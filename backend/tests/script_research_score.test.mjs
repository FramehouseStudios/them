import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreScript } from "../lib/clementine/script_research/score.js";

describe("script research score (nightly brief, samantha is clementine)", () => {
  it("thin draft with ghost + weak motif → weaknesses, good format → strengths", () => {
    const draft = "We see John is scared ghost. He was running very quickly very to listening shadow.";
    const { scores, strengths, weaknesses } = scoreScript({ draft, genre:"horror", tone:"dark", character:"John", ownerKey:"owner-score-test" });
    assert.ok(scores.coverage);
    assert.ok(Array.isArray(strengths) && Array.isArray(weaknesses));
    assert.ok(weaknesses.some(w=> w.includes("heading") || w.includes("Thin")));
    assert.ok(weaknesses.some(w=> w.includes("Hedges") || w.includes("Passive") || w.includes("Midpoint") || w.includes("Ghost")));
  });
  it("clean draft with heading → strengths", () => {
    const draft = "INT. BEDROOM - NIGHT\nJOHN whispers to listening shadow.\n\nJOHN\nI stay.";
    const { strengths } = scoreScript({ draft, genre:"horror", tone:"dark", character:"John", ownerKey:"owner-score-clean" });
    assert.ok(strengths.some(s=> s.includes("Clean") || s.includes("threaded") || s.includes("Active")));
  });
});
