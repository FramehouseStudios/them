// When Clementine's own reply misses the spoken contract, the lane fallback
// answers. It must still sound like her: no "Core idea I hear: <filler>"
// (it printed twice), no labeled "Sharpen pass"/"Build step"/"lens:" lines,
// no "I hear you. That makes sense.", no quote-backs, no "Heh. That is very
// human." (USER_ROLEPLAY_CRITIQUE.md, 2026-10-01). Deterministic.

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.OPENAI_API_KEY ||= "deterministic-guard-no-network";
process.env.RUN_SERVER = "0";

const {
  directorFlagsFromTranscript,
  inferRoutingPriorityLane,
  buildTurnPlanner,
  validateAndDirectHerReply,
  enforceReplyCompletenessGuard,
} = await import("../index.js");

function fallback(transcript, reply = "- Option one.\n- Option two.\n- Option three.") {
  const flags = directorFlagsFromTranscript(transcript);
  const routingPlan = inferRoutingPriorityLane(transcript, flags);
  const turnPlanner = buildTurnPlanner({ transcript, flags, routingPlan, behaviorMode: "growth", memory: {} });
  const outcome = { keptOwnReply: false };
  const validated = validateAndDirectHerReply(reply, {
    outcome,
    transcript,
    gratitudeOnlyTurn: Boolean(flags?.gratitudeOnly),
    preferQuestionEnding: Boolean(turnPlanner?.forceQuestionEnding),
    requireExtendedAnswer: Boolean(turnPlanner?.requiresSubstantiveAnswer),
    responseLengthMode: String(turnPlanner?.responseLengthMode || "compact"),
    minExtendedWords: Math.max(16, Number(turnPlanner?.minAnswerWords || 28)),
    turnIntent: String(turnPlanner?.intent || ""),
    routingLane: String(routingPlan?.lane || "normal_rotation"),
    flags,
    allowReassurance: true,
  });
  assert.equal(outcome.keptOwnReply, false, "a list must take the fallback path");
  return enforceReplyCompletenessGuard(validated, { transcript, flags, gratitudeOnlyTurn: Boolean(flags?.gratitudeOnly) });
}

const TEMPLATE = [
  /core idea i hear/i, /sharpen pass/i, /build step/i, /\blens:/i, /i hear you/i, /you said:/i,
  /that is very human/i, /\bheh\b/i, /emotional labor/i, /hold it for a minute/i, /feels loud/i,
  /do you want comfort/i, /iterate first/i, /\bwait\b.*iterate/i,
];

const WRITERS = {
  maya: "okay so I'm like twelve pages into my pilot and I have no idea what happens next. Dani just found out her roommate's been selling her stuff online and then... nothing. I'm stuck.",
  priya: "okay wait, idea, I'm walking so bear with me, what if there's this, um, night-shift pharmacist in Tucson who starts noticing the same prescription getting filled by different people and it's, I don't know, kind of a thriller but also kind of about her dad? Is that anything?",
  jordan: "Got the Nicholl rejection this morning. Didn't even make quarters. Honestly I'm kind of done. I don't want advice right now, I just feel like garbage.",
  theo: "I have a fellowship deadline in nine days, my feature's at 82 pages and act three is a mess. The climax just doesn't land. Can you help me finish this thing?",
  dev: "hey. can't sleep. thinking about my script lol",
};

for (const [who, transcript] of Object.entries(WRITERS)) {
  test(`${who}: the fallback has no template phrasing and no read-back`, () => {
    const heard = fallback(transcript);
    for (const phrase of TEMPLATE) assert.doesNotMatch(heard, phrase, heard);
    assert.doesNotMatch(heard.toLowerCase(), /okay so i'm like|bear with me|\bum\b/, heard);
    assert.ok((heard.match(/\?/g) || []).length <= 1, heard);
  });
}

test("the idea fallback says its first line once", () => {
  const heard = fallback(WRITERS.priya);
  const lines = heard.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  assert.equal(new Set(lines).size, lines.length, heard);
});

test("a no-advice vent gets company, not a script", () => {
  assert.equal(fallback(WRITERS.jordan), "That's a rough one.\n\nYou don't have to do anything with it right now.\n\nI'm here.");
});

test("a crisis turn keeps its safety structure, without the banned opener", () => {
  // Same shape as main apart from the opener. The template's grounding
  // question is clamped away later on main too; crisis copy is a founder and
  // legal decision (CLEMENTINE_PROMPT_v2.md D8), so only the opener changed.
  const heard = fallback("I can't do this anymore and I'm spiraling", "- Breathe.\n- Walk.");
  assert.match(heard, /^I'm really glad you told me\./);
  assert.match(heard, /Stay with me for one beat\./);
});

test("a no-question turn gets no stock question appended (a rate of 0 meant the default rate)", () => {
  const heard = fallback(WRITERS.theo);
  assert.doesNotMatch(heard, /sharpest part of this/i, heard);
  assert.doesNotMatch(heard, /what's|what is|do you want/i, heard);
});
