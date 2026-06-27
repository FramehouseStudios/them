import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTalkScreenplayExecutionBriefLines,
  isNextSceneExecutionBriefRepairReason,
} from "../lib/talk_screenplay_repair_plan.js";

test("[talk-screenplay-repair-plan] builds a next-scene execution brief from studio memory lanes", () => {
  const lines = buildTalkScreenplayExecutionBriefLines({
    screenplayNextSceneMoves: [
      "The reel plays the wrong memory.",
      "Marcus forces a public choice.",
    ],
    screenplayUnresolvedStoryThreads: ["The locked archive door blocks Mara."],
    screenplayCharacterArcTurns: ["Mara stops cutting around her guilt."],
    screenplayActThreePayoffPath: ["The fixer is exposed by the public splice."],
    screenplayImageMotifs: ["projector flare"],
  });

  assert.deepEqual(lines, [
    "SCENE_ASSIGNMENT: The reel plays the wrong memory.",
    "OBSTACLE_TO_PRESSURIZE: The locked archive door blocks Mara.",
    "CHANGED_BEHAVIOR_DUE: Mara stops cutting around her guilt.",
    "PAYOFF_OR_SETUP_TO_SPEND: The fixer is exposed by the public splice.",
    "IMAGE_TO_STAGE: projector flare",
    "EXIT_HANDOFF: Marcus forces a public choice.",
  ]);
});

test("[talk-screenplay-repair-plan] prefers explicit execution brief fields over inferred lanes", () => {
  const lines = buildTalkScreenplayExecutionBriefLines({
    screenplaySceneAssignment: "Mara screens the forged reel for the crowd.",
    screenplayObstacleToPressurize: "The archive door jams with Marcus outside.",
    screenplayChangedBehaviorDue: "Mara chooses public courage instead of private control.",
    screenplayPayoffOrSetupToSpend: "The broken splice exposes the fixer.",
    screenplayImageToStage: "projector flare on rainwater",
    screenplayExitHandoff: "The crowd hears the missing confession.",
    screenplayNextSceneMoves: ["Fallback assignment.", "Fallback exit."],
  });

  assert.deepEqual(lines, [
    "SCENE_ASSIGNMENT: Mara screens the forged reel for the crowd.",
    "OBSTACLE_TO_PRESSURIZE: The archive door jams with Marcus outside.",
    "CHANGED_BEHAVIOR_DUE: Mara chooses public courage instead of private control.",
    "PAYOFF_OR_SETUP_TO_SPEND: The broken splice exposes the fixer.",
    "IMAGE_TO_STAGE: projector flare on rainwater",
    "EXIT_HANDOFF: The crowd hears the missing confession.",
  ]);
});

test("[talk-screenplay-repair-plan] identifies next-scene execution repair reasons", () => {
  assert.equal(isNextSceneExecutionBriefRepairReason("missing_next_scene_execution_brief"), true);
  assert.equal(isNextSceneExecutionBriefRepairReason("missing_next_scene_assignment"), true);
  assert.equal(isNextSceneExecutionBriefRepairReason("missing_act_two_reversal"), false);
});
