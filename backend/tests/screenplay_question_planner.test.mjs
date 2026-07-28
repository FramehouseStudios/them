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

test("a learned Character Bible want resolves the duplicate question and advances Act I opposition", () => {
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

  assert.equal(plan.targetField, "project.antagonistic_force");
  assert.ok(plan.fieldStates.learned.includes("project.protagonist_want"));
  assert.doesNotMatch(plan.question, /carry Split Ferries through all three acts/i);
  assert.deepEqual(plan.actContext, {
    key: "act1",
    label: "Act I",
    source: "transcript",
  });
});

test("Act I prioritizes the protagonist's durable pursuit before downstream structure", () => {
  const plan = buildScreenplayQuestionPlan({
    transcript: "Help me break Act One.",
    creativeMemoryTrace: {
      project_id: "split-ferries",
      project_title: "Split Ferries",
      screenplay_project_memory: { act: "Act I" },
    },
    studioMeta: { screenplayProjectId: "split-ferries" },
    turnPlanner: { intent: "idea_development" },
  });

  assert.equal(plan.targetField, "project.protagonist_want");
  assert.equal(plan.actContext.key, "act1");
  assert.equal(plan.candidateScores[0].field, "project.protagonist_want");
  assert.equal(plan.selectionScore, plan.candidateScores[0].score);
});

test("Act II prioritizes the protagonist's failing tactic over intake-level questions", () => {
  const plan = buildScreenplayQuestionPlan({
    transcript: "Help me diagnose why the Act Two pressure feels repetitive.",
    creativeMemoryTrace: {
      project_id: "split-ferries",
      project_title: "Split Ferries",
      characters: [{
        name: "Mara",
        arc: {
          want: "Save Eli",
          wound: "She once abandoned June",
          false_belief: "Control keeps everyone safe",
        },
      }],
      screenplay_project_memory: {
        act: "Act II",
        protagonist_want: "Save Eli",
        central_question: "Can Mara save Eli without controlling him?",
        antagonistic_force: "The evacuation authority",
        scene_objective: "Reach the quarantine gate",
      },
    },
    studioMeta: {
      screenplayProjectId: "split-ferries",
      screenplayAct: "Act II",
      screenplayCharacterFocus: ["Mara"],
    },
    turnPlanner: { intent: "idea_development" },
  });

  assert.equal(plan.targetField, "character.current_tactic");
  assert.equal(plan.actContext.key, "act2");
  assert.match(plan.question, /tactic/i);
});

test("Act III prioritizes a missing ending image over earlier-act discovery", () => {
  const plan = buildScreenplayQuestionPlan({
    transcript: "Let's make Act Three land.",
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
        act: "Act III",
        protagonist_want: "Save Eli",
        central_question: "Can Mara save Eli without controlling him?",
        antagonistic_force: "The evacuation authority",
      },
    },
    studioMeta: {
      screenplayProjectId: "split-ferries",
      screenplayAct: "Act III",
    },
    turnPlanner: { intent: "idea_development" },
  });

  assert.equal(plan.targetField, "project.ending_image");
  assert.equal(plan.actContext.key, "act3");
  assert.match(plan.question, /final image/i);
});

test("ordinary writer phrasing does not masquerade as a protagonist-want request", () => {
  const plan = buildScreenplayQuestionPlan({
    transcript: "I want to work on Act Three.",
    creativeMemoryTrace: {
      project_id: "split-ferries",
      project_title: "Split Ferries",
      screenplay_project_memory: { act: "Act III" },
    },
    studioMeta: {
      screenplayProjectId: "split-ferries",
      screenplayAct: "Act III",
    },
    turnPlanner: { intent: "idea_development" },
  });

  assert.equal(plan.targetField, "project.ending_image");
  assert.notEqual(plan.targetField, "project.protagonist_want");
});

test("an explicit craft focus outranks the current act's default gap order", () => {
  const plan = buildScreenplayQuestionPlan({
    transcript: "The theme is blurry. Help me find what this movie argues.",
    creativeMemoryTrace: {
      project_id: "split-ferries",
      project_title: "Split Ferries",
      screenplay_project_memory: {
        act: "Act II",
        protagonist_want: "Save Eli",
        central_question: "Can Mara save Eli without controlling him?",
        antagonistic_force: "The evacuation authority",
      },
    },
    studioMeta: {
      screenplayProjectId: "split-ferries",
      screenplayAct: "Act II",
    },
    turnPlanner: { intent: "idea_development" },
  });

  assert.equal(plan.targetField, "project.theme_argument");
  assert.equal(plan.actContext.key, "act2");
  assert.match(plan.question, /ultimately argue/i);
});

test("recent accepted pages suppress generic development questions while writing is flowing", () => {
  const now = 2_000_000;
  const plan = buildScreenplayQuestionPlan({
    transcript: "Let's keep developing this sequence.",
    creativeMemoryTrace: {
      project_id: "split-ferries",
      project_title: "Split Ferries",
      accepted_scenes: [{
        scene_heading: "INT. FERRY CABIN - NIGHT",
        accepted_at: now - (5 * 60 * 1_000),
      }],
      screenplay_project_memory: {
        act: "Act II",
        feature_sequence: "Promise of the Premise",
      },
    },
    studioMeta: {
      screenplayProjectId: "split-ferries",
      screenplayAct: "Act II",
      screenplayFeatureSequence: "Promise of the Premise",
    },
    turnPlanner: { intent: "idea_development" },
    now,
  });

  assert.equal(plan.mode, "protect_momentum");
  assert.equal(plan.shouldAsk, false);
  assert.equal(plan.questionStrategy, "suppress_low_value_question");
  assert.equal(plan.writingMomentum.active, true);
  assert.equal(plan.writingMomentum.source, "recent_accepted_page");
  assert.equal(plan.writingMomentum.acceptedSceneAgeSeconds, 300);
  assert.match(plan.objective, /without opening a new intake question/i);
});

test("stale accepted pages do not suppress a useful development question", () => {
  const now = 4_000_000;
  const plan = buildScreenplayQuestionPlan({
    transcript: "Let's keep developing Act Two.",
    creativeMemoryTrace: {
      project_id: "split-ferries",
      project_title: "Split Ferries",
      accepted_scenes: [{
        scene_heading: "INT. FERRY CABIN - NIGHT",
        accepted_at: now - (31 * 60 * 1_000),
      }],
      screenplay_project_memory: { act: "Act II" },
    },
    studioMeta: {
      screenplayProjectId: "split-ferries",
      screenplayAct: "Act II",
    },
    turnPlanner: { intent: "idea_development" },
    now,
  });

  assert.equal(plan.mode, "develop_then_learn");
  assert.equal(plan.shouldAsk, true);
  assert.equal(plan.writingMomentum.active, false);
  assert.equal(plan.writingMomentum.acceptedSceneIsRecent, false);
});

test("ignored questions extend the project momentum-protection window", () => {
  const now = 10_000_000;
  const plan = buildScreenplayQuestionPlan({
    transcript: "Let's keep developing Act Two.",
    creativeMemoryTrace: {
      project_id: "split-ferries",
      project_title: "Split Ferries",
      accepted_scenes: [{
        scene_heading: "INT. FERRY CABIN - NIGHT",
        accepted_at: now - (50 * 60 * 1_000),
      }],
      screenplay_project_memory: {
        act: "Act II",
        question_effectiveness: [{
          question_id: "q-ignored-2",
          target_field: "character.current_tactic",
          asked_at: now - 20_000,
          response_status: "expired",
          outcome: "ignored",
        }, {
          question_id: "q-ignored-1",
          target_field: "project.theme_argument",
          asked_at: now - 40_000,
          response_status: "declined",
          outcome: "declined",
        }],
      },
    },
    studioMeta: {
      screenplayProjectId: "split-ferries",
      screenplayAct: "Act II",
    },
    turnPlanner: { intent: "idea_development" },
    now,
  });

  assert.equal(plan.mode, "protect_momentum");
  assert.equal(plan.shouldAsk, false);
  assert.equal(plan.writingMomentum.interventionProfile.strategy, "protect_flow");
  assert.equal(plan.writingMomentum.interventionProfile.ignoredCount, 2);
  assert.equal(plan.writingMomentum.interventionProfile.windowMinutes, 60);
  assert.equal(plan.writingMomentum.acceptedSceneAgeSeconds, 3_000);
});

test("questions proven useful shorten the quiet window without forcing an interruption", () => {
  const now = 20_000_000;
  const plan = buildScreenplayQuestionPlan({
    transcript: "Let's keep developing Act Two.",
    creativeMemoryTrace: {
      project_id: "split-ferries",
      project_title: "Split Ferries",
      accepted_scenes: [{
        scene_heading: "EXT. FERRY DECK - NIGHT",
        accepted_at: now - (25 * 60 * 1_000),
      }],
      screenplay_project_memory: {
        act: "Act II",
        question_effectiveness: [{
          question_id: "q-helpful-2",
          target_field: "story.next_irreversible_choice",
          asked_at: now - 40_000,
          answered_at: now - 35_000,
          response_status: "answered",
          accepted_page_count: 1,
          outcome: "accepted_pages",
        }, {
          question_id: "q-helpful-1",
          target_field: "character.current_tactic",
          asked_at: now - 80_000,
          answered_at: now - 75_000,
          response_status: "answered",
          block_resolution_count: 1,
          outcome: "block_resolved",
        }],
      },
    },
    studioMeta: {
      screenplayProjectId: "split-ferries",
      screenplayAct: "Act II",
    },
    turnPlanner: { intent: "idea_development" },
    now,
  });

  assert.equal(plan.mode, "develop_then_learn");
  assert.equal(plan.shouldAsk, true);
  assert.equal(
    plan.writingMomentum.interventionProfile.strategy,
    "questions_proven_helpful"
  );
  assert.equal(plan.writingMomentum.interventionProfile.successfulCount, 2);
  assert.equal(plan.writingMomentum.interventionProfile.windowMinutes, 20);
  assert.equal(plan.writingMomentum.acceptedSceneIsRecent, false);
});

test("explicit craft focus can ask through active writing momentum", () => {
  const now = 6_000_000;
  const plan = buildScreenplayQuestionPlan({
    transcript: "The theme is blurry. Help me find what this movie argues.",
    creativeMemoryTrace: {
      project_id: "split-ferries",
      project_title: "Split Ferries",
      accepted_scenes: [{
        scene_heading: "EXT. EAST FERRY DOCK - NIGHT",
        accepted_at: now - (2 * 60 * 1_000),
      }],
      screenplay_project_memory: {
        act: "Act II",
        protagonist_want: "Save Eli",
        central_question: "Can Mara save Eli without controlling him?",
        antagonistic_force: "The evacuation authority",
      },
    },
    studioMeta: {
      screenplayProjectId: "split-ferries",
      screenplayAct: "Act II",
    },
    turnPlanner: { intent: "idea_development" },
    now,
  });

  assert.equal(plan.mode, "develop_then_learn");
  assert.equal(plan.shouldAsk, true);
  assert.equal(plan.targetField, "project.theme_argument");
  assert.equal(plan.writingMomentum.active, true);
  assert.equal(plan.writingMomentum.explicitCraftFocus, true);
  assert.ok(plan.writingMomentum.explicitCraftFields.includes("project.theme_argument"));
});

test("Act III scoring skips a corrected ending image and selects the next unresolved transformation", () => {
  const plan = buildScreenplayQuestionPlan({
    transcript: "Let's strengthen Act Three.",
    creativeMemoryTrace: {
      project_id: "split-ferries",
      project_title: "Split Ferries",
      screenplay_project_memory: {
        act: "Act III",
        protagonist_want: "Save Eli",
        central_question: "Can Mara save Eli without controlling him?",
        antagonistic_force: "The evacuation authority",
        field_provenance: [{
          field: "endingImage",
          value: "Mara lets Eli steer the ferry into dawn",
          status: "corrected",
          source: "writer_correction",
          source_correction_id: "correction-ending",
        }],
      },
    },
    studioMeta: {
      screenplayProjectId: "split-ferries",
      screenplayAct: "Act III",
    },
    turnPlanner: { intent: "idea_development" },
  });

  assert.equal(plan.targetField, "project.protagonist_need");
  assert.ok(plan.fieldStates.corrected.includes("project.ending_image"));
  assert.doesNotMatch(plan.question, /final image/i);
});

test("opening-sequence planning prioritizes the wound that the ordinary world must dramatize", () => {
  const plan = buildScreenplayQuestionPlan({
    transcript: "The opening image and ordinary world still feel generic.",
    creativeMemoryTrace: {
      project_id: "split-ferries",
      project_title: "Split Ferries",
      characters: [{
        name: "Mara",
        arc: { want: "Save Eli" },
      }],
      screenplay_project_memory: {
        act: "Act I",
        protagonist_want: "Save Eli",
      },
    },
    studioMeta: {
      screenplayProjectId: "split-ferries",
      screenplayAct: "Act I",
      screenplayCharacterFocus: ["Mara"],
    },
    turnPlanner: { intent: "idea_development" },
  });

  assert.equal(plan.sequenceContext.key, "opening");
  assert.equal(plan.sequenceContext.source, "transcript");
  assert.equal(plan.targetField, "character.wound");
  assert.match(plan.question, /^For the opening sequence,/);
  assert.match(plan.objective, /Opening Image \/ Ordinary World/);
});

test("midpoint planning spends a due setup on an irreversible reversal", () => {
  const plan = buildScreenplayQuestionPlan({
    transcript: "Let's solve the midpoint reversal.",
    creativeMemoryTrace: {
      project_id: "split-ferries",
      project_title: "Split Ferries",
      due_story_thread: {
        setup: "Mara hid the ferry manifest in Eli's cassette case",
        promised_payoff: "The manifest exposes who ordered the evacuation",
      },
      screenplay_project_memory: {
        act: "Act II",
        protagonist_want: "Save Eli",
        central_question: "Can Mara save Eli without controlling him?",
        antagonistic_force: "The evacuation authority",
      },
    },
    studioMeta: {
      screenplayProjectId: "split-ferries",
      screenplayAct: "Act II",
    },
    turnPlanner: { intent: "idea_development" },
  });

  assert.equal(plan.sequenceContext.key, "midpoint");
  assert.equal(plan.targetField, "story_thread.payoff_choice");
  assert.match(plan.question, /^To make the midpoint irreversible,/);
  assert.match(plan.question, /ferry manifest/);
});

test("all-is-lost planning prioritizes the need beneath the collapsing want", () => {
  const plan = buildScreenplayQuestionPlan({
    transcript: "The all is lost sequence has no emotional power.",
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
          next_emotional_turn: "Admit the plan has failed",
        },
      }],
      screenplay_project_memory: {
        act: "Act II",
        protagonist_want: "Save Eli",
        central_question: "Can Mara save Eli without controlling him?",
        antagonistic_force: "The evacuation authority",
      },
    },
    studioMeta: {
      screenplayProjectId: "split-ferries",
      screenplayAct: "Act II",
    },
    turnPlanner: { intent: "idea_development" },
  });

  assert.equal(plan.sequenceContext.key, "crisis");
  assert.equal(plan.targetField, "project.protagonist_need");
  assert.match(plan.question, /^To power the all-is-lost turn,/);
});

test("climax planning prioritizes transformed behavior under maximum pressure", () => {
  const plan = buildScreenplayQuestionPlan({
    transcript: "Let's make the climax decisive.",
    creativeMemoryTrace: {
      project_id: "split-ferries",
      project_title: "Split Ferries",
      screenplay_project_memory: {
        act: "Act III",
        protagonist_want: "Save Eli",
        central_question: "Can Mara save Eli without controlling him?",
        antagonistic_force: "The evacuation authority",
      },
    },
    studioMeta: {
      screenplayProjectId: "split-ferries",
      screenplayAct: "Act III",
    },
    turnPlanner: { intent: "idea_development" },
  });

  assert.equal(plan.sequenceContext.key, "climax");
  assert.equal(plan.targetField, "project.protagonist_need");
  assert.match(plan.question, /^Under climax pressure,/);
});

test("resolution planning prioritizes the corrected-feature destination image", () => {
  const plan = buildScreenplayQuestionPlan({
    transcript: "The final image and resolution are not landing.",
    creativeMemoryTrace: {
      project_id: "split-ferries",
      project_title: "Split Ferries",
      screenplay_project_memory: {
        act: "Act III",
        protagonist_want: "Save Eli",
        central_question: "Can Mara save Eli without controlling him?",
        antagonistic_force: "The evacuation authority",
        protagonist_need: "Trust Eli with the route",
      },
    },
    studioMeta: {
      screenplayProjectId: "split-ferries",
      screenplayAct: "Act III",
    },
    turnPlanner: { intent: "idea_development" },
  });

  assert.equal(plan.sequenceContext.key, "resolution");
  assert.equal(plan.targetField, "project.ending_image");
  assert.match(plan.question, /^To complete the resolution,/);
});

test("page position restores midpoint sequence pressure when labels are absent", () => {
  const plan = buildScreenplayQuestionPlan({
    transcript: "Help me develop the next section.",
    creativeMemoryTrace: {
      project_id: "split-ferries",
      project_title: "Split Ferries",
      due_story_thread: {
        setup: "June pocketed the harbor master's red key",
        promised_payoff: "The key opens the quarantine gate",
      },
      screenplay_project_memory: {
        act: "Act II",
        protagonist_want: "Save Eli",
        central_question: "Can Mara save Eli without controlling him?",
        antagonistic_force: "The evacuation authority",
        act_progress: {
          current_act: "Act II",
          page_count: 47,
          target_pages: 110,
        },
      },
    },
    studioMeta: { screenplayProjectId: "split-ferries" },
    turnPlanner: { intent: "idea_development" },
  });

  assert.equal(plan.sequenceContext.key, "midpoint");
  assert.equal(plan.sequenceContext.source, "page_position");
  assert.equal(plan.sequenceContext.label, "Midpoint Pressure");
  assert.equal(plan.targetField, "story_thread.payoff_choice");
});

test("a remembered Act III payoff runway becomes execution guidance instead of a repeated question", () => {
  const plan = buildScreenplayQuestionPlan({
    transcript: "Help me develop the final plan.",
    creativeMemoryTrace: {
      project_id: "split-ferries",
      project_title: "Split Ferries",
      screenplay_project_memory: {
        act: "Act III",
        feature_sequence: "Act III - Break Into Three / Final Plan",
        current_beat: "Mara accepts that Eli must choose the route.",
        protagonist_want: "Save Eli",
        central_question: "Can Mara save Eli without controlling him?",
        antagonistic_force: "The evacuation authority",
        protagonist_need: "Trust Eli with the route",
        ending_image: "Eli steers while Mara watches the shore recede",
        theme_argument: "Love without trust becomes possession",
        next_scene_plan: "Mara gives Eli the harbor key",
        act_three_payoff_path: [
          "The ferry manifest exposes the evacuation order",
          "The harbor key opens the quarantine gate",
        ],
      },
    },
    studioMeta: {
      screenplayProjectId: "split-ferries",
      screenplayAct: "Act III",
    },
    turnPlanner: { intent: "idea_development" },
  });

  assert.equal(plan.sequenceContext.key, "final_plan");
  assert.deepEqual(plan.sequenceContext.payoffRunway, [
    "The ferry manifest exposes the evacuation order",
    "The harbor key opens the quarantine gate",
  ]);
  assert.equal(plan.shouldAsk, false);
  assert.match(plan.objective, /Spend the current beat first: Mara accepts/);
  assert.match(plan.objective, /Protect the remembered payoff runway/);
  assert.match(plan.objective, /ferry manifest exposes/);
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

test("accepted-page and unblock outcomes improve future sequence-specific ranking", () => {
  const now = 8_000_000;
  const plan = buildScreenplayQuestionPlan({
    transcript: "I'm stuck in the promise-of-the-premise sequence. What happens next?",
    creativeMemoryTrace: {
      project_id: "split-ferries",
      project_title: "Split Ferries",
      accepted_scenes: [{
        scene_heading: "INT. FERRY CABIN - NIGHT",
        accepted_at: now - (3 * 60 * 1_000),
      }],
      characters: [{
        name: "Mara",
        arc: {
          want: "Save Eli",
          need: "Trust Eli with the route",
          wound: "She once abandoned June",
          false_belief: "Control keeps everyone safe",
          next_emotional_turn: "Let Eli choose the crossing",
        },
      }],
      screenplay_project_memory: {
        act: "Act II",
        protagonist_want: "Save Eli",
        protagonist_need: "Trust Eli with the route",
        central_question: "Can Mara save Eli without controlling him?",
        antagonistic_force: "The evacuation authority",
        ending_image: "Mara lets Eli steer the ferry into dawn",
        theme_argument: "Love without trust becomes possession",
        scene_objective: "Reach the quarantine gate",
        question_effectiveness: [{
          question_id: "screenplay-learning-14-story.next_irreversible_choice",
          target_field: "story.next_irreversible_choice",
          act_key: "act2",
          sequence_key: "premise",
          writer_blocked: true,
          answered_at: 1_000,
          accepted_page_count: 1,
          block_resolution_count: 1,
          outcome: "accepted_pages_and_block_resolved",
        }],
      },
    },
    studioMeta: {
      screenplayProjectId: "split-ferries",
      screenplayAct: "Act II",
      screenplayFeatureSequence: "Promise of the Premise",
      screenplayCharacterFocus: ["Mara"],
    },
    turnPlanner: { intent: "momentum_rescue" },
    now,
  });

  assert.equal(plan.targetField, "story.next_irreversible_choice");
  assert.equal(plan.sequenceContext.key, "premise");
  assert.equal(plan.shouldAsk, true);
  assert.equal(plan.questionStrategy, "proven_block_recovery");
  assert.equal(plan.writingMomentum.active, false);
  assert.equal(plan.writingMomentum.acceptedSceneIsRecent, true);
  assert.equal(plan.effectivenessBonus, 42);
  assert.equal(plan.successfulQuestionOutcomes, 1);
  assert.equal(
    plan.candidateScores.find((item) => item.field === "story.next_irreversible_choice")
      ?.effectiveness_bonus,
    42
  );
  assert.ok(
    plan.selectionScore >
    plan.candidateScores.find((item) => item.field === "character.current_tactic")?.score
  );
});

test("a pending learning question turns the writer's next short answer into context", () => {
  const plan = {
    active: true,
    shouldAsk: true,
    mode: "rescue_then_decide",
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    targetField: "character.want",
    targetLabel: "Mara's dramatic want",
    anchor: "Mara",
    question: "What does Mara want badly enough to keep choosing danger instead of safety?",
    actContext: { key: "act2" },
    sequenceContext: { key: "premise" },
    writerBlocked: true,
  };
  const pending = createPendingScreenplayLearningQuestion(plan, { askedAtTurn: 8, now: 1000 });
  const resolution = resolvePendingScreenplayLearningAnswer({
    pending,
    transcript: "Freedom.",
    projectId: "split-ferries",
    currentTurn: 9,
    now: 2_000,
  });

  assert.equal(resolution.status, "answered");
  assert.equal(resolution.shouldClear, true);
  assert.equal(resolution.learningContext.targetField, "character.want");
  assert.equal(resolution.learningContext.authority, "writer_clarification");
  assert.equal(resolution.learningContext.actKey, "act2");
  assert.equal(resolution.learningContext.sequenceKey, "premise");
  assert.equal(resolution.learningContext.writerBlocked, true);
  assert.equal(resolution.interaction.responseStatus, "answered");
  assert.equal(resolution.interaction.askedAt, 1_000);
  assert.equal(resolution.interaction.respondedAt, 2_000);
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
  }, { askedAtTurn: 4, now: 1_000 });
  const resolution = resolvePendingScreenplayLearningAnswer({
    pending,
    transcript: "Write the next scene now.",
    projectId: "split-ferries",
    currentTurn: 5,
    now: 3_000,
  });

  assert.equal(resolution.status, "declined");
  assert.equal(resolution.learningContext, null);
  assert.equal(resolution.shouldClear, true);
  assert.equal(resolution.interaction.responseStatus, "declined");
  assert.equal(resolution.interaction.respondedAt, 3_000);
});

test("an unanswered learning question expires into an ignored interaction", () => {
  const pending = createPendingScreenplayLearningQuestion({
    active: true,
    shouldAsk: true,
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    targetField: "project.ending_image",
    targetLabel: "the ending image",
    question: "What final image proves the story changed?",
  }, { askedAtTurn: 4, now: 1_000 });
  const resolution = resolvePendingScreenplayLearningAnswer({
    pending,
    transcript: "Let's talk about something else.",
    projectId: "split-ferries",
    currentTurn: 7,
    now: 4_000,
  });

  assert.equal(resolution.status, "expired");
  assert.equal(resolution.shouldClear, true);
  assert.equal(resolution.learningContext, null);
  assert.equal(resolution.interaction.responseStatus, "expired");
  assert.equal(resolution.interaction.askedAt, 1_000);
  assert.equal(resolution.interaction.respondedAt, 4_000);
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
