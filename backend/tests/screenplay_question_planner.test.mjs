import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildScreenplayQuestionPlan,
  createPendingScreenplayLearningQuestion,
  enforceScreenplayQuestionPlan,
  resolvePendingScreenplayLearningAnswer,
} from "../lib/screenplay_question_planner.js";

test("direct screenplay requests execute without a blocking question", () => {
  const plan = buildScreenplayQuestionPlan({
    transcript: "Continue the screenplay and write the next three pages.",
    creativeMemoryTrace: {
      project_id: "split-ferries",
      project_title: "Split Ferries",
    },
    studioMeta: {
      screenplayProjectId: "split-ferries",
      screenplayTarget: "page",
    },
    turnPlanner: { intent: "idea_development" },
  });

  assert.equal(plan.active, true);
  assert.equal(plan.mode, "answer_now");
  assert.equal(plan.shouldAsk, false);
});

test("writer block uses a due story thread before asking generic development questions", () => {
  const plan = buildScreenplayQuestionPlan({
    transcript: "I'm stuck. What happens next in the story?",
    creativeMemoryTrace: {
      project_id: "split-ferries",
      project_title: "Split Ferries",
      due_story_thread: {
        setup: "Mara hid the ferry manifest in Eli's cassette case",
        promised_payoff: "The manifest exposes who ordered the evacuation",
      },
      screenplay_project_memory: {
        protagonist_want: "Mara wants to get Eli off the island",
      },
    },
    studioMeta: { screenplayProjectId: "split-ferries" },
    turnPlanner: { intent: "momentum_rescue" },
  });

  assert.equal(plan.mode, "rescue_then_decide");
  assert.equal(plan.targetField, "story_thread.payoff_choice");
  assert.match(plan.question, /ferry manifest/);
  assert.match(plan.objective, /three distinct causal story moves/i);
});

test("question planning skips story facts already present in memory", () => {
  const plan = buildScreenplayQuestionPlan({
    transcript: "Let's outline Act Three and work out the ending.",
    creativeMemoryTrace: {
      project_id: "split-ferries",
      project_title: "Split Ferries",
      characters: [{
        name: "Mara",
        arc: {
          want: "Save Eli",
          wound: "She once left June behind",
          false_belief: "Everyone she loves is safer without her",
          current_tactic: "Control every exit",
          next_emotional_turn: "Admit she needs Eli's help",
        },
      }],
      screenplay_project_memory: {
        protagonist_want: "Save Eli",
        central_question: "Can Mara save someone without controlling them?",
        antagonistic_force: "The evacuation authority",
        protagonist_need: "Trust another person with the plan",
        theme_argument: "Love without trust becomes possession",
      },
    },
    studioMeta: {
      screenplayProjectId: "split-ferries",
      screenplayCharacterFocus: ["Mara"],
    },
    turnPlanner: { intent: "idea_development" },
  });

  assert.equal(plan.targetField, "project.ending_image");
  assert.match(plan.question, /final image/i);
});

test("a pending learning question turns the writer's next short answer into context", () => {
  const plan = {
    active: true,
    shouldAsk: true,
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    targetField: "character.want",
    targetLabel: "Mara's dramatic want",
    anchor: "Mara",
    question: "What does Mara want badly enough to keep choosing danger instead of safety?",
  };
  const pending = createPendingScreenplayLearningQuestion(plan, { askedAtTurn: 8, now: 1000 });
  const resolution = resolvePendingScreenplayLearningAnswer({
    pending,
    transcript: "Freedom.",
    projectId: "split-ferries",
    currentTurn: 9,
  });

  assert.equal(resolution.status, "answered");
  assert.equal(resolution.shouldClear, true);
  assert.equal(resolution.learningContext.targetField, "character.want");
  assert.equal(resolution.learningContext.authority, "writer_clarification");
});

test("an answered learning question is applied before Clementine asks another one", () => {
  const plan = buildScreenplayQuestionPlan({
    transcript: "Freedom.",
    creativeMemoryTrace: {
      project_id: "split-ferries",
      project_title: "Split Ferries",
      screenplay_project_memory: {},
    },
    studioMeta: { screenplayProjectId: "split-ferries" },
    turnPlanner: { intent: "idea_development" },
    answeredLearningContext: {
      targetField: "character.want",
      targetLabel: "Mara's dramatic want",
    },
  });

  assert.equal(plan.mode, "apply_learning");
  assert.equal(plan.shouldAsk, false);
  assert.match(plan.objective, /one concrete story consequence/i);
});

test("an ignored learning question is cleared instead of mislearning a page command", () => {
  const pending = createPendingScreenplayLearningQuestion({
    active: true,
    shouldAsk: true,
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    targetField: "project.ending_image",
    targetLabel: "the ending image",
    question: "What final image proves the story changed?",
  }, { askedAtTurn: 4 });
  const resolution = resolvePendingScreenplayLearningAnswer({
    pending,
    transcript: "Write the next scene now.",
    projectId: "split-ferries",
    currentTurn: 5,
  });

  assert.equal(resolution.status, "declined");
  assert.equal(resolution.learningContext, null);
  assert.equal(resolution.shouldClear, true);
});

test("question enforcement preserves useful work and replaces only the generic closing question", () => {
  const plan = {
    active: true,
    shouldAsk: true,
    question: "What must Mara get before the next scene can end?",
  };
  const reply = "Three moves: expose the manifest, strand Eli, or make June take the boat. Which one feels right?";
  const enforced = enforceScreenplayQuestionPlan(reply, plan);

  assert.match(enforced, /^Three moves:/);
  assert.doesNotMatch(enforced, /Which one feels right/);
  assert.match(enforced, /What must Mara get before the next scene can end\?$/);
});
