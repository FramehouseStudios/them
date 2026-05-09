export function createTalkPromptContextServices(deps = {}) {
  const {
    appendDirectorAddendum,
    fitSystemPromptForTurnLatency,
  } = deps;

  function buildTalkPromptSystem({
    systemBase = "",
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
    characterVoiceAddendum = "",
    trajectoryAddendum = "",
    timeOfDayToneAddendum = "",
    weeklyArcAddendum = "",
    weeklyExpansionAddendum = "",
    movementAddendum = "",
    selfAwarenessAddendum = "",
    melancholySeedAddendum = "",
    directorAddendum = "",
    turnPlanner = null,
    flags = null,
    routingLane = "normal_rotation",
    chatModelPlan = null,
  } = {}) {
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
    const systemWithCharacterVoice = appendDirectorAddendum(systemWithTexture, characterVoiceAddendum);
    const systemWithTrajectory = appendDirectorAddendum(systemWithCharacterVoice, trajectoryAddendum);
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
    });

    return { rawSystem, system };
  }

  return {
    buildTalkPromptSystem,
  };
}
