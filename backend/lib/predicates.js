// D009 — pure is* helpers extracted verbatim from backend/index.js.
//
// Every function here reads only its arguments (plus the helpers imported
// below): no module state, no calls back into index.js. Moved verbatim with
// its doc comment; index.js imports it by the same name, so no call site
// changed.

import { normalizeFactKey, normalizeSpeculativeTranscript } from "./normalizers.js";

function isSpeculativeTranscriptCompatible(seedText, finalText) {
  const normalizedSeed = normalizeSpeculativeTranscript(seedText);
  const normalizedFinal = normalizeSpeculativeTranscript(finalText);
  if (!normalizedSeed || !normalizedFinal) return false;
  if (normalizedSeed === normalizedFinal) return true;
  if (
    normalizedFinal.startsWith(normalizedSeed) ||
    normalizedSeed.startsWith(normalizedFinal)
  ) {
    return true;
  }
  const seedWords = new Set(normalizedSeed.split(" ").filter(Boolean));
  const finalWords = new Set(normalizedFinal.split(" ").filter(Boolean));
  if (!seedWords.size || !finalWords.size) return false;
  let overlap = 0;
  for (const word of seedWords) {
    if (finalWords.has(word)) overlap += 1;
  }
  const baseline = Math.min(seedWords.size, finalWords.size);
  if (baseline <= 0) return false;
  return overlap / baseline >= 0.60;
}

function isTalkMarkdownFenceLine(line = "") {
  return /^\s*```[A-Za-z0-9_-]*\s*$/.test(String(line || ""));
}

function isTalkDirectAddressPrefix(text = "") {
  const trimmed = String(text || "").trim();
  if (!trimmed) return false;
  return /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}[,:-]?$/.test(trimmed);
}

function isTalkSceneHeadingLine(line = "") {
  const trimmed = String(line || "").trim();
  return /^(INT|EXT|EST|INT\/EXT|I\/E)\.?(?:\s|$)/i.test(trimmed);
}

function isTalkTransitionLine(line = "") {
  const trimmed = String(line || "").trim();
  return (
    /^[A-Z0-9 .'\-]+ TO:$/.test(trimmed)
    || /^(FADE IN|FADE OUT|CUT TO BLACK)\.?$/i.test(trimmed)
  );
}

function isTalkParentheticalLine(line = "") {
  const trimmed = String(line || "").trim();
  return /^\([^()\n]{1,80}\)$/.test(trimmed);
}

function isLikelyConversationalScreenplayLine(line = "") {
  const trimmed = String(line || "").trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (trimmed.endsWith("?")) return true;
  return [
    /^you asked about\b/,
    /^you mentioned\b/,
    /^you said:\s*["“]/,
    /^i (can|know|sense|feel)\b/,
    /^it's okay\b/,
    /^take a deep breath\b/,
    /^what(?:'| i)?s\b/,
    /^what feels\b/,
    /^what about\b/,
    /^do you want to\b/,
    /^would you\b/,
    /^could you\b/,
    /^should we\b/,
    /^you (can|should|need to)\b/,
    /\byou'?re feeling\b/,
    /\bi'?m here\b/,
    /\bstay anchored there\b/,
  ].some((pattern) => pattern.test(lower));
}

function isLowSignalListeningFact(text) {
  const t = normalizeFactKey(text);
  if (!t) return true;
  if (t.length < 10) return true;
  if (/^(i am )?(ok|okay|fine|good|bad|tired|busy|same|nothing|whatever|idk|not sure)$/.test(t)) {
    return true;
  }
  if (/^(i (am|feel|need|want|have been)\s+)?(just|kinda|sorta|maybe)\b/.test(t) && t.length < 26) {
    return true;
  }
  return false;
}

function isAbortError(err) {
  return !!err && (err.name === "AbortError" || err.code === "ABORT_ERR");
}

function isFillerClauseOnly(text) {
  const t = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[.!?…]+$/g, "")
    .trim();
  if (!t) return true;
  return /^(okay|alright|right|well|hey|wait|mm+|hmm+|uh|uhh|yo)$/.test(t);
}

function isLikelyMp3Buffer(buffer) {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (source.length < 2) return false;
  const startsWithId3 = source.length >= 3 && source.subarray(0, 3).toString("utf8") === "ID3";
  const startsWithFrameSync = source[0] === 0xff && (source[1] & 0xe0) === 0xe0;
  return startsWithId3 || startsWithFrameSync;
}

function isDayFeelingCheckInLine(text) {
  const t = String(text || "").toLowerCase().trim();
  if (!t) return false;

  const asksHowDayOrFeeling =
    /\bhow(?:'s|’s|s|\s+is|\s+are|\s+has|\s+was)\b/.test(t) &&
    /\b(day|today|feeling|feel|doing|mood|yourself|holding up)\b/.test(t);
  const asksVibeToday = /\bwhat(?:'s| is)\s+(?:the\s+)?vibe\s+today\b/.test(t);
  const asksHowWasDay = /\bhow\s+was\s+your\s+day\b/.test(t);

  return asksHowDayOrFeeling || asksVibeToday || asksHowWasDay;
}

function isHardTopicReset(transcript = "") {
  const t = String(transcript || "").trim().toLowerCase();
  if (!t) return false;
  return /^(?:anyway|anyways|quick one|serious question|be honest|different question|new question)\b/.test(t);
}

export {
  isAbortError,
  isDayFeelingCheckInLine,
  isFillerClauseOnly,
  isHardTopicReset,
  isLikelyConversationalScreenplayLine,
  isLikelyMp3Buffer,
  isLowSignalListeningFact,
  isSpeculativeTranscriptCompatible,
  isTalkDirectAddressPrefix,
  isTalkMarkdownFenceLine,
  isTalkParentheticalLine,
  isTalkSceneHeadingLine,
  isTalkTransitionLine,
};
