import test from "node:test";
import assert from "node:assert/strict";
import { INTENT, classifyIntent } from "../lib/clementine/intents.js";
import { LANE, EFFORT, laneForIntent } from "../lib/clementine/lanes.js";
import { resolveTalkLane } from "../lib/clementine/page_lane_adapter.js";

test("[intents] story help is a mentor intent, not comfort", () => {
  for (const text of [
    "I'm stuck on the second act.",
    "writer's block again",
    "my ending feels flat",
    "is this scene working?",
    "what should happen after the midpoint",
    "help me fix the climax",
    "notes on this line: I'm so angry at you",
    "what's missing from the opening",
    "any ideas for the diner scene",
    "How should I end act two?",
  ]) {
    assert.equal(classifyIntent(text), INTENT.STORY_HELP, text);
  }
  assert.equal(classifyIntent("I'm anxious and overwhelmed"), INTENT.COMFORT);
  assert.equal(classifyIntent("comfort me"), INTENT.COMFORT);
  assert.equal(laneForIntent(INTENT.STORY_HELP).lane, LANE.DEEP);
  assert.equal(laneForIntent(INTENT.STORY_HELP).effort, EFFORT.LOW);
  assert.equal(laneForIntent(INTENT.STORY_HELP).walletMeter, "deep");
});

test("[intents] page cues still win over story help, and plan/think-hard keep their lanes", () => {
  assert.equal(classifyIntent("write the next beat where she leaves"), INTENT.PAGE_EDIT);
  assert.equal(classifyIntent("continue the scene"), INTENT.PAGE_CONTINUE);
  assert.equal(classifyIntent("rewrite this line tighter"), INTENT.PAGE_REWRITE);
  assert.equal(classifyIntent("help me plan act two conflict"), INTENT.PLAN, "an explicit plan ask stays Deep/medium");
  assert.equal(classifyIntent("outline the structure"), INTENT.PLAN);
  assert.equal(classifyIntent("think hard about the twist"), INTENT.THINK_HARD);
});

test("[intents] a fresh-conversation opener is a pitch; the same words mid-conversation are a greeting", () => {
  for (const text of ["hello", "Hey.", "talk to me", "let's write something", "what should we write today", "give me anything", "I've got nothing today", "i'm here"]) {
    assert.equal(classifyIntent(text, { fresh: true }), INTENT.PITCH, text);
  }
  assert.equal(classifyIntent("hello", { fresh: false }), INTENT.GREETING);
  assert.equal(classifyIntent("hello"), INTENT.GREETING);
  assert.equal(classifyIntent("let's write a scene", { fresh: true }), INTENT.PAGE_EDIT, "a page cue outranks the pitch");
  assert.equal(laneForIntent(INTENT.PITCH).lane, LANE.COMPANION);
  assert.equal(resolveTalkLane("hello", { fresh: true }).intent, INTENT.PITCH);
  assert.equal(resolveTalkLane("hello", {}).intent, INTENT.GREETING);
});
