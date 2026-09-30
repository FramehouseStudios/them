// Older app builds sent Feature Compass interface text as the story's "last
// scene outcome" ("Write or accept a page batch and it will stay reviewable
// here.", "Latest: L45-L49, 5 lines · ABCD1234"). It was saved to memory and
// read back on Home as if it were story. The app no longer sends it; this
// drops what is already stored.

import { isPlannerScaffoldSentence } from "./screenplay_page_quality.js";
import { isLikelyCharacterName } from "./creative_memory_store.js";
import { isDistilledMemoryTemplate } from "./distilled_memory_templates.js";

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
  return firstUsable(candidates, (text) => !isScriptText(text) && !DISTILLED_ARC.test(text) && !isPlannerScaffoldSentence(text) && !isDistilledMemoryTemplate(text));
}

// The next move, for "Where we left off": never the planner's own wording,
// nor memory's ("Next move: Rain returns as proof or cost in Act III").
function continuityNextMove(candidates = []) {
  return firstUsable(candidates, (text) => !isPlannerScaffoldSentence(text) && !isDistilledMemoryTemplate(text));
}

// A draft that ends on FADE OUT / THE END is finished. The planner's act comes
// from page count against an assumed 110 pages, so Home called a finished
// 74-page script "Act II" and offered its next scene (seen live 2026-09-30).
function draftReachedTheEnd(draft) {
  const tail = String(draft || "").split("\n").map((line) => line.trim()).filter(Boolean).slice(-3);
  return tail.some((line) => /^(?:FADE OUT|FADE TO BLACK|THE END)[.:]?$/i.test(line));
}

// "Where we left off" is the project the writer has open, not whichever one
// memory touched last: Home offered "Night Nurse" while Sine Die was open
// (2026-09-30). Memory's most recent item is the fallback.
function activeProjectMemoryItem(projects = [], activeProjectId = "") {
  const list = Array.isArray(projects) ? projects : [];
  const active = String(activeProjectId || "").trim().toLowerCase();
  return (active && list.find((item) => String(item?.projectId || "").trim().toLowerCase() === active)) || list[0] || null;
}

// The recap names people, not words memory mistook for them, and with a story
// line only the people it is about: "CAL and DECKER were carrying this: ...
// Osgood stands on the step stool" read wrong (2026-09-30). None mentioned
// means the recap says "The last live thread was: ..." instead.
function recapCharacterNames(names = [], limit = 2, storyText = "") {
  const people = (Array.isArray(names) ? names : []).filter(isLikelyCharacterName);
  const story = String(storyText || "").toLowerCase();
  const mentioned = (name) => story && new RegExp(`\\b${String(name).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(story);
  return (story ? people.filter(mentioned) : people).slice(0, limit);
}

// What the recap is anchored to, for /session and /state alike: the project
// the writer has open and every project whose latest draft reached the end.
// /state built its own snapshot without either, and Home (which applies
// /state after /session) still said "Act II" for a finished script.
function continuitySnapshotOptions(owner = null, getLatestVersion = null) {
  const projects = Array.isArray(owner?.projects) ? owner.projects : [];
  return {
    activeProjectId: String(owner?.activeProjectId || "").trim(),
    finishedProjectIds: new Set(projects
      .filter((project) => draftReachedTheEnd(typeof getLatestVersion === "function" ? getLatestVersion(project)?.draft : ""))
      .map((project) => project.id)),
  };
}

export { continuitySnapshotOptions, isLikelyCharacterName, recapCharacterNames, activeProjectMemoryItem, continuityNextMove, continuityPosition, continuityStoryState, draftReachedTheEnd, withoutInterfaceCopy };
