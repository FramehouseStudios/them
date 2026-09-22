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
