// D009 — compute* helpers that read module limits, extracted verbatim from backend/index.js.
//
// Functions here read only their arguments, the helpers imported below, the
// limits in lib/limits.js, and each other. Moved verbatim with doc comments;
// index.js imports every name unchanged.

import { countConsecutiveDayStreak } from "./counters.js";
import { RELATIONSHIP_DEPTH_MAX } from "./limits.js";
import { clampUnit } from "./utils.js";
import { LISTENING_FACT_MAX_MEMORY, RELATIONSHIP_DEPTH_DAY_STEP, RELATIONSHIP_DEPTH_TURN_STEP, REL_DEPTH_DEEP_ELABORATION_WORDS, SEASON_BASELINE_MATURITY_START, SEASON_PROGRESS_BASE_GROWTH, SEASON_PROGRESS_BASE_SURFACE, SEASON_PROGRESS_BASE_TRANSCENDENCE, SEASON_PROGRESS_MAX_STEP, SEASON_PROGRESS_MIN_STEP, SURFACE_MODE_DEPTH_CAP } from "./limits.js";

function computeReturnConsistencyScore({
  activeDayStamps,
  todayTurnCount,
  todayStamp,
  sameDaySessionReturns,
}) {
  const sameDayReturnScore =
    Boolean(sameDaySessionReturns) || Number(todayTurnCount || 0) >= 2
      ? 1
      : 0;
  const streak = countConsecutiveDayStreak(activeDayStamps, todayStamp);
  if (streak >= 7) return 5;
  if (streak >= 3) return 3;
  return sameDayReturnScore;
}

function computeReflectiveAnswerScore({
  assistantAskedFollowUp,
  userProvidedFollowUp,
  behaviorSignals,
  transcriptSnippet,
  followUpCompliance,
}) {
  if (assistantAskedFollowUp) {
    if (!userProvidedFollowUp) return 0;
    const words = String(transcriptSnippet || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    const deepElaboration =
      words >= REL_DEPTH_DEEP_ELABORATION_WORDS &&
      (
        Boolean(behaviorSignals?.reflectiveTopic) ||
        Boolean(behaviorSignals?.vulnerableShare)
      );
    return deepElaboration ? 5 : 3;
  }
  return Math.max(0, Math.min(5, clampUnit(followUpCompliance, 0) * 5));
}

function computeRelationshipDepthTarget(memory) {
  const turns = Math.max(
    0,
    Number(memory?.conversationCount ?? memory?.turns ?? 0)
  );
  const timeActiveDays = Math.max(
    0,
    Number(
      memory?.timeActiveDays ??
      (Array.isArray(memory?.activeDayStamps) ? memory.activeDayStamps.length : 0)
    )
  );
  const sharedFacts = Array.isArray(memory?.listeningFacts)
    ? memory.listeningFacts.length
    : 0;
  const emotionalDepth = clampUnit(memory?.emotionalDepthScore, 0.12);
  const trust = clampUnit(memory?.trust, 0.10);
  const vulnerability = clampUnit(memory?.vulnerability, 0.10);
  const growthProgress = clampUnit(memory?.growthProgress, 0);
  const sharedNorm = clampUnit(sharedFacts / Math.max(1, LISTENING_FACT_MAX_MEMORY));
  const behaviorDepthNorm = clampUnit((Number(memory?.behaviorDepthScore || 12) / 100), 0.12);
  const behaviorMode = String(memory?.behaviorMode || "surface");
  const activeDaysNorm = clampUnit(timeActiveDays / 30);
  const avgTurnsPerDay = turns / Math.max(1, timeActiveDays);
  const longerSessionNorm = clampUnit((avgTurnsPerDay - 3) / 8);
  const followUpPrompts = Math.max(0, Number(memory?.followUpPromptCount || 0));
  const followUpAnswers = Math.max(0, Number(memory?.followUpAnswerCount || 0));
  const followUpCompliance = followUpPrompts > 0
    ? clampUnit(followUpAnswers / followUpPrompts)
    : 0;
  const sustainedDepthDays = Array.isArray(memory?.highDepthDayStamps)
    ? memory.highDepthDayStamps.length
    : 0;
  const sustainedDepthNorm = clampUnit(
    sustainedDepthDays / Math.max(3, timeActiveDays || 1)
  );

  const signalBlend =
    (emotionalDepth * 0.22) +
    (trust * 0.14) +
    (vulnerability * 0.10) +
    (growthProgress * 0.08) +
    (sharedNorm * 0.08) +
    (behaviorDepthNorm * 0.12) +
    (activeDaysNorm * 0.11) +
    (longerSessionNorm * 0.09) +
    (sustainedDepthNorm * 0.10) +
    (followUpCompliance * 0.06);

  const signalTarget = signalBlend * RELATIONSHIP_DEPTH_MAX;
  const turnCap = Math.min(RELATIONSHIP_DEPTH_MAX, turns * RELATIONSHIP_DEPTH_TURN_STEP);
  const dayCap = Math.min(RELATIONSHIP_DEPTH_MAX, timeActiveDays * RELATIONSHIP_DEPTH_DAY_STEP);
  const surfaceCap = behaviorMode === "surface"
    ? Math.min(SURFACE_MODE_DEPTH_CAP, (8 + (behaviorDepthNorm * 18)))
    : RELATIONSHIP_DEPTH_MAX;

  return Math.max(
    0,
    Math.min(
      RELATIONSHIP_DEPTH_MAX,
      Math.min(signalTarget, turnCap, dayCap, surfaceCap)
    )
  );
}

function computeSeasonProgressStep({ behaviorSnapshot, seasonBaselineMaturity }) {
  const snapshot = behaviorSnapshot && typeof behaviorSnapshot === "object"
    ? behaviorSnapshot
    : {};
  const mode = String(snapshot.mode || "surface");
  const behaviorDepthNorm = clampUnit((Number(snapshot.behaviorDepthScore || 0) / 100), 0);
  const followUpCompliance = clampUnit(snapshot.followUpCompliance, 0);
  const repeatedThemeRate = clampUnit(snapshot.repeatedThemeRate, 0);
  const consistencyScore = clampUnit(snapshot.consistencyScore, 0);
  const baselineMaturity = clampUnit(seasonBaselineMaturity, SEASON_BASELINE_MATURITY_START);

  const base =
    mode === "transcendence"
      ? SEASON_PROGRESS_BASE_TRANSCENDENCE
      : mode === "growth"
        ? SEASON_PROGRESS_BASE_GROWTH
        : SEASON_PROGRESS_BASE_SURFACE;
  const step =
    base +
    (baselineMaturity * 0.03) +
    (behaviorDepthNorm * 0.04) +
    (followUpCompliance * 0.03) +
    (repeatedThemeRate * 0.02) +
    (consistencyScore * 0.02);

  return Math.max(SEASON_PROGRESS_MIN_STEP, Math.min(SEASON_PROGRESS_MAX_STEP, step));
}

export {
  computeReflectiveAnswerScore,
  computeRelationshipDepthTarget,
  computeReturnConsistencyScore,
  computeSeasonProgressStep,
};
