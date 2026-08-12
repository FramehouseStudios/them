import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildStoryMoveTasteProfile,
  formatRankedStoryRescueMoveLine,
  inferStoryMoveActKind,
  normalizeStoryMovePreferenceOverrides,
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

test("[story-rescue-move-library] every act gets a complete rescue quality contract", () => {
  const fixtures = [
    ["Act I", /Act I progression/],
    ["Act II", /Act II progression/],
    ["Act III", /Act III progression/],
  ];
  for (const [act, actPattern] of fixtures) {
    const ranked = rankStoryRescueMovesForContext({
      transcript: `I'm stuck in ${act}.`,
      act,
      characters: ["Mara", "Eli"],
      protagonistWant: "expose the forged verdict",
      protagonistNeed: "trust Eli with the truth",
      unresolvedStoryThreads: ["Eli may leave if Mara edits the truth again"],
      unresolvedSetups: ["the sealed affidavit"],
    });
    assert.equal(ranked.length, 3);
    for (const move of ranked) {
      assert.equal(move.qualityGate.passed, true);
      assert.ok(move.move);
      assert.ok(move.causalAdvancement);
      assert.ok(move.characterCost);
      assert.match(move.actProgression, actPattern);
    }
  }
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
  for (const rescue of ranked) {
    assert.equal(rescue.qualityGate.passed, true);
    assert.equal(rescue.qualityGate.playableSpecificity, true);
    assert.equal(rescue.qualityGate.causalAdvancement, true);
    assert.equal(rescue.qualityGate.characterCost, true);
    assert.equal(rescue.qualityGate.actProgression, true);
    assert.ok(rescue.causalAdvancement);
    assert.ok(rescue.characterCost);
    assert.match(rescue.actProgression, /Act III progression/);
  }

  const line = formatRankedStoryRescueMoveLine(ranked[0]);
  assert.match(line, /^rank_1: engine=payoff_pressure; score=/);
  assert.match(line, /accepted_page: Mara puts the affidavit on the record/);
  assert.match(line, /causal_advance=/);
  assert.match(line, /character_cost=/);
  assert.match(line, /act_progression=Act III progression:/);
  assert.match(line, /quality_gate=pass\(playable\+causal\+cost\+act\)/);
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

test("[story-rescue-move-library] explicit writer corrections override learned taste without overriding due canon", () => {
  const questionEffectiveness = Array.from({ length: 5 }, (_, index) => ({
    questionId: `preference-${index}`,
    targetField: "story.next_irreversible_choice",
    responseStatus: "answered",
    selectedMoveFamily: "reversal_pressure",
    offeredMoveFamilies: [
      "reversal_pressure",
      "relationship_pressure",
      "payoff_pressure",
    ],
    acceptedPageCount: 1,
    answeredAt: 5_000 - index,
  }));
  const preferenceOverrides = [{
    family: "reversal_pressure",
    stance: "avoid",
    updatedAt: 6_000,
  }, {
    family: "relationship_pressure",
    stance: "prefer",
    updatedAt: 6_001,
  }];
  const profile = buildStoryMoveTasteProfile(questionEffectiveness, {
    preferenceOverrides,
  });
  assert.equal(
    profile.find((item) => item.family === "reversal_pressure")?.explicitStance,
    "avoid"
  );
  assert.ok(
    profile.find((item) => item.family === "reversal_pressure")?.tasteBonus <= -10
  );
  assert.ok(
    profile.find((item) => item.family === "relationship_pressure")?.tasteBonus >= 10
  );

  const actTwo = rankStoryRescueMovesForContext({
    transcript: "I'm stuck in the middle.",
    act: "Act II",
    protagonistWant: "Mara wants June to stay.",
    questionEffectiveness,
    storyMovePreferenceOverrides: preferenceOverrides,
  });
  assert.equal(actTwo[0].key, "relationship_pressure");

  const ending = rankStoryRescueMovesForContext({
    transcript: "Help me finish Act III.",
    act: "Act III",
    questionEffectiveness,
    storyMovePreferenceOverrides: preferenceOverrides,
    dueStoryThread: {
      setup: "June hid the red ferry key in Mara's coat.",
      promisedPayoff: "Mara gives June control of the final crossing.",
      ageInScenes: 42,
    },
  });
  assert.equal(ending[0].key, "payoff_pressure");

  const successfulRescueHistory = [{
    questionId: "relationship-choice",
    targetField: "story.next_irreversible_choice",
    responseStatus: "answered",
    selectedMoveFamily: "relationship_pressure",
    offeredMoveFamilies: ["relationship_pressure", "reversal_pressure", "obstacle_pressure"],
    acceptedPageCount: 1,
    answeredAt: 1_000,
  }, {
    questionId: "reversal-choice",
    targetField: "story.next_irreversible_choice",
    responseStatus: "answered",
    selectedMoveFamily: "reversal_pressure",
    offeredMoveFamilies: ["relationship_pressure", "reversal_pressure", "obstacle_pressure"],
    acceptedPageCount: 1,
    answeredAt: 2_000,
  }, {
    questionId: "writer-block-rescue",
    targetField: "story.writer_block_rescue",
    responseStatus: "answered",
    recommendationOnly: true,
    selectedMoveFamily: "reversal_pressure",
    offeredMoveFamilies: ["reversal_pressure", "relationship_pressure", "objective_pressure"],
    acceptedPageCount: 1,
    blockResolutionCount: 1,
    answeredAt: 3_000,
  }];
  const preferredRelationship = rankStoryRescueMovesForContext({
    transcript: "I'm stuck in the middle.",
    act: "Act II",
    protagonistWant: "get Eli onto the last ferry",
    protagonistNeed: "stop using control as a substitute for trust",
    nextScenePlan: "Write the next scene in the ferry waiting room.",
    acceptedPages: ["INT. FERRY WAITING ROOM - Mara finds the last ticket."],
    questionEffectiveness: successfulRescueHistory,
    storyMovePreferenceOverrides: [{
      family: "relationship_pressure",
      stance: "prefer",
      updatedAt: 4_000,
    }],
  });
  assert.equal(preferredRelationship[0].key, "relationship_pressure");
});

test("[story-rescue-move-library] preference corrections sanitize malformed timestamps", () => {
  assert.deepEqual(normalizeStoryMovePreferenceOverrides([
    {
      family: "relationship_pressure",
      stance: "prefer",
      updatedAt: "not-a-timestamp",
    },
    {
      family: "relationship_pressure",
      stance: "avoid",
      updatedAt: 4_200,
    },
  ]), [{
    family: "relationship_pressure",
    stance: "avoid",
    updatedAt: 4_200,
  }]);
});
