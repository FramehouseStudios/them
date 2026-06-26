function trimToString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeSnippet(value, maxChars = 220) {
  const clean = trimToString(value).replace(/\s+/g, " ");
  if (!clean) return "";
  return clean.slice(0, Math.max(1, Number(maxChars || 220))).trim();
}

function normalizeList(value, maxItems = 5, maxChars = 180) {
  const source = Array.isArray(value)
    ? value
    : trimToString(value)
      ? String(value).split(/\r?\n|;/)
      : [];
  const out = [];
  const seen = new Set();
  for (const item of source) {
    const clean = normalizeSnippet(item, maxChars);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= maxItems) break;
  }
  return out;
}

function titleCaseWords(value, fallback = "") {
  const clean = normalizeSnippet(value, 80)
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9' ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return fallback;
  return clean
    .split(" ")
    .filter(Boolean)
    .slice(0, 4)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function characterCue(value, fallback) {
  const clean = titleCaseWords(value, fallback);
  return clean ? clean.toUpperCase() : fallback;
}

function characterName(value, fallback) {
  return titleCaseWords(value, fallback);
}

function articlePhrase(value, fallback = "the proof") {
  const clean = normalizeSnippet(value, 140) || fallback;
  if (/^(?:a|an|the|this|that|their|his|her|its|our)\b/i.test(clean)) return clean;
  return `the ${clean}`;
}

function sceneHeadingFromLabel(sceneLabel = "") {
  const clean = normalizeSnippet(sceneLabel, 120);
  if (/^(INT|EXT|EST|INT\/EXT|I\/E)\.?(?:\s|$)/i.test(clean)) {
    return clean.toUpperCase();
  }
  const location = clean
    ? clean.replace(/[^a-z0-9' ]+/gi, " ").replace(/\s+/g, " ").trim().toUpperCase()
    : "PRESSURE POINT";
  return `INT. ${location || "PRESSURE POINT"} - NIGHT`;
}

function firstMetaValue(studioMeta, names, maxChars = 220) {
  for (const name of names) {
    const value = normalizeSnippet(studioMeta?.[name], maxChars);
    if (value) return value;
  }
  return "";
}

function listMetaValue(studioMeta, names, maxItems = 5, maxChars = 180) {
  for (const name of names) {
    const items = normalizeList(studioMeta?.[name], maxItems, maxChars);
    if (items.length) return items;
  }
  return [];
}

function buildMomentumRescueFallbackReply({
  transcript = "",
  studioMeta = null,
} = {}) {
  const meta = studioMeta && typeof studioMeta === "object" ? studioMeta : {};
  const act = firstMetaValue(meta, ["screenplayAct", "screenplay_act"], 120);
  const featureSequence = firstMetaValue(meta, ["screenplayFeatureSequence", "screenplay_feature_sequence"], 160);
  const featureObligation = firstMetaValue(meta, ["screenplayFeatureObligation", "screenplay_feature_obligation"], 240);
  const sceneObjective = firstMetaValue(meta, ["screenplaySceneObjective", "screenplay_scene_objective"], 240);
  const currentBeat = firstMetaValue(meta, ["screenplayCurrentBeat", "screenplay_current_beat"], 240);
  const actPressure = firstMetaValue(meta, ["screenplayActPressureState", "screenplay_act_pressure_state"], 240);
  const characterArc = firstMetaValue(meta, ["screenplayCharacterArcState", "screenplay_character_arc_state"], 240);
  const lastOutcome = firstMetaValue(meta, ["screenplayLastSceneOutcome", "screenplay_last_scene_outcome"], 240);
  const nextScenePlan = firstMetaValue(meta, ["screenplayNextScenePlan", "screenplay_next_scene_plan"], 260);
  const sceneLabel = firstMetaValue(meta, ["screenplayAnchorSceneLabel", "screenplay_anchor_scene_label"], 120);
  const nextTurns = listMetaValue(meta, ["screenplayNextThreeTurns", "screenplay_next_three_turns"], 3, 180);
  const setups = listMetaValue(meta, ["screenplayUnresolvedSetups", "screenplay_unresolved_setups"], 4, 160);
  const threads = listMetaValue(meta, ["screenplayUnresolvedStoryThreads", "screenplay_unresolved_story_threads"], 4, 180);
  const motifs = listMetaValue(meta, ["screenplayImageMotifs", "screenplay_image_motifs"], 4, 140);
  const characters = listMetaValue(meta, ["screenplayCharacterFocus", "screenplay_character_focus"], 4, 80);
  const protagonist = characterName(characters[0], "Protagonist");
  const opponent = characterName(characters[1], "Opposition");
  const protagonistCue = characterCue(characters[0], "PROTAGONIST");
  const opponentCue = characterCue(characters[1], "OPPOSITION");
  const objectPressure = articlePhrase(setups[0] || motifs[0], "the proof");
  const imagePressure = articlePhrase(motifs[0] || setups[0], "the room going still");
  const strongestTurn = nextTurns[0] || nextScenePlan || sceneObjective ||
    "force the protagonist to choose between the thing they want and the truth they are avoiding";
  const cost = characterArc || actPressure || featureObligation || threads[0] ||
    "the choice changes the relationship and makes the next scene unavoidable";
  const problemSource = currentBeat || lastOutcome || sceneObjective || normalizeSnippet(transcript, 180) ||
    "the scene has feeling, but not enough visible consequence yet";
  const position = [act, featureSequence].filter(Boolean).join(" / ");
  const heading = sceneHeadingFromLabel(sceneLabel);
  const contextLine = position
    ? `At ${position}, the blockage is consequence, not imagination.`
    : "The blockage is consequence, not imagination.";
  const pressureLine = [
    contextLine,
    `The story already has pressure in this: ${problemSource}.`,
    actPressure ? `Use that pressure instead of opening a new lane: ${actPressure}.` : "",
  ].filter(Boolean).join(" ");
  const turnLine = `Strongest next move: ${strongestTurn}. Make it cost this: ${cost}.`;
  const forkLine = threads[0]
    ? `If you need one alternate fork, pay off the open thread: ${threads[0]}.`
    : `If you need one alternate fork, make ${objectPressure} expose a secret instead of solving the problem.`;

  return [
    pressureLine,
    turnLine,
    forkLine,
    "",
    heading,
    "",
    `${protagonist} puts ${objectPressure} where ${opponent} can see it.`,
    "",
    opponentCue,
    "You know what happens if they hear this.",
    "",
    protagonistCue,
    "Then they hear it from me.",
    "",
    `The image of ${imagePressure} catches the light as the choice lands.`,
  ].join("\n");
}

export {
  buildMomentumRescueFallbackReply,
};
