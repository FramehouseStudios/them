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

export {
  STORY_STALL_MOVE_LIBRARY,
  inferStoryMoveActKind,
  selectStoryMoveLibraryLines,
  selectStoryMoveLibraryLinesForContext,
};
