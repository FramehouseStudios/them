// Clementine's own talk reply is heard when it keeps the spoken contract; the
// lane templates are the fallback. Six writers from USER_ROLEPLAY_CRITIQUE.md
// (2026-10-01): with ideal model replies, the templates replaced every one
// ("Core idea I hear: okay so I'm like…" twice, "I hear you. That makes
// sense.", "Heh. That is very human."). Deterministic; no model call.

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.OPENAI_API_KEY ||= "deterministic-guard-no-network";
process.env.RUN_SERVER = "0";

const {
  directorFlagsFromTranscript,
  inferRoutingPriorityLane,
  buildTurnPlanner,
  validateAndDirectHerReply,
} = await import("../index.js");
const { ownTalkReply } = await import("../lib/clementine/talk_reply_contract.js");

function hear(transcript, reply) {
  const flags = directorFlagsFromTranscript(transcript);
  const routingPlan = inferRoutingPriorityLane(transcript, flags);
  const turnPlanner = buildTurnPlanner({ transcript, flags, routingPlan, behaviorMode: "growth", memory: {} });
  const outcome = { keptOwnReply: false };
  const heard = validateAndDirectHerReply(reply, {
    outcome,
    transcript,
    gratitudeOnlyTurn: Boolean(flags?.gratitudeOnly),
    socialSparkActive: Boolean(flags?.socialSpark),
    preferQuestionEnding: Boolean(turnPlanner?.forceQuestionEnding),
    requireExtendedAnswer: Boolean(turnPlanner?.requiresSubstantiveAnswer),
    responseLengthMode: String(turnPlanner?.responseLengthMode || "compact"),
    minExtendedWords: Math.max(16, Number(turnPlanner?.minAnswerWords || 28)),
    turnIntent: String(turnPlanner?.intent || ""),
    routingLane: String(routingPlan?.lane || "normal_rotation"),
    flags,
    allowReassurance: true,
  });
  return { heard, kept: outcome.keptOwnReply, lane: routingPlan?.lane };
}

const TEMPLATE_PHRASES = [
  /core idea i hear/i, /sharpen pass/i, /build step/i, /i hear you/i, /you said:/i,
  /that is very human/i, /\bheh\b/i, /body feel/i, /iterate first/i, /do you want comfort/i,
];

const WRITERS = [
  ["Priya, walking with an idea",
    "okay wait, idea, I'm walking so bear with me, what if there's this, um, night-shift pharmacist in Tucson who starts noticing the same prescription getting filled by different people and it's, I don't know, kind of a thriller but also kind of about her dad? Is that anything?",
    "Okay, keep walking, because that's something.\n\nThe prescriptions are the hook. Her dad is the movie.\n\nWhat if one of the names on those scripts is his?"],
  ["Theo, nine days to a deadline",
    "I have a fellowship deadline in nine days, my feature's at 82 pages and act three is a mess. The climax just doesn't land. Can you help me finish this thing?",
    "Nine days is plenty if we stop polishing and fix one thing.\n\nI'd bet your climax isn't a choice yet. Things happen to her instead of her deciding something that costs her.\n\nWhat does she have to give up in the last ten pages?"],
  ["Jordan, rejected and asking for no advice",
    "Got the Nicholl rejection this morning. Didn't even make quarters. Honestly I'm kind of done. I don't want advice right now, I just feel like garbage.",
    "Ugh. I'm sorry. Not making quarters stings in a really specific way.\n\nYou don't have to do anything with it today.\n\nI'm right here."],
  ["Sam, a punch-up by voice",
    "punch up this exchange, it's so flat. MARCUS: I can't believe you told her. LENA: I didn't mean to. MARCUS: Well you did. LENA: I'm sorry, okay?",
    "It's flat because they're both apologizing for the same thing. Nobody's fighting.\n\nGive Lena a counterpunch. She didn't slip, she answered a direct question, and she's not sorry.\n\nI've got a sharper pass that ends with her saying \"Teach me.\" Want it on the page?"],
  ["Dev, can't sleep",
    "hey. can't sleep. thinking about my script lol",
    "Ah, the can't-sleep script brain. It always has notes.\n\nWhat's it chewing on?"],
];

for (const [who, transcript, reply] of WRITERS) {
  test(`${who}: hears Clementine's own reply, not a lane template`, () => {
    const { heard, kept } = hear(transcript, reply);
    assert.equal(kept, true);
    assert.equal(heard, reply);
    for (const phrase of TEMPLATE_PHRASES) assert.doesNotMatch(heard, phrase);
  });
}

test("Maya, stuck on page 12: her reply is kept with one question, the last", () => {
  const { heard, kept } = hear(
    "okay so I'm like twelve pages into my pilot and I have no idea what happens next. Dani just found out her roommate's been selling her stuff online and then... nothing. I'm stuck.",
    "Oh, that's a great setup. She's still living with the person selling her stuff?\n\nI think the stall is Dani's only reacted so far. She buys her own lamp back off the listing, under a fake name, and makes the roommate hand-deliver it.\n\nWant me to put that on the page?"
  );
  assert.equal(kept, true);
  assert.equal((heard.match(/\?/g) || []).length, 1);
  assert.match(heard, /selling her stuff\.\n\nI think the stall/);
  assert.match(heard, /Want me to put that on the page\?$/);
});

test("a crisis turn always keeps its safety structure", () => {
  const { kept, lane } = hear(
    "I can't do this anymore, I keep thinking I want to kill myself",
    "That sounds really heavy.\n\nI'm here with you right now."
  );
  assert.equal(lane, "high_distress_safety");
  assert.equal(kept, false);
  assert.equal(ownTalkReply("I'm here with you.", { transcript: "some days I want to hurt myself" }), null);
});

test("a reply that misses the contract falls back to the lane template", () => {
  const transcript = "I'm stuck on my second act and the middle sags.";
  assert.equal(ownTalkReply("- Raise the stakes.\n- Cut a scene.\n- Add a clock.", { raw: "- Raise the stakes.\n- Cut a scene.\n- Add a clock.", transcript }), null);
  assert.equal(ownTalkReply("Step 1: find the midpoint. Then rebuild.", { transcript }), null);
  assert.equal(ownTalkReply("I'm stuck on my second act and the middle sags. Let's fix it.", { transcript }), null);
  assert.equal(ownTalkReply("The middle sags because nobody wants anything and", { transcript }), null);
  assert.equal(ownTalkReply("I hear you. That makes sense.", { transcript }), null);
});

test("no-advice turns keep only a reply without advice", () => {
  const ctx = { transcript: "I don't want advice, I just feel like garbage.", explicitNoAdvice: true, hasAdvice: (r) => /you should/i.test(r) };
  assert.equal(ownTalkReply("You should take a walk and reread your favorite scene.", ctx), null);
  assert.equal(ownTalkReply("That's a rough one. I'm here.", ctx), "That's a rough one. I'm here.");
});

test("a knowledge answer is not a one-liner", () => {
  const { kept } = hear(
    "Explain Stoicism like I'm in high school, then give me one deeper philosophical criticism.",
    "Stoicism is about accepting what happens and staying calm."
  );
  assert.equal(kept, false);
});

test("gratitude turns end without a question", () => {
  assert.equal(
    ownTalkReply("Glad it helped. Go write the scene. Want me to check it after?", { gratitudeOnlyTurn: true }),
    "Glad it helped. Go write the scene. Want me to check it after."
  );
});
