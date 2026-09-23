import test from "node:test";
import assert from "node:assert/strict";
import { isPraiseOpener, stripPraiseOpener, shapeMentorReply } from "../lib/mentor_reply_shape.js";

test("[mentor-shape] praise and premise-verdict openers are recognised", () => {
  for (const s of [
    "That's a strong setup.",
    "Great setup.",
    "The setup is intriguing—a cab driver heading to the wrong address.",
    "Rosa having the wrong ring is a great setup for tension.",
    "Ada finding a body she recognizes is a strong inciting incident.",
    "Love this.",
    "That's an intriguing setup with built-in mystery.",
    "The premise feels evocative:",
    "That's a tough place to be.",
    "It's tough when a draft feels off.",
    "Let's take a breath and look at one part.",
    "It sounds like you're feeling stuck.",
    "I hear you.",
  ]) assert.equal(isPraiseOpener(s), true, s);
  for (const s of [
    "Mara pockets the ring before the vows.",
    "By page 12, give or take, and never later than 15.",
    "That line is on the nose; it says the feeling instead of doing it.",
    "The brother who wants to sell sees the diner as a burden.",
    "What is the last image?",
    "Pick the scene that bothers you most and read me its first line.",
    "It is tough on page 40 because the plan is stripped there.",
  ]) assert.equal(isPraiseOpener(s), false, s);
});

test("[mentor-shape] the opener is dropped and the reply still starts cleanly", () => {
  const r = stripPraiseOpener("That's a strong setup. Mara pockets the ring before the vows, and Rosa sees her do it. What does Rosa do with that?");
  assert.equal(r.stripped, "That's a strong setup.");
  assert.equal(r.text, "Mara pockets the ring before the vows, and Rosa sees her do it. What does Rosa do with that?");
  const lead = stripPraiseOpener("Great setup. But the driver locks the doors first.");
  assert.equal(lead.text, "The driver locks the doors first.");
});

test("[mentor-shape] never empties a reply, never touches a non-praise opener", () => {
  assert.deepEqual(stripPraiseOpener("That's a strong setup."), { text: "That's a strong setup.", stripped: "" });
  assert.deepEqual(stripPraiseOpener(""), { text: "", stripped: "" });
  const plain = "Mara pockets the ring. Rosa sees it.";
  assert.deepEqual(stripPraiseOpener(plain), { text: plain, stripped: "" });
});

test("[mentor-shape] only mentor turns are shaped; page writes pass through untouched", () => {
  const page = "INT. KITCHEN - NIGHT\n\nGreat setup. MARA waits.";
  assert.equal(shapeMentorReply(page, { mentorTurn: true, screenplayPageWrite: true }).text, page);
  assert.equal(shapeMentorReply("Great setup. Mara waits.", { mentorTurn: false }).text, "Great setup. Mara waits.");
  assert.equal(shapeMentorReply("Great setup. Mara waits.", { mentorTurn: true }).text, "Mara waits.");
});

import { capQuestions } from "../lib/mentor_reply_shape.js";

test("[mentor-shape] a stacked reply keeps only the handoff question", () => {
  const reply = [
    "A slow opening often means the world lacks pressure. The audience needs to know why this story starts today, not last year. What does your character want right now, what's the deadline, and what's standing in their way? Find that urgency, and the opening will pick up speed. What's your character's immediate want in the first scene?",
  ].join("\n\n");
  const out = capQuestions(reply);
  assert.equal(out.dropped.length, 1);
  assert.equal((out.text.match(/\?/g) || []).length, 1);
  assert.ok(out.text.endsWith("What's your character's immediate want in the first scene?"));
  assert.ok(out.text.includes("Find that urgency, and the opening will pick up speed."));
  assert.equal(out.text.includes("what's the deadline"), false);
});

test("[mentor-shape] an 'Or …?' tail keeps the first of the pair, and labels become colons", () => {
  const reply = "Picture this: a cramped diner at midnight. JESSICA wants to close early. The obstacle? TOM keeps ordering refills.\n\nHow do you see this playing out? Or is there a scene you've been mulling over?";
  const out = capQuestions(reply);
  assert.equal(out.text, "Picture this: a cramped diner at midnight. JESSICA wants to close early. The obstacle: TOM keeps ordering refills.\n\nHow do you see this playing out?");
  assert.deepEqual(out.dropped, ["Or is there a scene you've been mulling over?"]);
});

test("[mentor-shape] mid-reply rhetorical questions go, the closing question stays", () => {
  const reply = "It forces Hal to confront his past. Does it make him question his career, his integrity, or something deeper?\n\nConsider a scene where Hal confronts the student. What does Hal want from this confrontation, and what does the student want in return?";
  const out = capQuestions(reply);
  assert.equal(out.text, "It forces Hal to confront his past.\n\nConsider a scene where Hal confronts the student. What does Hal want from this confrontation, and what does the student want in return?");
});

test("[mentor-shape] quoted lines are never counted or cut, and a single question passes through", () => {
  const notes = 'That line says the feeling. Instead of "Where were you?" try "You smell like her." Which of them is lying?';
  assert.deepEqual(capQuestions(notes), { text: notes, dropped: [] });
  const one = "By page 12, never past 15. What is the last image?";
  assert.deepEqual(capQuestions(one), { text: one, dropped: [] });
  assert.deepEqual(capQuestions(""), { text: "", dropped: [] });
  const only = "What does she want? What is in the way?";
  assert.equal(capQuestions(only).text, "What is in the way?");
});

test("[mentor-shape] shapeMentorReply reports dropped questions and still skips page writes", () => {
  const reply = "That's a strong setup. Why does she leave today? What's the deadline? What's in the way?";
  const shaped = shapeMentorReply(reply, { mentorTurn: true });
  assert.equal(shaped.stripped, "That's a strong setup.");
  assert.equal(shaped.text, "What's in the way?");
  assert.equal(shaped.droppedQuestions.length, 2);
  const page = shapeMentorReply(reply, { mentorTurn: true, screenplayPageWrite: true });
  assert.equal(page.text, reply);
  assert.deepEqual(page.droppedQuestions, []);
});
