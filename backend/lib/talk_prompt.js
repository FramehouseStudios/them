// D009 B3 — talk prompt stage (strangler extract from talk_handler).
//
// Owns the ordered director/persona addendum fold + latency trim.
// Generation budget and chat message assembly stay in the orchestrator
// (too thin to extract without a cosmetic wrapper).

/**
 * Fold director/persona addenda onto the base system prompt, then trim for
 * turn-latency budgets. Order matches the prior inline chain exactly.
 */
function composeTalkSystemPrompt({
  systemBase = "",
  appendDirectorAddendum,
  fitSystemPromptForTurnLatency,
  addenda = {},
  turnPlanner = null,
  flags = null,
  routingLane = "",
  chatModelPlan = null,
  richMaxChars = undefined,
} = {}) {
  if (typeof appendDirectorAddendum !== "function") {
    throw new Error("composeTalkSystemPrompt requires appendDirectorAddendum");
  }
  if (typeof fitSystemPromptForTurnLatency !== "function") {
    throw new Error("composeTalkSystemPrompt requires fitSystemPromptForTurnLatency");
  }

  const {
    assistantSelfNameAddendum = "",
    humanStyleAddendum = "",
    therapeuticDepthAddendum = "",
    socialSparkAddendum = "",
    socialSparkMemoryHookAddendum = "",
    knowledgeAddendum = "",
    hiddenDepthModeAddendum = "",
    seasonalWaveAddendum = "",
    cycleEvolutionAddendum = "",
    cycleConsciousMemoryAddendum = "",
    backReferenceAddendum = "",
    characterTextureAddendum = "",
    trajectoryAddendum = "",
    timeOfDayToneAddendum = "",
    weeklyArcAddendum = "",
    weeklyExpansionAddendum = "",
    movementAddendum = "",
    selfAwarenessAddendum = "",
    melancholySeedAddendum = "",
    directorAddendum = "",
  } = addenda;

  const systemWithIdentity = appendDirectorAddendum(systemBase, assistantSelfNameAddendum);
  const systemWithStyle = appendDirectorAddendum(systemWithIdentity, humanStyleAddendum);
  const systemWithTherapeuticDepth = appendDirectorAddendum(systemWithStyle, therapeuticDepthAddendum);
  const systemWithSocialSpark = appendDirectorAddendum(systemWithTherapeuticDepth, socialSparkAddendum);
  const systemWithSocialSparkMemory = appendDirectorAddendum(
    systemWithSocialSpark,
    socialSparkMemoryHookAddendum
  );
  const systemWithKnowledge = appendDirectorAddendum(systemWithSocialSparkMemory, knowledgeAddendum);
  const systemWithHiddenMode = appendDirectorAddendum(systemWithKnowledge, hiddenDepthModeAddendum);
  const systemWithSeasonalWave = appendDirectorAddendum(systemWithHiddenMode, seasonalWaveAddendum);
  const systemWithCycleEvolution = appendDirectorAddendum(systemWithSeasonalWave, cycleEvolutionAddendum);
  const systemWithCycleMemory = appendDirectorAddendum(
    systemWithCycleEvolution,
    cycleConsciousMemoryAddendum
  );
  const systemWithBackReference = appendDirectorAddendum(
    systemWithCycleMemory,
    backReferenceAddendum
  );
  const systemWithTexture = appendDirectorAddendum(systemWithBackReference, characterTextureAddendum);
  const systemWithTrajectory = appendDirectorAddendum(systemWithTexture, trajectoryAddendum);
  const systemWithTimeTone = appendDirectorAddendum(systemWithTrajectory, timeOfDayToneAddendum);
  const systemWithArc = appendDirectorAddendum(systemWithTimeTone, weeklyArcAddendum);
  const systemWithExpansion = appendDirectorAddendum(systemWithArc, weeklyExpansionAddendum);
  const systemWithMovement = appendDirectorAddendum(systemWithExpansion, movementAddendum);
  const systemWithSelfAwareness = appendDirectorAddendum(systemWithMovement, selfAwarenessAddendum);
  const systemWithMelancholy = appendDirectorAddendum(systemWithSelfAwareness, melancholySeedAddendum);
  const rawSystem = appendDirectorAddendum(systemWithMelancholy, directorAddendum);
  const system = fitSystemPromptForTurnLatency(rawSystem, {
    turnPlanner,
    flags,
    routingLane,
    chatModelPlan,
    ...(Number.isFinite(richMaxChars) && richMaxChars > 0 ? { richMaxChars } : {}),
  });
  return { rawSystem, system };
}

export { composeTalkSystemPrompt };
