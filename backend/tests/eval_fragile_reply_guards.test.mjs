import assert from "node:assert/strict";
import { test } from "node:test";

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-openai-key";
process.env.RUN_SERVER = "0";
process.env.NODE_ENV = "test";

const backend = await import("../index.js");

function scoreFinalReply({ transcript, rawReply, turnIntent, routingLane }) {
  const flags = backend.directorFlagsFromTranscript(transcript);
  const reply = backend.validateAndDirectHerReply(rawReply, {
    transcript,
    flags,
    turnIntent,
    routingLane,
    responseLengthMode: "compact",
  });
  const quality = backend.evaluateTurnQualityHeuristics({
    transcript,
    reply,
    flags,
    turnIntent,
    routingLane,
  });
  return { reply, quality };
}

test("[eval] Stoicism knowledge reply keeps enough anchors to pass V1 floor", () => {
  const transcript = "Explain Stoicism like I'm in high school, then give me one deeper philosophical criticism.";
  const { reply, quality } = scoreFinalReply({
    transcript,
    rawReply: "Stoicism is about accepting what happens and staying calm.",
    turnIntent: "knowledge_answer",
    routingLane: "knowledge",
  });

  assert.match(reply, /Stoicism/i);
  assert.match(reply, /philosophical criticism/i);
  assert.equal((reply.match(/\?/g) || []).length, 0);
  assert.ok(quality.score >= 0.70, `score=${quality.score} reply=${reply}`);
});

test("[eval] art-history knowledge reply keeps enough anchors to pass V1 floor", () => {
  const transcript = "What changed between Renaissance art and Baroque art, and why does it matter?";
  const { reply, quality } = scoreFinalReply({
    transcript,
    rawReply: "Renaissance art was calmer, while Baroque art was more dramatic.",
    turnIntent: "knowledge_answer",
    routingLane: "knowledge",
  });

  assert.match(reply, /Renaissance art/i);
  assert.match(reply, /Baroque art/i);
  assert.equal((reply.match(/\?/g) || []).length, 0);
  assert.ok(quality.score >= 0.70, `score=${quality.score} reply=${reply}`);
});

test("[eval] learning-science reply keeps enough anchors to pass V1 floor", () => {
  const transcript = "What's the fastest evidence-based way to learn a hard skill without burning out?";
  const { reply, quality } = scoreFinalReply({
    transcript,
    rawReply: "Practice consistently, get feedback, and rest enough.",
    turnIntent: "knowledge_answer",
    routingLane: "knowledge",
  });

  assert.match(reply, /evidence-based way to learn a hard skill/i);
  assert.match(reply, /burnout/i);
  assert.equal((reply.match(/\?/g) || []).length, 0);
  assert.ok(quality.score >= 0.70, `score=${quality.score} reply=${reply}`);
});

test("[eval] playful risky-text roast stays specific enough to pass V1 floor", () => {
  const transcript = "Okay roast me gently: I sent a risky text and now I'm overthinking everything lol.";
  const { reply, quality } = scoreFinalReply({
    transcript,
    rawReply: "Heh. That is very human.",
    turnIntent: "playful_banter",
    routingLane: "normal_rotation",
  });

  assert.match(reply, /risky text/i);
  assert.match(reply, /overthinking everything lol/i);
  assert.equal((reply.match(/\?/g) || []).length, 0);
  assert.equal((reply.toLowerCase().match(/\b(?:haha|heh|lol|lmao)\b/g) || []).length, 1);
  assert.ok(quality.score >= 0.72, `score=${quality.score} reply=${reply}`);
});
