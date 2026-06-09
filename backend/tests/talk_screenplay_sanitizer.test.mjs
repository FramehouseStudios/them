import assert from "node:assert/strict";
import test from "node:test";

process.env.RUN_SERVER = "0";
process.env.OPENAI_API_KEY ||= "test-openai-key";
process.env.REALTIME_PROVIDER ||= "stub";

const {
  normalizeTalkPageReply,
} = await import("../index.js");

test("[talk-screenplay-sanitizer] removes warm lead-ins, markdown fences, and craft afterwords", () => {
  const raw = [
    "Absolutely - I'd write it like this:",
    "",
    "```fountain",
    "INT. MOTEL ROOM - NIGHT",
    "",
    "Rain taps the air conditioner hard enough to sound impatient.",
    "",
    "JUNE",
    "(quiet)",
    "I know where he hid it.",
    "```",
    "",
    "This gives the scene more pressure without explaining the feeling.",
  ].join("\n");

  const out = normalizeTalkPageReply(raw);
  assert.equal(out, [
    "INT. MOTEL ROOM - NIGHT",
    "",
    "Rain taps the air conditioner hard enough to sound impatient.",
    "",
    "JUNE",
    "(quiet)",
    "I know where he hid it.",
  ].join("\n"));
});

test("[talk-screenplay-sanitizer] strips direct co-writer setup before a scene heading", () => {
  const out = normalizeTalkPageReply([
    "Let's take the scene this way:",
    "EXT. GAS STATION - DAWN",
    "",
    "Mara watches the first truck pass without lifting her thumb.",
  ].join("\n"));

  assert.equal(out, [
    "EXT. GAS STATION - DAWN",
    "",
    "Mara watches the first truck pass without lifting her thumb.",
  ].join("\n"));
});

test("[talk-screenplay-sanitizer] strips strategy and diagnosis lines before page text", () => {
  const out = normalizeTalkPageReply([
    "Strategy: make the receipt the trap instead of exposition.",
    "The scene needs one irreversible turn before anyone explains the clue.",
    "",
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June folds the receipt into a white square.",
    "",
    "MARCUS",
    "You kept it.",
  ].join("\n"));

  assert.equal(out, [
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June folds the receipt into a white square.",
    "",
    "MARCUS",
    "You kept it.",
  ].join("\n"));
});

test("[talk-screenplay-sanitizer] keeps playable action lines that are not trailing craft notes", () => {
  const out = normalizeTalkPageReply([
    "INT. KITCHEN - MORNING",
    "",
    "This gives way to a silence neither of them wants to break.",
    "",
    "CAL",
    "Say it.",
  ].join("\n"));

  assert.equal(out, [
    "INT. KITCHEN - MORNING",
    "",
    "This gives way to a silence neither of them wants to break.",
    "",
    "CAL",
    "Say it.",
  ].join("\n"));
});
