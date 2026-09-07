// T-format-linter: Hollywood screenplay format linter (rules v1).
//
// Pure rule-based — no LLM. Each violation is a structured suggestion
// with severity (`hard` | `medium` | `soft`), not a rejection. The
// caller decides what to do with the suggestions; the iOS surface
// shows hard violations as red banners, medium as yellow hints, soft
// as dismissible chips.
//
// Rules v1:
//   - scene_heading_shape         hard   INT./EXT. + LOCATION (+ optional - TIME)
//   - character_cue_caps          hard   character cues are CAPS on their own line
//   - character_cue_isolation     medium character cues are surrounded by blank lines
//   - parenthetical_density       soft   ≤ 1 line and ≤ 30 chars per parenthetical
//   - parenthetical_count         soft   ≤ 1 parenthetical per cue
//   - action_voice_present        medium action lines should be present-tense
//                                        (heuristic: flag past-tense markers)
//   - action_adverb_density       soft   adverb-heavy action lines ("show, don't tell")
//   - page_economy_overlong       soft   lines > 4 sentences with no scene break
//   - blank_lines_around_headings hard   scene headings get blank lines around them
//
// Output shape (mirrors craft envelope conventions):
//   {
//     schemaVersion: 1,
//     ruleSetVersion: "v1",
//     totalSuggestions: N,
//     bySeverity: { hard: x, medium: y, soft: z },
//     suggestions: [
//       {
//         rule: "scene_heading_shape",
//         severity: "hard",
//         line: 12,        // 1-indexed
//         range: [start, end],  // 0-indexed char offsets in input
//         excerpt: "INT KITCHEN NIGHT",
//         message: "Scene heading missing leading INT./EXT. and a dot.",
//         suggestion: "Try: 'INT. KITCHEN - NIGHT'",
//       },
//       ...
//     ]
//   }

const FORMAT_LINT_SCHEMA_VERSION = 1;
const RULE_SET_VERSION = "v1";

const SEVERITY = Object.freeze({
  HARD: "hard",
  MEDIUM: "medium",
  SOFT: "soft",
});

// Common English adverbs that "show don't tell" rules flag in action.
// Bounded list — extending requires a code change so the linter stays
// auditable.
const ADVERBS_FLAGGED = new Set([
  "quickly", "slowly", "suddenly", "carefully", "angrily",
  "happily", "sadly", "gently", "softly", "loudly",
  "nervously", "anxiously", "calmly", "wildly", "fiercely",
  "tearfully", "joyfully", "bitterly", "sharply",
]);

// Past-tense markers commonly mistaken for present-tense action.
const PAST_TENSE_MARKERS = [
  /\bwas\b/i, /\bwere\b/i, /\bhad\b/i, /\bdid\b/i,
  /\b\w+ed\b/, // crude — flag any -ed verb in action; see notes below
];

const SCENE_HEADING_PREFIXES = [
  "INT.", "EXT.", "INT/EXT", "INT./EXT.", "I/E.", "I/E",
];

function trimToString(v) {
  return v === null || v === undefined ? "" : String(v);
}

function startsWithSceneHeadingPrefix(line) {
  const upper = line.toUpperCase();
  return SCENE_HEADING_PREFIXES.some((prefix) => upper.startsWith(prefix));
}

function looksLikeSceneHeading(line) {
  // A line is candidate scene heading if it's all-caps and contains a
  // location-time-ish structure. Catches both well-formed and malformed
  // candidates so the rule can complain about the malformed ones.
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.length < 4) return false;
  // All-caps line that contains at least one space and one of:
  //   INT  EXT  I/E
  // (anywhere — being lenient catches malformed cases)
  const upper = trimmed.toUpperCase();
  const hasMarker = /\b(INT|EXT|I\/E)\b/.test(upper);
  const isMostlyCaps = upper === trimmed && /[A-Z]/.test(trimmed);
  return hasMarker && isMostlyCaps;
}

function isWellFormedSceneHeading(line) {
  // Must start with INT./EXT. (or variants) followed by a space.
  // After that, must have at least 2 chars of content.
  const trimmed = line.trim();
  if (!startsWithSceneHeadingPrefix(trimmed.toUpperCase())) return false;
  // Strip the prefix; must have content after.
  for (const prefix of SCENE_HEADING_PREFIXES) {
    if (trimmed.toUpperCase().startsWith(prefix)) {
      const rest = trimmed.slice(prefix.length).trim();
      if (rest.length >= 2) return true;
    }
  }
  return false;
}

function isCharacterCue(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // 2-40 chars, all caps + spaces + a few special chars,
  // no trailing colon, ends in a letter or close-paren (for V.O./O.S.).
  if (trimmed.length < 2 || trimmed.length > 40) return false;
  if (/:$/.test(trimmed)) return false;
  // Reject scene-heading-looking lines.
  if (startsWithSceneHeadingPrefix(trimmed.toUpperCase())) return false;
  // Allow letters, digits, spaces, periods, apostrophes, hyphens,
  // parens (for cue extensions like "JANE (V.O.)").
  if (!/^[A-Z][A-Z0-9 .'\-()]+[A-Z0-9)]$/.test(trimmed)) return false;
  return true;
}

function isAllCaps(s) {
  const trimmed = String(s || "");
  return trimmed.length > 0 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
}

function countAdverbs(line) {
  let count = 0;
  const words = line.toLowerCase().match(/\b[a-z']+\b/g) || [];
  for (const w of words) if (ADVERBS_FLAGGED.has(w)) count += 1;
  return count;
}

function lineRange(text, lineIndex) {
  // Compute 0-indexed [start, end) char offsets for the line.
  let start = 0;
  for (let i = 0; i < lineIndex; i += 1) {
    const nl = text.indexOf("\n", start);
    if (nl === -1) return [start, text.length];
    start = nl + 1;
  }
  let end = text.indexOf("\n", start);
  if (end === -1) end = text.length;
  return [start, end];
}

function makeSuggestion({ rule, severity, line, range, excerpt, message, suggestion }) {
  const out = {
    rule,
    severity,
    line: line + 1, // 1-indexed for display
    range,
    excerpt: trimToString(excerpt).slice(0, 120),
    message,
  };
  if (suggestion) out.suggestion = suggestion;
  return out;
}

// ---- Rule implementations ----

function ruleSceneHeadingShape(lines, text, suggestions) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (looksLikeSceneHeading(line) && !isWellFormedSceneHeading(line)) {
      suggestions.push(makeSuggestion({
        rule: "scene_heading_shape",
        severity: SEVERITY.HARD,
        line: i,
        range: lineRange(text, i),
        excerpt: line.trim(),
        message: "Scene heading does not start with a well-formed INT./EXT. prefix.",
        suggestion: "Use 'INT. <LOCATION> - <TIME>' or 'EXT. <LOCATION> - <TIME>'.",
      }));
    }
  }
}

function ruleCharacterCueCaps(lines, text, suggestions) {
  // A line that LOOKS LIKE a cue (all caps, 2-40 chars) but isn't
  // strictly all-caps gets flagged. Mixed case in cues is the usual
  // submission-rejection trigger.
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    if (trimmed.length < 2 || trimmed.length > 40) continue;
    if (/:$/.test(trimmed)) continue;
    if (startsWithSceneHeadingPrefix(trimmed.toUpperCase())) continue;
    // Only a line in cue position can be a cue: first line of the page or
    // preceded by a blank line. A short line inside a speech or an action
    // block ("I did call." / "He waits.") is never a cue.
    if (i > 0 && lines[i - 1].trim()) continue;
    // Cues do not end in sentence punctuation and are a few words long.
    // Ignore a trailing extension such as (V.O.) or (CONT'D) for both checks.
    const cueCore = trimmed.replace(/\s*\([^)]*\)\s*$/, "");
    if (!cueCore) continue;
    if (/[.!?,;…]["'’”]*$/.test(cueCore)) continue;
    if (cueCore.split(/\s+/).length > 5) continue;
    // A cue starts with a capital letter, not a lowercase word or a bracket.
    if (!/^[A-Z]/.test(trimmed)) continue;
    // Heuristic: line is followed by what looks like dialogue (next non-blank
    // line is mixed-case sentence-shape).
    let nextIdx = i + 1;
    while (nextIdx < lines.length && !lines[nextIdx].trim()) nextIdx += 1;
    if (nextIdx >= lines.length) continue;
    const next = lines[nextIdx].trim();
    if (!next || next.length < 2) continue;
    if (isAllCaps(next)) continue; // Next line is also caps; not a dialogue context.
    // Now: did the line have at least 2 letters and is the line NOT all caps?
    const hasLetters = /[A-Za-z]{2,}/.test(trimmed);
    if (!hasLetters) continue;
    if (isAllCaps(trimmed)) continue;
    // It's mixed-case but in a cue position.
    suggestions.push(makeSuggestion({
      rule: "character_cue_caps",
      severity: SEVERITY.HARD,
      line: i,
      range: lineRange(text, i),
      excerpt: trimmed,
      message: "Character cue should be in ALL CAPS on its own line.",
      suggestion: `Try: '${trimmed.toUpperCase()}'`,
    }));
  }
}

function ruleParentheticalDensity(lines, text, suggestions) {
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    // Match a parenthetical line: starts with ( ends with )
    const m = trimmed.match(/^\(([^)]*)\)$/);
    if (!m) continue;
    const body = m[1];
    if (body.length > 30) {
      suggestions.push(makeSuggestion({
        rule: "parenthetical_density",
        severity: SEVERITY.SOFT,
        line: i,
        range: lineRange(text, i),
        excerpt: trimmed,
        message: `Parenthetical is ${body.length} characters; convention prefers ≤30.`,
        suggestion: "Move detail into action lines or trim to a short cue (e.g., 'softly', 'realizing').",
      }));
    }
  }
}

function ruleParentheticalCount(lines, text, suggestions) {
  // For each character cue, count following parentheticals before the dialogue.
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!isCharacterCue(trimmed)) continue;
    let parenCount = 0;
    let firstParenIdx = -1;
    let j = i + 1;
    while (j < lines.length && lines[j].trim()) {
      const ll = lines[j].trim();
      if (/^\([^)]*\)$/.test(ll)) {
        parenCount += 1;
        if (firstParenIdx < 0) firstParenIdx = j;
      } else {
        break;
      }
      j += 1;
    }
    if (parenCount > 1) {
      suggestions.push(makeSuggestion({
        rule: "parenthetical_count",
        severity: SEVERITY.SOFT,
        line: firstParenIdx,
        range: lineRange(text, firstParenIdx),
        excerpt: lines[firstParenIdx].trim(),
        message: `${parenCount} parentheticals stacked under one cue; convention prefers ≤1.`,
        suggestion: "Keep at most one parenthetical and move the rest into action.",
      }));
    }
  }
}

function ruleActionVoicePresent(lines, text, suggestions) {
  // Heuristic — only run on lines that look like action (sentence-case,
  // not all-caps, not parentheticals, not cues).
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    if (isAllCaps(trimmed)) continue;
    if (/^\(/.test(trimmed)) continue;
    if (looksLikeSceneHeading(trimmed)) continue;
    // Crude: flag lines ending in past-tense verb-shape ("walked.", "ran.").
    // Skip dialogue-ish lines (they often follow a CAPS cue and live next to
    // parentheticals).
    // Skip dialogue (lines that follow a CHARACTER CUE or parenthetical),
    // but NOT lines that follow a scene heading — those are action.
    let prevIdx = i - 1;
    while (prevIdx >= 0 && !lines[prevIdx].trim()) prevIdx -= 1;
    const prevTrim = prevIdx >= 0 ? lines[prevIdx].trim() : "";
    const prevIsCueOrParen = prevTrim && (
      /^\([^)]*\)$/.test(prevTrim) ||
      (isCharacterCue(prevTrim) && !looksLikeSceneHeading(prevTrim))
    );
    if (prevIsCueOrParen) continue;
    // Skip very short lines (likely cue extensions or action fragments).
    if (trimmed.length < 12) continue;
    // Match clear past tense: a sentence that ends with an -ed verb +
    // period, OR contains a "was/were <verb>ed" structure, OR contains a
    // "had <verb>ed" pluperfect — these are the patterns submission readers
    // flag fastest.
    // Flag lines with 2+ -ed verb-shaped words, OR a "was/were/had <verbed>"
    // construction, OR a sentence that ends with an -ed word + period. False
    // positives are acceptable at `medium` severity — the writer reviews and
    // dismisses; submission readers reach for these patterns first.
    const edWordCount = (trimmed.match(/\b[a-z]{3,}ed\b/gi) || []).length;
    const wasVerbed = /\b(was|were)\s+\w+ed\b/i.test(trimmed);
    const hadVerbed = /\bhad\s+\w+ed\b/i.test(trimmed);
    const trailingEd = /[a-z]{2,}ed\.\s*$/.test(trimmed);
    if (edWordCount >= 2 || wasVerbed || hadVerbed || trailingEd) {
      suggestions.push(makeSuggestion({
        rule: "action_voice_present",
        severity: SEVERITY.MEDIUM,
        line: i,
        range: lineRange(text, i),
        excerpt: trimmed,
        message: "Action line appears past-tense; convention is present-tense (e.g., 'walks', not 'walked').",
        suggestion: "Rewrite verbs in present tense.",
      }));
    }
  }
}

function ruleActionAdverbDensity(lines, text, suggestions) {
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed || isAllCaps(trimmed) || /^\(/.test(trimmed)) continue;
    if (looksLikeSceneHeading(trimmed)) continue;
    if (trimmed.length < 12) continue;
    const adverbCount = countAdverbs(trimmed);
    if (adverbCount >= 2) {
      suggestions.push(makeSuggestion({
        rule: "action_adverb_density",
        severity: SEVERITY.SOFT,
        line: i,
        range: lineRange(text, i),
        excerpt: trimmed,
        message: `Action line has ${adverbCount} flagged adverbs ('show, don't tell').`,
        suggestion: "Replace adverbs with concrete physical action.",
      }));
    }
  }
}

function rulePageEconomyOverlong(lines, text, suggestions) {
  // Crude: flag stretches of 5+ consecutive non-blank lines without a
  // scene heading, character cue, or parenthetical break. Suggests the
  // scene is dragging.
  let runStart = -1;
  let runCount = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    const isBreak = !trimmed
      || isAllCaps(trimmed)
      || /^\(/.test(trimmed)
      || looksLikeSceneHeading(trimmed)
      || isCharacterCue(trimmed);
    if (isBreak) {
      if (runCount >= 5 && runStart >= 0) {
        suggestions.push(makeSuggestion({
          rule: "page_economy_overlong",
          severity: SEVERITY.SOFT,
          line: runStart,
          range: lineRange(text, runStart),
          excerpt: lines[runStart].trim(),
          message: `${runCount} consecutive prose lines without a beat break; consider tightening or adding action.`,
          suggestion: "Industry advice: 'come in late, leave early'. Cut to the next beat sooner.",
        }));
      }
      runCount = 0;
      runStart = -1;
    } else {
      if (runCount === 0) runStart = i;
      runCount += 1;
    }
  }
}

function ruleBlankLinesAroundHeadings(lines, text, suggestions) {
  for (let i = 0; i < lines.length; i += 1) {
    if (!isWellFormedSceneHeading(lines[i])) continue;
    const prevBlank = i === 0 || lines[i - 1].trim() === "";
    const nextBlank = i === lines.length - 1 || lines[i + 1].trim() === "";
    if (!prevBlank || !nextBlank) {
      suggestions.push(makeSuggestion({
        rule: "blank_lines_around_headings",
        severity: SEVERITY.HARD,
        line: i,
        range: lineRange(text, i),
        excerpt: lines[i].trim(),
        message: "Scene heading should be surrounded by blank lines.",
        suggestion: "Add an empty line before and after the scene heading.",
      }));
    }
  }
}

const RULES = [
  ruleSceneHeadingShape,
  ruleCharacterCueCaps,
  ruleParentheticalDensity,
  ruleParentheticalCount,
  ruleActionVoicePresent,
  ruleActionAdverbDensity,
  rulePageEconomyOverlong,
  ruleBlankLinesAroundHeadings,
];

function lintScreenplay({ text = "", frameworkId = null } = {}) {
  const safeText = trimToString(text).replace(/\r\n?/g, "\n");
  const lines = safeText.split("\n");
  const suggestions = [];
  for (const rule of RULES) {
    try {
      rule(lines, safeText, suggestions);
    } catch (e) {
      // Rules must not crash. Swallow + continue so one bad rule doesn't
      // block the rest.
      // eslint-disable-next-line no-console
      console.error(`[format_linter] rule failed: ${e?.message || e}`);
    }
  }
  // Sort suggestions by line number, then by severity (hard first).
  const severityOrder = { hard: 0, medium: 1, soft: 2 };
  suggestions.sort((a, b) => {
    if (a.line !== b.line) return a.line - b.line;
    return (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9);
  });
  const bySeverity = { hard: 0, medium: 0, soft: 0 };
  for (const s of suggestions) bySeverity[s.severity] = (bySeverity[s.severity] || 0) + 1;
  return {
    schemaVersion: FORMAT_LINT_SCHEMA_VERSION,
    ruleSetVersion: RULE_SET_VERSION,
    frameworkId: frameworkId || null,
    totalSuggestions: suggestions.length,
    bySeverity,
    suggestions,
  };
}

export {
  lintScreenplay,
  FORMAT_LINT_SCHEMA_VERSION,
  RULE_SET_VERSION,
  SEVERITY,
};
