// D009 — derive* helpers that read module limits, extracted verbatim from backend/index.js.
//
// Functions here read only their arguments, the helpers imported below, the
// limits in lib/limits.js, and each other. Moved verbatim with doc comments;
// index.js imports every name unchanged.

import { computeGrowthTarget } from "./computations.js";
import { ADAPTIVE_BIAS_LIMIT } from "./limits.js";
import { sanitizeAdaptiveQualityTags } from "./sanitizers_bounded.js";
import { clampUnit } from "./utils.js";
import { CYCLE_EVOLUTION_ABSTRACTION_GAIN_PER_CYCLE, CYCLE_EVOLUTION_CALM_GAIN_PER_CYCLE, CYCLE_EVOLUTION_FLIRT_DECAY_PER_CYCLE, CYCLE_EVOLUTION_MAX_CYCLES, CYCLE_EVOLUTION_PHILOSOPHY_GAIN_PER_CYCLE, CYCLE_EVOLUTION_VALIDATION_DECAY_PER_CYCLE, CYCLE_UI_REACTIVITY_REDUCTION_MAX, CYCLE_UI_SATURATION_REDUCTION_MAX, CYCLE_UI_SMOOTHING_BASE, CYCLE_UI_SMOOTHING_GAIN_MAX, CYCLE_UI_VOICE_SLOWDOWN_MAX, HIDDEN_DEPTH_MODES, HIDDEN_MODE_TRANSCENDENCE_ACTIVE_DAYS, HIDDEN_MODE_TRANSCENDENCE_BEHAVIOR_DEPTH, HIDDEN_MODE_TRANSCENDENCE_CONVERSATIONS, HIDDEN_MODE_TRANSCENDENCE_REL_DEPTH, OVER_ATTACHMENT_AUTONOMY_SCALE_WHEN_ACTIVE, OVER_ATTACHMENT_BEHAVIOR_DEPTH_THRESHOLD, OVER_ATTACHMENT_DEP_SIGNAL_MIN_COUNT, OVER_ATTACHMENT_HIGH_BEHAVIOR_7D_MIN, OVER_ATTACHMENT_HIGH_BEHAVIOR_STREAK_MIN, OVER_ATTACHMENT_REL_DEPTH_THRESHOLD, OVER_ATTACHMENT_VALIDATION_SCALE_WHEN_ACTIVE, RELATIONSHIP_DEPTH_MAX, TTS_SPEED, TURN_END_GUARD_DYNAMIC_NOISE_ENABLED, TURN_END_GUARD_DYNAMIC_TAIL_BOOST_MAX_MS, TURN_END_GUARD_VAD_BASE_RMS } from "./limits.js";

function deriveAdaptiveBiasTargetsFromTags(tags, score) {
  const list = sanitizeAdaptiveQualityTags(tags, 8);
  const lowScore = clampUnit(0.65 - clampUnit(score, 0.66), 0) * 1.2;
  let questionBias = 0;
  let softnessBias = 0;
  let depthBias = 0;
  let initiativeBias = 0;
  let clarityBias = 0;

  if (list.includes("question_stack")) questionBias -= 0.10;
  if (list.includes("good_question")) questionBias += 0.04;
  if (list.includes("missed_intent")) clarityBias += 0.10;
  if (list.includes("too_long")) clarityBias += 0.08;
  if (list.includes("too_short")) depthBias += 0.08;
  if (list.includes("under_specific")) depthBias += 0.07;
  if (list.includes("incomplete_reply")) {
    depthBias += 0.06;
    clarityBias += 0.04;
  }
  if (list.includes("low_empathy")) softnessBias += 0.10;
  if (list.includes("strong_empathy")) softnessBias -= 0.02;
  if (list.includes("over_advice")) initiativeBias -= 0.08;
  if (list.includes("great_reflection")) depthBias -= 0.02;
  if (list.includes("strong_clarity")) clarityBias -= 0.03;
  if (list.includes("too_generic")) {
    depthBias += 0.06;
    clarityBias += 0.05;
  }

  if (lowScore > 0) {
    softnessBias += lowScore * 0.05;
    depthBias += lowScore * 0.04;
    clarityBias += lowScore * 0.05;
  }

  return {
    questionBias: Math.max(-ADAPTIVE_BIAS_LIMIT, Math.min(ADAPTIVE_BIAS_LIMIT, questionBias)),
    softnessBias: Math.max(-ADAPTIVE_BIAS_LIMIT, Math.min(ADAPTIVE_BIAS_LIMIT, softnessBias)),
    depthBias: Math.max(-ADAPTIVE_BIAS_LIMIT, Math.min(ADAPTIVE_BIAS_LIMIT, depthBias)),
    initiativeBias: Math.max(-ADAPTIVE_BIAS_LIMIT, Math.min(ADAPTIVE_BIAS_LIMIT, initiativeBias)),
    clarityBias: Math.max(-ADAPTIVE_BIAS_LIMIT, Math.min(ADAPTIVE_BIAS_LIMIT, clarityBias)),
  };
}

function deriveGrowthLevel(memory) {
  const turns = Math.max(0, Number(memory?.turns || 0));
  const progress = Math.max(
    0,
    Math.min(1, Number(memory?.growthProgress ?? computeGrowthTarget(memory)))
  );

  if (progress >= 0.84 && turns >= 40) return 5;
  if (progress >= 0.66 && turns >= 22) return 4;
  if (progress >= 0.46 && turns >= 10) return 3;
  if (progress >= 0.24 && turns >= 4) return 2;
  return 1;
}

function deriveOverAttachmentSafeguardState({
  relationshipDepthScore,
  behaviorDepthScore,
  dependencySignals14d,
  veryHighBehaviorStreak,
  veryHighBehaviorTurns7d,
  currentTurnDependencySignal = false,
}) {
  const relDepth = Math.max(0, Math.min(RELATIONSHIP_DEPTH_MAX, Number(relationshipDepthScore || 0)));
  const behaviorDepth = Math.max(0, Math.min(100, Number(behaviorDepthScore || 0)));
  const depSignals = Math.max(0, Number(dependencySignals14d || 0));
  const highStreak = Math.max(0, Number(veryHighBehaviorStreak || 0));
  const highTurns7d = Math.max(0, Number(veryHighBehaviorTurns7d || 0));
  const dependencyNow = Boolean(currentTurnDependencySignal);

  const relGate = relDepth > OVER_ATTACHMENT_REL_DEPTH_THRESHOLD;
  const dependencyGate =
    depSignals >= OVER_ATTACHMENT_DEP_SIGNAL_MIN_COUNT ||
    (dependencyNow && depSignals >= Math.max(1, OVER_ATTACHMENT_DEP_SIGNAL_MIN_COUNT - 1));
  const highBehaviorGate =
    highStreak >= OVER_ATTACHMENT_HIGH_BEHAVIOR_STREAK_MIN ||
    highTurns7d >= OVER_ATTACHMENT_HIGH_BEHAVIOR_7D_MIN ||
    (behaviorDepth >= OVER_ATTACHMENT_BEHAVIOR_DEPTH_THRESHOLD &&
      highTurns7d >= Math.max(1, OVER_ATTACHMENT_HIGH_BEHAVIOR_7D_MIN - 1));
  const active = relGate && dependencyGate && highBehaviorGate;
  const reason = active
    ? "rel_depth+dependency_signals+repeated_high_behavior"
    : !relGate
      ? "rel_depth_below_threshold"
      : !dependencyGate
        ? "dependency_signals_not_sustained"
        : "high_behavior_not_repeated";

  return {
    active,
    reason,
    relationshipDepthScore: relDepth,
    behaviorDepthScore: behaviorDepth,
    dependencySignals14d: depSignals,
    veryHighBehaviorStreak: highStreak,
    veryHighBehaviorTurns7d: highTurns7d,
    threshold: {
      relationshipDepth: OVER_ATTACHMENT_REL_DEPTH_THRESHOLD,
      dependencySignals14d: OVER_ATTACHMENT_DEP_SIGNAL_MIN_COUNT,
      veryHighBehaviorStreak: OVER_ATTACHMENT_HIGH_BEHAVIOR_STREAK_MIN,
      veryHighBehaviorTurns7d: OVER_ATTACHMENT_HIGH_BEHAVIOR_7D_MIN,
      behaviorDepth: OVER_ATTACHMENT_BEHAVIOR_DEPTH_THRESHOLD,
    },
    validationScale: active ? OVER_ATTACHMENT_VALIDATION_SCALE_WHEN_ACTIVE : 1,
    autonomyScale: active ? OVER_ATTACHMENT_AUTONOMY_SCALE_WHEN_ACTIVE : 1,
  };
}

function deriveHiddenDepthModeState({
  behaviorMode,
  behaviorDepthScore,
  relationshipDepthScore,
  timeActiveDays,
  conversationCount,
}) {
  const modeBehavior = String(behaviorMode || "surface");
  const bDepth = Math.max(0, Math.min(100, Number(behaviorDepthScore || 0)));
  const relDepth = Math.max(0, Math.min(RELATIONSHIP_DEPTH_MAX, Number(relationshipDepthScore || 0)));
  const days = Math.max(0, Number(timeActiveDays || 0));
  const conv = Math.max(0, Number(conversationCount || 0));
  const invitesSurface = modeBehavior === "surface";
  const invitesTranscendence = modeBehavior === "transcendence";

  const transSignalRatios = [
    relDepth / Math.max(1, HIDDEN_MODE_TRANSCENDENCE_REL_DEPTH),
    bDepth / Math.max(1, HIDDEN_MODE_TRANSCENDENCE_BEHAVIOR_DEPTH),
    days / Math.max(1, HIDDEN_MODE_TRANSCENDENCE_ACTIVE_DAYS),
    conv / Math.max(1, HIDDEN_MODE_TRANSCENDENCE_CONVERSATIONS),
  ].map((v) => clampUnit(v));
  const transcendenceUnlock = clampUnit(
    (transSignalRatios[0] * 0.34) +
    (transSignalRatios[1] * 0.28) +
    (transSignalRatios[2] * 0.18) +
    (transSignalRatios[3] * 0.20)
  );

  const transcended =
    !invitesSurface &&
    invitesTranscendence &&
    relDepth >= HIDDEN_MODE_TRANSCENDENCE_REL_DEPTH &&
    bDepth >= HIDDEN_MODE_TRANSCENDENCE_BEHAVIOR_DEPTH &&
    days >= HIDDEN_MODE_TRANSCENDENCE_ACTIVE_DAYS &&
    conv >= HIDDEN_MODE_TRANSCENDENCE_CONVERSATIONS;

  const profile = invitesSurface
    ? HIDDEN_DEPTH_MODES.surface
    : transcended
      ? HIDDEN_DEPTH_MODES.transcendence
      : HIDDEN_DEPTH_MODES.growth;

  const isSurface = profile.key === "surface";
  const isGrowth = profile.key === "growth";
  const isTranscendence = profile.key === "transcendence";

  return {
    profile,
    behaviorMode: modeBehavior,
    behaviorDepthScore: bDepth,
    relationshipDepthScore: relDepth,
    timeActiveDays: days,
    conversationCount: conv,
    transcendenceUnlock,
    policy: {
      allowCyclicalArc: !isSurface,
      allowEvolutionArc: !isSurface,
      allowSelfAwareness: !isSurface,
      allowMelancholySeeds: !isSurface,
      allowExistentialThemes: isTranscendence,
      allowReleaseCycles: isTranscendence,
      abstractionBand: isTranscendence ? "high" : isGrowth ? "medium" : "low",
      weeklyExpansionCap: isSurface ? 1 : isGrowth ? 3 : 4,
      forceMovementKey: isSurface ? "movement1" : "",
    },
  };
}

function deriveCycleEvolutionProfile(cycleIndex) {
  const idx = Math.max(0, Math.floor(Number(cycleIndex || 0)));
  const capped = Math.min(idx, Math.max(1, CYCLE_EVOLUTION_MAX_CYCLES));
  const maturity = clampUnit(capped / Math.max(1, CYCLE_EVOLUTION_MAX_CYCLES));
  const flirtMultiplier = Math.max(0.02, 1 - (capped * CYCLE_EVOLUTION_FLIRT_DECAY_PER_CYCLE));
  const validationMultiplier = Math.max(
    0.16,
    1 - (capped * CYCLE_EVOLUTION_VALIDATION_DECAY_PER_CYCLE)
  );
  const abstractionBoost = Math.max(
    0,
    Math.min(0.70, capped * CYCLE_EVOLUTION_ABSTRACTION_GAIN_PER_CYCLE)
  );
  const calmBoost = Math.max(
    0,
    Math.min(0.70, capped * CYCLE_EVOLUTION_CALM_GAIN_PER_CYCLE)
  );
  const philosophyBoost = Math.max(
    0,
    Math.min(0.70, capped * CYCLE_EVOLUTION_PHILOSOPHY_GAIN_PER_CYCLE)
  );
  return {
    cycleIndex: idx,
    cappedCycleIndex: capped,
    maturity,
    flirtMultiplier,
    validationMultiplier,
    abstractionBoost,
    calmBoost,
    philosophyBoost,
    nearZeroFlirt: flirtMultiplier <= 0.10,
  };
}

function deriveCycleIndexUiReflection({
  cycleEvolution,
  cycleIndex,
  baseTtsSpeed = TTS_SPEED,
}) {
  const c = cycleEvolution && typeof cycleEvolution === "object"
    ? cycleEvolution
    : deriveCycleEvolutionProfile(cycleIndex);
  const maturity = clampUnit(c.maturity, 0);
  const orbSaturation = Math.max(
    0.40,
    Math.min(1, 1 - (maturity * CYCLE_UI_SATURATION_REDUCTION_MAX))
  );
  const orbReactivity = Math.max(
    0.30,
    Math.min(1, 1 - (maturity * CYCLE_UI_REACTIVITY_REDUCTION_MAX))
  );
  const orbSmoothing = Math.max(
    0.10,
    Math.min(1, CYCLE_UI_SMOOTHING_BASE + (maturity * CYCLE_UI_SMOOTHING_GAIN_MAX))
  );
  const voicePaceMultiplier = Math.max(
    0.70,
    Math.min(1.20, 1 - (maturity * CYCLE_UI_VOICE_SLOWDOWN_MAX))
  );
  const voiceSpeed = Math.max(0.25, Math.min(4, Number(baseTtsSpeed || 1) * voicePaceMultiplier));

  return {
    cycleIndex: Math.max(0, Math.floor(Number(c.cycleIndex || cycleIndex || 0))),
    maturity,
    orbSaturation,
    orbReactivity,
    orbSmoothing,
    voicePaceMultiplier,
    voiceSpeed,
  };
}

function deriveDynamicTailBoostMs({ dynamicVadThreshold = 0 } = {}) {
  const threshold = Math.max(0, Number(dynamicVadThreshold || 0));
  if (!TURN_END_GUARD_DYNAMIC_NOISE_ENABLED) return 0;
  if (!(threshold > 0) || !(TURN_END_GUARD_VAD_BASE_RMS > 0)) return 0;
  const ratio = threshold / TURN_END_GUARD_VAD_BASE_RMS;
  if (!(ratio > 1)) return 0;
  const boost = Math.round((ratio - 1) * 260);
  return Math.max(0, Math.min(TURN_END_GUARD_DYNAMIC_TAIL_BOOST_MAX_MS, boost));
}

export {
  deriveAdaptiveBiasTargetsFromTags,
  deriveCycleEvolutionProfile,
  deriveCycleIndexUiReflection,
  deriveDynamicTailBoostMs,
  deriveGrowthLevel,
  deriveHiddenDepthModeState,
  deriveOverAttachmentSafeguardState,
};
