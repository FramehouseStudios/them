// Clementine's own talk reply is what the writer hears when it already keeps
// the spoken contract; the lane templates are the fallback for a reply that
// does not. Before this, a lane's template replaced the model's reply however
// good it was: "Core idea I hear: okay so I'm like twelve pages…" (twice),
// "I hear you. That makes sense.", "Heh. That is very human." Reproduced for
// six writers on main and the product stack on 2026-10-01 with ideal model
// replies (USER_ROLEPLAY_CRITIQUE.md).

const SAFETY_LANES = new Set(["high_distress_safety"]);
// Belt to the safety lane: these turns always keep their safety structure.
const CRISIS = /\b(kill(?:ing)? myself|suicid\w*|self[- ]?harm|hurt(?:ing)? myself|end (?:it all|my life)|i (?:am|feel) unsafe)\b/i;
const LIST_LINE = /^\s*(?:[-*•]\s|\d+[.)]\s|[a-cA-C][.)]\s|#{1,6}\s)/m;
// "Sharpen pass: …", "Step 1: …", "MARCUS: …" read aloud as a label.
const LABEL_LINE = /^\s*[A-Z][A-Za-z0-9 ]{0,24}:\s/m;
// The voice spec's banned register, and the template phrasing it replaces.
const BANNED = [
  "i hear you", "that makes sense", "hold space", "hold it for a minute", "as an ai",
  "great question", "you've got this", "you’ve got this", "core idea i hear", "sharpen pass",
  "build step", "you said:", "that is very human", "heh", "what did your body feel",
];
const COMPLETE_LINE = /[.!?…"”')\]]$/;

function words(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9'’\s]/g, " ").split(/\s+/).filter(Boolean);
}

function echoesOpening(reply, transcript) {
  const opening = words(transcript).slice(0, 6);
  if (opening.length < 6) return false;
  return ` ${words(reply).join(" ")} `.includes(` ${opening.join(" ")} `);
}

/** Keeps only the last question; earlier ones end as statements. */
function lastQuestionOnly(text, cap) {
  let seen = 0;
  const total = (text.match(/\?/g) || []).length;
  return text.replace(/\?/g, () => (++seen > total - cap ? "?" : "."));
}

/**
 * The model's spoken reply, one breath per line, when it can be heard as
 * written; null when the lane template should answer instead. `raw` is the
 * reply before list markers were stripped; `hasAdvice` reports advice lines
 * (index.js's stripUnsolicitedAdviceLines) for no-advice turns; `minWords`
 * is the turn's floor (a knowledge answer is not a one-liner).
 */
export function ownTalkReply(reply, {
  raw = reply,
  transcript = "",
  routingLane = "",
  gratitudeOnlyTurn = false,
  explicitNoAdvice = false,
  hasAdvice = () => false,
  minWords = 3,
} = {}) {
  const trimmed = String(reply || "").trim();
  if (!trimmed || SAFETY_LANES.has(String(routingLane || "")) || CRISIS.test(String(transcript || ""))) return null;
  const text = lastQuestionOnly(trimmed, gratitudeOnlyTurn ? 0 : 1);
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (words(text).length < Math.max(3, minWords) || lines.length > 5 || text.length > 600) return null;
  if (LIST_LINE.test(String(raw || "")) || LABEL_LINE.test(text)) return null;
  if (!lines.every((line) => COMPLETE_LINE.test(line))) return null;
  const lower = text.toLowerCase();
  if (BANNED.some((phrase) => (phrase === "heh" ? /\bheh\b/.test(lower) : lower.includes(phrase)))) return null;
  if (echoesOpening(text, transcript)) return null;
  if (explicitNoAdvice && hasAdvice(text)) return null;
  return lines.join("\n\n");
}
