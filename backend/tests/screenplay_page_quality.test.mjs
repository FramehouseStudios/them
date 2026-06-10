import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluateScreenplayPageQuality,
  isLikelyOutlineOrCraftArtifactLine,
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
      "The scene should escalate suspicion before the reveal.",
    ].join("\n"),
    lines: [
      { text: "INT. MOTEL ROOM - NIGHT", element: "sceneHeading" },
      { text: "", element: "blank" },
      { text: "Beat 1: June confronts Marcus about the receipt.", element: "action" },
      { text: "The scene should escalate suspicion before the reveal.", element: "action" },
    ],
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "outline_or_craft_artifact");
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
