// Decide whether a "low confidence" transcript deserves a clarification turn.
//
// estimateSttConfidence() falls back to a word-count heuristic when the STT
// supplier returns no per-word or per-segment scores (gpt-4o-mini-transcribe
// does not). In that mode every 1–3 word utterance scores 0.40–0.52, so the
// ambiguity rule would bounce real short commands ("Talk to me.", "Next beat",
// "Rewrite it") with "say that again" forever. Only treat a short transcript
// as unintelligible when the confidence was actually measured, or when the
// text itself looks like an echo fragment.

function hasMeasuredSttConfidence(sttJson) {
  const stt = sttJson && typeof sttJson === "object" ? sttJson : {};
  const words = Array.isArray(stt.words) ? stt.words : [];
  const scoredWords = words.filter((w) => {
    const c = w?.confidence;
    return Number.isFinite(c) && c >= 0 && c <= 1;
  });
  if (scoredWords.length >= 2) return true;
  const segments = Array.isArray(stt.segments) ? stt.segments : [];
  return segments.some((seg) => {
    if (!seg || typeof seg !== "object") return false;
    const noSpeech = seg.no_speech_prob;
    const logprob = seg.avg_logprob;
    return (Number.isFinite(noSpeech) && noSpeech >= 0 && noSpeech <= 1)
      || (Number.isFinite(logprob) && logprob <= 0);
  });
}

function countWords(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

/**
 * True for transcripts that read like a cut-off echo of the assistant or
 * background noise rather than a short command: a stub that trails off or
 * text with no letters. Language and word count alone are not echo evidence.
 */
function looksLikeUnintelligibleFragment(transcript) {
  const raw = String(transcript || "").trim();
  if (!raw) return true;
  const words = countWords(raw);
  if (!/\p{L}/u.test(raw)) return true;
  if (words <= 2 && /(\.\.\.|…)$/.test(raw)) return true;
  return false;
}

/**
 * Gate the spoken/silent clarification path. `ambiguous` is the existing
 * isLikelyAmbiguousLowConfidenceUtterance verdict.
 */
function shouldTreatAsLowConfidence({ ambiguous, sttJson, transcript }) {
  if (!ambiguous) return false;
  if (hasMeasuredSttConfidence(sttJson)) return true;
  return looksLikeUnintelligibleFragment(transcript);
}

export {
  hasMeasuredSttConfidence,
  looksLikeUnintelligibleFragment,
  shouldTreatAsLowConfidence,
};
