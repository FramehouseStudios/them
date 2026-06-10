import assert from "node:assert/strict";
import { test } from "node:test";

import {
  deriveScreenplayOutcome,
  normalizeTalkScreenplayMetricSample,
  summarizeTalkScreenplayMetrics,
} from "../lib/talk_screenplay_metrics.js";

test("[talk-screenplay-metrics] derives accepted, repaired, and rejected outcomes", () => {
  assert.equal(deriveScreenplayOutcome({
    screenplayMode: true,
    screenplayRequestedTarget: "page",
    screenplayFinalTarget: "page",
    screenplayOutputSource: "studio_target",
    screenplayAuthoritative: true,
    screenplayReplyRepaired: false,
  }), "accepted_page");

  assert.equal(deriveScreenplayOutcome({
    screenplayMode: true,
    screenplayRequestedTarget: "page",
    screenplayFinalTarget: "page",
    screenplayOutputSource: "studio_target",
    screenplayAuthoritative: true,
    screenplayReplyRepaired: true,
  }), "accepted_repaired_page");

  assert.equal(deriveScreenplayOutcome({
    screenplayMode: true,
    screenplayRequestedTarget: "page",
    screenplayFinalTarget: "voice_pin",
    screenplayOutputSource: "guard_invalid_page_format",
  }), "rejected_invalid_page_format");

  assert.equal(deriveScreenplayOutcome({
    screenplayMode: true,
    screenplayRequestedTarget: "page",
    screenplayFinalTarget: "voice_pin",
    screenplayOutputSource: "guard_non_screenplay",
  }), "rejected_non_screenplay");
});

test("[talk-screenplay-metrics] normalizes sample fields without content", () => {
  const normalized = normalizeTalkScreenplayMetricSample({
    screenplayMode: true,
    screenplayRequestedTarget: "Page!!",
    screenplayFinalTarget: "VOICE PIN",
    screenplayOutputSource: "guard_non_screenplay",
    screenplayAuthoritative: false,
    screenplayReplyRepaired: false,
  });

  assert.deepEqual(normalized, {
    screenplayMode: true,
    screenplayRequestedTarget: "page",
    screenplayFinalTarget: "voice_pin",
    screenplayOutputSource: "guard_non_screenplay",
    screenplayOutcome: "rejected_non_screenplay",
    screenplayAuthoritative: false,
    screenplayReplyRepaired: false,
  });
});

test("[talk-screenplay-metrics] summarizes page-write outcome counters", () => {
  const summary = summarizeTalkScreenplayMetrics([
    {
      screenplayMode: true,
      screenplayRequestedTarget: "page",
      screenplayFinalTarget: "page",
      screenplayOutputSource: "studio_target",
      screenplayAuthoritative: true,
      screenplayReplyRepaired: false,
    },
    {
      screenplayMode: true,
      screenplayRequestedTarget: "page",
      screenplayFinalTarget: "page",
      screenplayOutputSource: "studio_target",
      screenplayAuthoritative: true,
      screenplayReplyRepaired: true,
    },
    {
      screenplayMode: true,
      screenplayRequestedTarget: "page",
      screenplayFinalTarget: "voice_pin",
      screenplayOutputSource: "guard_non_screenplay",
    },
    {
      screenplayMode: true,
      screenplayRequestedTarget: "voice_pin",
      screenplayFinalTarget: "voice_pin",
      screenplayOutputSource: "studio_target",
    },
    {
      screenplayMode: false,
    },
  ]);

  assert.equal(summary.modeCount, 4);
  assert.equal(summary.pageRequestedCount, 3);
  assert.equal(summary.pageAcceptedCount, 2);
  assert.equal(summary.pageRepairedCount, 1);
  assert.equal(summary.pageDowngradedCount, 1);
  assert.equal(summary.pageRejectedInvalidFormatCount, 0);
  assert.equal(summary.pageRejectedNonScreenplayCount, 1);
  assert.equal(summary.pageAcceptanceRate, 2 / 3);
  assert.equal(summary.outcomeCounts.accepted_page, 1);
  assert.equal(summary.outcomeCounts.accepted_repaired_page, 1);
  assert.equal(summary.outcomeCounts.rejected_non_screenplay, 1);
  assert.equal(summary.outcomeCounts.voice_pin, 1);
});
