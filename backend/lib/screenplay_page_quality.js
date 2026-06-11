function normalizeLineText(value = "") {
  return String(value || "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function countWords(value = "") {
  const words = normalizeLineText(value).match(/[A-Za-z0-9'][A-Za-z0-9'-]*/g);
  return Array.isArray(words) ? words.length : 0;
}

const QUALITY_TOKEN_STOPWORDS = Object.freeze(new Set([
  "about",
  "above",
  "after",
  "again",
  "against",
  "along",
  "also",
  "because",
  "before",
  "being",
  "between",
  "could",
  "every",
  "final",
  "from",
  "have",
  "into",
  "only",
  "over",
  "page",
  "pages",
  "payoff",
  "scene",
  "sequence",
  "setup",
  "should",
  "still",
  "that",
  "their",
  "there",
  "these",
  "they",
  "this",
  "through",
  "under",
  "until",
  "where",
  "while",
  "with",
  "would",
]));

function qualityTokenSet(value = "") {
  const tokens = String(value || "")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/'s\b/g, "")
    .match(/[a-z0-9][a-z0-9-]{2,}/g);
  if (!Array.isArray(tokens)) return new Set();
  return new Set(tokens.filter((token) => token.length >= 4 && !QUALITY_TOKEN_STOPWORDS.has(token)));
}

function sanitizeQualityList(items, maxItems = 6, maxChars = 180) {
  const source = Array.isArray(items)
    ? items
    : normalizeLineText(items)
      ? String(items).split(/\r?\n|;/)
      : [];
  const out = [];
  const seen = new Set();
  for (const item of source) {
    const clean = normalizeLineText(item).slice(0, Math.max(1, Number(maxChars || 180)));
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= maxItems) break;
  }
  return out;
}

function positiveIntegerOrZero(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed);
}

function normalizeElement(value = "") {
  const clean = String(value || "").trim();
  return clean || "action";
}

function isDialogueProtectedElement(element = "") {
  return ["character", "dialogue", "parenthetical"].includes(normalizeElement(element));
}

function isLikelyOutlineOrCraftArtifactLine(line = "", element = "action") {
  const text = normalizeLineText(line);
  if (!text || isDialogueProtectedElement(element)) return false;
  const lower = text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .trim();
  return [
    /^\d+[.)]\s+/,
    /^(?:beat|act|sequence|outline|note|notes|analysis|diagnosis|strategy|structure|theme|pacing|character arc|scene objective|scene job|turn|payoff|setup)\s*(?:\d+)?\s*:/,
    /^(?:next three turns?|act iii payoff path|payoff path|memory to page execution|turn runway|arc turns?|story threads?|image motifs?)\s*:/,
    /^(?:what works|what's working|what is working|what is not working|highest-leverage fix)\s*:/,
    /^the (?:scene|sequence|act|page|moment|exchange|dialogue) (?:should|needs|wants|must|can|is here to)\b/,
    /^this (?:scene|sequence|act|page|moment|exchange|dialogue) (?:should|needs|wants|must|can|is here to)\b/,
    /^we (?:need|should|can|could|want)\b.{0,120}\b(?:scene|beat|page|act|sequence|dialogue|theme|structure)\b/,
    /^i (?:would|will|can|think|suggest|recommend)\b.{0,120}\b(?:scene|beat|page|act|sequence|dialogue|theme|structure)\b/,
    /^here(?:'s| is| are)\b.{0,120}\b(?:scene|pages?|beat|outline|plan|version|pass)\b/,
  ].some((pattern) => pattern.test(lower));
}

function canonicalLowerLine(line = "") {
  return normalizeLineText(line)
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/^[\s"'`([{<]+|[\s"'`)\]}>.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyPlaceholderScreenplayLine(line = "", element = "action") {
  const text = normalizeLineText(line);
  if (!text) return false;

  const cleanElement = normalizeElement(element);
  const lower = canonicalLowerLine(text);
  const bracketedPlaceholder = /^\[(?:character|dialogue|action|scene|beat|description|slug ?line|insert)[^\]]*\]$/.test(
    text.toLowerCase().trim(),
  ) || /^<(?:character|dialogue|action|scene|beat|description|slug ?line|insert)[^>]*>$/.test(
    text.toLowerCase().trim(),
  );

  if (bracketedPlaceholder) return true;

  if (cleanElement === "character") {
    return /^(?:character|character [a-z0-9]+|protagonist|antagonist|hero|villain|lead|main character)$/.test(
      lower,
    );
  }

  if (cleanElement === "dialogue") {
    return [
      /^(?:dialogue|dialogue line|sample dialogue|placeholder dialogue|insert dialogue|say something)$/,
      /^(?:dialogue|line) (?:goes|starts) here$/,
    ].some((pattern) => pattern.test(lower));
  }

  return [
    /\b(?:tbd|todo|placeholder|fill in later)\b/,
    /^(?:action|action line|description|description line)(?: goes here| starts here)?$/,
    /^(?:beat|moment|scene|page) goes here$/,
    /^(?:insert|add|write) (?:action|dialogue|scene|beat|moment|description|slug ?line)\b/,
    /^(?:something happens|stuff happens|things happen)$/,
    /^(?:they talk|they argue|people talk|conversation happens)$/,
    /^scene continues(?: here)?$/,
  ].some((pattern) => pattern.test(lower));
}

function isLowSignalActionLine(line = "", element = "action") {
  if (normalizeElement(element) !== "action") return false;
  const lower = canonicalLowerLine(line);
  if (!lower || isLikelyPlaceholderScreenplayLine(lower, element)) return false;

  return [
    /^(?:they|we|everyone|the two of them) (?:talk|talks|argue|argues|fight|fights|wait|waits|stare|stares|look|looks|sit|sits|stand|stands)(?: together| at each other| in the room| for a while)?$/,
    /^(?:he|she) (?:looks?|stares?|waits?|sits?|stands?) (?:at (?:him|her|them)|there|quietly|silently)?$/,
    /^they keep (?:talking|arguing|fighting)(?: in the room| for a while| together)?$/,
    /^the (?:conversation|argument|scene|moment) (?:continues|goes on|keeps going|gets more (?:tense|intense|emotional))(?: for a while)?$/,
    /^things (?:get|become|feel) (?:tense|awkward|quiet|intense|emotional)$/,
    /^it (?:gets|feels|becomes) (?:tense|awkward|quiet|intense|emotional)$/,
    /^(?:a|the) silence (?:hangs|stretches|settles|fills|takes over)(?: between them| in the room| for a moment)?$/,
    /^(?:the )?(?:tension|pressure) (?:builds|rises|thickens|hangs|settles|fills the room|gets worse)$/,
    /^the air (?:feels|gets|becomes|turns) (?:heavy|tense|awkward|quiet|charged)$/,
    /^the room (?:holds its breath|goes quiet|feels smaller|gets tense)$/,
    /^the truth (?:hangs|sits|lands|settles) between them$/,
    /^(?:no one|nobody) knows what to say$/,
    /^everything (?:changes|feels different)$/,
    /^the moment (?:lands|hangs|settles|stretches)$/,
  ].some((pattern) => pattern.test(lower));
}

function isLowSubtextDialogueLine(line = "", element = "dialogue") {
  if (normalizeElement(element) !== "dialogue") return false;
  const lower = canonicalLowerLine(line);
  if (!lower) return false;

  return [
    /^we need to talk(?: about (?:this|us|what happened|our feelings))?$/,
    /^i (?:feel|felt) (?:like )?(?:angry|sad|scared|afraid|hurt|confused|upset|alone|lost|broken|betrayed)\b/,
    /^i(?: am|'m) (?:angry|sad|scared|afraid|hurt|confused|upset|alone|lost|broken|betrayed)\b/,
    /^you (?:hurt|betrayed|lied to|abandoned) me\b/,
    /^(?:this|that) (?:is|was) (?:important|hard|difficult|complicated|serious|wrong)\b/,
    /^i (?:do not|don't) know what to say\b/,
    /^tell me (?:the truth|what you want|what happened)\b/,
    /^i can't do this(?: anymore| any more)?$/,
    /^you need to (?:listen|understand|tell me|trust me)\b/,
    /^we have to (?:be honest|talk|face this)\b/,
    /^i just (?:want|need) (?:the truth|you to listen|you to understand|to be honest)\b/,
  ].some((pattern) => pattern.test(lower));
}

function isPlayableActionLine(line = "", element = "action") {
  if (normalizeElement(element) !== "action") return false;
  const text = normalizeLineText(line);
  if (!text || isLikelyOutlineOrCraftArtifactLine(text, element)) return false;
  if (countWords(text) < 3) return false;
  return /[A-Za-z]/.test(text);
}

function summarizeLineCounts(lines = []) {
  const counts = {
    nonEmpty: 0,
    sceneHeading: 0,
    action: 0,
    playableAction: 0,
    character: 0,
    dialogue: 0,
    parenthetical: 0,
    transition: 0,
    artifact: 0,
    placeholder: 0,
    lowSignalAction: 0,
    lowSubtextDialogue: 0,
    specificAction: 0,
    dialogueWords: 0,
    distinctCharacters: 0,
    maxDialogueRun: 0,
    words: 0,
  };
  const characterNames = new Set();
  let dialogueRun = 0;

  for (const line of Array.isArray(lines) ? lines : []) {
    const text = normalizeLineText(line?.text ?? line);
    if (!text) continue;
    const element = normalizeElement(line?.element);
    counts.nonEmpty += 1;
    counts.words += countWords(text);
    if (element === "sceneHeading") counts.sceneHeading += 1;
    else if (element === "action") counts.action += 1;
    else if (element === "character") {
      counts.character += 1;
      characterNames.add(canonicalLowerLine(text));
    }
    else if (element === "dialogue") counts.dialogue += 1;
    else if (element === "parenthetical") counts.parenthetical += 1;
    else if (element === "transition") counts.transition += 1;
    if (isDialogueProtectedElement(element)) {
      dialogueRun += 1;
      counts.maxDialogueRun = Math.max(counts.maxDialogueRun, dialogueRun);
    } else {
      dialogueRun = 0;
    }
    if (isPlayableActionLine(text, element)) counts.playableAction += 1;
    if (isLikelyOutlineOrCraftArtifactLine(text, element)) counts.artifact += 1;
    if (isLikelyPlaceholderScreenplayLine(text, element)) counts.placeholder += 1;
    if (element === "dialogue") counts.dialogueWords += countWords(text);
    if (isLowSignalActionLine(text, element)) counts.lowSignalAction += 1;
    if (isLowSubtextDialogueLine(text, element)) counts.lowSubtextDialogue += 1;
    if (isPlayableActionLine(text, element) && !isLowSignalActionLine(text, element)) {
      counts.specificAction += 1;
    }
  }

  counts.distinctCharacters = characterNames.size;
  return counts;
}

function minimumExpectedWordsForRequestedPages(requestedPages = 0) {
  const pages = Math.max(0, Math.min(30, Math.round(Number(requestedPages || 0))));
  if (pages <= 1) return 4;
  if (pages === 2) return 70;
  if (pages === 3) return 120;
  if (pages === 4) return 170;
  return Math.min(420, 170 + ((pages - 4) * 45));
}

function inferFeatureActKind(featureContext = {}) {
  if (!featureContext || typeof featureContext !== "object") return false;
  const actText = [
    featureContext.act,
    featureContext.currentAct,
    featureContext.current_act,
    featureContext.requestedAct,
    featureContext.requested_act,
    featureContext.featureSequence,
    featureContext.feature_sequence,
    featureContext.featureObligation,
    featureContext.feature_obligation,
  ].map((value) => normalizeLineText(value).toLowerCase()).filter(Boolean).join(" ");
  if (/\bact\s*(?:iii|3|three)\b|\bthird act\b|\bfinal act\b|\bfinale\b|\bclimax\b|\bbreak into three\b/.test(actText)) {
    return "act3";
  }
  if (/\bact\s*(?:ii|2|two)\b|\bsecond act\b|\bmidpoint\b|\breversal\b|\ball[- ]is[- ]lost\b|\bpromise of the premise\b/.test(actText)) {
    return "act2";
  }
  if (/\bact\s*(?:i|1|one)\b|\bfirst act\b|\bopening image\b|\bcatalyst\b|\bcommitment\b|\bordinary world\b/.test(actText)) {
    return "act1";
  }
  const pageCount = positiveIntegerOrZero(featureContext.pageCount ?? featureContext.page_count);
  const targetPages = positiveIntegerOrZero(
    featureContext.targetPages ??
    featureContext.target_pages ??
    featureContext.featureTargetPages ??
    featureContext.feature_target_pages
  ) || 110;
  if (pageCount > 0 && pageCount >= Math.round(targetPages * (86 / 110))) return "act3";
  if (pageCount > 0 && pageCount >= Math.round(targetPages * (26 / 110))) return "act2";
  if (pageCount > 0) return "act1";
  return "";
}

function featureObligationPhrasesForAct(featureActKind = "", featureContext = {}) {
  if (!featureActKind || !featureContext || typeof featureContext !== "object") return [];
  if (featureActKind === "act3") {
    return [
      normalizeLineText(featureContext?.featureObligation ?? featureContext?.feature_obligation),
      ...sanitizeQualityList(
        featureContext?.actThreePayoffPath ??
        featureContext?.act_three_payoff_path ??
        featureContext?.payoffPath ??
        featureContext?.payoff_path,
        5,
        200
      ),
      ...sanitizeQualityList(featureContext?.unresolvedSetups ?? featureContext?.unresolved_setups, 6, 200),
      ...sanitizeQualityList(featureContext?.unresolvedStoryThreads ?? featureContext?.unresolved_story_threads, 6, 200),
      ...sanitizeQualityList(
        featureContext?.imageMotifs ??
        featureContext?.image_motifs ??
        featureContext?.visualMotifs ??
        featureContext?.visual_motifs,
        4,
        120
      ),
      normalizeLineText(
        featureContext?.endingImage ??
        featureContext?.ending_image ??
        featureContext?.finalImage ??
        featureContext?.final_image
      ),
    ].filter(Boolean);
  }

  const phrases = [
    normalizeLineText(featureContext?.featureObligation ?? featureContext?.feature_obligation),
    normalizeLineText(featureContext?.structuralObligation ?? featureContext?.structural_obligation),
    normalizeLineText(featureContext?.actPressureState ?? featureContext?.act_pressure_state),
    normalizeLineText(featureContext?.characterArcState ?? featureContext?.character_arc_state),
    normalizeLineText(featureContext?.sceneObjective ?? featureContext?.scene_objective),
    normalizeLineText(featureContext?.currentBeat ?? featureContext?.current_beat),
    normalizeLineText(featureContext?.nextScenePlan ?? featureContext?.next_scene_plan),
    ...sanitizeQualityList(featureContext?.nextThreeTurns ?? featureContext?.next_three_turns, 3, 180),
    ...sanitizeQualityList(featureContext?.unresolvedSetups ?? featureContext?.unresolved_setups, 6, 200),
    ...sanitizeQualityList(featureContext?.unresolvedStoryThreads ?? featureContext?.unresolved_story_threads, 6, 200),
    ...sanitizeQualityList(
      featureContext?.imageMotifs ??
      featureContext?.image_motifs ??
      featureContext?.visualMotifs ??
      featureContext?.visual_motifs,
      4,
      120
    ),
  ].filter(Boolean);

  if (featureActKind === "act1") {
    phrases.push(
      normalizeLineText(featureContext?.protagonistWant ?? featureContext?.protagonist_want),
      normalizeLineText(featureContext?.protagonistNeed ?? featureContext?.protagonist_need),
      normalizeLineText(featureContext?.centralQuestion ?? featureContext?.central_question),
      normalizeLineText(featureContext?.themeArgument ?? featureContext?.theme_argument),
    );
  }

  return phrases.filter(Boolean);
}

function evaluateFeatureActObligationCoverage({
  text = "",
  counts = {},
  featureContext = null,
} = {}) {
  const featureActKind = inferFeatureActKind(featureContext);
  if (!featureActKind) return { ok: true, reason: "not_feature_act" };
  const obligationPhrases = featureObligationPhrasesForAct(featureActKind, featureContext);

  const obligationTokens = new Set();
  for (const phrase of obligationPhrases) {
    for (const token of qualityTokenSet(phrase)) obligationTokens.add(token);
  }
  const textTokens = qualityTokenSet(text);
  const matchedTokens = [...obligationTokens].filter((token) => textTokens.has(token));
  const minimumMatches = featureActKind === "act3"
    ? 1
    : Math.min(2, obligationTokens.size);
  if (obligationTokens.size > 0 && matchedTokens.length < minimumMatches) {
    const missingReason = featureActKind === "act1"
      ? "missing_act_one_commitment"
      : featureActKind === "act2"
        ? "missing_act_two_reversal"
        : "missing_act_three_payoff";
    return {
      ok: false,
      reason: missingReason,
      featureActKind,
      matchedTokens,
      obligationTokenCount: obligationTokens.size,
      minimumMatches,
    };
  }

  const hasArcPressure = Boolean(
    normalizeLineText(featureContext?.characterArcState ?? featureContext?.character_arc_state) ||
    normalizeLineText(featureContext?.actPressureState ?? featureContext?.act_pressure_state)
  );
  if (featureActKind === "act3" && hasArcPressure && Number(counts.specificAction || 0) < 2) {
    return {
      ok: false,
      reason: "missing_act_three_changed_behavior",
      featureActKind,
      matchedTokens,
      obligationTokenCount: obligationTokens.size,
    };
  }

  return {
    ok: true,
    reason: "ok",
    featureActKind,
    matchedTokens,
    obligationTokenCount: obligationTokens.size,
  };
}

function evaluateScreenplayPageQuality({
  text = "",
  lines = [],
  targetPages = 0,
  hasSceneAnchor = false,
  featureContext = null,
} = {}) {
  const normalizedText = normalizeLineText(text);
  if (!normalizedText) {
    return { ok: false, reason: "empty_page_text", counts: summarizeLineCounts(lines) };
  }

  const counts = summarizeLineCounts(lines);
  if (counts.nonEmpty < 1) {
    return { ok: false, reason: "empty_page_lines", counts };
  }
  if (counts.artifact > 0) {
    return { ok: false, reason: "outline_or_craft_artifact", counts };
  }
  if (counts.placeholder > 0) {
    return { ok: false, reason: "placeholder_page_text", counts };
  }

  const requestedPages = Math.max(0, Math.round(Number(targetPages || 0)));
  const hasDialogueBlock = counts.character > 0 && counts.dialogue > 0;
  const hasSceneShape = counts.sceneHeading > 0 || hasDialogueBlock || counts.transition > 0;
  const hasPlayableContent = counts.playableAction > 0 || hasDialogueBlock;
  const minWords = minimumExpectedWordsForRequestedPages(requestedPages);

  if (!hasSceneShape && !hasSceneAnchor) {
    return { ok: false, reason: "missing_screenplay_shape", counts };
  }
  if (!hasPlayableContent) {
    return { ok: false, reason: "missing_playable_content", counts };
  }
  if (counts.words < minWords) {
    return { ok: false, reason: "underfilled_page_text", counts };
  }
  const dialogueHeavyBatch = requestedPages >= 2 && counts.dialogue >= 8;
  const lowSubtextRatio = counts.dialogue > 0
    ? counts.lowSubtextDialogue / counts.dialogue
    : 0;
  if (
    dialogueHeavyBatch &&
    counts.lowSubtextDialogue >= 5 &&
    lowSubtextRatio >= 0.55 &&
    counts.specificAction < 3
  ) {
    return { ok: false, reason: "on_the_nose_dialogue", counts };
  }
  if (
    requestedPages >= 3 &&
    counts.dialogue >= 8 &&
    counts.dialogueWords >= 90 &&
    counts.specificAction < 2
  ) {
    return { ok: false, reason: "static_dialogue_batch", counts };
  }
  if (
    counts.nonEmpty >= 4
    && counts.specificAction < 1
    && counts.dialogueWords < 3
    && counts.lowSignalAction >= 2
  ) {
    return { ok: false, reason: "low_dramatic_density", counts };
  }
  if (requestedPages >= 3 && counts.sceneHeading < 1 && !hasSceneAnchor) {
    return { ok: false, reason: "missing_batch_scene_anchor", counts };
  }
  const featureObligation = evaluateFeatureActObligationCoverage({
    text: normalizedText,
    counts,
    featureContext,
  });
  if (!featureObligation.ok) {
    return {
      ok: false,
      reason: featureObligation.reason,
      counts,
      featureObligation,
    };
  }

  return {
    ok: true,
    reason: "ok",
    counts,
    featureObligation: featureObligation.reason === "not_feature_act" ? null : featureObligation,
  };
}

export {
  evaluateScreenplayPageQuality,
  evaluateFeatureActObligationCoverage,
  isLikelyOutlineOrCraftArtifactLine,
  isLikelyPlaceholderScreenplayLine,
  isLowSignalActionLine,
  isLowSubtextDialogueLine,
  minimumExpectedWordsForRequestedPages,
  summarizeLineCounts,
};
