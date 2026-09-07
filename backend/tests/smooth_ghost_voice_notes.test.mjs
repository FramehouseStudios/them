import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSmoothGhostVoiceNotes } from "../lib/clementine/smooth_ghost_voice_notes.js";

describe("smooth ghost voice notes (smooth amazing)", () => {
  it("scene ghost + voice + notes + spring", () => {
    const r = buildSmoothGhostVoiceNotes({ scene: 8, character: "John", ghost: "age12", want: "prove safe", need: "admit fear", motif: "listening shadow", scar: "second hand missing", finalImage: "final echo", lexicon: ["shadow"], draft: "INT. BEDROOM ghost" });
    assert.equal(r.scene, 8);
    assert.ok(r.voice.includes("John") && r.notes.length >=1);
    assert.equal(r.spring, 0.9);
  });
});
