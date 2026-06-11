import assert from "node:assert/strict";
import test from "node:test";

process.env.RUN_SERVER = "0";
process.env.OPENAI_API_KEY ||= "test-openai-key";
process.env.REALTIME_PROVIDER ||= "stub";

const {
  applyTalkScreenplayRepairCandidate,
  buildTalkScreenplayOutput,
  isAuthoritativeTalkScreenplayOutput,
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

test("[talk-screenplay-sanitizer] strips page labels, dividers, and trailing craft notes", () => {
  const out = normalizeTalkPageReply([
    "## Screenplay Pages",
    "---",
    "Here are the next pages:",
    "",
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June folds the receipt into a white square.",
    "",
    "MARCUS",
    "You kept it.",
    "",
    "END SCENE.",
    "",
    "Why this works:",
    "This gives the scene pressure without explaining the feeling.",
    "Want me to keep going from here?",
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

test("[talk-screenplay-sanitizer] preserves dialogue that looks like an assistant offer", () => {
  const out = normalizeTalkPageReply([
    "INT. MOTEL ROOM - NIGHT",
    "",
    "MARCUS",
    "Want me to go?",
    "",
    "June does not answer.",
  ].join("\n"));

  assert.equal(out, [
    "INT. MOTEL ROOM - NIGHT",
    "",
    "MARCUS",
    "Want me to go?",
    "",
    "June does not answer.",
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

test("[talk-screenplay-output] repairs missing scene heading from trusted page anchor", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "MARA: Don't open it.",
      "",
      "Eli slips the receipt under the coffee cup before she can see his hand shake.",
    ].join("\n"),
    studioMeta: {
      screenplayTarget: "page",
      screenplayAnchorSceneLabel: "INT. MOTEL ROOM - NIGHT",
    },
  });

  assert.equal(output.target, "page");
  assert.equal(output.source, "repaired_scene_anchor");
  assert.equal(output.text, [
    "INT. MOTEL ROOM - NIGHT",
    "",
    "MARA",
    "Don't open it.",
    "",
    "Eli slips the receipt under the coffee cup before she can see his hand shake.",
  ].join("\n"));
  assert.equal(output.lines[0].element, "sceneHeading");
  assert.ok(output.lines.some((line) => line.element === "character"));
});

test("[talk-screenplay-output] repairs action-only continuations when anchor is available", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "June folds the receipt into a white square.",
      "The motel sign flickers out behind her.",
    ].join("\n"),
    studioMeta: {
      screenplayTarget: "page",
      screenplayAnchorSceneLabel: "EXT. MOTEL BALCONY - DAWN",
    },
  });

  assert.equal(output.target, "page");
  assert.equal(output.source, "repaired_scene_anchor");
  assert.equal(output.text.startsWith("EXT. MOTEL BALCONY - DAWN\n\n"), true);
});

test("[talk-screenplay-output] accepts playable page output after quality gate", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "June folds the receipt into a white square.",
      "",
      "MARCUS",
      "You kept it.",
      "",
      "June looks up before he can hide the shake in his hand.",
    ].join("\n"),
    studioMeta: {
      screenplayTarget: "page",
    },
  });

  assert.equal(output.target, "page");
  assert.equal(output.source, "studio_target");
  assert.ok(output.lines.some((line) => line.element === "sceneHeading"));
  assert.ok(output.lines.some((line) => line.element === "dialogue"));
});

test("[talk-screenplay-output] rejects outline prose masquerading as page text", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "Beat 1: June confronts Marcus about the receipt.",
      "The scene should escalate suspicion before the reveal.",
    ].join("\n"),
    studioMeta: {
      screenplayTarget: "page",
      screenplayAnchorSceneLabel: "INT. MOTEL ROOM - NIGHT",
    },
  });

  assert.equal(output.target, "voice_pin");
  assert.equal(output.source, "guard_low_page_quality");
});

test("[talk-screenplay-output] rejects placeholder page scaffolding", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "INT. ROOM - NIGHT",
      "",
      "Action line goes here.",
      "",
      "CHARACTER A",
      "Dialogue line.",
    ].join("\n"),
    studioMeta: {
      screenplayTarget: "page",
    },
  });

  assert.equal(output.target, "voice_pin");
  assert.equal(output.source, "guard_low_page_quality");
});

test("[talk-screenplay-output] rejects generic low-density page action", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "INT. ROOM - NIGHT",
      "",
      "They keep talking in the room.",
      "The argument gets more intense.",
      "The conversation continues for a while.",
    ].join("\n"),
    studioMeta: {
      screenplayTarget: "page",
    },
  });

  assert.equal(output.target, "voice_pin");
  assert.equal(output.source, "guard_low_page_quality");
});

test("[talk-screenplay-output] rejects craft notes even with a scene anchor", () => {
  const output = buildTalkScreenplayOutput({
    reply: "The scene needs more pressure before anyone explains the clue.",
    studioMeta: {
      screenplayTarget: "page",
      screenplayAnchorSceneLabel: "INT. MOTEL ROOM - NIGHT",
    },
  });

  assert.equal(output.target, "voice_pin");
  assert.equal(output.source, "guard_invalid_page_format");
});

test("[talk-screenplay-output] rejects low-quality explicit prompt block fallback", () => {
  const output = buildTalkScreenplayOutput({
    reply: "",
    transcript: [
      "Write exactly this screenplay block and nothing else:",
      "INT. MOTEL ROOM - NIGHT",
      "",
      "Beat 1: June confronts Marcus about the receipt.",
      "The scene should escalate suspicion before the reveal.",
    ].join("\n"),
    studioMeta: {
      screenplayTarget: "page",
      screenplayAnchorSceneLabel: "INT. MOTEL ROOM - NIGHT",
    },
  });

  assert.equal(output.target, "voice_pin");
  assert.equal(output.source, "guard_invalid_page_format");
});

test("[talk-screenplay-output] rejects underfilled requested page batches", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "June folds the receipt into a white square.",
      "",
      "MARCUS",
      "You kept it.",
      "",
      "June looks up before he can hide the shake in his hand.",
    ].join("\n"),
    transcript: "Write the next three pages from here.",
    studioMeta: {
      screenplayTarget: "page",
    },
  });

  assert.equal(output.target, "voice_pin");
  assert.equal(output.source, "guard_low_page_quality");
});

test("[talk-screenplay-output] accepts a repair-pass candidate after the live guard rejects the first draft", () => {
  const studioMeta = {
    screenplayTarget: "page",
    screenplayAnchorSceneLabel: "INT. MOTEL ROOM - NIGHT",
  };
  const transcript = "Continue the motel scene as screenplay pages.";
  const failed = buildTalkScreenplayOutput({
    reply: [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "Beat 1: June confronts Marcus about the receipt.",
      "The scene should escalate suspicion before the reveal.",
    ].join("\n"),
    transcript,
    studioMeta,
  });
  assert.equal(failed.target, "voice_pin");
  assert.equal(failed.source, "guard_low_page_quality");

  const repaired = applyTalkScreenplayRepairCandidate({
    currentOutput: failed,
    candidateReply: [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "June folds the receipt into a white square and slides it under the motel Bible.",
      "",
      "MARCUS",
      "You kept it.",
      "",
      "The bathroom faucet knocks once inside the wall. June looks at his wet cuffs before she looks at his face.",
      "",
      "JUNE",
      "I kept everything you were afraid to touch.",
    ].join("\n"),
    transcript,
    studioMeta,
  });

  assert.equal(repaired.target, "page");
  assert.equal(repaired.source, "repair_pass");
  assert.equal(
    isAuthoritativeTalkScreenplayOutput(repaired, { studioMeta, transcript }),
    true
  );
});

test("[talk-screenplay-output] rejects repair-pass candidates that still look like outlines", () => {
  const studioMeta = {
    screenplayTarget: "page",
    screenplayAnchorSceneLabel: "INT. MOTEL ROOM - NIGHT",
  };
  const failed = {
    target: "voice_pin",
    source: "guard_low_page_quality",
    text: "",
    lines: [],
  };
  const repaired = applyTalkScreenplayRepairCandidate({
    currentOutput: failed,
    candidateReply: [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "Next three turns: June hides the receipt, Marcus admits the lie, the truth lands.",
      "The scene should create more pressure.",
    ].join("\n"),
    transcript: "Write the next page.",
    studioMeta,
  });

  assert.equal(repaired, null);
});

test("[talk-screenplay-output] final authority gate rejects outline drift", () => {
  const screenplayOutput = {
    target: "page",
    format: "hollywood",
    source: "generation_transcript",
    text: [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "Next three turns: June hides the reel; Marcus forces a public choice.",
      "Act III payoff path: the reel exposes the fixer.",
    ].join("\n"),
    lines: [
      { text: "INT. MOTEL ROOM - NIGHT", element: "sceneHeading" },
      { text: "", element: "blank" },
      { text: "Next three turns: June hides the reel; Marcus forces a public choice.", element: "action" },
      { text: "Act III payoff path: the reel exposes the fixer.", element: "action" },
    ],
  };

  assert.equal(
    isAuthoritativeTalkScreenplayOutput(screenplayOutput, {
      studioMeta: { screenplayTarget: "page", screenplayAnchorSceneLabel: "INT. MOTEL ROOM - NIGHT" },
    }),
    false
  );
});
