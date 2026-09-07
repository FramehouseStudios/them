import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSmoothGhostPayoffNotesImage } from "../lib/clementine/smooth_ghost_payoff_notes_image.js";

describe("smooth ghost payoff notes image (smooth amazing)", () => {
  it("scene ghost + voice + notes + image echo + spring", () => {
    const r = buildSmoothGhostPayoffNotesImage({ scene: 8, character: "John", ghost: "age12", want: "prove safe", need: "admit fear", motif: "listening shadow", scar: "second hand missing", finalImage: "final echo", lexicon: ["shadow"], draft: "INT. BEDROOM ghost" });
    assert.equal(r.scene, 8);
    assert.ok(r.voice.includes("John") && r.image.includes("listening shadow") && r.notes.length >=1);
    assert.equal(r.spring, 0.9);
  });
});
