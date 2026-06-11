function normalizeLineText(value = "") {
  return String(value || "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function countWords(value = "") {
  const words = normalizeLineText(value).match(/[A-Za-z0-9'][A-Za-z0-9'-]*/g);
  return Array.isArray(words) ? words.length : 0;
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
    specificAction: 0,
    dialogueWords: 0,
    words: 0,
  };

  for (const line of Array.isArray(lines) ? lines : []) {
    const text = normalizeLineText(line?.text ?? line);
    if (!text) continue;
    const element = normalizeElement(line?.element);
    counts.nonEmpty += 1;
    counts.words += countWords(text);
    if (element === "sceneHeading") counts.sceneHeading += 1;
    else if (element === "action") counts.action += 1;
    else if (element === "character") counts.character += 1;
    else if (element === "dialogue") counts.dialogue += 1;
    else if (element === "parenthetical") counts.parenthetical += 1;
    else if (element === "transition") counts.transition += 1;
    if (isPlayableActionLine(text, element)) counts.playableAction += 1;
    if (isLikelyOutlineOrCraftArtifactLine(text, element)) counts.artifact += 1;
    if (isLikelyPlaceholderScreenplayLine(text, element)) counts.placeholder += 1;
    if (element === "dialogue") counts.dialogueWords += countWords(text);
    if (isLowSignalActionLine(text, element)) counts.lowSignalAction += 1;
    if (isPlayableActionLine(text, element) && !isLowSignalActionLine(text, element)) {
      counts.specificAction += 1;
    }
  }

  return counts;
}

function evaluateScreenplayPageQuality({
  text = "",
  lines = [],
  targetPages = 0,
  hasSceneAnchor = false,
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
  const minWords = requestedPages >= 3 ? 24 : 4;

  if (!hasSceneShape && !hasSceneAnchor) {
    return { ok: false, reason: "missing_screenplay_shape", counts };
  }
  if (!hasPlayableContent) {
    return { ok: false, reason: "missing_playable_content", counts };
  }
  if (counts.words < minWords) {
    return { ok: false, reason: "underfilled_page_text", counts };
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

  return { ok: true, reason: "ok", counts };
}

export {
  evaluateScreenplayPageQuality,
  isLikelyOutlineOrCraftArtifactLine,
  isLikelyPlaceholderScreenplayLine,
  isLowSignalActionLine,
  summarizeLineCounts,
};
