// Older app builds sent Feature Compass interface text as the story's "last
// scene outcome" ("Write or accept a page batch and it will stay reviewable
// here.", "Latest: L45-L49, 5 lines · ABCD1234"). It was saved to memory and
// read back on Home as if it were story. The app no longer sends it; this
// drops what is already stored.

import { isPlannerScaffoldSentence } from "./screenplay_page_quality.js";

const INTERFACE_COPY = [
  /^write or accept a page batch and it will stay reviewable here\.?$/i,
  /^open the thread to review accepted page writes\.?$/i,
  /^latest: l\d+-l\d+, \d+ lines?( · [a-z0-9]+)?$/i,
  // Feature Compass placeholder when no next scene was known, saved as the
  // scene summary / next plan: "the next scene: DINER",
  // "Next scene: the next scene. DINER", "Write the next scene: DINER".
  /^the next scene(:.*)?$/i,
  // Also wrapped by memory as "JOE's next emotional turn: Write the next scene: DINER."
  /\bnext scene: the next scene\b/i,
  /\bwrite the next scene\b/i,
];

function withoutInterfaceCopy(value) {
  const text = String(value || "").trim();
  return INTERFACE_COPY.some((pattern) => pattern.test(text)) ? "" : text;
}

// "Act I" + "Act I - Opening Image (p1-p12)" reads "Act I / Act I - …".
function continuityPosition(act, featureSequence) {
  const actText = String(act || "").trim();
  const sequence = String(featureSequence || "").trim();
  const repeatsAct = actText && sequence.toLowerCase().startsWith(`${actText.toLowerCase()} `);
  return [repeatsAct ? "" : actText, sequence].filter(Boolean).join(" / ");
}

// The page itself is not a story state: a scene heading, a capitalised cue
// before a line ("... MAE Last one tonight? DRIVER ..."), or a bare heading
// label ("BUS DEPOT"). Seen on Home 2026-09-30: "MAE and DRIVER were carrying
// this: INT. BUS DEPOT - NIGHT Rain on the roof ...".
function isScriptText(text) {
  return /^(INT|EXT|INT\.\/EXT|I\/E)[.\s]/i.test(text) ||
    /\b[A-Z][A-Z'\-]{1,}\s+[A-Z][a-z]/.test(text) ||
    (/[A-Z]/.test(text) && text === text.toUpperCase());
}

// Memory's distilled arc line only restates the last beat.
const DISTILLED_ARC = /^[A-Za-z][\w'-]* (?:is under pressure from|must change tactics after):/;

function firstUsable(candidates, isUsable) {
  for (const candidate of candidates) {
    const text = withoutInterfaceCopy(candidate);
    if (text && isUsable(text)) return text;
  }
  return "";
}

// What the characters were carrying, for "Where we left off".
function continuityStoryState(candidates = []) {
  return firstUsable(candidates, (text) => !isScriptText(text) && !DISTILLED_ARC.test(text) && !isPlannerScaffoldSentence(text));
}

// The next move, for "Where we left off": never the planner's own wording.
function continuityNextMove(candidates = []) {
  return firstUsable(candidates, (text) => !isPlannerScaffoldSentence(text));
}

export { continuityNextMove, continuityPosition, continuityStoryState, withoutInterfaceCopy };
