const MAX_CAUSAL_FACTS = 8;
const MAX_CANON_VIOLATIONS = 4;

const MATCH_STOP_WORDS = new Set([
  "about", "after", "again", "against", "before", "being", "between", "could", "does", "from",
  "have", "into", "itself", "only", "over", "that", "their", "them", "then", "there", "these",
  "they", "this", "those", "through", "under", "very", "what", "when", "where", "which", "while",
  "with", "would", "your", "chooses", "decides", "reveals", "admits", "confesses", "burns", "burned",
  "destroys", "destroyed", "dies", "died", "killed", "arrested", "publishes", "published", "broadcast",
]);

const HISTORICAL_OR_IMAGINED_FRAME = /\b(?:flashback|memory|dream|vision|nightmare|imagines?|remembers?|years? earlier|earlier that|ghost|apparition|recording|video|photograph|hologram)\b/i;
const EXPLICIT_CANON_ERASURE = /\b(?:none|nothing) of (?:that|this) (?:ever )?happened\b|\b(?:it|that|this) (?:never|didn't|did not) happen(?:ed)?\b|\bas if (?:it|that|this) never happened\b|\b(?:was|were) (?:only|just) a (?:dream|lie|story)\b/i;
const REVELATION_RESET = /\b(?:for the first time|finally (?:learns?|discovers?|realizes?)|learns? (?:the )?truth|discovers? (?:the )?truth|never knew|didn't know|did not know|had no idea|nobody told me|you never told me)\b/i;
const RELATIONSHIP_RESET = /\b(?:back to normal|nothing between them has changed|their relationship is unchanged|pick up where we left off|back where (?:we|they) started|as if (?:the breakup|the betrayal|the choice) never happened)\b/i;
const DECISION_ERASURE = /\b(?:never made|didn't make|did not make|takes? back|undoes?|cancels?|erases?)\b.{0,80}\b(?:choice|decision|promise|commitment)\b|\b(?:choice|decision|promise|commitment)\b.{0,80}\b(?:never happened|doesn't count|does not count|is forgotten|is erased)\b/i;
const DESTROYED_FACT = /\b(?:burn(?:s|ed)?|destroy(?:s|ed)?|shred(?:s|ded)?|tear(?:s|ing)? up|tore up|incinerat(?:es|ed)|smash(?:es|ed)|sink(?:s|ing)?|sank)\b/i;
const DESTROYED_OBJECT_RESTORED = /\b(?:another|the original|the only|same|intact|unburned|undamaged|whole)\b.{0,90}\b(?:copy|affidavit|letter|tape|recording|evidence|document|file|photo|photograph|weapon|contract|will|verdict)\b|\b(?:copy|affidavit|letter|tape|recording|evidence|document|file|photo|photograph|weapon|contract|will|verdict)\b.{0,90}\b(?:intact|unburned|undamaged|whole|reappears?|is back|was never destroyed|survived the fire)\b|\b(?:finds?|produces?|pulls? out|holds? up|reveals?|opens?)\b.{0,100}\b(?:another copy|the original|the only copy|intact|unburned|undamaged)\b/i;
const DEATH_FACT = /\b(?:dies?|died|is dead|was killed|is killed|was murdered|is murdered)\b/i;
const ARREST_FACT = /\b(?:was arrested|is arrested|gets arrested|turns? (?:himself|herself|themself|themselves) in)\b/i;
const ARREST_RESET = /\b(?:back at (?:work|home)|walks? free|is free again|the arrest never happened|no record of the arrest)\b/i;
const PUBLIC_FACT = /\b(?:broadcasts?|broadcast|publishes?|published|goes public|went public|public testimony|signs? (?:the )?(?:confession|plea))\b/i;
const PUBLIC_RESET = /\b(?:still secret|no one knows|nobody knows|never aired|never published|never sent|unsigned after all)\b/i;

function cleanInline(value = "", maxChars = 240) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(maxChars || 240)))
    .trim();
}

function normalizeFactKind(value = "") {
  const clean = cleanInline(value, 48).toLowerCase().replace(/[\s-]+/g, "_");
  if ([
    "decision",
    "revelation",
    "relationship_change",
    "irreversible_consequence",
    "writer_correction",
  ].includes(clean)) {
    return clean;
  }
  return "";
}

function normalizeAcceptedCausalFacts(value = []) {
  const source = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();
  for (const item of source) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const kind = normalizeFactKind(item.kind ?? item.type);
    const fact = cleanInline(item.fact ?? item.value ?? item.text, 220);
    if (!kind || !fact) continue;
    const key = `${kind}:${fact.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind,
      fact,
      sourceSceneHeading: cleanInline(item.sourceSceneHeading ?? item.source_scene_heading, 140),
      sourceAct: cleanInline(item.sourceAct ?? item.source_act, 80),
      ageInScenes: Math.max(0, Math.round(Number(item.ageInScenes ?? item.age_in_scenes ?? 0))),
    });
    if (out.length >= MAX_CAUSAL_FACTS) break;
  }
  return out;
}

function normalizeMatchToken(value = "") {
  let token = String(value || "").toLowerCase().replace(/^'+|'+$/g, "");
  if (token.endsWith("'s")) token = token.slice(0, -2);
  if (token.length > 6 && token.endsWith("ing")) token = token.slice(0, -3);
  else if (token.length > 5 && token.endsWith("ed")) token = token.slice(0, -2);
  else if (token.length > 5 && token.endsWith("s")) token = token.slice(0, -1);
  return token;
}

function factAnchorTokens(fact = "") {
  const out = [];
  const seen = new Set();
  for (const raw of String(fact || "").match(/[A-Za-z][A-Za-z0-9']{2,}/g) || []) {
    const token = normalizeMatchToken(raw);
    if (token.length < 4 || MATCH_STOP_WORDS.has(token) || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out.slice(0, 10);
}

function factSubjectCandidates(fact = "") {
  const source = String(fact || "");
  const cue = source.match(/^([A-Z][A-Z0-9 .'-]{1,48}):/);
  const candidates = cue ? [cue[1]] : (source.match(/\b[A-Z][a-z]{2,}\b/g) || []).slice(0, 2);
  return [...new Set(candidates.map((item) => cleanInline(item, 48)).filter(Boolean))];
}

function screenplayWindows(text = "") {
  const lines = String(text || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const out = [];
  const seen = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    const start = Math.max(0, index - 2);
    const end = Math.min(lines.length, index + 3);
    const rawLines = lines.slice(start, end);
    const value = cleanInline(rawLines.join(" "), 520);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push({ value, rawLines });
  }
  return out;
}

function windowHasFactAnchor(windowText = "", fact = "") {
  const windowTokens = new Set(
    (String(windowText || "").match(/[A-Za-z][A-Za-z0-9']{2,}/g) || [])
      .map(normalizeMatchToken)
      .filter(Boolean)
  );
  const anchors = factAnchorTokens(fact);
  let score = 0;
  for (const token of anchors) {
    if (!windowTokens.has(token)) continue;
    score += token.length >= 8 ? 2 : 1;
  }
  return score >= 2;
}

function hasPresentDayDeadCharacter(window, fact = "") {
  if (!DEATH_FACT.test(fact) || HISTORICAL_OR_IMAGINED_FRAME.test(window.value)) return false;
  for (const name of factSubjectCandidates(fact)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const presentAction = new RegExp(`\\b${escaped}\\b\\s+(?:enters?|walks?|runs?|steps?|opens?|wakes?|sits?|stands?|breathes?|answers?|reaches?|takes?)\\b`, "i");
    const isDialogueCue = window.rawLines.some((line) => line === name.toUpperCase());
    if (presentAction.test(window.value) || isDialogueCue) return true;
  }
  return false;
}

function contradictionTypeForWindow(window, record) {
  if (HISTORICAL_OR_IMAGINED_FRAME.test(window.value)) return "";
  if (hasPresentDayDeadCharacter(window, record.fact)) return "irreversible_undo";
  if (!windowHasFactAnchor(window.value, record.fact)) return "";
  if (EXPLICIT_CANON_ERASURE.test(window.value)) return "canon_erasure";
  if (record.kind === "revelation" && REVELATION_RESET.test(window.value)) return "revelation_reset";
  if (record.kind === "relationship_change" && RELATIONSHIP_RESET.test(window.value)) return "relationship_reset";
  if (record.kind === "decision" && DECISION_ERASURE.test(window.value)) return "decision_erasure";
  if (record.kind === "irreversible_consequence") {
    if (DESTROYED_FACT.test(record.fact) && DESTROYED_OBJECT_RESTORED.test(window.value)) {
      return "irreversible_undo";
    }
    if (ARREST_FACT.test(record.fact) && ARREST_RESET.test(window.value) && !/\b(?:released|bail|escaped|acquitted|charges? dropped)\b/i.test(window.value)) {
      return "irreversible_undo";
    }
    if (PUBLIC_FACT.test(record.fact) && PUBLIC_RESET.test(window.value)) return "irreversible_undo";
  }
  return "";
}

function isExplicitCanonCorrectionRequest(writerRequest = "") {
  const clean = cleanInline(writerRequest, 1_600);
  if (!clean) return false;
  return /\b(?:retcon|canon correction|correct the canon|overwrite canon|replace the previous|change what happened|revise the accepted|undo that accepted)\b/i.test(clean) ||
    /\bactually\b.{0,120}\b(?:didn't|did not|never|instead|change|correct|replace)\b/i.test(clean);
}

function repairDirectiveForViolation(violation) {
  const binding = `Preserve this accepted ${violation.kind.replace(/_/g, " ")}: ${violation.fact}`;
  switch (violation.type) {
    case "revelation_reset":
      return `${binding}. The knowledge already changed; dramatize its consequence instead of staging it as unknown or first-time.`;
    case "relationship_reset":
      return `${binding}. Continue from the changed bond; any new reversal must earn a visible cause on this page.`;
    case "decision_erasure":
      return `${binding}. Continue the cost of the choice; do not erase it or return to the pre-choice state.`;
    case "irreversible_undo":
      return `${binding}. Remove the restoration or reappearance and build the next beat from the irreversible loss.`;
    default:
      return `${binding}. Remove the canon reset and continue from the accepted changed condition.`;
  }
}

function evaluateScreenplayCanonContinuity({
  text = "",
  acceptedCausalFacts = [],
  writerRequest = "",
} = {}) {
  const facts = normalizeAcceptedCausalFacts(acceptedCausalFacts);
  const screenplayText = String(text || "").trim();
  if (!screenplayText || !facts.length) {
    return {
      ok: true,
      reason: "ok",
      factsChecked: facts.length,
      correctionOverride: false,
      violations: [],
      repairDirectives: [],
    };
  }
  if (isExplicitCanonCorrectionRequest(writerRequest)) {
    return {
      ok: true,
      reason: "writer_correction_override",
      factsChecked: facts.length,
      correctionOverride: true,
      violations: [],
      repairDirectives: [],
    };
  }

  const windows = screenplayWindows(screenplayText);
  const violations = [];
  const seen = new Set();
  for (const record of facts) {
    for (const window of windows) {
      const type = contradictionTypeForWindow(window, record);
      if (!type) continue;
      const key = `${type}:${record.kind}:${record.fact.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      violations.push({
        type,
        kind: record.kind,
        fact: record.fact,
        sourceSceneHeading: record.sourceSceneHeading,
        sourceAct: record.sourceAct,
        excerpt: cleanInline(window.value, 260),
      });
      break;
    }
    if (violations.length >= MAX_CANON_VIOLATIONS) break;
  }
  return {
    ok: violations.length === 0,
    reason: violations.length ? "accepted_canon_contradiction" : "ok",
    factsChecked: facts.length,
    correctionOverride: false,
    violations,
    repairDirectives: violations.map(repairDirectiveForViolation),
  };
}

export {
  evaluateScreenplayCanonContinuity,
  isExplicitCanonCorrectionRequest,
  normalizeAcceptedCausalFacts,
};
