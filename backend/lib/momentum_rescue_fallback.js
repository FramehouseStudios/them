import { selectStoryMoveLibraryLinesForContext } from "./story_rescue_move_library.js";

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

function actRescueLine(act = "") {
  const lower = normalizeSnippet(act, 80).toLowerCase();
  if (/\bact\s*(?:iii|3|three)\b|\bthird act\b|\bfinal\b|\bclimax\b/.test(lower)) {
    return "Act III rescue lens: spend one planted setup through changed behavior, then aim the image toward the ending.";
  }
  if (/\bact\s*(?:ii|2|two)\b|\bsecond act\b|\bmiddle\b|\bmidpoint\b/.test(lower)) {
    return "Act II rescue lens: make the old tactic fail, turn the apparent win into a cost, and force a new strategy.";
  }
  if (/\bact\s*(?:i|1|one)\b|\bfirst act\b|\bbeginning\b|\bopening\b/.test(lower)) {
    return "Act I rescue lens: clarify the want, make the catalyst unavoidable, and burn a safe exit.";
  }
  return "Story rescue lens: want meets obstacle, tactic changes under pressure, and the exit image makes the next scene inevitable.";
}

function diagnoseFallbackStoryProblem({
  transcript = "",
  act = "",
  featureSequence = "",
  currentBeat = "",
  nextTurns = [],
  setups = [],
  threads = [],
  characterArc = "",
  actPressure = "",
} = {}) {
  const lower = [
    transcript,
    act,
    featureSequence,
    currentBeat,
    nextTurns.join(" "),
    setups.join(" "),
    threads.join(" "),
    characterArc,
    actPressure,
  ].join(" ").toLowerCase();
  if (/\bact\s*(?:iii|3|three)|third act|finale|climax|ending|payoff|setup\b/.test(lower)) {
    return "Story diagnosis: the payoff path is asking for one planted promise to come due as behavior, not explanation.";
  }
  if (/\bact\s*(?:ii|2|two)|second act|middle|midpoint|drag|slow|static|repeating|stuck\b/.test(lower)) {
    return "Story diagnosis: the middle needs a reversal that makes the old tactic expensive.";
  }
  if (/\bsecret|lie|truth|reveal|expose|withheld|proof|affidavit|tape|reel|receipt\b/.test(lower)) {
    return "Story diagnosis: the cleanest engine is secret exposure under public pressure.";
  }
  if (/\bdialogue|conversation|argument|line|subtext|exposition|backstory\b/.test(lower)) {
    return "Story diagnosis: the exchange needs a tactic and a cost underneath the words.";
  }
  return "Story diagnosis: the scene has feeling, but it needs a visible want, opposition, cost, and exit image.";
}

function buildFallbackMomentumMoveMenu({
  strongestTurn = "",
  problemSource = "",
  cost = "",
  objectPressure = "",
  imagePressure = "",
  actPressure = "",
  characterArc = "",
  featureObligation = "",
  protagonist = "the protagonist",
  protagonistWant = "",
  protagonistNeed = "",
  correctionSummary = "",
  threads = [],
  setups = [],
  motifs = [],
} = {}) {
  const source = normalizeSnippet(problemSource, 180) || "the current beat";
  const turn = normalizeSnippet(strongestTurn, 200) || "force a visible choice";
  const consequence = normalizeSnippet(cost, 200) || "a real relationship cost";
  const object = normalizeSnippet(objectPressure, 140) || "the proof";
  const image = normalizeSnippet(imagePressure, 140) || "a changed image";
  const thread = normalizeSnippet(threads[0], 160);
  const setup = normalizeSnippet(setups[0], 140);
  const motif = normalizeSnippet(motifs[0], 120);
  const arc = normalizeSnippet(characterArc || actPressure || featureObligation, 200);
  const want = normalizeSnippet(protagonistWant, 160);
  const need = normalizeSnippet(protagonistNeed, 160);
  const correction = normalizeSnippet(correctionSummary, 180);
  const options = [
    `Option A - pressure engine: ${turn}. Put it in conflict with ${source}, make ${consequence} land, and exit on ${image}.`,
  ];
  if (thread || setup || object) {
    options.push(`Option B - exposure engine: make ${thread || setup || object} public before the protagonist is ready, so the win becomes a trap.`);
  }
  if (want || need) {
    options.push(`Option C - character engine: force ${protagonist}'s want (${want || turn}) to collide with their need (${need || arc || "the truth they are avoiding"}).`);
  } else if (arc) {
    options.push(`Option C - character engine: make ${arc} impossible to avoid; the next plot move should reveal old tactic versus needed change.`);
  } else if (motif) {
    options.push(`Option C - image engine: let ${motif} change meaning through action, not explanation.`);
  } else {
    options.push("Option C - choice engine: close one safe door so the next scene becomes inevitable.");
  }
  if (correction) {
    options.push(`Correction guard: ${correction}. Treat this as canon before older memory.`);
  }
  options.push("Pick the one that changes story state fastest; do not add a brand-new lane unless these engines are truly unavailable.");
  return options;
}

function readableStoryMoveLine(line = "") {
  const clean = normalizeSnippet(line, 260);
  if (!clean) return "";
  const match = clean.match(/^([a-z_]+):\s*(.+)$/i);
  if (!match) return clean;
  const label = match[1].replace(/_/g, " ");
  return `${label} - ${match[2]}`;
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
  const protagonistWant = firstMetaValue(meta, ["screenplayProtagonistWant", "screenplay_protagonist_want"], 200);
  const protagonistNeed = firstMetaValue(meta, ["screenplayProtagonistNeed", "screenplay_protagonist_need"], 200);
  const actPressure = firstMetaValue(meta, ["screenplayActPressureState", "screenplay_act_pressure_state"], 240);
  const characterArc = firstMetaValue(meta, ["screenplayCharacterArcState", "screenplay_character_arc_state"], 240);
  const lastOutcome = firstMetaValue(meta, ["screenplayLastSceneOutcome", "screenplay_last_scene_outcome"], 240);
  const nextScenePlan = firstMetaValue(meta, ["screenplayNextScenePlan", "screenplay_next_scene_plan"], 260);
  const sceneLabel = firstMetaValue(meta, ["screenplayAnchorSceneLabel", "screenplay_anchor_scene_label"], 120);
  const nextTurns = listMetaValue(meta, ["screenplayNextThreeTurns", "screenplay_next_three_turns"], 3, 180);
  const nextMoves = listMetaValue(meta, ["screenplayNextSceneMoves", "screenplay_next_scene_moves"], 5, 180);
  const setups = listMetaValue(meta, ["screenplayUnresolvedSetups", "screenplay_unresolved_setups"], 4, 160);
  const threads = listMetaValue(meta, ["screenplayUnresolvedStoryThreads", "screenplay_unresolved_story_threads"], 4, 180);
  const characterArcTurns = listMetaValue(meta, ["screenplayCharacterArcTurns", "screenplay_character_arc_turns"], 4, 180);
  const actThreePayoffPath = listMetaValue(meta, ["screenplayActThreePayoffPath", "screenplay_act_three_payoff_path"], 4, 180);
  const motifs = listMetaValue(meta, ["screenplayImageMotifs", "screenplay_image_motifs"], 4, 140);
  const characters = listMetaValue(meta, ["screenplayCharacterFocus", "screenplay_character_focus"], 4, 80);
  const correctedTerms = listMetaValue(meta, ["screenplayCorrectedTerms", "screenplay_corrected_terms", "correctedTerms", "corrected_terms"], 4, 120);
  const correctionReplacements = listMetaValue(meta, ["screenplayCorrectionReplacements", "screenplay_correction_replacements", "correctionReplacements", "correction_replacements"], 4, 160);
  const correctionSummary = correctionReplacements.length || correctedTerms.length
    ? [
      correctionReplacements.length ? `replace ${correctionReplacements.join(" / ")}` : "",
      correctedTerms.length ? `retire ${correctedTerms.join(" / ")}` : "",
    ].filter(Boolean).join("; ")
    : "";
  const protagonist = characterName(characters[0], "Protagonist");
  const opponent = characterName(characters[1], "Opposition");
  const protagonistCue = characterCue(characters[0], "PROTAGONIST");
  const opponentCue = characterCue(characters[1], "OPPOSITION");
  const objectPressure = articlePhrase(setups[0] || motifs[0], "the proof");
  const imagePressure = articlePhrase(motifs[0] || actThreePayoffPath[0] || setups[0], "the room going still");
  const strongestTurn = nextTurns[0] || nextMoves[0] || nextScenePlan || sceneObjective ||
    "force the protagonist to choose between the thing they want and the truth they are avoiding";
  const cost = characterArcTurns[0] || characterArc || protagonistNeed || actPressure || featureObligation || threads[0] ||
    "the choice changes the relationship and makes the next scene unavoidable";
  const problemSource = currentBeat || lastOutcome || sceneObjective || normalizeSnippet(transcript, 180) ||
    "the scene has feeling, but not enough visible consequence yet";
  const oppositionPressure = threads[0] || setups[0] || actPressure || "a force that can say no";
  const bestNextBeat = `Best next beat: have ${protagonist} pursue ${protagonistWant || strongestTurn}; collide with ${oppositionPressure}; make the cost ${cost}; exit on ${imagePressure}.`;
  const position = [act, featureSequence].filter(Boolean).join(" / ");
  const heading = sceneHeadingFromLabel(sceneLabel);
  const contextLine = position
    ? `At ${position}, the blockage is consequence, not imagination.`
    : "The blockage is consequence, not imagination.";
  const diagnosisLine = diagnoseFallbackStoryProblem({
    transcript,
    act,
    featureSequence,
    currentBeat,
    nextTurns,
    setups,
    threads,
    characterArc,
    actPressure,
  });
  const storyMoveLines = selectStoryMoveLibraryLinesForContext({
    transcript,
    act,
    featureSequence,
    featureObligation,
    currentBeat,
    actPressureState: actPressure,
    characterArcState: characterArc,
    problem: diagnosisLine,
    nextThreeTurns: nextTurns,
    nextSceneMoves: nextMoves,
    unresolvedSetups: setups,
    unresolvedStoryThreads: threads,
    actThreePayoffPath,
    imageMotifs: motifs,
  });
  const storyMoveLine = storyMoveLines.length
    ? `Story move library: ${storyMoveLines.slice(0, 4).map(readableStoryMoveLine).filter(Boolean).join("; ")}`
    : "";
  const actLine = actRescueLine(act || featureSequence);
  const beatEngineLine = `Beat engine: because ${problemSource}, force ${strongestTurn}; make ${cost} impose the cost; leave on ${imagePressure}.`;
  const moveMenu = buildFallbackMomentumMoveMenu({
    strongestTurn,
    problemSource,
    cost,
    objectPressure,
    imagePressure,
    actPressure,
    characterArc,
    featureObligation,
    protagonist,
    protagonistWant,
    protagonistNeed,
    correctionSummary,
    threads,
    setups,
    motifs,
  });
  const pressureLine = [
    contextLine,
    diagnosisLine,
    storyMoveLine,
    actLine,
    `The story already has pressure in this: ${problemSource}.`,
    actPressure ? `Use that pressure instead of opening a new lane: ${actPressure}.` : "",
    correctionSummary ? `Memory priority: ${correctionSummary}. Apply that before older story memory.` : "",
  ].filter(Boolean).join(" ");
  const characterLine = protagonistWant || protagonistNeed || characterArcTurns[0]
    ? `Character engine: ${protagonist}${protagonistWant ? `'s want: ${protagonistWant}` : ""}${protagonistNeed ? `; need: ${protagonistNeed}` : ""}${characterArcTurns[0] ? `. Arc pressure: ${characterArcTurns[0]}` : "."}`
    : "";
  const turnLine = `Strongest next move: ${strongestTurn}. Make it cost this: ${cost}.`;
  const forkLine = threads[0]
    ? `If you need one alternate fork, pay off the open thread: ${threads[0]}.`
    : actThreePayoffPath[0]
      ? `If you need one alternate fork, spend the payoff seed: ${actThreePayoffPath[0]}.`
    : `If you need one alternate fork, make ${objectPressure} expose a secret instead of solving the problem.`;

  return [
    pressureLine,
    characterLine,
    bestNextBeat,
    beatEngineLine,
    turnLine,
    "Three clean ways forward:",
    ...moveMenu,
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
