import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatRankedStoryRescueMoveLine,
  inferStoryMoveActKind,
  rankStoryRescueMovesForContext,
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

test("[story-rescue-move-library] ranks accepted continuity by act, character, and payoff pressure", () => {
  const ranked = rankStoryRescueMovesForContext({
    transcript: "I'm stuck on the ending.",
    act: "Act III",
    currentBeat: "Mara puts the affidavit on the record.",
    featureObligation: "Force Mara to risk being seen.",
    protagonistWant: "expose the judge",
    protagonistNeed: "trust Eli with the truth",
    characters: ["Mara", "Eli"],
    unresolvedSetups: ["sealed affidavit"],
    actThreePayoffPath: ["The affidavit becomes public testimony."],
    imageMotifs: ["empty witness chair"],
    acceptedPages: ["Mara puts the affidavit on the record."],
    storyMoments: ["Eli promised never to testify alone."],
  });

  assert.equal(ranked.length, 3);
  assert.equal(ranked[0].key, "payoff_pressure");
  assert.ok(ranked[0].score > ranked[1].score);
  assert.ok(ranked[0].evidence.some((item) => item.startsWith("accepted_page:")));
  assert.match(ranked[0].move, /sealed affidavit/);
  assert.match(ranked[0].move, /changed behavior/);
  assert.match(ranked[0].successCheck, /planted promise/i);

  const line = formatRankedStoryRescueMoveLine(ranked[0]);
  assert.match(line, /^rank_1: engine=payoff_pressure; score=/);
  assert.match(line, /accepted_page: Mara puts the affidavit on the record/);
  assert.doesNotMatch(line, /contentHash|content_hash/);
});

test("[story-rescue-move-library] an old accepted setup outranks generic Act II invention", () => {
  const ranked = rankStoryRescueMovesForContext({
    transcript: "I'm stuck in the middle. What happens next?",
    act: "Act II",
    featureSequence: "Bad guys close in",
    currentBeat: "Nora reaches the courthouse before dawn.",
    featureObligation: "Make Nora's private proof dangerous in public.",
    characters: ["Nora"],
    unresolvedSetups: ["The red locket inside the courthouse clock"],
    actThreePayoffPath: ["Nora uses the red locket to expose the forged verdict"],
    acceptedPages: ["Nora reaches the courthouse before dawn."],
    dueStoryThread: {
      kind: "setup",
      setup: "The red locket inside the courthouse clock",
      promisedPayoff: "Nora uses the red locket to expose the forged verdict",
      sourceSceneHeading: "INT. COURTHOUSE CLOCK - NIGHT",
      sourceSceneSummary: "Nora hides the red locket inside the courthouse clock.",
      ageInScenes: 17,
    },
  });

  assert.equal(ranked[0].key, "payoff_pressure");
  assert.ok(ranked[0].evidence[0].startsWith("due_story_thread:"));
  assert.match(ranked[0].move, /red locket inside the courthouse clock/i);
  assert.match(ranked[0].move, /expose the forged verdict/i);
});
