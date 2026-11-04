// T-screenplay-import-fountain — pure Fountain parser.
//
// Reverse of T-fountain-export-endpoint. Takes a Fountain-formatted
// string and produces the canonical screenplay shape the export
// endpoint accepts as input:
//
//   {
//     title?: { title, credit?, author?, source?, draftDate?, contact?, notes? },
//     scenes: [
//       {
//         heading?: string,
//         lines: [
//           { kind: "action", text },
//           { kind: "character", name, parenthetical?, dialogue: string[],
//             forced?: boolean, dualDialogue?: boolean },
//           { kind: "transition", text, forced?: boolean },
//           { kind: "centered", text },
//           { kind: "lyrics", text },
//           { kind: "section", level, text },
//           { kind: "synopsis", text }
//         ]
//       }
//     ]
//   }
//
// Round-trip target: exportToFountain(importFromFountain(text)) ≈ text
// (lossy on whitespace + un-escaped formatting; lossless on structure).
//
// Spec: https://fountain.io/syntax — V1 covers the common case:
// title pages, scene headings (INT./EXT.), action, character cues +
// parentheticals + dialogue, transitions ending in TO:, # sections,
// = synopses, centered text, lyrics, dual dialogue, and forced elements.

const TITLE_FIELDS = Object.freeze({
  "title": "title",
  "credit": "credit",
  "author": "author",
  "authors": "author",
  "source": "source",
  "draft date": "draftDate",
  "contact": "contact",
  "notes": "notes",
});

const FOUNTAIN_LINE_SEPARATORS = /\r\n?|\u2028|\u2029|\u0085/g;

function normalizeFountainText(text) {
  const raw = typeof text === "string" ? text : "";
  return raw.replace(/^\uFEFF/, "").replace(FOUNTAIN_LINE_SEPARATORS, "\n");
}

function isSceneHeading(line) {
  if (!line) return false;
  const trimmed = line.trim();
  return /^(INT\.|EXT\.|INT\/EXT|EST\.|INT |EXT )/i.test(trimmed)
    || /^\./.test(trimmed); // Fountain forced scene heading
}

function isCentered(line) {
  if (!line) return false;
  const trimmed = line.trim();
  return trimmed.length > 2 && trimmed.startsWith(">") && trimmed.endsWith("<");
}

function isTransition(line) {
  if (!line) return false;
  const trimmed = line.trim();
  if (!trimmed) return false;
  // `@` explicitly forces a character cue, even when the name itself
  // resembles a transition such as `CUT TO:`.
  if (trimmed.startsWith("@")) return false;
  // Centered text also uses angle brackets and must be resolved first.
  if (isCentered(trimmed)) return false;
  // ALL CAPS ending in "TO:" or a transition forced with `>`.
  if (trimmed.startsWith(">")) return true;
  if (trimmed === trimmed.toUpperCase() && /\bTO:$/.test(trimmed)) return true;
  return false;
}

function isCharacterCue(line, nextLine) {
  if (!line) return false;
  const trimmed = line.trim();
  if (!trimmed) return false;
  const forced = trimmed.startsWith("@");
  let candidate = forced ? trimmed.slice(1).trim() : trimmed;
  candidate = candidate.replace(/\s*\^\s*$/, "").trim();
  if (!candidate) return false;
  // Must be ALL CAPS with a letter; cannot be a scene heading or
  // transition; the next non-empty line must be dialogue or
  // parenthetical (i.e. non-empty and not another cue / heading).
  if (!forced && (isSceneHeading(candidate) || isTransition(candidate) || isCentered(candidate))) {
    return false;
  }
  if (!/[A-Za-z]/.test(candidate)) return false;
  if (!forced && candidate !== candidate.toUpperCase()) return false;
  // Allow trailing parenthetical extension on the cue line ("JUNE (V.O.)").
  const cueRegex = /^[A-Za-z][A-Za-z0-9 .'\-():]+$/;
  if (!cueRegex.test(candidate)) return false;
  if (typeof nextLine !== "string" || !nextLine.trim()) return false;
  const next = nextLine.trim();
  // Explicit Fountain element markers are never dialogue. This keeps an
  // all-caps action immediately before a lyric/section from swallowing it.
  if (
    isSceneHeading(next)
    || isTransition(next)
    || isCentered(next)
    || /^(?:~|!|#{1,3} |={1,2} )/.test(next)
  ) return false;
  return true;
}

function isParenthetical(line) {
  if (!line) return false;
  const trimmed = line.trim();
  return /^\(.*\)$/.test(trimmed);
}

function titleField(line) {
  const match = String(line).replace(/^\uFEFF/, "").match(/^([\p{L}\p{N} _()/&.'-]{1,64}):\s*(.*)$/u);
  if (!match || match[1] !== match[1].trim()) return null;
  return { key: match[1], value: match[2].trim() };
}

function leadingTitle(rawLines, { requireTitle = true } = {}) {
  const first = titleField(rawLines[0] ?? "");
  // Full-document operations require an explicit first Title field. The
  // structured import endpoint retains its historical Author-only support.
  if (!first || (requireTitle ? first.key.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "") !== "title" : !TITLE_FIELDS[first.key.toLowerCase()])) {
    return { title: null, consumedLineCount: 0 };
  }
  let i = 0;
  const out = {};
  let currentKey = null;
  while (i < rawLines.length) {
    const line = rawLines[i];
    if (!line.trim()) {
      do { i += 1; } while (i < rawLines.length && !rawLines[i].trim());
      break;
    }
    const field = titleField(line);
    if (field) {
      const rawKey = field.key.toLowerCase();
      const mapped = TITLE_FIELDS[rawKey];
      currentKey = mapped ?? null;
      if (mapped) out[mapped] = field.value;
      i += 1;
      continue;
    }
    if (/^[ \t]/.test(line)) {
      if (currentKey) out[currentKey] = [out[currentKey], line.trim()].filter(Boolean).join("\n");
      i += 1;
      continue;
    }
    // Not a title field and not a continuation — we're past title page.
    break;
  }
  if (Object.keys(out).length === 0) return { title: null, consumedLineCount: 0 };
  return { title: out, consumedLineCount: i };
}

function parseTitlePage(rawLines) {
  return leadingTitle(rawLines, { requireTitle: false });
}

// A lossless source view, never an import/export round trip. Offsets refer to
// the original complete document; body bytes and original terminators survive.
export function splitFountainDocument(document) {
  const source = typeof document === "string" ? document : "";
  const physical = [...source.matchAll(/([^\r\n\u0085\u2028\u2029]*)(\r\n|[\r\n\u0085\u2028\u2029]|$)/gu)];
  const { title, consumedLineCount } = leadingTitle(physical.map(part => part[1]));
  const bodyStart = title ? (physical[consumedLineCount]?.index ?? source.length) : 0;
  return { hasTitlePage: title !== null, scriptText: source.slice(bodyStart), documentLineOffset: title ? consumedLineCount : 0 };
}

function parseBody(rawLines, startIdx) {
  const scenes = [];
  let currentScene = null;
  const ensureScene = () => {
    if (!currentScene) {
      currentScene = { heading: "", lines: [] };
      scenes.push(currentScene);
    }
    return currentScene;
  };
  let i = startIdx;
  while (i < rawLines.length) {
    const line = rawLines[i] || "";
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (isSceneHeading(trimmed)) {
      const heading = trimmed.replace(/^\./, ""); // strip forced-heading dot
      currentScene = { heading: heading.toUpperCase(), lines: [] };
      scenes.push(currentScene);
      i += 1;
      continue;
    }

    // # section
    if (/^#{1,3} /.test(trimmed)) {
      const m = trimmed.match(/^(#{1,3}) +(.*)$/);
      if (m) {
        ensureScene().lines.push({ kind: "section", level: m[1].length, text: m[2] });
      }
      i += 1;
      continue;
    }

    // = synopsis
    if (trimmed.startsWith("= ")) {
      ensureScene().lines.push({ kind: "synopsis", text: trimmed.slice(2) });
      i += 1;
      continue;
    }

    // > centered text <
    if (isCentered(trimmed)) {
      ensureScene().lines.push({
        kind: "centered",
        text: trimmed.slice(1, -1).trim(),
      });
      i += 1;
      continue;
    }

    // Transition, including a `>`-forced transition that does not end in TO:.
    if (isTransition(trimmed)) {
      const forced = trimmed.startsWith(">");
      const text = forced ? trimmed.slice(1).trim() : trimmed;
      const entry = { kind: "transition", text };
      if (forced) entry.forced = true;
      ensureScene().lines.push(entry);
      i += 1;
      continue;
    }

    // ~ lyrics
    if (trimmed.startsWith("~")) {
      ensureScene().lines.push({ kind: "lyrics", text: trimmed.slice(1).trim() });
      i += 1;
      continue;
    }

    // ! forced action
    if (trimmed.startsWith("!")) {
      ensureScene().lines.push({ kind: "action", text: trimmed.slice(1).trim() });
      i += 1;
      continue;
    }

    // Character cue?
    if (isCharacterCue(line, rawLines[i + 1])) {
      // Parse cue + optional parenthetical + dialogue lines.
      let cueLine = trimmed;
      const forced = cueLine.startsWith("@");
      if (forced) cueLine = cueLine.slice(1).trim();
      const dualDialogue = /\^\s*$/.test(cueLine);
      if (dualDialogue) cueLine = cueLine.replace(/\s*\^\s*$/, "").trim();
      let parenthetical = null;
      // Trailing parenthetical extension on the cue itself: "JUNE (V.O.)"
      const parenInCue = cueLine.match(/^(.+?)\s*(\([^)]+\))\s*$/);
      let name = cueLine;
      if (parenInCue) {
        name = parenInCue[1];
        parenthetical = parenInCue[2].slice(1, -1).trim();
      }
      const dialogue = [];
      i += 1;
      while (i < rawLines.length) {
        const dLine = rawLines[i];
        const dTrim = (dLine || "").trim();
        if (!dTrim) break;
        // Parenthetical between dialogue lines.
        if (isParenthetical(dTrim)) {
          if (parenthetical === null) {
            parenthetical = dTrim.slice(1, -1).trim();
          } else {
            // Multiple parentheticals: append to dialogue verbatim
            // (rare; lossy but preserves the text).
            dialogue.push(dTrim);
          }
          i += 1;
          continue;
        }
        // A new cue / heading / transition ends dialogue.
        if (
          isSceneHeading(dTrim)
          || isTransition(dTrim)
          || isCentered(dTrim)
          || dTrim.startsWith("~")
          || isCharacterCue(dLine, rawLines[i + 1])
        ) {
          break;
        }
        dialogue.push(dTrim);
        i += 1;
      }
      const entry = { kind: "character", name, dialogue };
      if (parenthetical) entry.parenthetical = parenthetical;
      if (forced) entry.forced = true;
      if (dualDialogue) entry.dualDialogue = true;
      ensureScene().lines.push(entry);
      continue;
    }

    // Default: action.
    ensureScene().lines.push({ kind: "action", text: trimmed });
    i += 1;
  }
  return scenes.filter((s) => s.heading || (s.lines && s.lines.length));
}

function importFromFountain(text) {
  const lines = normalizeFountainText(text).split("\n");
  const { title, consumedLineCount } = parseTitlePage(lines);
  const scenes = parseBody(lines, consumedLineCount);
  const out = { scenes };
  if (title) out.title = title;
  return out;
}

export {
  importFromFountain,
  normalizeFountainText,
  parseTitlePage,
  parseBody,
  isSceneHeading,
  isCentered,
  isTransition,
  isCharacterCue,
  isParenthetical,
};
