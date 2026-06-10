function normalizeMetricToken(value = "", fallback = "none", maxLength = 48) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, Math.max(1, Number(maxLength || 48)));
  return normalized || fallback;
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

export {
  deriveScreenplayOutcome,
  normalizeTalkScreenplayMetricSample,
  summarizeTalkScreenplayMetrics,
};
