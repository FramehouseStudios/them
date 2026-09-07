import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSmoothGhostVoiceNotesImageTheme } from "../lib/clementine/smooth_ghost_voice_notes_image_theme.js";

describe("smooth ghost voice notes image theme (smooth amazing)", () => {
  it("scene ghost + voice + notes + image + theme + spring", () => {
    const r = buildSmoothGhostVoiceNotesImageTheme({ scene: 8, character: "John", ghost: "age12", want: "prove safe", need: "admit fear", flaw: "control", motif: "listening shadow", scar: "second hand missing", finalImage: "final echo", lexicon: ["shadow"], draft: "INT. BEDROOM ghost" });
    assert.equal(r.scene, 8);
    assert.ok(r.theme.includes("prove safe") && r.theme.includes("control"));
    assert.ok(r.image.includes("listening shadow") && r.voice.includes("John"));
    assert.equal(r.spring, 0.9);
  });
});
