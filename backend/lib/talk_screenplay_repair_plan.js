function normalizeRepairSnippet(value = "", maxChars = 220) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(maxChars || 220)));
}

function normalizeRepairList(items, maxItems = 5, maxChars = 200) {
  const source = Array.isArray(items)
    ? items
    : normalizeRepairSnippet(items)
      ? String(items).split(/\r?\n|;/)
      : [];
  const out = [];
  const seen = new Set();
  for (const item of source) {
    const clean = normalizeRepairSnippet(item, maxChars);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= maxItems) break;
  }
  return out;
}

function firstRepairValue(values = [], maxChars = 220) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const [first = ""] = normalizeRepairList(value, 1, maxChars);
      if (first) return first;
      continue;
    }
    const clean = normalizeRepairSnippet(value, maxChars);
    if (clean) return clean;
  }
  return "";
}

function buildTalkScreenplayExecutionBriefLines(studioMeta = null) {
  if (!studioMeta || typeof studioMeta !== "object") return [];
  const nextSceneMoves = normalizeRepairList(
    studioMeta.screenplayNextSceneMoves ?? studioMeta.screenplay_next_scene_moves,
    5,
    180
  );
  const nextThreeTurns = normalizeRepairList(
    studioMeta.screenplayNextThreeTurns ?? studioMeta.screenplay_next_three_turns,
    3,
    180
  );
  const unresolvedStoryThreads = normalizeRepairList(
    studioMeta.screenplayUnresolvedStoryThreads ?? studioMeta.screenplay_unresolved_story_threads,
    4,
    220
  );
  const unresolvedSetups = normalizeRepairList(
    studioMeta.screenplayUnresolvedSetups ?? studioMeta.screenplay_unresolved_setups,
    4,
    200
  );
  const actThreePayoffPath = normalizeRepairList(
    studioMeta.screenplayActThreePayoffPath ?? studioMeta.screenplay_act_three_payoff_path,
    4,
    200
  );
  const characterArcTurns = normalizeRepairList(
    studioMeta.screenplayCharacterArcTurns ?? studioMeta.screenplay_character_arc_turns,
    4,
    180
  );
  const imageMotifs = normalizeRepairList(
    studioMeta.screenplayImageMotifs ?? studioMeta.screenplay_image_motifs,
    4,
    140
  );

  const lanes = [
    ["SCENE_ASSIGNMENT", firstRepairValue([
      studioMeta.screenplaySceneAssignment,
      studioMeta.screenplay_scene_assignment,
      studioMeta.screenplayNextSceneAssignment,
      studioMeta.screenplay_next_scene_assignment,
      nextSceneMoves[0],
      nextThreeTurns[0],
      studioMeta.screenplayNextScenePlan,
      studioMeta.screenplay_next_scene_plan,
      studioMeta.screenplaySceneObjective,
      studioMeta.screenplay_scene_objective,
      studioMeta.screenplayCurrentBeat,
      studioMeta.screenplay_current_beat,
    ], 240)],
    ["OBSTACLE_TO_PRESSURIZE", firstRepairValue([
      studioMeta.screenplayObstacleToPressurize,
      studioMeta.screenplay_obstacle_to_pressurize,
      unresolvedStoryThreads[0],
      unresolvedSetups[0],
      studioMeta.screenplayFeatureObligation,
      studioMeta.screenplay_feature_obligation,
    ], 220)],
    ["CHANGED_BEHAVIOR_DUE", firstRepairValue([
      studioMeta.screenplayChangedBehaviorDue,
      studioMeta.screenplay_changed_behavior_due,
      characterArcTurns[0],
      studioMeta.screenplayCharacterArcState,
      studioMeta.screenplay_character_arc_state,
    ], 220)],
    ["PAYOFF_OR_SETUP_TO_SPEND", firstRepairValue([
      studioMeta.screenplayPayoffOrSetupToSpend,
      studioMeta.screenplay_payoff_or_setup_to_spend,
      actThreePayoffPath[0],
      unresolvedSetups[0],
    ], 220)],
    ["IMAGE_TO_STAGE", firstRepairValue([
      studioMeta.screenplayImageToStage,
      studioMeta.screenplay_image_to_stage,
      imageMotifs[0],
      studioMeta.screenplayEndingImage,
      studioMeta.screenplay_ending_image,
    ], 180)],
    ["EXIT_HANDOFF", firstRepairValue([
      studioMeta.screenplayExitHandoff,
      studioMeta.screenplay_exit_handoff,
      nextSceneMoves[1],
      nextThreeTurns[1],
    ], 220)],
  ];

  return lanes
    .map(([label, value]) => value ? `${label}: ${value}` : "")
    .filter(Boolean);
}

function isNextSceneExecutionBriefRepairReason(reason = "") {
  const normalized = normalizeRepairSnippet(reason, 120).toLowerCase();
  return normalized === "missing_next_scene_assignment" ||
    normalized === "missing_next_scene_execution_brief";
}

export {
  buildTalkScreenplayExecutionBriefLines,
  isNextSceneExecutionBriefRepairReason,
};
