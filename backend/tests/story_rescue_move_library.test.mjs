import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildStoryMoveTasteProfile,
  formatRankedStoryRescueMoveLine,
  inferStoryMoveActKind,
  rankStoryRescueMovesForContext,
  selectProvisionalStoryMoveFamilies,
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

test("[story-rescue-move-library] accepted revelations and relationship changes become present-tense pressure", () => {
  const revelationMoves = rankStoryRescueMovesForContext({
    transcript: "I know the reveal already happened, but I don't know what comes next.",
    act: "Act II",
    currentBeat: "Mara enters the hearing.",
    characters: ["Mara", "Eli"],
    causalFacts: [{
      kind: "revelation",
      fact: "MARA: I forged the affidavit.",
      sourceAct: "Act II",
      sourceSceneHeading: "INT. ARCHIVE - NIGHT",
      ageInScenes: 4,
    }],
  });
  assert.equal(revelationMoves[0].key, "information_pressure");
  assert.ok(revelationMoves[0].evidence.some((item) => (
    item === "accepted_causal_fact: MARA: I forged the affidavit."
  )));
  assert.match(revelationMoves[0].move, /Do not reveal it again/);
  assert.match(revelationMoves[0].move, /force Mara to act before ready/);

  const relationshipMoves = rankStoryRescueMovesForContext({
    transcript: "The relationship thread feels stalled.",
    act: "Act II",
    protagonistWant: "expose the judge",
    characters: ["Mara", "Eli"],
    causalFacts: [{
      kind: "relationship_change",
      fact: "ELI: I choose the case over us.",
      sourceAct: "Act II",
      ageInScenes: 2,
    }],
  });
  assert.equal(relationshipMoves[0].key, "relationship_pressure");
  assert.match(relationshipMoves[0].move, /bond's current state/);
  assert.match(relationshipMoves[0].move, /choose the case over us/);
});

test("[story-rescue-move-library] irreversible accepted consequences cannot be undone for a reversal", () => {
  const ranked = rankStoryRescueMovesForContext({
    transcript: "I need a stronger reversal after the evidence is gone.",
    act: "Act II",
    currentBeat: "Mara reaches for her old legal tactic.",
    characters: ["Mara", "Judge Vale"],
    causalFacts: [{
      kind: "irreversible_consequence",
      fact: "Mara burns the only copy of the affidavit.",
      sourceAct: "Act II",
      ageInScenes: 12,
    }],
  });
  assert.equal(ranked[0].key, "reversal_pressure");
  assert.ok(ranked[0].evidence.includes("accepted_causal_fact: Mara burns the only copy of the affidavit."));
  assert.match(ranked[0].move, /Do not undo it/);
});

test("[story-rescue-move-library] learns bounded taste from choices and downstream page success", () => {
  const questionEffectiveness = [
    {
      questionId: "options-3",
      targetField: "character.current_tactic",
      responseStatus: "answered",
      selectedMoveFamily: "relationship_pressure",
      offeredMoveFamilies: [
        "reversal_pressure",
        "relationship_pressure",
        "obstacle_pressure",
      ],
      acceptedPageCount: 1,
      blockResolutionCount: 1,
      answeredAt: 3_000,
    },
    {
      questionId: "options-2",
      targetField: "story.next_irreversible_choice",
      responseStatus: "answered",
      selectedMoveFamily: "relationship_pressure",
      offeredMoveFamilies: [
        "choice_pressure",
        "relationship_pressure",
        "information_pressure",
      ],
      answeredAt: 2_000,
    },
  ];
  const profile = buildStoryMoveTasteProfile(questionEffectiveness);
  const relationship = profile.find((item) => item.family === "relationship_pressure");
  const obstacle = profile.find((item) => item.family === "obstacle_pressure");

  assert.equal(relationship.selectedCount, 2);
  assert.equal(relationship.acceptedPageCount, 1);
  assert.equal(relationship.blockResolutionCount, 1);
  assert.ok(relationship.tasteBonus > 0);
  assert.equal(relationship.recentVarietyPenalty, 3);
  assert.ok(obstacle.tasteBonus <= 0);

  const ranked = rankStoryRescueMovesForContext({
    transcript: "I'm stuck in Act II and need the next turn.",
    act: "Act II",
    protagonistWant: "Mara wants June to stay.",
    characterArcState: "Mara still confuses protection with control.",
    questionEffectiveness,
  });
  assert.equal(ranked[0].key, "relationship_pressure");
  assert.ok(ranked[0].tasteBonus > 0);

  const provisionalFamilies = selectProvisionalStoryMoveFamilies({
    transcript: "Give me options for the next turn.",
    act: "Act II",
    protagonistWant: "Mara wants June to stay.",
    characterArcState: "Mara still confuses protection with control.",
    questionEffectiveness,
  });
  assert.equal(provisionalFamilies.length, 3);
  assert.equal(new Set(provisionalFamilies).size, 3);
  assert.equal(provisionalFamilies[0], "relationship_pressure");
});

test("[story-rescue-move-library] due canon outranks taste and protects feature structure", () => {
  const relationshipTaste = Array.from({ length: 6 }, (_, index) => ({
    questionId: `taste-${index}`,
    targetField: "character.relationship_pressure",
    responseStatus: "answered",
    selectedMoveFamily: "relationship_pressure",
    offeredMoveFamilies: [
      "relationship_pressure",
      "payoff_pressure",
      "image_pressure",
    ],
    acceptedPageCount: 1,
    answeredAt: 10_000 - index,
  }));
  const ranked = rankStoryRescueMovesForContext({
    transcript: "I'm stuck at the ending.",
    act: "Act III",
    characters: ["Mara"],
    dueStoryThread: {
      setup: "June hid the red ferry key in Mara's coat.",
      promisedPayoff: "Mara gives June control of the final crossing.",
      ageInScenes: 42,
    },
    questionEffectiveness: relationshipTaste,
  });

  assert.equal(ranked[0].key, "payoff_pressure");
  assert.match(ranked[0].move, /red ferry key/i);
});
