import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildStudioScreenplayRepairRequest,
  enforceStudioScreenplayQuality,
  enforceStudioStructuralAnalysisQuality,
  evaluateStudioScreenplayReply,
  studioScreenplayFeatureContext,
  studioScreenplayMaxTokens,
  studioScreenplayRequestedPages,
} from "../lib/studio_screenplay_quality_gate.js";

const VALID_SCENE_DOCTOR = [
  "The core problem is that Mara's objective never meets real opposition, so the scene repeats one tactic without a turn.",
  "The highest-leverage fix is to make Eli withhold the reel until Mara risks their relationship. That creates obstacle, leverage, subtext, and a consequence for the next scene and her Act II arc.",
  "A playable version on the page:",
  "INT. EDIT BAY - NIGHT",
  "Mara reaches for the reel. Eli closes his fist around it.",
  "ELI",
  "Tell them what you cut, or this stays with me.",
  "End when Mara opens the live microphone; the choice makes the public hearing inevitable.",
].join("\n");

const VALID_PAGE = [
  "INT. ARCHIVE - NIGHT",
  "",
  "Mara drives a brass key into the evidence locker as footsteps close behind her.",
  "",
  "ELI",
  "You said the file was gone.",
  "",
  "Mara snaps the key before the lock can release it.",
  "",
  "MARA",
  "I said they could not use it.",
  "",
  "The broken half drops inside the locker. Eli raises the original subpoena, its red seal reflected in the steel door.",
  "",
  "ELI",
  "Then we use this.",
  "",
  "Mara takes the subpoena and steps toward the approaching guard instead of the exit.",
].join("\n");

const CONTRADICTORY_PAGE = VALID_PAGE.replace(
  "You said the file was gone.",
  "I had no idea you forged the affidavit."
);

test("[studio-quality] valid Fountain passes without spending the repair", async () => {
  let repairCalls = 0;
  const result = await enforceStudioScreenplayQuality({
    reply: VALID_PAGE,
    transcript: "Write the next page.",
    body: { screenplay_target: "page" },
    renderRepair: async () => {
      repairCalls += 1;
      return VALID_PAGE;
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.repaired, false);
  assert.equal(result.reply, VALID_PAGE);
  assert.equal(result.quality.repair_outcome, "not_needed");
  assert.equal(repairCalls, 0);
});

test("[studio-quality] structural analysis passes without spending repair", async () => {
  let repairCalls = 0;
  const result = await enforceStudioStructuralAnalysisQuality({
    reply: VALID_SCENE_DOCTOR,
    transcript: "Scene doctor this sequence.",
    modelReason: "screenplay_scene_doctor",
    taskIntent: "scene_doctor",
    renderRepair: async () => {
      repairCalls += 1;
      return VALID_SCENE_DOCTOR;
    },
  });

  assert.equal(result.reply, VALID_SCENE_DOCTOR);
  assert.equal(result.repaired, false);
  assert.equal(result.structuralQuality.passed, true);
  assert.equal(result.structuralQuality.outcome, "initial_pass");
  assert.equal(result.structuralQuality.model_reason, "screenplay_scene_doctor");
  assert.equal(repairCalls, 0);
});

test("[studio-quality] weak structural analysis gets one canon-aware repair", async () => {
  const calls = [];
  const result = await enforceStudioStructuralAnalysisQuality({
    reply: "The scene needs more emotion.",
    transcript: "Scene doctor this sequence.",
    studioMeta: {
      screenplayAct: "Act II",
      screenplayCorrectionReplacements: ["mother -> Eli's sister"],
    },
    modelReason: "screenplay_scene_doctor",
    taskIntent: "scene_doctor",
    maxTokens: 700,
    renderRepair: async (request) => {
      calls.push(request);
      return VALID_SCENE_DOCTOR;
    },
  });

  assert.equal(result.reply, VALID_SCENE_DOCTOR);
  assert.equal(result.repaired, true);
  assert.equal(result.structuralQuality.passed, true);
  assert.equal(result.structuralQuality.outcome, "repaired_pass");
  assert.equal(result.structuralQuality.initial_reason, "underdeveloped_scene_doctor");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].modelTier, "structural_repair");
  assert.equal(calls[0].maxTokens, 700);
  assert.match(calls[0].transcript, /CANON_CORRECTION: mother -> Eli's sister/);
});

test("[studio-quality] structurally fluent but project-generic analysis gets one graph-grounded repair", async () => {
  const calls = [];
  const grounded = [
    "The core problem is that Mara keeps searching for the burned ferry ledger instead of confronting Eli's refusal, so the scene repeats her control tactic without a turn.",
    "The highest-leverage fix is to make Eli withhold the memorized names until Mara gives June the cracked token and lets her choose the route. That adds obstacle, leverage, subtext, and a relationship consequence for the next scene and Mara's Act II arc.",
    "A playable version on the page:",
    "INT. FERRY TERMINAL - NIGHT",
    "Mara slides the cracked token to June. Eli finally says the first name.",
    "The choice makes the service-tunnel escape inevitable.",
  ].join("\n");
  const result = await enforceStudioStructuralAnalysisQuality({
    reply: VALID_SCENE_DOCTOR,
    transcript: "Scene doctor the ferry-terminal confrontation.",
    studioMeta: {
      screenplayFeatureStoryGraph: {
        currentState: {
          lastAcceptedOutcome: "Eli refuses to repeat the memorized names until Mara trusts him.",
          nextScenePlan: "June takes the cracked ferry token through the service tunnel.",
          characterArcState: "Mara treats dependence as danger and trust as surrendering control.",
        },
        bindingFacts: [{ fact: "Mara burned the ferry ledger beyond recovery." }],
        openThreads: [{ due: true, setup: "The cracked ferry token Mara gave June." }],
      },
    },
    modelReason: "screenplay_scene_doctor",
    taskIntent: "scene_doctor",
    renderRepair: async (request) => {
      calls.push(request);
      return grounded;
    },
  });

  assert.equal(result.repaired, true);
  assert.equal(result.structuralQuality.initial_reason, "missing_specific_story_grounding");
  assert.equal(result.structuralQuality.passed, true);
  assert.equal(result.structuralQuality.dimensions.storySpecificGrounding, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].transcript, /GRAPH_CHANGED_STATE: Eli refuses/);
  assert.match(calls[0].transcript, /GRAPH_DUE_PROMISE: The cracked ferry token/);
});

test("[studio-quality] weaker structural repair cannot replace the initial answer", async () => {
  const initial = "The scene needs more emotion and a clearer objective before the next scene.";
  const result = await enforceStudioStructuralAnalysisQuality({
    reply: initial,
    transcript: "Scene doctor this sequence.",
    modelReason: "screenplay_scene_doctor",
    taskIntent: "scene_doctor",
    renderRepair: async () => "Make it better.",
  });

  assert.equal(result.reply, initial);
  assert.equal(result.repaired, false);
  assert.equal(result.structuralQuality.outcome, "not_improved");
  assert.equal(result.structuralQuality.final_score, result.structuralQuality.initial_score);
});

test("[studio-quality] recap instead of pages gets exactly one bounded repair", async () => {
  const repairCalls = [];
  const result = await enforceStudioScreenplayQuality({
    reply: "Here is a recap of what should happen next: Mara finds the file.",
    transcript: "Write the next page.",
    body: {
      screenplay_target: "page",
      screenplay_act: "Act II",
      screenplay_feature_sequence: "The courthouse trap",
      screenplay_current_beat: "Mara commits to exposing the forged testimony",
      screenplay_next_three_turns: ["Mara steals the sealed subpoena"],
    },
    systemPrompt: "ORIGINAL_CANON: Mara is Eli's sister, not his mother.",
    renderRepair: async (request) => {
      repairCalls.push(request);
      return VALID_PAGE;
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.repaired, true);
  assert.equal(result.reply, VALID_PAGE);
  assert.equal(result.quality.attempted_repair, true);
  assert.equal(result.quality.repair_outcome, "repaired");
  assert.equal(repairCalls.length, 1);
  assert.equal(repairCalls[0].modelTier, "structural_repair");
  assert.equal(repairCalls[0].repairAttempt, true);
  assert.equal(repairCalls[0].maxTokens, 1_600);
  assert.match(repairCalls[0].systemPrompt, /QUALITY_FAILURE:/);
  assert.match(repairCalls[0].systemPrompt, /Mara is Eli's sister, not his mother/);
  assert.match(repairCalls[0].transcript, /ACTIVE_SEQUENCE: The courthouse trap/);
  assert.match(repairCalls[0].transcript, /NEXT_TURN: Mara steals the sealed subpoena/);
});

test("[studio-quality] weak repair is rejected and never becomes the final reply", async () => {
  let repairCalls = 0;
  const result = await enforceStudioScreenplayQuality({
    reply: "Three possible directions for the scene.",
    transcript: "Write the next page.",
    body: { screenplay_target: "page" },
    renderRepair: async () => {
      repairCalls += 1;
      return "The scene could become more intense here.";
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reply, "");
  assert.equal(result.quality.repair_outcome, "rejected");
  assert.equal(repairCalls, 1);
});

test("[studio-quality] accepted canon contradiction spends exactly one repair and rechecks the result", async () => {
  const repairCalls = [];
  const body = {
    screenplay_target: "page",
    screenplay_act: "Act II",
    screenplay_accepted_causal_facts: [{
      kind: "revelation",
      fact: "MARA: I forged the affidavit.",
      source_scene_heading: "INT. ARCHIVE - NIGHT",
      age_in_scenes: 4,
    }],
  };
  const initial = evaluateStudioScreenplayReply({
    reply: CONTRADICTORY_PAGE,
    transcript: "Continue the hearing.",
    body,
  });
  assert.equal(initial.ok, false);
  assert.equal(initial.reason, "accepted_canon_contradiction");
  assert.equal(initial.canonContinuity.violations[0].type, "revelation_reset");

  const result = await enforceStudioScreenplayQuality({
    reply: CONTRADICTORY_PAGE,
    transcript: "Continue the hearing.",
    body,
    systemPrompt: "Return screenplay pages only.",
    renderRepair: async (request) => {
      repairCalls.push(request);
      return VALID_PAGE;
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.repaired, true);
  assert.equal(result.reply, VALID_PAGE);
  assert.equal(result.quality.initial_reason, "accepted_canon_contradiction");
  assert.equal(result.quality.repair_outcome, "repaired");
  assert.equal(result.quality.canon_facts_checked, 1);
  assert.equal(result.quality.canon_violation_count, 0);
  assert.equal(repairCalls.length, 1);
  assert.match(repairCalls[0].systemPrompt, /accepted revelation/i);
  assert.match(repairCalls[0].transcript, /BINDING_CAUSAL_FACT \[revelation\]: MARA: I forged the affidavit/);
  assert.match(repairCalls[0].transcript, /CANON_VIOLATION \[revelation_reset\]/);
});

test("[studio-quality] supplier failure is contained inside the one repair pass", async () => {
  const result = await enforceStudioScreenplayQuality({
    reply: "An outline follows.",
    transcript: "Write the next page.",
    body: { screenplay_target: "page" },
    renderRepair: async () => {
      throw new Error("provider unavailable");
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reply, "");
  assert.equal(result.quality.repair_outcome, "supplier_failed");
  assert.match(result.error, /provider unavailable/);
});

test("[studio-quality] page batch controls model budget without treating feature length as one turn", () => {
  assert.equal(studioScreenplayRequestedPages({
    body: { screenplay_requested_pages: 10, screenplay_target_pages: 110 },
    transcript: "Continue.",
  }), 10);
  assert.equal(studioScreenplayRequestedPages({
    body: { screenplay_target_pages: 110 },
    transcript: "Continue the scene.",
  }), 0);
  assert.equal(studioScreenplayMaxTokens(0), 1_600);
  assert.equal(studioScreenplayMaxTokens(10), 6_400);
  assert.equal(studioScreenplayMaxTokens(20), 8_000);
});

test("[studio-quality] absent execution brief does not create a false continuity obligation", () => {
  const empty = studioScreenplayFeatureContext({ screenplay_act: "Act I" });
  assert.equal(empty.nextSceneExecutionBrief, undefined);

  const populated = studioScreenplayFeatureContext({
    screenplay_next_scene_execution_brief: {
      assignment: "Mara must steal the sealed subpoena",
      image_to_stage: "red seal reflected in the locker",
    },
  });
  assert.equal(populated.nextSceneExecutionBrief.assignment, "Mara must steal the sealed subpoena");
  assert.equal(populated.nextSceneExecutionBrief.image, "red seal reflected in the locker");
});

test("[studio-quality] direct evaluator catches malformed output before persistence", () => {
  const malformed = evaluateStudioScreenplayReply({
    reply: "Beat one: Mara should discover the clue. Beat two: raise the stakes.",
    transcript: "Write the next page.",
    body: { screenplay_target: "page" },
  });
  assert.equal(malformed.ok, false);
  assert.match(malformed.reason, /empty|missing|artifact/);

  const repairRequest = buildStudioScreenplayRepairRequest({
    systemPrompt: "CANON_CORRECTION: Mara is Eli's sister.",
    transcript: "Continue the scene.",
    body: { screenplay_act: "Act II" },
    failedReply: "A summary instead of pages.",
    quality: malformed,
  });
  assert.match(repairRequest.systemPrompt, /CANON_CORRECTION/);
  assert.match(repairRequest.transcript, /WRITER_REQUEST:/);
  assert.match(repairRequest.transcript, /FAILED_DRAFT_TO_REPAIR:/);
});
