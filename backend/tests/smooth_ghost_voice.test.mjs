import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSmoothGhostVoice } from "../lib/clementine/smooth_ghost_voice.js";

describe("smooth ghost voice (smooth amazing)", () => {
  it("scene ghost + voice lexicon + spring", () => {
    const r = buildSmoothGhostVoice({ scene: 8, character: "John", ghost: "age12", want: "prove safe", need: "admit fear", motif: "listening shadow", scar: "second hand missing", finalImage: "final echo", lexicon: ["shadow"] });
    assert.equal(r.scene, 8);
    assert.ok(r.voice.includes("John") && r.cadence.includes("control"));
    assert.equal(r.spring, 0.9);
  });
});
