import test from "node:test";
import assert from "node:assert/strict";

import {
  hasMeasuredSttConfidence,
  looksLikeUnintelligibleFragment,
  shouldTreatAsLowConfidence,
} from "../lib/low_confidence_gate.js";

test("[low-confidence-gate] measured confidence needs real word or segment scores", () => {
  assert.equal(hasMeasuredSttConfidence(null), false);
  assert.equal(hasMeasuredSttConfidence({ text: "hi" }), false);
  assert.equal(hasMeasuredSttConfidence({ words: [{ confidence: 0.9 }] }), false, "one scored word is not a measurement");
  assert.equal(hasMeasuredSttConfidence({ words: [{ confidence: 0.9 }, { confidence: 0.2 }] }), true);
  assert.equal(hasMeasuredSttConfidence({ segments: [{ no_speech_prob: 0.7 }] }), true);
  assert.equal(hasMeasuredSttConfidence({ segments: [{ avg_logprob: -1.2 }] }), true);
  assert.equal(hasMeasuredSttConfidence({ segments: [{ text: "x" }] }), false);
  assert.equal(hasMeasuredSttConfidence({ words: [{ confidence: null }, { confidence: "" }] }), false);
  assert.equal(hasMeasuredSttConfidence({ segments: [{ no_speech_prob: null, avg_logprob: "" }] }), false);
});

test("[low-confidence-gate] echo fragments look unintelligible, short commands do not", () => {
  for (const junk of ["", "I...", "Ai...", "…", "123", "!!!"]) {
    assert.equal(looksLikeUnintelligibleFragment(junk), true, JSON.stringify(junk));
  }
  for (const real of ["Talk to me.", "Next beat", "Rewrite it", "You are", "Write a scene", "Do you hear me?", "Yes", "No", "Stop", "Continue", "卡。", "ครับ", "继续写", "أعد الكتابة"]) {
    assert.equal(looksLikeUnintelligibleFragment(real), false, real);
  }
});

test("[low-confidence-gate] heuristic-only confidence never bounces a real short command", () => {
  const heuristicOnly = { text: "Talk to me." };
  assert.equal(shouldTreatAsLowConfidence({ ambiguous: true, sttJson: heuristicOnly, transcript: "Talk to me." }), false);
  assert.equal(shouldTreatAsLowConfidence({ ambiguous: true, sttJson: heuristicOnly, transcript: "ครับ" }), false);
  assert.equal(shouldTreatAsLowConfidence({ ambiguous: true, sttJson: heuristicOnly, transcript: "Yes" }), false);
  assert.equal(shouldTreatAsLowConfidence({ ambiguous: true, sttJson: heuristicOnly, transcript: "I..." }), true);
  assert.equal(shouldTreatAsLowConfidence({ ambiguous: false, sttJson: heuristicOnly, transcript: "iz" }), false, "the existing rule still decides ambiguity");
  const measured = { words: [{ confidence: 0.2 }, { confidence: 0.3 }, { confidence: 0.25 }] };
  assert.equal(shouldTreatAsLowConfidence({ ambiguous: true, sttJson: measured, transcript: "Talk to me." }), true, "measured low confidence is respected");
});
