function trimToString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeSnippet(value, maxChars = 220) {
  const clean = trimToString(value).replace(/\s+/g, " ");
  if (!clean) return "";
  return clean.slice(0, Math.max(1, Number(maxChars || 220))).trim();
}

function normalizeList(value, maxItems = 6, maxChars = 180) {
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

function inferStoryMoveActKind(value = "") {
  const lower = trimToString(value).toLowerCase();
  if (!lower) return "";
  if (/\bact\s*(?:iii|3|three)\b|\bthird act\b|\bfinal act\b|\bfinale\b|\bclimax\b|\bending\b/.test(lower)) {
    return "act3";
  }
  if (/\bact\s*(?:ii|2|two)\b|\bsecond act\b|\bmiddle\b|\bmidpoint\b|\ball[- ]is[- ]lost\b|\bfun and games\b/.test(lower)) {
    return "act2";
  }
  if (/\bact\s*(?:i|1|one)\b|\bfirst act\b|\bbeginning\b|\bopening\b|\bcatalyst\b|\bbreak into two\b/.test(lower)) {
    return "act1";
  }
  return "";
}

const STORY_STALL_MOVE_LIBRARY = Object.freeze([
  Object.freeze({
    key: "objective_pressure",
    problems: ["passive protagonist / unclear want", "next dramatic engine unclear"],
    triggers: [/\b(?:passive|inactive|aimless|no goal|no want|unclear want|unclear objective|stuck|blocked|writer'?s block|writers block|out of ideas)\b/],
    line: "objective_pressure: if the scene feels inactive, give the protagonist a concrete objective that can succeed or fail before the scene exits.",
  }),
  Object.freeze({
    key: "obstacle_pressure",
    problems: ["weak obstacle / low opposition", "pressure drop / missing consequence"],
    triggers: [/\b(?:no conflict|weak conflict|too easy|low stakes|no stakes|nothing stopping|no obstacle|raise the stakes|more pressure)\b/],
    line: "obstacle_pressure: put the want against a person, rule, deadline, secret, or public consequence that can say no right now.",
  }),
  Object.freeze({
    key: "reversal_pressure",
    problems: ["repeated tactic / static middle", "pressure drop / missing consequence"],
    triggers: [/\b(?:repeating|same beat|same tactic|static|middle sag|second act slump|act\s*(?:ii|2|two)|second act|slow|drag|boring|flat)\b/],
    line: "reversal_pressure: make the current tactic appear to work, then flip the win into a cost, obligation, exposed secret, or changed leverage.",
  }),
  Object.freeze({
    key: "information_pressure",
    problems: ["exposition instead of dramatization", "missing turn / no exit image"],
    triggers: [/\b(?:exposition|backstory|info dump|infodump|secret|truth|reveal|discover|proof|tape|reel|affidavit)\b/],
    line: "information_pressure: if the page has facts instead of drama, make one fact arrive late, publicly, or in the wrong hands.",
  }),
  Object.freeze({
    key: "relationship_pressure",
    problems: ["repeated tactic / static middle", "weak obstacle / low opposition"],
    triggers: [/\b(?:relationship|love|friend|family|father|mother|sister|brother|partner|betray|trust|forgive|bond)\b/],
    line: "relationship_pressure: make the plot solution damage, redefine, or test a bond so story movement carries emotional cost.",
  }),
  Object.freeze({
    key: "deadline_pressure",
    problems: ["pressure drop / missing consequence", "next dramatic engine unclear"],
    triggers: [/\b(?:deadline|clock|time|urgent|now or never|too much time|can wait|delay)\b/],
    line: "deadline_pressure: if the scene can wait, add a now-or-never clock that forces action before the character is ready.",
  }),
  Object.freeze({
    key: "choice_pressure",
    problems: ["missing turn / no exit image", "next dramatic engine unclear"],
    triggers: [/\b(?:choice|decision|choose|dilemma|impossible|moral|sacrifice|door|what happens next|next beat|next scene|where do i go)\b/],
    line: "choice_pressure: if possibilities feel endless, close one door with an irreversible decision that makes the next scene inevitable.",
  }),
  Object.freeze({
    key: "payoff_pressure",
    problems: ["payoff path unclear", "missing turn / no exit image"],
    triggers: [/\b(?:payoff|setup|plant|promise|ending|act\s*(?:iii|3|three)|third act|final act|finale|climax|resolution)\b/],
    line: "payoff_pressure: if the ending feels vague, spend or echo a planted object, image, promise, or wound under higher pressure.",
  }),
  Object.freeze({
    key: "image_pressure",
    problems: ["payoff path unclear", "exposition instead of dramatization"],
    triggers: [/\b(?:image|motif|visual|symbol|object|room|light|rain|mirror|frame|final image|abstract|vague)\b/],
    line: "image_pressure: if the page feels abstract, transform a concrete image or object through action so the idea becomes filmable.",
  }),
]);

function selectStoryMoveLibraryLines(lower = "", { intent = "", actKind = "", act = "", problem = "" } = {}) {
  const normalizedProblem = trimToString(problem).toLowerCase();
  const resolvedActKind = trimToString(actKind) || inferStoryMoveActKind(act);
  const haystack = [
    trimToString(lower).toLowerCase(),
    trimToString(intent).toLowerCase(),
    trimToString(resolvedActKind).toLowerCase(),
    trimToString(act).toLowerCase(),
    normalizedProblem,
  ].filter(Boolean).join(" ");
  const selected = [];
  const add = (move) => {
    if (!move || selected.some((item) => item.key === move.key)) return;
    selected.push(move);
  };
  const addByKey = (key) => add(STORY_STALL_MOVE_LIBRARY.find((move) => move.key === key));

  for (const move of STORY_STALL_MOVE_LIBRARY) {
    if (move.problems.some((entry) => normalizedProblem.includes(entry))) add(move);
  }

  for (const move of STORY_STALL_MOVE_LIBRARY) {
    if (move.triggers.some((pattern) => pattern.test(haystack))) add(move);
  }

  if (resolvedActKind === "act1") {
    addByKey("objective_pressure");
    addByKey("deadline_pressure");
    addByKey("choice_pressure");
  } else if (resolvedActKind === "act2") {
    addByKey("reversal_pressure");
    addByKey("relationship_pressure");
    addByKey("obstacle_pressure");
  } else if (resolvedActKind === "act3") {
    addByKey("payoff_pressure");
    addByKey("image_pressure");
    addByKey("choice_pressure");
  }

  if (intent === "momentum_rescue") {
    addByKey("objective_pressure");
    addByKey("image_pressure");
    if (selected.length < 5) {
      addByKey("reversal_pressure");
      addByKey("choice_pressure");
    }
  }

  return selected.slice(0, 6).map((move) => move.line);
}

function selectStoryMoveLibraryLinesForContext({
  transcript = "",
  intent = "momentum_rescue",
  act = "",
  featureSequence = "",
  featureObligation = "",
  currentBeat = "",
  actPressureState = "",
  characterArcState = "",
  problem = "",
  nextThreeTurns = [],
  nextSceneMoves = [],
  unresolvedSetups = [],
  unresolvedStoryThreads = [],
  actThreePayoffPath = [],
  imageMotifs = [],
} = {}) {
  const source = [
    transcript,
    act,
    featureSequence,
    featureObligation,
    currentBeat,
    actPressureState,
    characterArcState,
    ...normalizeList(nextThreeTurns, 3, 180),
    ...normalizeList(nextSceneMoves, 5, 180),
    ...normalizeList(unresolvedSetups, 6, 180),
    ...normalizeList(unresolvedStoryThreads, 6, 180),
    ...normalizeList(actThreePayoffPath, 5, 180),
    ...normalizeList(imageMotifs, 5, 140),
  ].filter(Boolean).join(" ");
  const actKind = inferStoryMoveActKind([act, featureSequence, featureObligation, actPressureState, transcript].join(" "));
  return selectStoryMoveLibraryLines(source, { intent, actKind, act, problem });
}

const STORY_MOVE_ACT_PRIORITIES = Object.freeze({
  act1: Object.freeze(["objective_pressure", "deadline_pressure", "choice_pressure"]),
  act2: Object.freeze(["reversal_pressure", "relationship_pressure", "obstacle_pressure"]),
  act3: Object.freeze(["payoff_pressure", "image_pressure", "choice_pressure"]),
});

const STORY_MOVE_SUCCESS_CHECKS = Object.freeze({
  objective_pressure: "The protagonist can visibly succeed or fail before the scene exits.",
  obstacle_pressure: "The opposition forces a new tactic instead of permitting the current one.",
  reversal_pressure: "The apparent gain changes into a cost, obligation, or loss of leverage.",
  information_pressure: "The reveal changes who can act, what they risk, or who holds power.",
  relationship_pressure: "The plot move alters trust, intimacy, loyalty, or emotional leverage.",
  deadline_pressure: "Waiting is no longer neutral; delay creates an immediate consequence.",
  choice_pressure: "One safe option closes and the next scene becomes causally inevitable.",
  payoff_pressure: "A planted promise returns through changed behavior rather than explanation.",
  image_pressure: "A concrete image changes meaning through visible action.",
});

function firstStoryValue(values = [], fallback = "") {
  for (const value of values) {
    const clean = normalizeSnippet(value, 220);
    if (clean) return clean;
  }
  return fallback;
}

function storyClause(value, fallback = "") {
  return firstStoryValue([value], fallback).replace(/[.!?]+$/g, "").trim();
}

function normalizeStoryRescueContext(context = {}) {
  const acceptedPages = normalizeList(
    context.acceptedPages ?? context.acceptedPageContinuity ?? context.accepted_page_continuity,
    3,
    240
  );
  const storyMoments = normalizeList(
    context.storyMoments ?? context.retrievedStoryMoments ?? context.retrieved_story_moments,
    4,
    220
  );
  const nextThreeTurns = normalizeList(context.nextThreeTurns ?? context.next_three_turns, 3, 180);
  const nextSceneMoves = normalizeList(context.nextSceneMoves ?? context.next_scene_moves, 5, 180);
  const unresolvedSetups = normalizeList(context.unresolvedSetups ?? context.unresolved_setups, 6, 180);
  const unresolvedStoryThreads = normalizeList(
    context.unresolvedStoryThreads ?? context.unresolved_story_threads,
    6,
    180
  );
  const actThreePayoffPath = normalizeList(
    context.actThreePayoffPath ?? context.act_three_payoff_path,
    5,
    180
  );
  const imageMotifs = normalizeList(context.imageMotifs ?? context.image_motifs, 5, 140);
  const characterArcTurns = normalizeList(
    context.characterArcTurns ?? context.character_arc_turns,
    5,
    180
  );
  const characters = normalizeList(
    context.characters ?? context.characterFocus ?? context.character_focus,
    6,
    80
  );
  const act = normalizeSnippet(context.act, 120);
  const featureSequence = normalizeSnippet(context.featureSequence ?? context.feature_sequence, 180);
  const featureObligation = normalizeSnippet(context.featureObligation ?? context.feature_obligation, 220);
  const actPressureState = normalizeSnippet(context.actPressureState ?? context.act_pressure_state, 220);
  const transcript = normalizeSnippet(context.transcript, 600);
  return {
    transcript,
    intent: normalizeSnippet(context.intent || "momentum_rescue", 64),
    problem: normalizeSnippet(context.problem, 180),
    act,
    actKind: normalizeSnippet(context.actKind ?? context.act_kind, 24) || inferStoryMoveActKind(
      [act, featureSequence, featureObligation, actPressureState, transcript].join(" ")
    ),
    featureSequence,
    featureObligation,
    actPressureState,
    sceneObjective: normalizeSnippet(context.sceneObjective ?? context.scene_objective, 220),
    currentBeat: normalizeSnippet(context.currentBeat ?? context.current_beat, 220),
    lastSceneOutcome: normalizeSnippet(context.lastSceneOutcome ?? context.last_scene_outcome, 220),
    nextScenePlan: normalizeSnippet(context.nextScenePlan ?? context.next_scene_plan, 240),
    protagonistWant: normalizeSnippet(context.protagonistWant ?? context.protagonist_want, 200),
    protagonistNeed: normalizeSnippet(context.protagonistNeed ?? context.protagonist_need, 200),
    antagonisticForce: normalizeSnippet(context.antagonisticForce ?? context.antagonistic_force, 200),
    characterArcState: normalizeSnippet(context.characterArcState ?? context.character_arc_state, 220),
    endingImage: normalizeSnippet(context.endingImage ?? context.ending_image, 180),
    acceptedPages,
    storyMoments,
    nextThreeTurns,
    nextSceneMoves,
    unresolvedSetups,
    unresolvedStoryThreads,
    actThreePayoffPath,
    imageMotifs,
    characterArcTurns,
    characters,
  };
}

function storyMoveEvidence(key, context) {
  const candidates = [];
  const add = (label, value) => {
    const clean = normalizeSnippet(value, 180);
    if (!clean) return;
    const rendered = `${label}: ${clean}`;
    if (!candidates.some((item) => item.toLowerCase() === rendered.toLowerCase())) {
      candidates.push(rendered);
    }
  };
  const nextTurn = context.nextThreeTurns[0] || context.nextSceneMoves[0] || context.nextScenePlan;
  const setup = context.unresolvedSetups[0] || context.actThreePayoffPath[0];
  const thread = context.unresolvedStoryThreads[0] || context.antagonisticForce;
  const characterPressure = context.characterArcTurns[0] || context.characterArcState || context.protagonistNeed;
  const image = context.imageMotifs[0] || context.endingImage;

  add("accepted_page", context.acceptedPages[0]);
  if (["objective_pressure", "choice_pressure", "reversal_pressure"].includes(key)) {
    add("remembered_next_turn", nextTurn);
  }
  if (["payoff_pressure", "information_pressure", "image_pressure", "reversal_pressure"].includes(key)) {
    add("open_setup", setup);
  }
  if (["obstacle_pressure", "relationship_pressure", "information_pressure"].includes(key)) {
    add("open_story_thread", thread);
  }
  if (["relationship_pressure", "choice_pressure", "objective_pressure", "payoff_pressure"].includes(key)) {
    add("character_pressure", characterPressure || context.protagonistWant);
  }
  if (["deadline_pressure", "obstacle_pressure", "reversal_pressure"].includes(key)) {
    add("act_obligation", context.featureObligation || context.actPressureState);
  }
  if (["image_pressure", "payoff_pressure"].includes(key)) add("image_motif", image);
  add("retrieved_story_memory", context.storyMoments[0]);
  add("current_beat", context.currentBeat || context.lastSceneOutcome);
  return candidates.slice(0, 3);
}

function storyMoveScore(key, context, selectedKeys) {
  let score = 12;
  const selectedIndex = selectedKeys.indexOf(key);
  if (selectedIndex >= 0) score += Math.max(12, 24 - selectedIndex * 2);
  const actIndex = (STORY_MOVE_ACT_PRIORITIES[context.actKind] || []).indexOf(key);
  if (actIndex >= 0) score += Math.max(10, 20 - actIndex * 5);

  const hasNextTurn = Boolean(context.nextThreeTurns[0] || context.nextSceneMoves[0] || context.nextScenePlan);
  const hasSetup = Boolean(context.unresolvedSetups[0] || context.actThreePayoffPath[0]);
  const hasThread = Boolean(context.unresolvedStoryThreads[0] || context.antagonisticForce);
  const hasCharacterPressure = Boolean(
    context.characterArcTurns[0] || context.characterArcState || context.protagonistWant || context.protagonistNeed
  );
  const hasActPressure = Boolean(context.featureObligation || context.actPressureState);
  const hasImage = Boolean(context.imageMotifs[0] || context.endingImage);
  const hasAcceptedPage = Boolean(context.acceptedPages[0]);

  if (hasNextTurn && key === "objective_pressure") score += 12;
  if (hasNextTurn && key === "choice_pressure") score += 8;
  if (hasNextTurn && key === "reversal_pressure") score += 8;
  if (hasSetup && key === "payoff_pressure") score += 16;
  if (hasSetup && key === "information_pressure") score += 11;
  if (hasThread && key === "obstacle_pressure") score += 15;
  if (hasThread && key === "relationship_pressure") score += 8;
  if (hasCharacterPressure && key === "relationship_pressure") score += 12;
  if (hasCharacterPressure && key === "choice_pressure") score += 10;
  if (hasCharacterPressure && key === "objective_pressure") score += 6;
  if (hasActPressure && key === "deadline_pressure") score += 12;
  if (hasActPressure && key === "obstacle_pressure") score += 6;
  if (hasImage && key === "image_pressure") score += 16;
  if (hasImage && key === "payoff_pressure") score += 6;
  if (hasAcceptedPage && ["reversal_pressure", "information_pressure", "payoff_pressure", "image_pressure"].includes(key)) {
    score += 8;
  }
  score += Math.min(6, storyMoveEvidence(key, context).length * 2);
  return Math.max(1, Math.min(100, score));
}

function buildGroundedStoryMove(key, context) {
  const protagonist = firstStoryValue(context.characters, "the protagonist");
  const nextTurn = storyClause(context.nextThreeTurns[0] || context.nextSceneMoves[0] || context.nextScenePlan);
  const sourceBeat = storyClause(
    context.currentBeat || context.lastSceneOutcome || context.acceptedPages[0],
    "the current beat"
  );
  const want = storyClause(context.protagonistWant || nextTurn || context.sceneObjective, "a concrete objective");
  const need = storyClause(
    context.protagonistNeed || context.characterArcState || context.characterArcTurns[0],
    "the truth they avoid"
  );
  const opposition = storyClause(
    context.antagonisticForce || context.unresolvedStoryThreads[0] || context.actPressureState,
    "a force that can say no"
  );
  const setup = storyClause(
    context.unresolvedSetups[0] || context.actThreePayoffPath[0] || context.storyMoments[0],
    "an earlier promise"
  );
  const cost = storyClause(
    context.characterArcTurns[0] || context.characterArcState || context.protagonistNeed || context.unresolvedStoryThreads[0],
    "a relationship cost"
  );
  const image = storyClause(
    context.imageMotifs[0] || context.endingImage || context.unresolvedSetups[0],
    "a changed exit image"
  );
  const obligation = storyClause(
    context.featureObligation || context.actPressureState || nextTurn,
    "the next story obligation"
  );
  const acceptedAnchor = storyClause(context.acceptedPages[0] || context.storyMoments[0] || setup);

  switch (key) {
    case "objective_pressure":
      return `Have ${protagonist} pursue this now: ${want}. Let this pressure block the attempt: ${opposition}. Failure activates this cost: ${cost}.`;
    case "obstacle_pressure":
      return `Turn this into active opposition: ${opposition}. Put it between ${protagonist} and ${want}, forcing a tactic shift before the beat exits on ${image}.`;
    case "reversal_pressure":
      return `Treat this beat as apparent progress: ${sourceBeat}. Then use this established continuity against it: ${acceptedAnchor}. The gain becomes this cost: ${cost}, forcing ${protagonist} to change tactic.`;
    case "information_pressure":
      return `Move this established fact into the wrong hands or a public space: ${acceptedAnchor}. Make the reveal force ${protagonist} to act before ready.`;
    case "relationship_pressure":
      return `Make ${protagonist}'s move toward ${want} damage or redefine this bond: ${storyClause(context.unresolvedStoryThreads[0] || cost)}. The plot advances only through that emotional price.`;
    case "deadline_pressure":
      return `Turn this obligation into a now-or-never condition: ${obligation}. Waiting makes this cost land before ${protagonist} is ready: ${cost}.`;
    case "choice_pressure":
      return `Force ${protagonist} to choose between ${want} and ${need}; close the safe door so the next scene becomes inevitable.`;
    case "payoff_pressure":
      return `Spend this setup now: ${setup}. Inside this obligation: ${obligation}. Make ${protagonist}'s changed behavior, not explanation, deliver the payoff toward ${image}.`;
    case "image_pressure":
      return `Transform ${image} through one visible action by ${protagonist}; let the changed image put this character pressure on screen: ${cost}.`;
    default:
      return `Use ${sourceBeat} to force ${protagonist} into a visible choice with opposition, cost, and a changed exit image.`;
  }
}

function rankStoryRescueMovesForContext(input = {}, { limit = 3 } = {}) {
  const context = normalizeStoryRescueContext(input);
  const selectedLines = selectStoryMoveLibraryLinesForContext({
    ...context,
    nextThreeTurns: context.nextThreeTurns,
    nextSceneMoves: context.nextSceneMoves,
    unresolvedSetups: context.unresolvedSetups,
    unresolvedStoryThreads: context.unresolvedStoryThreads,
    actThreePayoffPath: context.actThreePayoffPath,
    imageMotifs: context.imageMotifs,
  });
  const selectedKeys = selectedLines
    .map((line) => normalizeSnippet(line, 80).split(":")[0])
    .filter(Boolean);
  const actReason = context.actKind === "act1"
    ? "Act I must turn desire into an irreversible commitment."
    : context.actKind === "act2"
      ? "Act II must break the current tactic and increase cost or obligation."
      : context.actKind === "act3"
        ? "Act III must spend setup through changed behavior and final-image pressure."
        : "The next beat must change available choices and make another scene necessary.";
  const ranked = STORY_STALL_MOVE_LIBRARY
    .map((entry, libraryIndex) => ({
      key: entry.key,
      libraryIndex,
      score: storyMoveScore(entry.key, context, selectedKeys),
      move: buildGroundedStoryMove(entry.key, context),
      why: actReason,
      evidence: storyMoveEvidence(entry.key, context),
      successCheck: STORY_MOVE_SUCCESS_CHECKS[entry.key] || "The beat visibly changes story state.",
    }))
    .sort((a, b) => b.score - a.score || a.libraryIndex - b.libraryIndex)
    .slice(0, Math.max(1, Math.min(5, Number(limit) || 3)))
    .map(({ libraryIndex: _libraryIndex, ...move }, index) => ({ ...move, rank: index + 1 }));
  return ranked;
}

function formatRankedStoryRescueMoveLine(move = {}) {
  const rank = Math.max(1, Number(move.rank || 1));
  const key = normalizeSnippet(move.key, 48) || "story_pressure";
  const score = Math.max(0, Math.min(100, Math.round(Number(move.score || 0))));
  const evidence = normalizeList(move.evidence, 3, 180).join(" | ") || "current request";
  const playableMove = normalizeSnippet(move.move, 420);
  const successCheck = normalizeSnippet(move.successCheck, 220);
  return `rank_${rank}: engine=${key}; score=${score}; evidence=${evidence}; move=${playableMove}; success_check=${successCheck}`;
}

export {
  STORY_STALL_MOVE_LIBRARY,
  formatRankedStoryRescueMoveLine,
  inferStoryMoveActKind,
  rankStoryRescueMovesForContext,
  selectStoryMoveLibraryLines,
  selectStoryMoveLibraryLinesForContext,
};
