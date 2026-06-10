import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildTalkScreenplayQualityAlert,
  deriveScreenplayOutcome,
  deriveTalkScreenplayQualitySignal,
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

  assert.equal(deriveScreenplayOutcome({
    screenplayMode: true,
    screenplayRequestedTarget: "page",
    screenplayFinalTarget: "voice_pin",
    screenplayOutputSource: "guard_low_page_quality",
  }), "rejected_low_page_quality");
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
      screenplayMode: true,
      screenplayRequestedTarget: "page",
      screenplayFinalTarget: "voice_pin",
      screenplayOutputSource: "guard_low_page_quality",
    },
    {
      screenplayMode: false,
    },
  ]);

  assert.equal(summary.modeCount, 5);
  assert.equal(summary.pageRequestedCount, 4);
  assert.equal(summary.pageAcceptedCount, 2);
  assert.equal(summary.pageRepairedCount, 1);
  assert.equal(summary.pageDowngradedCount, 2);
  assert.equal(summary.pageRejectedInvalidFormatCount, 0);
  assert.equal(summary.pageRejectedNonScreenplayCount, 1);
  assert.equal(summary.pageRejectedLowQualityCount, 1);
  assert.equal(summary.pageAcceptanceRate, 2 / 4);
  assert.equal(summary.outcomeCounts.accepted_page, 1);
  assert.equal(summary.outcomeCounts.accepted_repaired_page, 1);
  assert.equal(summary.outcomeCounts.rejected_non_screenplay, 1);
  assert.equal(summary.outcomeCounts.rejected_low_page_quality, 1);
  assert.equal(summary.outcomeCounts.voice_pin, 1);
});

test("[talk-screenplay-metrics] quality signal gates on enough page requests", () => {
  const signal = deriveTalkScreenplayQualitySignal({
    pageRequestedCount: 3,
    pageAcceptedCount: 1,
    pageAcceptanceRate: 1 / 3,
  });

  assert.equal(signal.status, "ok");
  assert.equal(signal.reason, "insufficient_page_requests");
  assert.equal(signal.sampleReady, false);
  assert.equal(buildTalkScreenplayQualityAlert(signal), null);
});

test("[talk-screenplay-metrics] quality signal warns on low page acceptance", () => {
  const signal = deriveTalkScreenplayQualitySignal({
    pageRequestedCount: 8,
    pageAcceptedCount: 5,
    pageRepairedCount: 2,
    pageDowngradedCount: 3,
    pageRejectedInvalidFormatCount: 1,
    pageRejectedNonScreenplayCount: 1,
    pageRejectedLowQualityCount: 1,
    pageAcceptanceRate: 5 / 8,
  });
  const alert = buildTalkScreenplayQualityAlert(signal);

  assert.equal(signal.status, "warning");
  assert.equal(signal.reason, "low_page_acceptance");
  assert.equal(signal.sampleReady, true);
  assert.equal(signal.guardRejectedCount, 3);
  assert.equal(signal.guardRejectionRate, 0.375);
  assert.equal(signal.downgradeRate, 0.375);
  assert.equal(alert.code, "screenplay_page_write_regression");
  assert.equal(alert.severity, "warning");
  assert.equal(alert.details.page_requested_count, 8);
  assert.equal(alert.details.page_rejected_low_quality_count, 1);
  assert.equal(alert.details.page_acceptance_rate, 0.625);
});

test("[talk-screenplay-metrics] quality signal escalates critical regressions", () => {
  const signal = deriveTalkScreenplayQualitySignal({
    pageRequestedCount: 6,
    pageAcceptedCount: 2,
    pageDowngradedCount: 4,
    pageRejectedInvalidFormatCount: 2,
    pageRejectedNonScreenplayCount: 1,
    pageRejectedLowQualityCount: 1,
    pageAcceptanceRate: 2 / 6,
  });
  const alert = buildTalkScreenplayQualityAlert(signal);

  assert.equal(signal.status, "critical");
  assert.equal(signal.reason, "low_page_acceptance");
  assert.equal(alert.severity, "critical");
  assert.equal(alert.details.guard_rejected_count, 4);
  assert.equal(alert.details.page_rejected_low_quality_count, 1);
  assert.equal(alert.details.downgrade_rate, 0.667);
});
