import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildStudioScreenplayRepairRequest,
  enforceStudioScreenplayQuality,
  evaluateStudioScreenplayReply,
  studioScreenplayFeatureContext,
  studioScreenplayMaxTokens,
  studioScreenplayRequestedPages,
} from "../lib/studio_screenplay_quality_gate.js";

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
  assert.equal(repairCalls[0].modelTier, "rich");
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
