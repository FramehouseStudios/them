import assert from "node:assert/strict";
import { test } from "node:test";
import { stripPraiseOpener, shapeMentorReply } from "../lib/mentor_reply_shape.js";

test("mentor shaping preserves concrete advice instead of deleting it as a check-in", () => {
  for (const reply of [
    "First, remember that John must choose before midnight. Make him hide the key.",
    "Sounds like the antagonist controls the deadline. Let John take that leverage away.",
    "I hear that Mara lies to John. Make the lie cost her the key.",
    "First, let's remember the key is missing. Make John choose who to trust.",
  ]) {
    assert.deepEqual(stripPraiseOpener(reply), { text: reply, stripped: "" });
  }
});

test("mentor verdict carrying its because or criticism is never discarded", () => {
  for (const reply of [
    "The setup is strong because John's lie forces the chase. Make the key visible.",
    "The scene is good, but Mara never chooses. Give her a deadline.",
    "That is a strong setup; however, the clock has no consequence. Close the door.",
  ]) {
    assert.deepEqual(stripPraiseOpener(reply), { text: reply, stripped: "" });
  }
});

test("quoted punctuation cannot split off the mentor's external causal reason", () => {
  for (const line of [
    '"Do not leave. Stay here."',
    "'Do not leave. Stay here.'",
    '“Why now? Stay here.”',
    '‘Do not leave. Stay here.’',
    '"MARA: Do not leave. Stay here."',
    '"Do not leave.\nStay at the cafe\u0301."',
  ]) {
    const reply = `I love this line ${line} because John must choose. Keep the door locked.`;
    assert.deepEqual(stripPraiseOpener(reply), { text: reply, stripped: "" }, line);
    assert.equal(shapeMentorReply(reply, { mentorTurn: true }).text, reply, line);
  }
});

test("an unfinished quoted fragment cannot be excised as premise praise", () => {
  const reply = 'I love this line "Do not leave. Stay here';
  assert.deepEqual(stripPraiseOpener(reply), { text: reply, stripped: "" });
});

test("two bland check-ins can go without removing the causal craft note", () => {
  const reply = "Sounds like a rough spot. First, let's take a breath and remember: John must choose because the door locks at midnight. Who does he trust?";
  assert.deepEqual(stripPraiseOpener(reply), {
    text: "John must choose because the door locks at midnight. Who does he trust?",
    stripped: "Sounds like a rough spot. First, let's take a breath and remember:",
  });
});

test("bounded opener stripping never empties an answer or touches Page output", () => {
  const reply = "Sounds like a rough spot. First, let's take a breath.";
  assert.ok(stripPraiseOpener(reply).text.length > 0);
  assert.equal(shapeMentorReply(reply, { mentorTurn: true, screenplayPageWrite: true }).text, reply);
  assert.equal(shapeMentorReply(reply, { mentorTurn: false }).text, reply);
});
