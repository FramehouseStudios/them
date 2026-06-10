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
  if (requestedPages >= 3 && counts.sceneHeading < 1 && !hasSceneAnchor) {
    return { ok: false, reason: "missing_batch_scene_anchor", counts };
  }

  return { ok: true, reason: "ok", counts };
}

export {
  evaluateScreenplayPageQuality,
  isLikelyOutlineOrCraftArtifactLine,
  summarizeLineCounts,
};
