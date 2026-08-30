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

const STORY_MOVE_REPAIR_PHRASES = Object.freeze({
  objective_pressure: "a concrete objective",
  obstacle_pressure: "an active obstacle",
  reversal_pressure: "another reversal",
  information_pressure: "an information reveal",
  relationship_pressure: "relationship pressure",
  deadline_pressure: "a deadline",
  choice_pressure: "an irreversible choice",
  payoff_pressure: "the due payoff",
  image_pressure: "a visual turn",
});

const STORY_MOVE_FAILED_PHRASES = Object.freeze({
  objective_pressure: "the last objective-driven move",
  obstacle_pressure: "the last obstacle",
  reversal_pressure: "the last reversal",
  information_pressure: "the last reveal",
  relationship_pressure: "the last relationship-pressure move",
  deadline_pressure: "the last deadline",
  choice_pressure: "the last forced choice",
  payoff_pressure: "the last payoff attempt",
  image_pressure: "the last visual turn",
});

const STORY_MOVE_FAMILY_KEYS = Object.freeze(
  STORY_STALL_MOVE_LIBRARY.map((entry) => entry.key)
);
const STORY_MOVE_FAMILY_KEY_SET = new Set(STORY_MOVE_FAMILY_KEYS);
const STORY_MOVE_SEQUENCE_KEY_SET = new Set([
  "opening",
  "commitment",
  "premise",
  "midpoint",
  "fallout",
  "crisis",
  "final_plan",
  "climax",
  "resolution",
]);
const STORY_MOVE_FAMILY_DIRECTIVES = Object.freeze({
  objective_pressure: "turn desire into a concrete objective that can visibly succeed or fail",
  obstacle_pressure: "activate a person, rule, deadline, secret, or consequence that can say no",
  reversal_pressure: "turn apparent progress into a cost, obligation, or loss of leverage",
  information_pressure: "move established information into dangerous hands or a public consequence",
  relationship_pressure: "make plot movement damage, redefine, or test a bond",
  deadline_pressure: "create a now-or-never condition where waiting causes immediate harm",
  choice_pressure: "close a safe door with an irreversible decision that causes the next scene",
  payoff_pressure: "spend an established setup through changed behavior rather than explanation",
  image_pressure: "transform a concrete image or object through visible action",
});
const STORY_MOVE_FAMILY_LABELS = Object.freeze({
  objective_pressure: "Clear objectives",
  obstacle_pressure: "Active opposition",
  reversal_pressure: "Reversals",
  information_pressure: "Reveals",
  relationship_pressure: "Relationship pressure",
  deadline_pressure: "Urgency",
  choice_pressure: "Irreversible choices",
  payoff_pressure: "Setups and payoffs",
  image_pressure: "Visual storytelling",
});
const PROVISIONAL_EMOTIONAL_FAMILIES = Object.freeze([
  "relationship_pressure",
  "choice_pressure",
  "reversal_pressure",
]);
const PROVISIONAL_CONTRAST_FAMILIES = Object.freeze([
  "payoff_pressure",
  "information_pressure",
  "obstacle_pressure",
  "deadline_pressure",
  "image_pressure",
  "objective_pressure",
]);

function normalizeStoryMoveFamily(value = "") {
  const key = normalizeSnippet(value, 48)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return STORY_MOVE_FAMILY_KEY_SET.has(key) ? key : "";
}

function storyMoveFamilyDirective(value = "") {
  const key = normalizeStoryMoveFamily(value);
  return key ? STORY_MOVE_FAMILY_DIRECTIVES[key] : "";
}

function storyMoveFamilyLabel(value = "") {
  const key = normalizeStoryMoveFamily(value);
  return key ? STORY_MOVE_FAMILY_LABELS[key] : "";
}

function normalizeStoryMovePreferenceOverrides(value = []) {
  const source = Array.isArray(value) ? value : [];
  const byFamily = new Map();
  for (const item of source) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const family = normalizeStoryMoveFamily(
      item.family ?? item.moveFamily ?? item.move_family
    );
    const stance = normalizeSnippet(
      item.stance ?? item.preference ?? item.direction,
      16
    ).toLowerCase();
    if (!family || !["prefer", "avoid"].includes(stance)) continue;
    const rawUpdatedAt = Number(item.updatedAt ?? item.updated_at ?? 0);
    const updatedAt = Number.isFinite(rawUpdatedAt)
      ? Math.max(0, rawUpdatedAt)
      : 0;
    const previous = byFamily.get(family);
    if (!previous || updatedAt >= previous.updatedAt) {
      byFamily.set(family, { family, stance, updatedAt });
    }
  }
  return STORY_MOVE_FAMILY_KEYS
    .map((family) => byFamily.get(family))
    .filter(Boolean);
}

function normalizeOfferedStoryMoveFamilies(value = []) {
  const source = Array.isArray(value) ? value : [];
  const out = [];
  for (const item of source) {
    const family = normalizeStoryMoveFamily(item);
    if (!family || out.includes(family)) continue;
    out.push(family);
    if (out.length >= 3) break;
  }
  return out;
}

function normalizeStoryMoveActKey(value = "") {
  const normalized = normalizeSnippet(value, 48).toLowerCase();
  if (["act1", "act2", "act3"].includes(normalized)) return normalized;
  return inferStoryMoveActKind(normalized);
}

function normalizeStoryMoveSequenceKey(value = "") {
  const normalized = normalizeSnippet(value, 180)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const canonical = normalized.replace(/\s+/g, "_");
  if (STORY_MOVE_SEQUENCE_KEY_SET.has(canonical)) return canonical;
  if (/\b(?:resolution|denouement|epilogue)\b/.test(normalized) ||
      (/\b(?:final|closing|last) image\b/.test(normalized) && !/\bclimax\b/.test(normalized))) {
    return "resolution";
  }
  if (/\b(?:climax|final battle|decisive choice)\b/.test(normalized)) return "climax";
  if (/\b(?:break into three|final plan|new plan)\b/.test(normalized)) return "final_plan";
  if (/\b(?:all is lost|low point|collapse|dark night)\b/.test(normalized)) return "crisis";
  if (/\b(?:reversal fallout|bad guys close in|midpoint fallout)\b/.test(normalized)) return "fallout";
  if (/\bmidpoint\b/.test(normalized)) return "midpoint";
  if (/\b(?:promise of the premise|fun and games|premise testing)\b/.test(normalized)) return "premise";
  if (/\b(?:catalyst|inciting incident|debate|commitment|break into two|lock in)\b/.test(normalized)) {
    return "commitment";
  }
  if (/\b(?:opening image|ordinary world|opening sequence)\b/.test(normalized)) return "opening";
  return normalized;
}

function storyMoveTasteEvidenceWeight(record, { actKey = "", sequenceKey = "" } = {}) {
  const requestedActKey = normalizeStoryMoveActKey(actKey);
  const requestedSequenceKey = normalizeStoryMoveSequenceKey(sequenceKey);
  if (!requestedActKey && !requestedSequenceKey) return 1;

  const recordActKey = normalizeStoryMoveActKey(
    record.actKey ?? record.act_key ?? record.sourceAct ?? record.source_act
  );
  const recordSequenceKey = normalizeStoryMoveSequenceKey(
    record.sequenceKey ?? record.sequence_key ?? record.featureSequence ?? record.feature_sequence
  );
  if (requestedActKey && (!recordActKey || recordActKey !== requestedActKey)) return 0;
  if (!requestedSequenceKey) return 1;
  if (!recordSequenceKey) return requestedActKey ? 0.35 : 0;
  return recordSequenceKey === requestedSequenceKey ? 1 : 0.35;
}

function buildStoryMoveTasteProfile(
  questionEffectiveness = [],
  { preferenceOverrides = [], actKey = "", sequenceKey = "" } = {}
) {
  const records = Array.isArray(questionEffectiveness)
    ? questionEffectiveness.slice(0, 24)
    : [];
  const overrides = normalizeStoryMovePreferenceOverrides(preferenceOverrides);
  const byFamily = new Map();
  const ensure = (family) => {
    if (!byFamily.has(family)) {
      byFamily.set(family, {
        family,
        selectedCount: 0,
        passedOverCount: 0,
        declinedCount: 0,
        acceptedPageCount: 0,
        blockResolutionCount: 0,
        successfulSelectionCount: 0,
        successfulRescueCount: 0,
        failedRescueCount: 0,
        lastSelectedAt: 0,
        explicitStance: "",
        correctedAt: 0,
      });
    }
    return byFamily.get(family);
  };
  let mostRecentSelectedFamily = "";
  let mostRecentSelectedAt = 0;

  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) continue;
    const evidenceWeight = storyMoveTasteEvidenceWeight(record, { actKey, sequenceKey });
    if (evidenceWeight <= 0) continue;
    const selectedFamily = normalizeStoryMoveFamily(
      record.selectedMoveFamily ??
      record.selected_move_family ??
      record.selectedStoryMove ??
      record.selected_story_move
    );
    const offeredFamilies = normalizeOfferedStoryMoveFamilies(
      record.offeredMoveFamilies ??
      record.offered_move_families ??
      record.provisionalMoveFamilies ??
      record.provisional_move_families
    );
    if (!selectedFamily && !offeredFamilies.length) continue;
    const answeredAt = Math.max(
      0,
      Number(record.answeredAt ?? record.answered_at ?? record.respondedAt ?? record.responded_at ?? 0)
    );
    const responseStatus = normalizeSnippet(
      record.responseStatus ?? record.response_status,
      24
    ).toLowerCase();
    const acceptedPageCount = Math.max(
      0,
      Math.min(8, Math.floor(Number(
        record.acceptedPageCount ?? record.accepted_page_count ?? 0
      ) || 0))
    );
    const blockResolutionCount = Math.max(
      0,
      Math.min(8, Math.floor(Number(
        record.blockResolutionCount ?? record.block_resolution_count ?? 0
      ) || 0))
    );
    const recommendationOnly = Boolean(
      record.recommendationOnly ?? record.recommendation_only
    );
    const failedRescueCount = Math.max(
      0,
      Math.min(8, Math.floor(Number(
        record.failedRescueCount ?? record.failed_rescue_count ?? 0
      ) || 0))
    );
    const earnedRecommendation = !recommendationOnly || acceptedPageCount > 0 || blockResolutionCount > 0;
    const failedRecommendation = recommendationOnly && failedRescueCount > 0;

    if (selectedFamily && earnedRecommendation) {
      const selected = ensure(selectedFamily);
      selected.selectedCount += evidenceWeight;
      selected.acceptedPageCount += acceptedPageCount * evidenceWeight;
      selected.blockResolutionCount += blockResolutionCount * evidenceWeight;
      if (acceptedPageCount > 0 || blockResolutionCount > 0) {
        selected.successfulSelectionCount += evidenceWeight;
        if (recommendationOnly) selected.successfulRescueCount += evidenceWeight;
      }
      selected.lastSelectedAt = Math.max(selected.lastSelectedAt, answeredAt);
      if (evidenceWeight === 1 && answeredAt >= mostRecentSelectedAt) {
        mostRecentSelectedAt = answeredAt;
        mostRecentSelectedFamily = selectedFamily;
      }
    }
    if (selectedFamily && failedRecommendation) {
      const failed = ensure(selectedFamily);
      failed.failedRescueCount += failedRescueCount * evidenceWeight;
    }
    for (const family of earnedRecommendation ? offeredFamilies : []) {
      if (family === selectedFamily) continue;
      const passed = ensure(family);
      passed.passedOverCount += evidenceWeight;
      if (!selectedFamily && responseStatus === "declined") {
        passed.declinedCount += evidenceWeight;
      }
    }
  }
  for (const override of overrides) {
    const item = ensure(override.family);
    item.explicitStance = override.stance;
    item.correctedAt = override.updatedAt;
  }

  return [...byFamily.values()]
    .map((item) => {
      const positive =
        item.selectedCount * 5 +
        item.successfulSelectionCount * 7 +
        item.acceptedPageCount * 3 +
        item.blockResolutionCount * 4;
      const negative =
        Math.min(6, item.passedOverCount) +
        Math.min(6, item.declinedCount * 2) +
        Math.min(18, item.failedRescueCount * 8);
      const evidenceCount =
        item.selectedCount +
        item.passedOverCount +
        item.declinedCount +
        item.acceptedPageCount +
        item.blockResolutionCount +
        item.failedRescueCount;
      const confidence = Math.min(1, evidenceCount / 5);
      const learnedTasteBonus = Math.max(
        -12,
        Math.min(18, Math.round((positive - negative) * (0.35 + confidence * 0.65)))
      );
      const tasteBonus = item.explicitStance === "prefer"
        ? Math.max(24, Math.min(30, learnedTasteBonus + 18))
        : item.explicitStance === "avoid"
          ? Math.min(-18, Math.max(-24, learnedTasteBonus - 30))
          : learnedTasteBonus;
      const recentVarietyPenalty =
        item.family === mostRecentSelectedFamily && item.selectedCount > 1
          ? 3
          : 0;
      return {
        ...item,
        tasteBonus,
        learnedTasteBonus,
        recentVarietyPenalty,
        evidenceCount,
      };
    })
    .sort((left, right) => (
      right.tasteBonus - left.tasteBonus ||
      right.successfulSelectionCount - left.successfulSelectionCount ||
      right.lastSelectedAt - left.lastSelectedAt ||
      STORY_MOVE_FAMILY_KEYS.indexOf(left.family) -
        STORY_MOVE_FAMILY_KEYS.indexOf(right.family)
    ));
}

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
  causalFacts = [],
  dueStoryThread = null,
} = {}) {
  const due = normalizeDueStoryThread(dueStoryThread);
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
    ...normalizeAcceptedCausalFacts(causalFacts).map((item) => item.fact),
    due?.setup,
    due?.promisedPayoff,
    due?.sourceSceneSummary,
    due?.sourceSceneOutcome,
  ].filter(Boolean).join(" ");
  const actKind = normalizeStoryMoveActKey(act) || inferStoryMoveActKind(
    [featureSequence, featureObligation, actPressureState, transcript].join(" ")
  );
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

function normalizeDueStoryThread(value = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out = {
    kind: normalizeSnippet(value.kind, 24),
    setup: normalizeSnippet(value.setup ?? value.oldestOpenSetup ?? value.oldest_open_setup, 220),
    promisedPayoff: normalizeSnippet(value.promisedPayoff ?? value.promised_payoff ?? value.payoff, 220),
    sourceSceneHeading: normalizeSnippet(value.sourceSceneHeading ?? value.source_scene_heading, 140),
    sourceSceneSummary: normalizeSnippet(value.sourceSceneSummary ?? value.source_scene_summary, 220),
    sourceSceneOutcome: normalizeSnippet(value.sourceSceneOutcome ?? value.source_scene_outcome, 220),
    sourceAct: normalizeSnippet(value.sourceAct ?? value.source_act, 80),
    ageInScenes: Math.max(0, Math.round(Number(value.ageInScenes ?? value.age_in_scenes ?? 0))),
  };
  return out.setup || out.promisedPayoff ? out : null;
}

function normalizeAcceptedCausalFacts(value = []) {
  const source = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();
  for (const item of source) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const kind = normalizeSnippet(item.kind ?? item.type, 48).toLowerCase().replace(/\s+/g, "_");
    const fact = normalizeSnippet(item.fact ?? item.value ?? item.text, 220);
    if (!kind || !fact) continue;
    const key = `${kind}:${fact.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind,
      fact,
      sourceSceneHeading: normalizeSnippet(item.sourceSceneHeading ?? item.source_scene_heading, 140),
      sourceAct: normalizeSnippet(item.sourceAct ?? item.source_act, 80),
      ageInScenes: Math.max(0, Math.round(Number(item.ageInScenes ?? item.age_in_scenes ?? 0))),
    });
    if (out.length >= 8) break;
  }
  return out;
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
  const dueStoryThread = normalizeDueStoryThread(context.dueStoryThread ?? context.due_story_thread);
  const causalFacts = normalizeAcceptedCausalFacts(
    context.causalFacts ?? context.acceptedCausalFacts ?? context.accepted_causal_facts
  );
  const questionEffectiveness = Array.isArray(
    context.questionEffectiveness ?? context.question_effectiveness
  )
    ? (context.questionEffectiveness ?? context.question_effectiveness).slice(0, 24)
    : [];
  const storyMovePreferenceOverrides = normalizeStoryMovePreferenceOverrides(
    context.storyMovePreferenceOverrides ??
    context.story_move_preference_overrides
  );
  const actKind = normalizeStoryMoveActKey(context.actKind ?? context.act_kind) ||
    normalizeStoryMoveActKey(act) ||
    inferStoryMoveActKind(
      [featureSequence, featureObligation, actPressureState, transcript].join(" ")
    );
  const sequenceKey = normalizeSnippet(
    context.sequenceKey ?? context.sequence_key ?? featureSequence,
    180
  );
  return {
    transcript,
    intent: normalizeSnippet(context.intent || "momentum_rescue", 64),
    problem: normalizeSnippet(context.problem, 180),
    act,
    actKind,
    sequenceKey,
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
    causalFacts,
    dueStoryThread,
    questionEffectiveness,
    storyMovePreferenceOverrides,
    storyMoveTasteProfile: buildStoryMoveTasteProfile(questionEffectiveness, {
      preferenceOverrides: storyMovePreferenceOverrides,
      actKey: actKind,
      sequenceKey,
    }),
  };
}

function causalFactForStoryMove(key, context) {
  const facts = Array.isArray(context?.causalFacts) ? context.causalFacts : [];
  const preferredKinds = key === "information_pressure"
    ? ["revelation", "irreversible_consequence", "decision", "relationship_change"]
    : key === "relationship_pressure"
      ? ["relationship_change", "decision", "revelation", "irreversible_consequence"]
      : key === "choice_pressure"
        ? ["decision", "irreversible_consequence", "relationship_change", "revelation"]
        : key === "reversal_pressure"
          ? ["irreversible_consequence", "decision", "revelation", "relationship_change"]
          : ["irreversible_consequence", "decision", "relationship_change", "revelation"];
  for (const kind of preferredKinds) {
    const match = facts.find((item) => item.kind === kind);
    if (match) return match;
  }
  return facts[0] || null;
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
  const dueThread = context.dueStoryThread;
  const setup = dueThread?.setup || dueThread?.promisedPayoff || context.unresolvedSetups[0] || context.actThreePayoffPath[0];
  const thread = context.unresolvedStoryThreads[0] || context.antagonisticForce;
  const characterPressure = context.characterArcTurns[0] || context.characterArcState || context.protagonistNeed;
  const image = context.imageMotifs[0] || context.endingImage;
  const causalFact = causalFactForStoryMove(key, context);

  if (
    dueThread &&
    ["payoff_pressure", "information_pressure", "reversal_pressure", "image_pressure"].includes(key)
  ) {
    add("due_story_thread", dueThread.setup || dueThread.promisedPayoff);
  }
  add("accepted_causal_fact", causalFact?.fact);
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
  const hasSetup = Boolean(
    context.dueStoryThread?.setup ||
    context.dueStoryThread?.promisedPayoff ||
    context.unresolvedSetups[0] ||
    context.actThreePayoffPath[0]
  );
  const hasThread = Boolean(context.unresolvedStoryThreads[0] || context.antagonisticForce);
  const hasCharacterPressure = Boolean(
    context.characterArcTurns[0] || context.characterArcState || context.protagonistWant || context.protagonistNeed
  );
  const hasActPressure = Boolean(context.featureObligation || context.actPressureState);
  const hasImage = Boolean(context.imageMotifs[0] || context.endingImage);
  const hasAcceptedPage = Boolean(context.acceptedPages[0]);
  const hasDueStoryThread = Boolean(context.dueStoryThread?.setup || context.dueStoryThread?.promisedPayoff);
  const causalFact = causalFactForStoryMove(key, context);

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
  if (hasDueStoryThread && key === "payoff_pressure") {
    score += 72 + Math.min(12, Math.floor(Number(context.dueStoryThread.ageInScenes || 0) / 4));
  }
  if (hasDueStoryThread && key === "information_pressure") score += 10;
  if (hasDueStoryThread && key === "reversal_pressure") score += 6;
  if (causalFact?.kind === "revelation" && key === "information_pressure") score += 40;
  if (causalFact?.kind === "revelation" && key === "reversal_pressure") score += 12;
  if (causalFact?.kind === "relationship_change" && key === "relationship_pressure") score += 30;
  if (causalFact?.kind === "decision" && key === "choice_pressure") score += 22;
  if (causalFact?.kind === "decision" && key === "reversal_pressure") score += 16;
  if (causalFact?.kind === "irreversible_consequence" && key === "reversal_pressure") score += 26;
  if (causalFact?.kind === "irreversible_consequence" && key === "obstacle_pressure") score += 14;
  const taste = context.storyMoveTasteProfile.find((item) => item.family === key);
  if (taste) {
    score += taste.tasteBonus;
    score -= taste.recentVarietyPenalty;
  }
  score += Math.min(6, storyMoveEvidence(key, context).length * 2);
  return Math.max(1, score);
}

function buildGroundedStoryMove(key, context) {
  const protagonist = firstStoryValue(context.characters, "the protagonist");
  const dueThread = context.dueStoryThread;
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
    dueThread?.setup || dueThread?.promisedPayoff || context.unresolvedSetups[0] || context.actThreePayoffPath[0] || context.storyMoments[0],
    "an earlier promise"
  );
  const promisedPayoff = storyClause(
    dueThread?.promisedPayoff || context.actThreePayoffPath[0],
    "a changed image"
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
  const dueSource = storyClause(
    dueThread?.sourceSceneOutcome || dueThread?.sourceSceneSummary || dueThread?.sourceSceneHeading,
    acceptedAnchor
  );
  const causalRecord = causalFactForStoryMove(key, context);
  const causalFact = storyClause(causalRecord?.fact);

  switch (key) {
    case "objective_pressure":
      return `${causalFact ? `Continue from this accepted change: ${causalFact}. ` : ""}Have ${protagonist} pursue this now: ${want}. Let this pressure block the attempt: ${opposition}. Failure activates this cost: ${cost}.`;
    case "obstacle_pressure":
      return `${causalFact ? `Make this accepted consequence active opposition: ${causalFact}. ` : ""}Put ${opposition} between ${protagonist} and ${want}, forcing a tactic shift before the beat exits on ${image}.`;
    case "reversal_pressure":
      return `Treat this beat as apparent progress: ${sourceBeat}. Then use this established continuity against it: ${causalFact || dueSource}. Do not undo it; turn its consequence into this cost: ${cost}, forcing ${protagonist} to change tactic.`;
    case "information_pressure":
      return `The accepted pages already established this fact: ${causalFact || dueSource}. Do not reveal it again; move its consequence into the wrong hands or a public space and force ${protagonist} to act before ready.`;
    case "relationship_pressure":
      return `${causalFact ? `Treat this as the bond's current state: ${causalFact}. ` : ""}Make ${protagonist}'s move toward ${want} damage or redefine that bond further. The plot advances only through that emotional price.`;
    case "deadline_pressure":
      return `Turn this obligation into a now-or-never condition: ${obligation}. Waiting makes this cost land before ${protagonist} is ready: ${cost}.`;
    case "choice_pressure":
      return causalFact
        ? `Because this accepted change cannot be reset - ${causalFact} - force ${protagonist} to choose between ${want} and ${need}; close the safe door so the next scene becomes inevitable.`
        : `Force ${protagonist} to choose between ${want} and ${need}; close the safe door so the next scene becomes inevitable.`;
    case "payoff_pressure":
      return `Spend this setup now: ${setup}. Inside this obligation: ${obligation}. Make ${protagonist}'s changed behavior, not explanation, deliver the promised payoff: ${promisedPayoff}. Land it through ${image}.`;
    case "image_pressure":
      return `Transform ${image} through one visible action by ${protagonist}; let the changed image put this character pressure on screen: ${cost}.`;
    default:
      return `Use ${causalFact || sourceBeat} to force ${protagonist} into a visible choice with opposition, cost, and a changed exit image.`;
  }
}

function storyRescueCausalAdvancement(key, context) {
  const protagonist = firstStoryValue(context.characters, "the protagonist");
  const setup = storyClause(
    context.dueStoryThread?.setup ||
    context.unresolvedSetups[0] ||
    context.actThreePayoffPath[0],
    "the planted promise"
  );
  const cost = storyClause(
    context.unresolvedStoryThreads[0] ||
    context.characterArcState ||
    context.protagonistNeed,
    "the relationship can no longer return to safety"
  );
  switch (key) {
    case "objective_pressure":
      return `Success or failure changes what ${protagonist} can try next and activates ${cost}.`;
    case "obstacle_pressure":
      return `The blocked tactic removes the easy route and forces ${protagonist} into a riskier strategy.`;
    case "reversal_pressure":
      return "The apparent gain removes leverage, so the old tactic cannot be repeated and a new choice becomes necessary.";
    case "information_pressure":
      return "Moving the known fact changes who holds power and forces action before anyone is ready.";
    case "relationship_pressure":
      return "The plot gain changes trust, so the bond cannot return to its previous state.";
    case "deadline_pressure":
      return `Delay now triggers ${cost}, removing the option to wait.`;
    case "choice_pressure":
      return "The choice closes the safe option and makes the next scene causally necessary.";
    case "payoff_pressure":
      return `Spending ${setup} fulfills or complicates its promise and narrows the final choice.`;
    case "image_pressure":
      return `The transformed image makes ${cost} visible and changes the next available choice.`;
    default:
      return "The move changes available choices and makes the following scene necessary.";
  }
}

function storyRescueCharacterCost(context) {
  const protagonist = firstStoryValue(context.characters, "The protagonist");
  const relationship = storyClause(context.unresolvedStoryThreads[0] || context.antagonisticForce);
  if (relationship) return `${protagonist} risks this relationship pressure becoming permanent: ${relationship}.`;
  const need = storyClause(context.protagonistNeed);
  if (need) return `${protagonist} must expose the vulnerable need they have avoided: ${need}.`;
  const arc = storyClause(context.characterArcState || context.characterArcTurns[0]);
  if (arc) return `${protagonist} must let this emotional defense fail in public: ${arc}.`;
  return `${protagonist} risks losing trust with the person whose love or loyalty matters most.`;
}

function storyRescueActProgression(context) {
  if (context.actKind === "act1") {
    return "Act I progression: burn a safe exit and force commitment to the central pursuit.";
  }
  if (context.actKind === "act2") {
    return "Act II progression: break the old tactic, deepen the trap, and make the next strategy costlier.";
  }
  if (context.actKind === "act3") {
    return "Act III progression: spend setup through changed behavior and drive toward the final image.";
  }
  return "Feature progression: narrow the available choices so the next scene is necessary.";
}

function buildStoryRescueQualityContract(key, context) {
  const causalAdvancement = storyRescueCausalAdvancement(key, context);
  const characterCost = storyRescueCharacterCost(context);
  const actProgression = storyRescueActProgression(context);
  return {
    playableSpecificity: true,
    causalAdvancement,
    characterCost,
    actProgression,
    passed: Boolean(causalAdvancement && characterCost && actProgression),
  };
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
    causalFacts: context.causalFacts,
    dueStoryThread: context.dueStoryThread,
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
    .map((entry, libraryIndex) => {
      const taste = context.storyMoveTasteProfile.find((item) => item.family === entry.key);
      const qualityContract = buildStoryRescueQualityContract(entry.key, context);
      const failedInCurrentPosition = Boolean(
        taste &&
        taste.explicitStance !== "prefer" &&
        Number(taste.failedRescueCount || 0) >= 0.99 &&
        Number(taste.failedRescueCount || 0) > Number(taste.successfulRescueCount || 0)
      );
      const requiredByDueCanon = Boolean(
        context.dueStoryThread && entry.key === "payoff_pressure"
      );
      return {
        key: entry.key,
        libraryIndex,
        suppressFailedRepeat: failedInCurrentPosition && !requiredByDueCanon,
        score: storyMoveScore(entry.key, context, selectedKeys),
        tasteBonus: taste?.tasteBonus || 0,
        tasteEvidenceCount: taste?.evidenceCount || 0,
        move: buildGroundedStoryMove(entry.key, context),
        causalAdvancement: qualityContract.causalAdvancement,
        characterCost: qualityContract.characterCost,
        actProgression: qualityContract.actProgression,
        qualityGate: {
          passed: qualityContract.passed,
          playableSpecificity: qualityContract.playableSpecificity,
          causalAdvancement: Boolean(qualityContract.causalAdvancement),
          characterCost: Boolean(qualityContract.characterCost),
          actProgression: Boolean(qualityContract.actProgression),
        },
        why: actReason,
        evidence: storyMoveEvidence(entry.key, context),
        successCheck: STORY_MOVE_SUCCESS_CHECKS[entry.key] || "The beat visibly changes story state.",
      };
    })
    .sort((a, b) => (
      Number(a.suppressFailedRepeat) - Number(b.suppressFailedRepeat) ||
      b.score - a.score ||
      a.libraryIndex - b.libraryIndex
    ))
    .slice(0, Math.max(1, Math.min(5, Number(limit) || 3)))
    .map(({
      libraryIndex: _libraryIndex,
      suppressFailedRepeat: _suppressFailedRepeat,
      ...move
    }, index) => ({ ...move, rank: index + 1 }));
  return ranked;
}

function buildFailedStoryRescueRepair(input = {}, { rankedMoves = [] } = {}) {
  const context = normalizeStoryRescueContext(input);
  const ranked = Array.isArray(rankedMoves) && rankedMoves.length
    ? rankedMoves
    : rankStoryRescueMovesForContext(input);
  const strongestFamily = normalizeStoryMoveFamily(ranked[0]?.key);
  if (!strongestFamily) return null;
  const failed = context.storyMoveTasteProfile
    .filter((item) => (
      item.family !== strongestFamily &&
      item.explicitStance !== "prefer" &&
      Number(item.failedRescueCount || 0) >= 0.99 &&
      Number(item.failedRescueCount || 0) > Number(item.successfulRescueCount || 0)
    ))
    .sort((left, right) => (
      Number(right.failedRescueCount || 0) - Number(left.failedRescueCount || 0)
    ))[0];
  if (!failed) return null;

  const failedPhrase = STORY_MOVE_FAILED_PHRASES[failed.family] || "that kind of move";
  const nextPhrase = STORY_MOVE_REPAIR_PHRASES[strongestFamily] || "a different kind of pressure";
  return {
    failedFamily: failed.family,
    nextFamily: strongestFamily,
    acknowledgment: `I remember ${failedPhrase} did not get you moving here. So I am changing the engine, not repainting the same idea: use ${nextPhrase}.`,
    promptDirective: `failed_rescue_repair: Briefly acknowledge that ${failedPhrase} did not get the writer moving at this exact story position, then change the engine to ${nextPhrase} by executing rank_1. Use one warm natural sentence before the playable answer. Never mention internal labels, scores, classifiers, or memory machinery.`,
  };
}

function selectProvisionalStoryMoveFamilies(input = {}) {
  const ranked = rankStoryRescueMovesForContext(input, { limit: 5 });
  const rankedKeys = ranked.map((item) => item.key).filter(Boolean);
  const selected = [];
  const add = (family) => {
    const clean = normalizeStoryMoveFamily(family);
    if (!clean || selected.includes(clean)) return;
    selected.push(clean);
  };
  add(rankedKeys[0]);
  add(PROVISIONAL_EMOTIONAL_FAMILIES.find((family) => (
    rankedKeys.includes(family) && !selected.includes(family)
  )));
  add(PROVISIONAL_CONTRAST_FAMILIES.find((family) => (
    rankedKeys.includes(family) && !selected.includes(family)
  )));
  for (const family of rankedKeys) add(family);
  for (const family of STORY_MOVE_FAMILY_KEYS) add(family);
  return selected.slice(0, 3);
}

function formatRankedStoryRescueMoveLine(move = {}) {
  const rank = Math.max(1, Number(move.rank || 1));
  const key = normalizeSnippet(move.key, 48) || "story_pressure";
  const score = Math.max(0, Math.min(100, Math.round(Number(move.score || 0))));
  const evidence = normalizeList(move.evidence, 3, 180).join(" | ") || "current request";
  const playableMove = normalizeSnippet(move.move, 420);
  const causalAdvancement = normalizeSnippet(move.causalAdvancement, 220);
  const characterCost = normalizeSnippet(move.characterCost, 220);
  const actProgression = normalizeSnippet(move.actProgression, 220);
  const successCheck = normalizeSnippet(move.successCheck, 220);
  const tasteBonus = Math.max(-12, Math.min(18, Math.round(Number(move.tasteBonus || 0))));
  const taste = tasteBonus
    ? `; taste_bonus=${tasteBonus > 0 ? "+" : ""}${tasteBonus}`
    : "";
  const qualityGate = move?.qualityGate?.passed === true
    ? "pass(playable+causal+cost+act)"
    : "repair_required";
  return `rank_${rank}: engine=${key}; score=${score}${taste}; evidence=${evidence}; move=${playableMove}; causal_advance=${causalAdvancement}; character_cost=${characterCost}; act_progression=${actProgression}; quality_gate=${qualityGate}; success_check=${successCheck}`;
}

function buildDeliveredStoryRescueInteraction({
  systemPrompt = "",
  reply = "",
  requestId = "",
  projectId = "",
  projectTitle = "",
  actKey = "",
  sequenceKey = "",
  deliveredAt = Date.now(),
} = {}) {
  const rankedFamilies = [];
  const add = (rank, value) => {
    const family = normalizeStoryMoveFamily(value);
    if (!family || rankedFamilies.some((item) => item.family === family)) return;
    rankedFamilies.push({ rank: Math.max(1, Math.floor(Number(rank || 1))), family });
  };
  const rankingPattern = /\brank_(\d+):\s*engine=([a-z_]+)/gi;
  for (const match of String(systemPrompt || "").matchAll(rankingPattern)) {
    add(match[1], match[2]);
  }
  const deliveredPattern = /\bRanked strongest move\s*-\s*([a-z ]+):/i;
  const deliveredMatch = String(reply || "").match(deliveredPattern);
  rankedFamilies.sort((left, right) => left.rank - right.rank);
  const deliveredMoveFamily = normalizeStoryMoveFamily(deliveredMatch?.[1]);
  const selectedMoveFamily = deliveredMoveFamily || rankedFamilies[0]?.family || "";
  if (!selectedMoveFamily) return null;
  const offeredMoveFamilies = [
    selectedMoveFamily,
    ...rankedFamilies.map((item) => item.family),
  ].filter((family, index, all) => all.indexOf(family) === index).slice(0, 3);
  const at = Math.max(1, Number(deliveredAt) || Date.now());
  const cleanRequestId = String(requestId || "").trim().replace(/[^a-z0-9_-]+/gi, "-").slice(0, 72);
  return {
    questionId: `writer-block-rescue-${cleanRequestId || at}`,
    projectId: String(projectId || "").trim(),
    projectTitle: String(projectTitle || "").trim(),
    targetField: "story.writer_block_rescue",
    targetLabel: "the delivered writer-block rescue",
    anchor: selectedMoveFamily,
    question: "Which delivered story move gets the writer moving again?",
    authority: "clementine_recommendation",
    actKey: normalizeStoryMoveActKey(actKey),
    sequenceKey: normalizeStoryMoveSequenceKey(sequenceKey),
    writerBlocked: true,
    recommendationOnly: true,
    selectedMoveFamily,
    offeredMoveFamilies,
    askedAt: at,
    respondedAt: at,
    responseStatus: "answered",
  };
}

export {
  STORY_STALL_MOVE_LIBRARY,
  STORY_MOVE_FAMILY_KEYS,
  buildFailedStoryRescueRepair,
  buildStoryMoveTasteProfile,
  buildDeliveredStoryRescueInteraction,
  formatRankedStoryRescueMoveLine,
  inferStoryMoveActKind,
  normalizeStoryMoveFamily,
  normalizeStoryMovePreferenceOverrides,
  rankStoryRescueMovesForContext,
  selectProvisionalStoryMoveFamilies,
  selectStoryMoveLibraryLines,
  selectStoryMoveLibraryLinesForContext,
  storyMoveFamilyDirective,
  storyMoveFamilyLabel,
};
