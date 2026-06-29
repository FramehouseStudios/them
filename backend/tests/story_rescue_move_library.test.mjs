import assert from "node:assert/strict";
import { test } from "node:test";

import {
  inferStoryMoveActKind,
  selectStoryMoveLibraryLines,
  selectStoryMoveLibraryLinesForContext,
} from "../lib/story_rescue_move_library.js";

test("[story-rescue-move-library] selects act-aware engines for blocked turns", () => {
  assert.equal(inferStoryMoveActKind("Act II midpoint trap"), "act2");
  assert.equal(inferStoryMoveActKind("third act climax"), "act3");

  const actTwoLines = selectStoryMoveLibraryLinesForContext({
    transcript: "My second act is dragging and the middle feels static.",
    intent: "momentum_rescue",
    act: "Act II",
    currentBeat: "Mara thinks the recovered reel solved the case.",
    characterArcState: "Mara still edits pain into control.",
  });
  assert.ok(actTwoLines.some((line) => line.startsWith("reversal_pressure:")));
  assert.ok(actTwoLines.some((line) => line.startsWith("relationship_pressure:")));
  assert.ok(actTwoLines.some((line) => line.startsWith("obstacle_pressure:")));
  assert.ok(actTwoLines.some((line) => line.startsWith("objective_pressure:")));

  const actThreeLines = selectStoryMoveLibraryLinesForContext({
    transcript: "I'm stuck in Act III and can't land the ending.",
    intent: "momentum_rescue",
    act: "Act III",
    unresolvedSetups: ["sealed affidavit"],
    actThreePayoffPath: ["Mara exposes the fixer by refusing control."],
    imageMotifs: ["blank frame"],
  });
  assert.ok(actThreeLines.some((line) => line.startsWith("payoff_pressure:")));
  assert.ok(actThreeLines.some((line) => line.startsWith("image_pressure:")));
  assert.ok(actThreeLines.some((line) => line.startsWith("choice_pressure:")));
});

test("[story-rescue-move-library] generic momentum rescue always gets objective and image lanes", () => {
  const lines = selectStoryMoveLibraryLines("help me get unstuck and find the next beat", {
    intent: "momentum_rescue",
    problem: "missing turn / no exit image",
  });
  assert.ok(lines.some((line) => line.startsWith("objective_pressure:")));
  assert.ok(lines.some((line) => line.startsWith("image_pressure:")));
  assert.ok(lines.some((line) => line.startsWith("choice_pressure:")));
});
