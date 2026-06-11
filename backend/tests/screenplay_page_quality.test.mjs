import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluateScreenplayPageQuality,
  isLikelyOutlineOrCraftArtifactLine,
  isLikelyPlaceholderScreenplayLine,
  isLowSignalActionLine,
  minimumExpectedWordsForRequestedPages,
} from "../lib/screenplay_page_quality.js";

test("[screenplay-page-quality] accepts playable screenplay pages", () => {
  const quality = evaluateScreenplayPageQuality({
    text: "INT. MOTEL ROOM - NIGHT\n\nJune folds the receipt into a white square.\n\nMARCUS\nYou kept it.",
    lines: [
      { text: "INT. MOTEL ROOM - NIGHT", element: "sceneHeading" },
      { text: "", element: "blank" },
      { text: "June folds the receipt into a white square.", element: "action" },
      { text: "", element: "blank" },
      { text: "MARCUS", element: "character" },
      { text: "You kept it.", element: "dialogue" },
    ],
  });

  assert.equal(quality.ok, true);
  assert.equal(quality.reason, "ok");
});

test("[screenplay-page-quality] rejects outline and craft artifacts masquerading as pages", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "Beat 1: June confronts Marcus about the receipt.",
      "Next three turns: June hides the reel; Marcus forces a public choice.",
      "Act III payoff path: the reel exposes the fixer.",
      "The scene should escalate suspicion before the reveal.",
    ].join("\n"),
    lines: [
      { text: "INT. MOTEL ROOM - NIGHT", element: "sceneHeading" },
      { text: "", element: "blank" },
      { text: "Beat 1: June confronts Marcus about the receipt.", element: "action" },
      { text: "Next three turns: June hides the reel; Marcus forces a public choice.", element: "action" },
      { text: "Act III payoff path: the reel exposes the fixer.", element: "action" },
      { text: "The scene should escalate suspicion before the reveal.", element: "action" },
    ],
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "outline_or_craft_artifact");
  assert.equal(isLikelyOutlineOrCraftArtifactLine("Next three turns: June hides the reel."), true);
  assert.equal(isLikelyOutlineOrCraftArtifactLine("Act III payoff path: the reel exposes the fixer."), true);
  assert.equal(isLikelyOutlineOrCraftArtifactLine("Memory to page execution: dramatize turn one first."), true);
});

test("[screenplay-page-quality] rejects placeholder screenplay scaffolding", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. ROOM - NIGHT",
      "",
      "Action line goes here.",
      "",
      "CHARACTER A",
      "Dialogue line.",
    ].join("\n"),
    lines: [
      { text: "INT. ROOM - NIGHT", element: "sceneHeading" },
      { text: "", element: "blank" },
      { text: "Action line goes here.", element: "action" },
      { text: "", element: "blank" },
      { text: "CHARACTER A", element: "character" },
      { text: "Dialogue line.", element: "dialogue" },
    ],
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "placeholder_page_text");
});

test("[screenplay-page-quality] rejects generic low-density page action", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. ROOM - NIGHT",
      "",
      "They keep talking in the room.",
      "The argument gets more intense.",
      "The conversation continues for a while.",
    ].join("\n"),
    lines: [
      { text: "INT. ROOM - NIGHT", element: "sceneHeading" },
      { text: "", element: "blank" },
      { text: "They keep talking in the room.", element: "action" },
      { text: "The argument gets more intense.", element: "action" },
      { text: "The conversation continues for a while.", element: "action" },
    ],
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "low_dramatic_density");
});

test("[screenplay-page-quality] rejects vague cinematic vapor without playable behavior", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. ROOM - NIGHT",
      "",
      "A silence stretches between them.",
      "The tension builds.",
      "The truth hangs between them.",
      "No one knows what to say.",
    ].join("\n"),
    lines: [
      { text: "INT. ROOM - NIGHT", element: "sceneHeading" },
      { text: "", element: "blank" },
      { text: "A silence stretches between them.", element: "action" },
      { text: "The tension builds.", element: "action" },
      { text: "The truth hangs between them.", element: "action" },
      { text: "No one knows what to say.", element: "action" },
    ],
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "low_dramatic_density");
});

test("[screenplay-page-quality] rejects underfilled multi-page requests", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "June folds the receipt into a white square.",
      "",
      "MARCUS",
      "You kept it.",
      "",
      "June looks up before he can hide the shake in his hand.",
    ].join("\n"),
    lines: [
      { text: "INT. MOTEL ROOM - NIGHT", element: "sceneHeading" },
      { text: "", element: "blank" },
      { text: "June folds the receipt into a white square.", element: "action" },
      { text: "", element: "blank" },
      { text: "MARCUS", element: "character" },
      { text: "You kept it.", element: "dialogue" },
      { text: "", element: "blank" },
      { text: "June looks up before he can hide the shake in his hand.", element: "action" },
    ],
    targetPages: 3,
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "underfilled_page_text");
  assert.equal(minimumExpectedWordsForRequestedPages(3), 120);
});

test("[screenplay-page-quality] caps requested-page floors below full-feature targets", () => {
  assert.equal(minimumExpectedWordsForRequestedPages(1), 4);
  assert.equal(minimumExpectedWordsForRequestedPages(8), 350);
  assert.equal(minimumExpectedWordsForRequestedPages(30), 420);
});

test("[screenplay-page-quality] requires screenplay shape when no trusted anchor exists", () => {
  const quality = evaluateScreenplayPageQuality({
    text: "June folds the receipt into a white square.",
    lines: [
      { text: "June folds the receipt into a white square.", element: "action" },
    ],
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "missing_screenplay_shape");
});

test("[screenplay-page-quality] allows anchored action-only continuations with enough playable content", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
      "June folds the receipt into a white square.",
      "The motel sign flickers out behind her.",
    ].join("\n"),
    lines: [
      { text: "June folds the receipt into a white square.", element: "action" },
      { text: "The motel sign flickers out behind her.", element: "action" },
    ],
    hasSceneAnchor: true,
  });

  assert.equal(quality.ok, true);
});

test("[screenplay-page-quality] protects dialogue lines from prose artifact heuristics", () => {
  assert.equal(
    isLikelyOutlineOrCraftArtifactLine("I would burn the whole town down first.", "dialogue"),
    false,
  );
  assert.equal(
    isLikelyOutlineOrCraftArtifactLine("I would make this scene more tense.", "action"),
    true,
  );
});

test("[screenplay-page-quality] identifies placeholders and low-signal action without flagging specific action", () => {
  assert.equal(isLikelyPlaceholderScreenplayLine("CHARACTER A", "character"), true);
  assert.equal(isLikelyPlaceholderScreenplayLine("Dialogue line.", "dialogue"), true);
  assert.equal(isLowSignalActionLine("They keep talking in the room.", "action"), true);
  assert.equal(isLowSignalActionLine("A silence stretches between them.", "action"), true);
  assert.equal(isLowSignalActionLine("The truth hangs between them.", "action"), true);
  assert.equal(
    isLowSignalActionLine("June folds the receipt into a white square.", "action"),
    false,
  );
});
