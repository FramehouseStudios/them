function normalizeMetricToken(value = "", fallback = "none", maxLength = 48) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, Math.max(1, Number(maxLength || 48)));
  return normalized || fallback;
}

function normalizeMetricCount(value = 0) {
  return Math.max(0, Math.floor(Number(value || 0)));
}

function normalizeMetricRate(value = 0) {
  const normalized = Number(value || 0);
  if (!Number.isFinite(normalized)) return 0;
  return Math.max(0, Math.min(1, normalized));
}

function deriveScreenplayOutcome({
  screenplayMode = false,
  screenplayRequestedTarget = "none",
  screenplayFinalTarget = "none",
  screenplayOutputSource = "none",
  screenplayAuthoritative = false,
  screenplayReplyRepaired = false,
} = {}) {
  if (!screenplayMode) return "none";
  if (screenplayRequestedTarget !== "page") {
    return screenplayFinalTarget === "voice_pin" ? "voice_pin" : "screenplay_mode";
  }
  if (screenplayFinalTarget === "page" && screenplayAuthoritative) {
    return screenplayReplyRepaired ? "accepted_repaired_page" : "accepted_page";
  }
  if (screenplayOutputSource === "guard_invalid_page_format") {
    return "rejected_invalid_page_format";
  }
  if (screenplayOutputSource === "guard_non_screenplay") {
    return "rejected_non_screenplay";
  }
  if (screenplayFinalTarget === "voice_pin") {
    return "downgraded_voice_pin";
  }
  return "rejected_unknown";
}

function normalizeTalkScreenplayMetricSample(sample = {}) {
  const screenplayMode = Boolean(sample?.screenplayMode);
  const screenplayRequestedTarget = normalizeMetricToken(sample?.screenplayRequestedTarget);
  const screenplayFinalTarget = normalizeMetricToken(sample?.screenplayFinalTarget);
  const screenplayOutputSource = normalizeMetricToken(sample?.screenplayOutputSource, "none", 64);
  const screenplayAuthoritative = Boolean(sample?.screenplayAuthoritative);
  const screenplayReplyRepaired = Boolean(sample?.screenplayReplyRepaired);
  const screenplayOutcome = normalizeMetricToken(
    sample?.screenplayOutcome ||
      deriveScreenplayOutcome({
        screenplayMode,
        screenplayRequestedTarget,
        screenplayFinalTarget,
        screenplayOutputSource,
        screenplayAuthoritative,
        screenplayReplyRepaired,
      }),
    "none",
    64
  );
  return {
    screenplayMode,
    screenplayRequestedTarget,
    screenplayFinalTarget,
    screenplayOutputSource,
    screenplayOutcome,
    screenplayAuthoritative,
    screenplayReplyRepaired,
  };
}

function countBy(items = [], key) {
  const counts = {};
  for (const item of Array.isArray(items) ? items : []) {
    const value = normalizeMetricToken(item?.[key]);
    counts[value] = Math.max(0, Number(counts[value] || 0)) + 1;
  }
  return counts;
}

function summarizeTalkScreenplayMetrics(samples = []) {
  const normalized = (Array.isArray(samples) ? samples : [])
    .map(normalizeTalkScreenplayMetricSample);
  const screenplaySamples = normalized.filter((sample) => sample.screenplayMode);
  const pageRequested = screenplaySamples.filter((sample) => sample.screenplayRequestedTarget === "page");
  const accepted = pageRequested.filter((sample) =>
    sample.screenplayFinalTarget === "page" && sample.screenplayAuthoritative
  );
  const repaired = accepted.filter((sample) => sample.screenplayReplyRepaired);
  const downgraded = pageRequested.filter((sample) => sample.screenplayFinalTarget === "voice_pin");
  const invalidFormat = pageRequested.filter((sample) =>
    sample.screenplayOutputSource === "guard_invalid_page_format"
  );
  const nonScreenplay = pageRequested.filter((sample) =>
    sample.screenplayOutputSource === "guard_non_screenplay"
  );
  return {
    modeCount: screenplaySamples.length,
    pageRequestedCount: pageRequested.length,
    pageAcceptedCount: accepted.length,
    pageRepairedCount: repaired.length,
    pageDowngradedCount: downgraded.length,
    pageRejectedInvalidFormatCount: invalidFormat.length,
    pageRejectedNonScreenplayCount: nonScreenplay.length,
    pageAcceptanceRate: pageRequested.length > 0 ? accepted.length / pageRequested.length : 0,
    outcomeCounts: countBy(screenplaySamples, "screenplayOutcome"),
    outputSourceCounts: countBy(screenplaySamples, "screenplayOutputSource"),
  };
}

const TALK_SCREENPLAY_QUALITY_DEFAULTS = Object.freeze({
  minPageRequests: 6,
  warningPageAcceptanceRate: 0.75,
  criticalPageAcceptanceRate: 0.50,
  warningGuardRejectionRate: 0.25,
  criticalGuardRejectionRate: 0.50,
  warningDowngradeRate: 0.25,
  criticalDowngradeRate: 0.50,
});

function deriveTalkScreenplayQualitySignal(summary = {}, options = {}) {
  const thresholds = {
    ...TALK_SCREENPLAY_QUALITY_DEFAULTS,
    ...(options && typeof options === "object" ? options : {}),
  };
  const minPageRequests = Math.max(1, normalizeMetricCount(thresholds.minPageRequests));
  const pageRequestedCount = normalizeMetricCount(summary?.pageRequestedCount);
  const pageAcceptedCount = normalizeMetricCount(summary?.pageAcceptedCount);
  const pageRepairedCount = normalizeMetricCount(summary?.pageRepairedCount);
  const pageDowngradedCount = normalizeMetricCount(summary?.pageDowngradedCount);
  const pageRejectedInvalidFormatCount = normalizeMetricCount(summary?.pageRejectedInvalidFormatCount);
  const pageRejectedNonScreenplayCount = normalizeMetricCount(summary?.pageRejectedNonScreenplayCount);
  const guardRejectedCount = pageRejectedInvalidFormatCount + pageRejectedNonScreenplayCount;
  const denominator = Math.max(1, pageRequestedCount);
  const pageAcceptanceRate = pageRequestedCount > 0
    ? normalizeMetricRate(summary?.pageAcceptanceRate || (pageAcceptedCount / denominator))
    : 0;
  const guardRejectionRate = pageRequestedCount > 0 ? normalizeMetricRate(guardRejectedCount / denominator) : 0;
  const downgradeRate = pageRequestedCount > 0 ? normalizeMetricRate(pageDowngradedCount / denominator) : 0;
  const repairRate = pageAcceptedCount > 0 ? normalizeMetricRate(pageRepairedCount / Math.max(1, pageAcceptedCount)) : 0;
  const sampleReady = pageRequestedCount >= minPageRequests;

  let status = "ok";
  let reason = sampleReady ? "healthy" : "insufficient_page_requests";
  if (sampleReady) {
    const critical =
      pageAcceptanceRate < normalizeMetricRate(thresholds.criticalPageAcceptanceRate) ||
      guardRejectionRate >= normalizeMetricRate(thresholds.criticalGuardRejectionRate) ||
      downgradeRate >= normalizeMetricRate(thresholds.criticalDowngradeRate);
    const warning =
      pageAcceptanceRate < normalizeMetricRate(thresholds.warningPageAcceptanceRate) ||
      guardRejectionRate >= normalizeMetricRate(thresholds.warningGuardRejectionRate) ||
      downgradeRate >= normalizeMetricRate(thresholds.warningDowngradeRate);
    if (critical) {
      status = "critical";
    } else if (warning) {
      status = "warning";
    }
    if (status !== "ok") {
      if (
        pageAcceptanceRate < (
          status === "critical"
            ? normalizeMetricRate(thresholds.criticalPageAcceptanceRate)
            : normalizeMetricRate(thresholds.warningPageAcceptanceRate)
        )
      ) {
        reason = "low_page_acceptance";
      } else if (
        guardRejectionRate >= (
          status === "critical"
            ? normalizeMetricRate(thresholds.criticalGuardRejectionRate)
            : normalizeMetricRate(thresholds.warningGuardRejectionRate)
        )
      ) {
        reason = "high_guard_rejection_rate";
      } else {
        reason = "high_downgrade_rate";
      }
    }
  }

  return {
    status,
    reason,
    sampleReady,
    minPageRequests,
    pageRequestedCount,
    pageAcceptedCount,
    pageRepairedCount,
    pageDowngradedCount,
    pageRejectedInvalidFormatCount,
    pageRejectedNonScreenplayCount,
    guardRejectedCount,
    pageAcceptanceRate,
    guardRejectionRate,
    downgradeRate,
    repairRate,
  };
}

function roundedMetricRate(value = 0) {
  return Math.round(normalizeMetricRate(value) * 1000) / 1000;
}

function buildTalkScreenplayQualityAlert(signal = {}) {
  const status = String(signal?.status || "ok").trim().toLowerCase();
  if (status !== "warning" && status !== "critical") return null;
  const pageRequestedCount = normalizeMetricCount(signal?.pageRequestedCount);
  const pageAcceptanceRate = roundedMetricRate(signal?.pageAcceptanceRate);
  return {
    code: "screenplay_page_write_regression",
    severity: status === "critical" ? "critical" : "warning",
    message: `Screenplay page-write acceptance ${pageAcceptanceRate.toFixed(3)} across ${pageRequestedCount} page requests (${normalizeMetricToken(signal?.reason, "quality_regression", 64)}).`,
    details: {
      page_requested_count: pageRequestedCount,
      page_accepted_count: normalizeMetricCount(signal?.pageAcceptedCount),
      page_repaired_count: normalizeMetricCount(signal?.pageRepairedCount),
      page_downgraded_count: normalizeMetricCount(signal?.pageDowngradedCount),
      guard_rejected_count: normalizeMetricCount(signal?.guardRejectedCount),
      page_acceptance_rate: pageAcceptanceRate,
      guard_rejection_rate: roundedMetricRate(signal?.guardRejectionRate),
      downgrade_rate: roundedMetricRate(signal?.downgradeRate),
      reason: normalizeMetricToken(signal?.reason, "quality_regression", 64),
    },
  };
}

export {
  buildTalkScreenplayQualityAlert,
  deriveScreenplayOutcome,
  deriveTalkScreenplayQualitySignal,
  normalizeTalkScreenplayMetricSample,
  summarizeTalkScreenplayMetrics,
};
