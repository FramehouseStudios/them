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

test("learned Story Spine fields are resolved even when raw session memory is missing", () => {
  const plan = buildScreenplayQuestionPlan({
    transcript: "Let's develop the feature structure.",
    creativeMemoryTrace: {
      project_id: "split-ferries",
      project_title: "Split Ferries",
      screenplay_project_memory: {
        field_provenance: [{
          field: "protagonistWant",
          value: "Mara must get Eli off the island",
          source: "screenplay_learning_confirmation",
          status: "current",
          question_id: "screenplay-learning-protagonist-want",
        }],
      },
    },
    studioMeta: { screenplayProjectId: "split-ferries" },
    turnPlanner: { intent: "idea_development" },
  });

  assert.equal(plan.targetField, "project.central_question");
  assert.equal(plan.targetFieldStatus, "unknown");
  assert.deepEqual(plan.fieldStates.learned, ["project.protagonist_want"]);
});

test("corrected Story Spine fields are authoritative and never re-asked", () => {
  const plan = buildScreenplayQuestionPlan({
    transcript: "Help me break the story.",
    creativeMemoryTrace: {
      project_id: "split-ferries",
      project_title: "Split Ferries",
      screenplay_project_memory: {
        protagonist_want: "Mara must get Eli off the island",
        field_provenance: [{
          field: "centralQuestion",
          value: "Can Mara save Eli without controlling him?",
          learned_value: "Can Mara keep everyone alive?",
          source: "writer_correction",
          status: "corrected",
          source_correction_id: "correction-17",
        }],
      },
    },
    studioMeta: { screenplayProjectId: "split-ferries" },
    turnPlanner: { intent: "idea_development" },
  });

  assert.equal(plan.targetField, "project.antagonistic_force");
  assert.ok(plan.fieldStates.corrected.includes("project.central_question"));
  assert.doesNotMatch(plan.question, /dramatic question/i);
});

test("a learned Character Bible want resolves the duplicate protagonist-want question", () => {
  const plan = buildScreenplayQuestionPlan({
    transcript: "Let's work out the shape of Act One.",
    creativeMemoryTrace: {
      project_id: "split-ferries",
      project_title: "Split Ferries",
      characters: [{
        name: "Mara",
        arc: {},
        field_provenance: [{
          field: "want",
          value: "Get Eli off the island alive",
          source: "screenplay_learning_confirmation",
          status: "current",
        }],
      }],
      screenplay_project_memory: {},
    },
    studioMeta: {
      screenplayProjectId: "split-ferries",
      screenplayCharacterFocus: ["Mara"],
    },
    turnPlanner: { intent: "idea_development" },
  });

  assert.equal(plan.targetField, "project.central_question");
  assert.ok(plan.fieldStates.learned.includes("project.protagonist_want"));
  assert.doesNotMatch(plan.question, /carry Split Ferries through all three acts/i);
});

test("a resolved payoff question is not repeated for the same due setup", () => {
  const baseTrace = {
    project_id: "split-ferries",
    project_title: "Split Ferries",
    due_story_thread: {
      setup: "Mara hid the ferry manifest in Eli's cassette case",
      promised_payoff: "The manifest exposes who ordered the evacuation",
    },
    screenplay_project_memory: {
      protagonist_want: "Save Eli",
      central_question: "Can Mara save Eli without controlling him?",
      antagonistic_force: "The evacuation authority",
      protagonist_need: "Trust Eli",
      ending_image: "Mara lets Eli steer the ferry",
      theme_argument: "Love without trust becomes possession",
      scene_objective: "Get the harbor key",
      next_scene_plan: "Mara burns her safe route",
      field_provenance: [{
        field: "nextSceneMoves",
        value: "The manifest exposes the evacuation order",
        source: "screenplay_learning_confirmation",
        status: "current",
        anchor: "Mara hid the ferry manifest in Eli's cassette case",
      }],
    },
    characters: [{
      name: "Mara",
      arc: {
        want: "Save Eli",
        wound: "She once abandoned June",
        false_belief: "Control keeps everyone safe",
        current_tactic: "Control every exit",
        next_emotional_turn: "Trust Eli with the route",
      },
    }],
  };
  const resolved = buildScreenplayQuestionPlan({
    transcript: "I'm stuck. What happens next?",
    creativeMemoryTrace: baseTrace,
    studioMeta: { screenplayProjectId: "split-ferries" },
    turnPlanner: { intent: "momentum_rescue" },
  });
  const newSetup = buildScreenplayQuestionPlan({
    transcript: "I'm stuck. What happens next?",
    creativeMemoryTrace: {
      ...baseTrace,
      due_story_thread: {
        setup: "June pocketed the harbor master's red key",
        promised_payoff: "The key opens the quarantine gate",
      },
    },
    studioMeta: { screenplayProjectId: "split-ferries" },
    turnPlanner: { intent: "momentum_rescue" },
  });

  assert.equal(resolved.shouldAsk, false);
  assert.equal(resolved.mode, "rescue_with_known_spine");
  assert.equal(newSetup.targetField, "story_thread.payoff_choice");
  assert.match(newSetup.question, /red key/);
});

test("fully resolved Story Spine and Character Bible fields produce no intake question", () => {
  const plan = buildScreenplayQuestionPlan({
    transcript: "Let's develop the story further.",
    creativeMemoryTrace: {
      project_id: "split-ferries",
      project_title: "Split Ferries",
      characters: [{
        name: "Mara",
        arc: {
          want: "Save Eli",
          wound: "She once abandoned June",
          false_belief: "Control keeps everyone safe",
          current_tactic: "Control every exit",
          next_emotional_turn: "Trust Eli with the route",
        },
      }],
      screenplay_project_memory: {
        protagonist_want: "Save Eli",
        central_question: "Can Mara save Eli without controlling him?",
        antagonistic_force: "The evacuation authority",
        protagonist_need: "Trust Eli",
        ending_image: "Mara lets Eli steer the ferry",
        theme_argument: "Love without trust becomes possession",
        next_scene_plan: "Mara burns her safe route",
      },
    },
    studioMeta: { screenplayProjectId: "split-ferries" },
    turnPlanner: { intent: "idea_development" },
  });

  assert.equal(plan.shouldAsk, false);
  assert.equal(plan.mode, "develop_with_known_spine");
  assert.match(plan.reason, /already resolved/i);
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

test("a central dramatic question remains a valid structured learning answer", () => {
  const pending = createPendingScreenplayLearningQuestion({
    active: true,
    shouldAsk: true,
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    targetField: "project.central_question",
    targetLabel: "the feature's central dramatic question",
    anchor: "Rain Docket",
    question: "What dramatic question should the feature keep tightening?",
  }, { askedAtTurn: 12, now: 1000 });
  const resolution = resolvePendingScreenplayLearningAnswer({
    pending,
    transcript: "Can Mara expose the truth without becoming her father?",
    projectId: "rain-docket",
    currentTurn: 13,
  });

  assert.equal(resolution.status, "answered");
  assert.equal(resolution.learningContext.targetField, "project.central_question");
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

test("question enforcement removes every unplanned question and appends exactly one canonical question", () => {
  const plan = {
    active: true,
    shouldAsk: true,
    question: "What must Mara get before the next scene can end?",
  };
  const reply = [
    "The strongest move is to strand Eli at the dock.",
    "Should June betray her? That could work.",
    "Or should the manifest vanish?",
    "What must Mara get before the next scene can end?",
  ].join("\n");
  const enforced = enforceScreenplayQuestionPlan(reply, plan);

  assert.match(enforced, /The strongest move/);
  assert.doesNotMatch(enforced, /Should June/);
  assert.doesNotMatch(enforced, /manifest vanish/);
  assert.equal((enforced.match(/\?/g) || []).length, 1);
  assert.match(enforced, /What must Mara get before the next scene can end\?$/);
});
