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

const CHARACTER_ARC_TOKEN_STOPWORDS = Object.freeze(new Set([
  ...QUALITY_TOKEN_STOPWORDS,
  "arc",
  "belief",
  "believe",
  "believes",
  "character",
  "false",
  "learn",
  "learns",
  "must",
  "need",
  "needs",
  "protagonist",
  "realize",
  "realizes",
  "turn",
  "want",
  "wants",
]));

const CHARACTER_ARC_MEMORY_VALUE_FIELDS = Object.freeze([
  "want",
  "need",
  "wound",
  "falseBelief",
  "relationshipPressure",
  "currentTactic",
  "nextEmotionalTurn",
]);
const MOMENTUM_RESCUE_TRIGGER_PATTERNS = Object.freeze([
  /\b(stuck|blocked|writer'?s block|writers block|creative block|out of ideas|need ideas|lost)\b/i,
  /\b(what happens next|what should happen next|next beat|next scene|where do i go|where to go)\b/i,
  /\b(story|scene|act|middle|second act)\b.{0,80}\b(slow|slowed|dragging|drags|sag|static|boring|flat|spinning)\b/i,
  /\b(help me get unstuck|help me find the next beat|find the next beat|need a better next move)\b/i,
]);
const MOMENTUM_PRESSURE_PATTERNS = Object.freeze([
  /\bwant\b/i,
  /\bobstacle\b/i,
  /\bopposition\b/i,
  /\bconsequence\b/i,
  /\bcost\b/i,
  /\bstakes?\b/i,
  /\btactic\b/i,
  /\breversal\b/i,
  /\breveal|revelation\b/i,
  /\bdeadline\b/i,
  /\bsecret\b/i,
  /\bchoice\b/i,
  /\bpayoff\b/i,
  /\bturn\b/i,
  /\bpressure\b/i,
]);
const MOMENTUM_PLAYABLE_VERB_PATTERN = /\b(grabs?|takes?|hides?|burns?|opens?|locks?|throws?|slides?|chooses?|refuses?|calls?|reveals?|turns?|walks?|hands?|pockets?|pulls?|sets?|breaks?|steals?|confesses?|records?|signs?|tears?|crosses?|blocks?|drops?|folds?|plants?|watches?|shows?|pushes?|cuts?|leaves?|enters?|exits?|finds?)\b/i;
const MOMENTUM_GENERIC_ADVICE_PATTERNS = Object.freeze([
  /\b(?:raise|add|increase) (?:the )?stakes\b/i,
  /\b(?:add|create) (?:more )?conflict\b/i,
  /\btrust (?:your|the) instinct\b/i,
  /\bjust keep writing\b/i,
  /\bbrainstorm\b/i,
  /\bwhat if\b/i,
  /\btry (?:making|adding|having)\b/i,
]);
const SCENE_TURN_ACTION_PATTERN = /\b(?:blocks?|burns?|breaks?|changes?|chooses?|confesses?|corners?|crosses?|cuts?|discovers?|drops?|exposes?|finds?|folds?|forces?|grabs?|hands?|hides?|locks?|opens?|palms?|pockets?|plants?|pulls?|pushes?|records?|refuses?|replaces?|reveals?|rewinds?|rattles?|signs?|slides?|slips?|steals?|tears?|threads?|turns?|unlocks?|writes?|yanks?)\b/i;
const DIALOGUE_TACTIC_PATTERN = /\b(?:before|choice|choose|cost|deal|door|except|force|give|hide|if|listen|look|not until|not unless|open|or|proof|read|refuse|sign|show|stop|take|tell|trap|unless|until|watch)\b/i;
const DIALOGUE_REVERSAL_PATTERN = /^(?:no|not\b|not if|not unless|not until|but|then|except|unless|good|wrong|you said|you told|that is not|that's not|if you|if i)\b/i;
const DIALOGUE_GENERIC_START_STOPWORDS = Object.freeze(new Set([
  "about",
  "again",
  "because",
  "before",
  "going",
  "have",
  "just",
  "know",
  "like",
  "mean",
  "need",
  "really",
  "that",
  "then",
  "there",
  "this",
  "want",
  "what",
  "when",
  "where",
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

function isSummaryLikeActionLine(line = "", element = "action") {
  if (normalizeElement(element) !== "action") return false;
  const lower = canonicalLowerLine(line);
  if (!lower || isLikelyPlaceholderScreenplayLine(lower, element)) return false;

  return [
    /^(?:over|across|through) (?:the )?(?:next|following) (?:few |several )?(?:pages|scenes|beats|moments)\b/,
    /^(?:the )?(?:scene|sequence|page|pages|next scene|next pages) (?:shows?|follows?|tracks?|covers?|moves?|builds?|escalates?|reveals?|ends?)\b/,
    /^(?:a )?(?:series|montage) of (?:shots|moments|beats|scenes)\b/,
    /^(?:we|the audience) (?:see|watch|follow|learn|realize|discover)\b/,
    /^(?:mara|june|he|she|they|the protagonist) (?:realizes?|learns?|discovers?|understands?|decides?|confronts?|tries?|starts?|begins?|continues?)\b.{0,140}\b(?:as|while|before|after|until|and then)\b/,
    /\b(?:this|that) (?:sets up|pays off|shows us|reveals that|establishes that)\b/,
  ].some((pattern) => pattern.test(lower));
}

function isWeakOpeningActionLine(line = "", element = "action") {
  if (normalizeElement(element) !== "action") return false;
  const lower = canonicalLowerLine(line);
  if (!lower) return false;
  if (isLowSignalActionLine(line, element) || isSummaryLikeActionLine(line, element)) return true;
  return [
    /^the (?:scene|page|moment|sequence) (?:opens|begins|starts)\b/,
    /^(?:we|the audience) (?:see|watch|follow|find)\b/,
    /^(?:the )?camera (?:finds|pushes|moves|drifts|glides|tracks)\b/,
    /^(?:it is|it's|the room is|the space is|the air is|everything is) (?:quiet|silent|tense|dark|moody|still|heavy|awkward|charged)\b/,
    /^a (?:quiet|silent|tense|dark|moody|lonely|beautiful|empty) (?:room|street|hallway|office|apartment|house|night|morning|space)\b/,
  ].some((pattern) => pattern.test(lower));
}

function firstPageOpeningQuality(lines = []) {
  for (const line of Array.isArray(lines) ? lines : []) {
    const text = normalizeLineText(line?.text ?? line);
    if (!text) continue;
    const element = normalizeElement(line?.element);
    if (["blank", "sceneHeading", "transition"].includes(element)) continue;
    if (element === "action" && isWeakOpeningActionLine(text, element)) {
      return { ok: false, reason: "weak_first_page_opening", text };
    }
    return { ok: true, reason: "ok", text, element };
  }
  return { ok: true, reason: "empty" };
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

function isDialogueTacticLine(line = "", element = "dialogue") {
  if (normalizeElement(element) !== "dialogue") return false;
  const lower = canonicalLowerLine(line);
  if (!lower) return false;
  return DIALOGUE_TACTIC_PATTERN.test(lower) || DIALOGUE_REVERSAL_PATTERN.test(lower);
}

function isDialogueReversalLine(line = "", element = "dialogue") {
  if (normalizeElement(element) !== "dialogue") return false;
  const lower = canonicalLowerLine(line);
  return Boolean(lower && DIALOGUE_REVERSAL_PATTERN.test(lower));
}

function isExpositoryDialogueLine(line = "", element = "dialogue") {
  if (normalizeElement(element) !== "dialogue") return false;
  const lower = canonicalLowerLine(line);
  if (!lower) return false;
  return [
    /\bas you know\b/,
    /\blet me explain\b/,
    /\bthe reason (?:is|was)\b/,
    /\bwhat happened (?:is|was)\b/,
    /\bremember when\b/,
    /\bback then\b/,
    /\bwhen we were\b/,
    /\bi am telling you this because\b/,
    /\bthis is important because\b/,
    /\bso the audience\b/,
  ].some((pattern) => pattern.test(lower));
}

function isGenericDialogueVoiceLine(line = "", element = "dialogue") {
  if (normalizeElement(element) !== "dialogue") return false;
  const lower = canonicalLowerLine(line);
  if (!lower) return false;
  if (isLowSubtextDialogueLine(line, element)) return true;
  return [
    /^what do you mean\??$/,
    /^i (?:do not|don't) understand$/,
    /^that (?:does not|doesn't) make sense$/,
    /^we have to do something$/,
    /^this changes everything$/,
    /^everything is different now$/,
    /^are you okay\??$/,
    /^i(?: am|'m) sorry$/,
    /^okay$/,
  ].some((pattern) => pattern.test(lower));
}

function dialogueStartKey(line = "") {
  const tokens = canonicalLowerLine(line).match(/[a-z0-9'][a-z0-9'-]*/g);
  if (!Array.isArray(tokens)) return "";
  const meaningful = tokens.filter((token) => {
    const clean = token.replace(/^'+|'+$/g, "");
    return clean.length >= 3 && !DIALOGUE_GENERIC_START_STOPWORDS.has(clean);
  });
  return meaningful.length >= 2 ? meaningful.slice(0, 2).join(" ") : "";
}

function isPlayableActionLine(line = "", element = "action") {
  if (normalizeElement(element) !== "action") return false;
  const text = normalizeLineText(line);
  if (!text || isLikelyOutlineOrCraftArtifactLine(text, element)) return false;
  if (countWords(text) < 3) return false;
  return /[A-Za-z]/.test(text);
}

function isSceneTurnActionLine(line = "", element = "action") {
  if (!isPlayableActionLine(line, element)) return false;
  if (isLowSignalActionLine(line, element) || isSummaryLikeActionLine(line, element)) return false;
  const text = normalizeLineText(line);
  if (countWords(text) < 5) return false;
  return SCENE_TURN_ACTION_PATTERN.test(text);
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
    summaryLikeAction: 0,
    specificAction: 0,
    turnEventAction: 0,
    dialogueTacticSignal: 0,
    dialogueReversalSignal: 0,
    expositoryDialogue: 0,
    genericDialogueVoice: 0,
    repeatedDialogueStart: 0,
    distinctDialogueCharacters: 0,
    dialogueWords: 0,
    distinctCharacters: 0,
    maxDialogueRun: 0,
    words: 0,
  };
  const characterNames = new Set();
  const dialogueCharacterNames = new Set();
  const dialogueStartCounts = new Map();
  let dialogueRun = 0;
  let currentCharacter = "";

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
      currentCharacter = canonicalLowerLine(text);
      characterNames.add(currentCharacter);
    }
    else if (element === "dialogue") counts.dialogue += 1;
    else if (element === "parenthetical") counts.parenthetical += 1;
    else if (element === "transition") counts.transition += 1;
    if (!["character", "dialogue", "parenthetical"].includes(element)) {
      currentCharacter = "";
    }
    if (isDialogueProtectedElement(element)) {
      dialogueRun += 1;
      counts.maxDialogueRun = Math.max(counts.maxDialogueRun, dialogueRun);
    } else {
      dialogueRun = 0;
    }
    if (isPlayableActionLine(text, element)) counts.playableAction += 1;
    if (isLikelyOutlineOrCraftArtifactLine(text, element)) counts.artifact += 1;
    if (isLikelyPlaceholderScreenplayLine(text, element)) counts.placeholder += 1;
    if (element === "dialogue") {
      counts.dialogueWords += countWords(text);
      if (currentCharacter) dialogueCharacterNames.add(currentCharacter);
      if (isDialogueTacticLine(text, element)) counts.dialogueTacticSignal += 1;
      if (isDialogueReversalLine(text, element)) counts.dialogueReversalSignal += 1;
      if (isExpositoryDialogueLine(text, element)) counts.expositoryDialogue += 1;
      if (isGenericDialogueVoiceLine(text, element)) counts.genericDialogueVoice += 1;
      const startKey = dialogueStartKey(text);
      if (startKey) dialogueStartCounts.set(startKey, (dialogueStartCounts.get(startKey) || 0) + 1);
    }
    if (isLowSignalActionLine(text, element)) counts.lowSignalAction += 1;
    if (isLowSubtextDialogueLine(text, element)) counts.lowSubtextDialogue += 1;
    if (isSummaryLikeActionLine(text, element)) counts.summaryLikeAction += 1;
    if (
      isPlayableActionLine(text, element) &&
      !isLowSignalActionLine(text, element) &&
      !isSummaryLikeActionLine(text, element)
    ) {
      counts.specificAction += 1;
    }
    if (isSceneTurnActionLine(text, element)) counts.turnEventAction += 1;
  }

  counts.distinctCharacters = characterNames.size;
  counts.distinctDialogueCharacters = dialogueCharacterNames.size;
  counts.repeatedDialogueStart = [...dialogueStartCounts.values()]
    .reduce((total, count) => total + (count >= 3 ? count - 1 : 0), 0);
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

function minimumSceneTurnsForRequestedPages(requestedPages = 0) {
  const pages = Math.max(0, Math.min(30, Math.round(Number(requestedPages || 0))));
  if (pages < 3) return 0;
  return Math.min(5, Math.max(2, Math.ceil(pages / 2)));
}

function parseCharacterArcMemoryObject(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = parseCharacterArcMemoryObject(item);
      if (parsed) return parsed;
    }
    return null;
  }
  if (typeof value === "object") {
    if (value.bible?.arc && typeof value.bible.arc === "object") {
      return {
        character: value.character ?? value.characterName ?? value.character_name ?? value.name ?? "",
        ...value.bible.arc,
      };
    }
    if (value.arc && typeof value.arc === "object") {
      return {
        character: value.character ?? value.characterName ?? value.character_name ?? value.name ?? "",
        ...value.arc,
      };
    }
    return value;
  }

  const raw = normalizeLineText(value);
  if (!raw) return null;
  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      return parseCharacterArcMemoryObject(JSON.parse(raw));
    } catch (_err) {
      // Fall through to key/value parsing.
    }
  }

  const parsed = {};
  for (const part of raw.split(/\r?\n|;/)) {
    const match = part.match(/^\s*([A-Za-z][A-Za-z0-9_\-\s]{1,40})\s*:\s*(.+?)\s*$/);
    if (!match) continue;
    const key = match[1]
      .trim()
      .replace(/[-\s]+([a-zA-Z0-9])/g, (_all, ch) => ch.toUpperCase())
      .replace(/^([A-Z])/, (_all, ch) => ch.toLowerCase());
    parsed[key] = match[2].trim();
  }
  return Object.keys(parsed).length ? parsed : null;
}

function characterArcMemoryField(source = null, featureContext = null, keys = [], maxChars = 180) {
  for (const key of keys) {
    const clean = normalizeLineText(source?.[key] ?? featureContext?.[key] ?? "").slice(0, maxChars);
    if (clean) return clean;
  }
  return "";
}

function normalizeCharacterArcMemory(featureContext = null) {
  if (!featureContext || typeof featureContext !== "object") return null;
  const source = parseCharacterArcMemoryObject(
    featureContext.characterArcMemory ??
    featureContext.character_arc_memory ??
    featureContext.screenplayCharacterArcMemory ??
    featureContext.screenplay_character_arc_memory
  );
  const memory = {
    character: characterArcMemoryField(source, featureContext, [
      "character",
      "characterName",
      "character_name",
      "name",
      "protagonist",
    ], 80),
    act: characterArcMemoryField(source, featureContext, ["act", "currentAct", "current_act"], 80),
    want: characterArcMemoryField(source, featureContext, [
      "want",
      "externalWant",
      "external_want",
      "characterArcWant",
      "character_arc_want",
      "screenplayCharacterArcWant",
      "screenplay_character_arc_want",
    ]),
    need: characterArcMemoryField(source, featureContext, [
      "need",
      "innerNeed",
      "inner_need",
      "characterArcNeed",
      "character_arc_need",
      "screenplayCharacterArcNeed",
      "screenplay_character_arc_need",
    ]),
    wound: characterArcMemoryField(source, featureContext, [
      "wound",
      "ghost",
      "trauma",
      "characterArcWound",
      "character_arc_wound",
      "screenplayCharacterArcWound",
      "screenplay_character_arc_wound",
    ]),
    falseBelief: characterArcMemoryField(source, featureContext, [
      "falseBelief",
      "false_belief",
      "lie",
      "misbelief",
      "characterArcFalseBelief",
      "character_arc_false_belief",
      "screenplayCharacterArcFalseBelief",
      "screenplay_character_arc_false_belief",
    ]),
    relationshipPressure: characterArcMemoryField(source, featureContext, [
      "relationshipPressure",
      "relationship_pressure",
      "relationalPressure",
      "relational_pressure",
      "characterArcRelationshipPressure",
      "character_arc_relationship_pressure",
      "screenplayCharacterArcRelationshipPressure",
      "screenplay_character_arc_relationship_pressure",
    ]),
    currentTactic: characterArcMemoryField(source, featureContext, [
      "currentTactic",
      "current_tactic",
      "tactic",
      "characterArcCurrentTactic",
      "character_arc_current_tactic",
      "screenplayCharacterArcCurrentTactic",
      "screenplay_character_arc_current_tactic",
    ]),
    nextEmotionalTurn: characterArcMemoryField(source, featureContext, [
      "nextEmotionalTurn",
      "next_emotional_turn",
      "emotionalTurn",
      "emotional_turn",
      "nextTurn",
      "next_turn",
      "characterArcNextEmotionalTurn",
      "character_arc_next_emotional_turn",
      "screenplayCharacterArcNextEmotionalTurn",
      "screenplay_character_arc_next_emotional_turn",
    ]),
  };

  const meaningfulFieldCount = CHARACTER_ARC_MEMORY_VALUE_FIELDS
    .filter((field) => characterArcTokenSet(memory[field]).size > 0)
    .length;
  return meaningfulFieldCount > 0
    ? { ...memory, meaningfulFieldCount }
    : null;
}

function characterArcTokenSet(value = "", ignoreTokens = new Set()) {
  const tokens = qualityTokenSet(value);
  const out = new Set();
  for (const token of tokens) {
    if (CHARACTER_ARC_TOKEN_STOPWORDS.has(token)) continue;
    if (ignoreTokens.has(token)) continue;
    out.add(token);
  }
  return out;
}

function characterArcTokensFromPhrases(phrases = [], ignoreTokens = new Set()) {
  const out = new Set();
  for (const phrase of phrases) {
    for (const token of characterArcTokenSet(phrase, ignoreTokens)) out.add(token);
  }
  return out;
}

function evaluateCharacterArcMemoryCoverage({
  text = "",
  featureContext = null,
} = {}) {
  const memory = normalizeCharacterArcMemory(featureContext);
  if (!memory) return { ok: true, reason: "no_character_arc_memory" };
  const identityTokens = characterArcTokenSet(memory.character);
  const objectiveTokens = characterArcTokensFromPhrases([
    memory.want,
    memory.currentTactic,
    memory.relationshipPressure,
  ], identityTokens);
  const transformationTokens = characterArcTokensFromPhrases([
    memory.need,
    memory.falseBelief,
    memory.nextEmotionalTurn,
  ], identityTokens);
  const woundTokens = characterArcTokensFromPhrases([memory.wound], identityTokens);
  const obligationTokens = new Set([
    ...objectiveTokens,
    ...transformationTokens,
    ...woundTokens,
  ]);

  if (memory.meaningfulFieldCount < 2 || obligationTokens.size < 2) {
    return {
      ok: true,
      reason: "insufficient_character_arc_memory",
      featureActKind: "character_arc",
      obligationTokenCount: obligationTokens.size,
    };
  }

  const textTokens = characterArcTokenSet(text, identityTokens);
  const matchedTokens = [...obligationTokens].filter((token) => textTokens.has(token));
  const matchedObjectiveTokens = [...objectiveTokens].filter((token) => textTokens.has(token));
  const matchedTransformationTokens = [...transformationTokens].filter((token) => textTokens.has(token));
  const minimumMatches = Math.min(3, Math.max(2, obligationTokens.size > 0 ? 2 : 0));
  const missingObjective = objectiveTokens.size > 0 && matchedObjectiveTokens.length < 1;
  const missingTransformation = transformationTokens.size > 0 && matchedTransformationTokens.length < 1;

  if (matchedTokens.length < minimumMatches || missingObjective || missingTransformation) {
    return {
      ok: false,
      reason: "missing_character_arc_memory",
      featureActKind: "character_arc",
      matchedTokens,
      matchedObjectiveTokens,
      matchedTransformationTokens,
      obligationTokenCount: obligationTokens.size,
      minimumMatches,
      missingObjective,
      missingTransformation,
    };
  }

  return {
    ok: true,
    reason: "ok",
    featureActKind: "character_arc",
    matchedTokens,
    matchedObjectiveTokens,
    matchedTransformationTokens,
    obligationTokenCount: obligationTokens.size,
    minimumMatches,
  };
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

  const characterArcPressure = normalizeLineText(
    featureContext?.characterArcState ?? featureContext?.character_arc_state
  );
  const characterArcTokens = qualityTokenSet(characterArcPressure);
  if (characterArcTokens.size > 0) {
    const matchedCharacterArcTokens = [...characterArcTokens].filter((token) => textTokens.has(token));
    const minimumCharacterArcMatches = Math.min(2, characterArcTokens.size);
    if (matchedCharacterArcTokens.length < minimumCharacterArcMatches) {
      return {
        ok: false,
        reason: "missing_character_arc_pressure",
        featureActKind,
        matchedTokens,
        matchedCharacterArcTokens,
        characterArcTokenCount: characterArcTokens.size,
        minimumCharacterArcMatches,
        obligationTokenCount: obligationTokens.size,
        minimumMatches,
      };
    }
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

function firstNextTurnTokens(featureContext = null) {
  if (!featureContext || typeof featureContext !== "object") return new Set();
  const turns = sanitizeQualityList(
    featureContext?.nextThreeTurns ?? featureContext?.next_three_turns,
    1,
    200
  );
  if (!turns.length) return new Set();
  return qualityTokenSet(turns[0]);
}

function evaluateFirstNextTurnCoverage({ text = "", featureContext = null } = {}) {
  const tokens = firstNextTurnTokens(featureContext);
  if (!tokens.size) return { ok: true, reason: "no_next_turn" };
  const textTokens = qualityTokenSet(text);
  const matchedTokens = [...tokens].filter((token) => textTokens.has(token));
  const minimumMatches = Math.min(2, tokens.size);
  if (matchedTokens.length < minimumMatches) {
    return {
      ok: false,
      reason: "missing_next_turn_continuation",
      matchedTokens,
      nextTurnTokenCount: tokens.size,
      minimumMatches,
    };
  }
  return {
    ok: true,
    reason: "ok",
    matchedTokens,
    nextTurnTokenCount: tokens.size,
    minimumMatches,
  };
}

function cleanBriefScalar(value = "", maxChars = 220) {
  if (Array.isArray(value)) return sanitizeQualityList(value, 1, maxChars)[0] || "";
  if (value && typeof value === "object") return "";
  return normalizeLineText(value).slice(0, Math.max(1, Number(maxChars || 220)));
}

function firstBriefValue(values = [], maxChars = 220) {
  for (const value of values) {
    const clean = cleanBriefScalar(value, maxChars);
    if (clean) return clean;
  }
  return "";
}

function directBriefSource(featureContext = null) {
  const source = featureContext?.nextSceneExecutionBrief ?? featureContext?.next_scene_execution_brief;
  return source && typeof source === "object" && !Array.isArray(source) ? source : {};
}

function nextSceneExecutionBriefValues(featureContext = null) {
  if (!featureContext || typeof featureContext !== "object") return null;
  const brief = directBriefSource(featureContext);
  const nextSceneMoves = sanitizeQualityList(
    featureContext?.nextSceneMoves ?? featureContext?.next_scene_moves,
    5,
    180
  );
  const nextThreeTurns = sanitizeQualityList(
    featureContext?.nextThreeTurns ?? featureContext?.next_three_turns,
    3,
    180
  );
  const unresolvedStoryThreads = sanitizeQualityList(
    featureContext?.unresolvedStoryThreads ?? featureContext?.unresolved_story_threads,
    4,
    220
  );
  const unresolvedSetups = sanitizeQualityList(
    featureContext?.unresolvedSetups ?? featureContext?.unresolved_setups,
    4,
    200
  );
  const actThreePayoffPath = sanitizeQualityList(
    featureContext?.actThreePayoffPath ??
    featureContext?.act_three_payoff_path ??
    featureContext?.payoffPath ??
    featureContext?.payoff_path,
    4,
    200
  );
  const characterArcTurns = sanitizeQualityList(
    featureContext?.characterArcTurns ?? featureContext?.character_arc_turns,
    4,
    180
  );
  const imageMotifs = sanitizeQualityList(
    featureContext?.imageMotifs ??
    featureContext?.image_motifs ??
    featureContext?.visualMotifs ??
    featureContext?.visual_motifs,
    4,
    140
  );

  return {
    assignment: firstBriefValue([
      brief.assignment,
      brief.sceneAssignment,
      brief.scene_assignment,
      brief.nextSceneAssignment,
      brief.next_scene_assignment,
      featureContext?.sceneAssignment,
      featureContext?.scene_assignment,
      featureContext?.nextSceneAssignment,
      featureContext?.next_scene_assignment,
      nextSceneMoves[0],
      nextThreeTurns[0],
      featureContext?.nextScenePlan,
      featureContext?.next_scene_plan,
      featureContext?.sceneObjective,
      featureContext?.scene_objective,
      featureContext?.currentBeat,
      featureContext?.current_beat,
    ], 240),
    obstacle: firstBriefValue([
      brief.obstacle,
      brief.obstacleToPressurize,
      brief.obstacle_to_pressurize,
      featureContext?.obstacleToPressurize,
      featureContext?.obstacle_to_pressurize,
      unresolvedStoryThreads[0],
      unresolvedSetups[0],
      featureContext?.featureObligation,
      featureContext?.feature_obligation,
    ], 220),
    arc: firstBriefValue([
      brief.arc,
      brief.changedBehaviorDue,
      brief.changed_behavior_due,
      featureContext?.changedBehaviorDue,
      featureContext?.changed_behavior_due,
      characterArcTurns[0],
      featureContext?.characterArcState,
      featureContext?.character_arc_state,
    ], 220),
    payoff: firstBriefValue([
      brief.payoff,
      brief.payoffOrSetupToSpend,
      brief.payoff_or_setup_to_spend,
      featureContext?.payoffOrSetupToSpend,
      featureContext?.payoff_or_setup_to_spend,
      actThreePayoffPath[0],
      unresolvedSetups[0],
    ], 220),
    image: firstBriefValue([
      brief.image,
      brief.imageToStage,
      brief.image_to_stage,
      featureContext?.imageToStage,
      featureContext?.image_to_stage,
      imageMotifs[0],
      featureContext?.endingImage,
      featureContext?.ending_image,
      featureContext?.finalImage,
      featureContext?.final_image,
    ], 180),
    exit: firstBriefValue([
      brief.exit,
      brief.exitHandoff,
      brief.exit_handoff,
      featureContext?.exitHandoff,
      featureContext?.exit_handoff,
      nextSceneMoves[1],
      nextThreeTurns[1],
    ], 220),
  };
}

function hasExplicitNextSceneExecutionBrief(featureContext = null) {
  if (!featureContext || typeof featureContext !== "object") return false;
  if (Object.keys(directBriefSource(featureContext)).length > 0) return true;
  return [
    "sceneAssignment",
    "scene_assignment",
    "nextSceneAssignment",
    "next_scene_assignment",
    "obstacleToPressurize",
    "obstacle_to_pressurize",
    "changedBehaviorDue",
    "changed_behavior_due",
    "payoffOrSetupToSpend",
    "payoff_or_setup_to_spend",
    "imageToStage",
    "image_to_stage",
    "exitHandoff",
    "exit_handoff",
  ].some((key) => cleanBriefScalar(featureContext?.[key], 220));
}

function executionBriefFieldCoverage({ name = "", phrase = "", textTokens = new Set(), minimumMatches = 1 } = {}) {
  const tokens = [...qualityTokenSet(phrase)];
  const matchedTokens = tokens.filter((token) => textTokens.has(token));
  const requiredMatches = Math.min(Math.max(0, Number(minimumMatches || 0)), tokens.length);
  return {
    name,
    phrase,
    tokens,
    matchedTokens,
    tokenCount: tokens.length,
    minimumMatches: requiredMatches,
    ok: tokens.length < 1 || matchedTokens.length >= requiredMatches,
  };
}

function executionBriefSupportMinimum(phrase = "") {
  const tokenCount = qualityTokenSet(phrase).size;
  if (tokenCount < 1) return 0;
  return tokenCount >= 4 ? 2 : 1;
}

function evaluateNextSceneExecutionBriefCoverage({ text = "", featureContext = null } = {}) {
  const values = nextSceneExecutionBriefValues(featureContext);
  if (!values) return { ok: true, reason: "no_execution_brief" };
  const textTokens = qualityTokenSet(text);
  const assignment = executionBriefFieldCoverage({
    name: "assignment",
    phrase: values.assignment,
    textTokens,
    minimumMatches: 2,
  });
  const supportFields = [
    executionBriefFieldCoverage({ name: "obstacle", phrase: values.obstacle, textTokens, minimumMatches: executionBriefSupportMinimum(values.obstacle) }),
    executionBriefFieldCoverage({ name: "arc", phrase: values.arc, textTokens, minimumMatches: executionBriefSupportMinimum(values.arc) }),
    executionBriefFieldCoverage({ name: "payoff", phrase: values.payoff, textTokens, minimumMatches: executionBriefSupportMinimum(values.payoff) }),
    executionBriefFieldCoverage({ name: "image", phrase: values.image, textTokens, minimumMatches: executionBriefSupportMinimum(values.image) }),
    executionBriefFieldCoverage({ name: "exit", phrase: values.exit, textTokens, minimumMatches: executionBriefSupportMinimum(values.exit) }),
  ].filter((field) => field.tokenCount > 0);
  const enforceBrief = hasExplicitNextSceneExecutionBrief(featureContext) || supportFields.length >= 3;
  if (!enforceBrief) {
    return {
      ok: true,
      reason: "insufficient_execution_brief",
      assignment,
      supportFields,
    };
  }
  if (assignment.tokenCount > 0 && !assignment.ok) {
    return {
      ok: false,
      reason: "missing_next_scene_assignment",
      assignment,
      supportFields,
    };
  }

  const matchedSupportFields = supportFields.filter((field) => field.ok);
  const minimumSupportFields = Math.min(3, supportFields.length);
  if (matchedSupportFields.length < minimumSupportFields) {
    return {
      ok: false,
      reason: "missing_next_scene_execution_brief",
      assignment,
      supportFields,
      matchedSupportFieldNames: matchedSupportFields.map((field) => field.name),
      minimumSupportFields,
    };
  }

  return {
    ok: true,
    reason: "ok",
    assignment,
    supportFields,
    matchedSupportFieldNames: matchedSupportFields.map((field) => field.name),
    minimumSupportFields,
  };
}

function isMomentumRescueTurn({ transcript = "", studioMeta = null } = {}) {
  const source = [
    transcript,
    studioMeta?.screenplayTaskHint,
    studioMeta?.screenplay_task_hint,
    studioMeta?.screenplayPromptSource,
    studioMeta?.screenplay_prompt_source,
  ].map((value) => normalizeLineText(value)).filter(Boolean).join(" ");
  if (!source) return false;
  return MOMENTUM_RESCUE_TRIGGER_PATTERNS.some((pattern) => pattern.test(source));
}

function countMomentumPressureSignals(text = "") {
  return MOMENTUM_PRESSURE_PATTERNS
    .filter((pattern) => pattern.test(text))
    .length;
}

function countGenericMomentumAdviceSignals(text = "") {
  return MOMENTUM_GENERIC_ADVICE_PATTERNS
    .filter((pattern) => pattern.test(text))
    .length;
}

function hasMomentumFountainShape(text = "") {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.some((line) => /^(INT|EXT|EST|INT\/EXT|I\/E)\.?(?:\s|$)/i.test(line))) return true;
  for (let index = 0; index < lines.length - 1; index += 1) {
    const current = lines[index];
    const next = lines[index + 1];
    if (
      current.length <= 42 &&
      current === current.toUpperCase() &&
      /[A-Z]/.test(current) &&
      !/[.!?]$/.test(current) &&
      next.length >= 2
    ) {
      return true;
    }
  }
  return false;
}

function countPlayableMomentumMoves(text = "") {
  const lines = String(text || "")
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((line) => normalizeLineText(line))
    .filter(Boolean);
  let count = 0;
  for (const line of lines) {
    const lower = canonicalLowerLine(line);
    if (!lower) continue;
    if (isLikelyOutlineOrCraftArtifactLine(line, "action")) continue;
    if (isLowSignalActionLine(line, "action")) continue;
    if (isSummaryLikeActionLine(line, "action")) continue;
    if (!MOMENTUM_PLAYABLE_VERB_PATTERN.test(line)) continue;
    if (countWords(line) < 5) continue;
    count += 1;
  }
  return count;
}

function buildMomentumRescueRepairDirectives(reason = "") {
  const base = [
    "Name the likely story problem as a craft issue: want, obstacle, tactic, consequence, pressure, or exit turn.",
    "Give one strongest next beat before offering alternatives.",
    "Include a tiny playable micro-beat in Fountain style when scene context exists.",
  ];
  switch (reason) {
    case "missing_pressure_engine":
      return [
        "Choose a pressure engine: reversal, revelation, deadline, impossible choice, secret exposure, relationship cost, antagonist move, object payoff, or image transformation.",
        ...base.slice(1),
      ];
    case "missing_decisive_next_beat":
      return [
        "Replace the option menu with one decisive next beat that changes story state.",
        base[0],
        base[2],
      ];
    case "missing_playable_micro_beat":
      return [
        "Convert the advice into visible page behavior: action, tactical dialogue, a changed power dynamic, and an exit image.",
        ...base.slice(0, 2),
      ];
    case "missing_next_turn_continuation":
      return [
        "Use the first remembered next turn as the immediate story engine before inventing a new plot lane.",
        "Make the remembered turn visible through action, tactical dialogue, cost, or an exit image.",
        base[2],
      ];
    case "missing_next_scene_execution_brief":
      return [
        "Dramatize the supplied next-scene brief lanes: assignment, obstacle, character change, payoff/setup, visual motif, or exit handoff.",
        "Use the concrete nouns from the remembered story state; do not replace them with generic pressure.",
        base[2],
      ];
    case "vague_option_menu":
      return [
        "Lead with the single strongest move; include at most two alternate forks after it.",
        "Make each fork playable as a decision, reveal, cost, or image.",
      ];
    case "generic_encouragement_only":
      return [
        "Do not answer with encouragement alone; diagnose the story blockage and move the scene forward.",
        ...base.slice(1),
      ];
    default:
      return base;
  }
}

function momentumFeatureContextFromStudioMeta(studioMeta = null) {
  if (!studioMeta || typeof studioMeta !== "object") return null;
  return {
    act: studioMeta.screenplayAct ?? studioMeta.screenplay_act,
    featureSequence: studioMeta.screenplayFeatureSequence ?? studioMeta.screenplay_feature_sequence,
    featureObligation: studioMeta.screenplayFeatureObligation ?? studioMeta.screenplay_feature_obligation,
    actPressureState: studioMeta.screenplayActPressureState ?? studioMeta.screenplay_act_pressure_state,
    characterArcState: studioMeta.screenplayCharacterArcState ?? studioMeta.screenplay_character_arc_state,
    currentBeat: studioMeta.screenplayCurrentBeat ?? studioMeta.screenplay_current_beat,
    sceneObjective: studioMeta.screenplaySceneObjective ?? studioMeta.screenplay_scene_objective,
    nextScenePlan: studioMeta.screenplayNextScenePlan ?? studioMeta.screenplay_next_scene_plan,
    nextSceneMoves: studioMeta.screenplayNextSceneMoves ?? studioMeta.screenplay_next_scene_moves,
    nextThreeTurns: studioMeta.screenplayNextThreeTurns ?? studioMeta.screenplay_next_three_turns,
    nextSceneExecutionBrief: studioMeta.screenplayNextSceneExecutionBrief ?? studioMeta.screenplay_next_scene_execution_brief,
    unresolvedSetups: studioMeta.screenplayUnresolvedSetups ?? studioMeta.screenplay_unresolved_setups,
    unresolvedStoryThreads: studioMeta.screenplayUnresolvedStoryThreads ?? studioMeta.screenplay_unresolved_story_threads,
    actThreePayoffPath: studioMeta.screenplayActThreePayoffPath ?? studioMeta.screenplay_act_three_payoff_path,
    characterArcTurns: studioMeta.screenplayCharacterArcTurns ?? studioMeta.screenplay_character_arc_turns,
    imageMotifs: studioMeta.screenplayImageMotifs ?? studioMeta.screenplay_image_motifs,
  };
}

function evaluateMomentumRescueQuality({
  reply = "",
  transcript = "",
  studioMeta = null,
} = {}) {
  const applicable = isMomentumRescueTurn({ transcript, studioMeta });
  if (!applicable) {
    return { applicable: false, ok: true, reason: "not_momentum_rescue" };
  }

  const normalized = normalizeLineText(reply);
  if (!normalized) {
    return {
      applicable: true,
      ok: false,
      reason: "empty_momentum_rescue",
      repairDirectives: buildMomentumRescueRepairDirectives("empty_momentum_rescue"),
      counts: {
        words: 0,
        pressureSignals: 0,
        playableMoves: 0,
        genericAdviceSignals: 0,
      },
    };
  }

  const pressureSignals = countMomentumPressureSignals(normalized);
  const playableMoves = countPlayableMomentumMoves(reply);
  const hasFountainShape = hasMomentumFountainShape(reply);
  const genericAdviceSignals = countGenericMomentumAdviceSignals(normalized);
  const words = countWords(normalized);
  const optionMenuCount = (normalized.match(/\b(?:option|idea|path|fork)\s*(?:\d+|one|two|three|[a-c])\b/gi) || []).length;
  const hasDecisiveLanguage = /\b(?:strongest|best|next beat|next move|the move|do this|make|force|put|have|let|the beat is|the scene turns when)\b/i.test(normalized);
  const hasPlayableMicroBeat = hasFountainShape || playableMoves > 0;
  const featureContext = momentumFeatureContextFromStudioMeta(studioMeta);
  const nextTurnCoverage = evaluateFirstNextTurnCoverage({
    text: normalized,
    featureContext,
  });
  const executionBriefCoverage = evaluateNextSceneExecutionBriefCoverage({
    text: normalized,
    featureContext,
  });
  const requiresNextTurn = !nextTurnCoverage.ok && nextTurnCoverage.reason !== "no_next_turn";
  const requiresExecutionBrief = (
    !executionBriefCoverage.ok &&
    !["no_execution_brief", "insufficient_execution_brief"].includes(executionBriefCoverage.reason)
  );
  const counts = {
    words,
    pressureSignals,
    playableMoves,
    genericAdviceSignals,
    optionMenuCount,
    hasFountainShape: hasFountainShape ? 1 : 0,
    nextTurnMatchedTokens: Array.isArray(nextTurnCoverage.matchedTokens)
      ? nextTurnCoverage.matchedTokens.length
      : 0,
    nextTurnTokenCount: Math.max(0, Number(nextTurnCoverage.nextTurnTokenCount || 0)),
  };

  let reason = "";
  if (words < 12) reason = "underdeveloped_momentum_rescue";
  else if (pressureSignals < 1) reason = "missing_pressure_engine";
  else if (!hasDecisiveLanguage && playableMoves < 1) reason = "missing_decisive_next_beat";
  else if (!hasPlayableMicroBeat) reason = "missing_playable_micro_beat";
  else if (requiresNextTurn) reason = nextTurnCoverage.reason || "missing_next_turn_continuation";
  else if (requiresExecutionBrief) reason = executionBriefCoverage.reason || "missing_next_scene_execution_brief";
  else if (optionMenuCount > 2 && !/\b(?:strongest|best|lead with|start with)\b/i.test(normalized)) reason = "vague_option_menu";
  else if (genericAdviceSignals >= 2 && pressureSignals < 2 && playableMoves < 1) reason = "generic_encouragement_only";

  if (reason) {
    return {
      applicable: true,
      ok: false,
      reason,
      counts,
      repairDirectives: buildMomentumRescueRepairDirectives(reason),
      featureObligation: nextTurnCoverage.reason !== "no_next_turn"
        ? nextTurnCoverage
        : executionBriefCoverage,
    };
  }

  return {
    applicable: true,
    ok: true,
    reason: "ok",
    counts,
    repairDirectives: [],
    featureObligation: nextTurnCoverage.reason !== "no_next_turn"
      ? nextTurnCoverage
      : executionBriefCoverage,
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
  const minimumSceneTurns = minimumSceneTurnsForRequestedPages(requestedPages);

  if (!hasSceneShape && !hasSceneAnchor) {
    return { ok: false, reason: "missing_screenplay_shape", counts };
  }
  if (!hasPlayableContent) {
    return { ok: false, reason: "missing_playable_content", counts };
  }
  if (
    requestedPages >= 3 &&
    counts.summaryLikeAction >= 2
  ) {
    return {
      ok: false,
      reason: "summary_like_page_batch",
      counts,
      minimumSpecificActions: Math.min(6, Math.max(3, Math.ceil(requestedPages / 2))),
    };
  }
  const openingQuality = requestedPages >= 2 ? firstPageOpeningQuality(lines) : { ok: true };
  if (!openingQuality.ok) {
    return { ok: false, reason: openingQuality.reason, counts, openingQuality };
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
  const dialogueCraftBatch = counts.dialogue >= 6 && counts.distinctDialogueCharacters >= 2;
  if (
    dialogueCraftBatch &&
    counts.expositoryDialogue >= 2 &&
    counts.dialogueTacticSignal < 3
  ) {
    return { ok: false, reason: "expository_dialogue_dump", counts };
  }
  if (
    dialogueCraftBatch &&
    (counts.genericDialogueVoice >= 4 || counts.repeatedDialogueStart >= 3) &&
    counts.dialogueTacticSignal < 3
  ) {
    return { ok: false, reason: "interchangeable_dialogue_voice", counts };
  }
  if (
    dialogueCraftBatch &&
    counts.dialogueTacticSignal < 2 &&
    counts.turnEventAction < 2
  ) {
    return { ok: false, reason: "flat_dialogue_no_tactics", counts };
  }
  if (counts.words < minWords) {
    return { ok: false, reason: "underfilled_page_text", counts };
  }
  const minimumSpecificActionsForLongBatch = requestedPages >= 5
    ? Math.min(6, Math.max(4, Math.ceil(requestedPages / 2)))
    : 0;
  if (minimumSpecificActionsForLongBatch > 0 && counts.specificAction < minimumSpecificActionsForLongBatch) {
    return {
      ok: false,
      reason: "thin_long_page_batch",
      counts,
      minimumSpecificActions: minimumSpecificActionsForLongBatch,
    };
  }
  if (minimumSceneTurns > 0 && counts.turnEventAction < minimumSceneTurns) {
    return {
      ok: false,
      reason: "thin_scene_turn_batch",
      counts,
      minimumSceneTurns,
    };
  }
  if (
    requestedPages >= 3 &&
    counts.maxDialogueRun >= 12 &&
    counts.turnEventAction < 3
  ) {
    return {
      ok: false,
      reason: "dialogue_tactic_lock",
      counts,
      minimumSceneTurns: 3,
    };
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
  const characterArcMemoryCoverage = evaluateCharacterArcMemoryCoverage({
    text: normalizedText,
    featureContext,
  });
  if (!characterArcMemoryCoverage.ok) {
    return {
      ok: false,
      reason: characterArcMemoryCoverage.reason,
      counts,
      featureObligation: characterArcMemoryCoverage,
    };
  }
  const nextTurnCoverage = evaluateFirstNextTurnCoverage({
    text: normalizedText,
    featureContext,
  });
  if (!nextTurnCoverage.ok) {
    return {
      ok: false,
      reason: nextTurnCoverage.reason,
      counts,
      featureObligation: {
        ...featureObligation,
        nextTurnCoverage,
      },
    };
  }
  const executionBriefCoverage = evaluateNextSceneExecutionBriefCoverage({
    text: normalizedText,
    featureContext,
  });
  if (!executionBriefCoverage.ok) {
    return {
      ok: false,
      reason: executionBriefCoverage.reason,
      counts,
      featureObligation: {
        ...featureObligation,
        nextTurnCoverage,
        executionBriefCoverage,
      },
    };
  }

  return {
    ok: true,
    reason: "ok",
    counts,
    featureObligation: (() => {
      let obligation = featureObligation.reason === "not_feature_act" ? null : { ...featureObligation };
      if (characterArcMemoryCoverage.reason !== "no_character_arc_memory") {
        if (obligation) {
          obligation.characterArcMemoryCoverage = characterArcMemoryCoverage;
        } else if (characterArcMemoryCoverage.reason !== "insufficient_character_arc_memory") {
          obligation = { ...characterArcMemoryCoverage };
        }
      }
      if (nextTurnCoverage.reason !== "no_next_turn") {
        if (obligation) {
          obligation.nextTurnCoverage = nextTurnCoverage;
        } else {
          obligation = { nextTurnCoverage };
        }
      }
      if (!["no_execution_brief", "insufficient_execution_brief"].includes(executionBriefCoverage.reason)) {
        if (obligation) {
          obligation.executionBriefCoverage = executionBriefCoverage;
        } else {
          obligation = { executionBriefCoverage };
        }
      }
      return obligation;
    })(),
  };
}

export {
  evaluateCharacterArcMemoryCoverage,
  evaluateMomentumRescueQuality,
  evaluateScreenplayPageQuality,
  evaluateFeatureActObligationCoverage,
  isLikelyOutlineOrCraftArtifactLine,
  isLikelyPlaceholderScreenplayLine,
  isLowSignalActionLine,
  isLowSubtextDialogueLine,
  isSummaryLikeActionLine,
  minimumExpectedWordsForRequestedPages,
  summarizeLineCounts,
};
