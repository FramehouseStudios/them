import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSmoothGhostVoiceNotesImageThemePolish } from "../lib/clementine/smooth_ghost_voice_notes_image_theme_polish.js";

describe("smooth ghost voice notes image theme polish (smooth amazing)", () => {
  it("scene ghost + voice + notes + image + theme + polish + spring", () => {
    const r = buildSmoothGhostVoiceNotesImageThemePolish({ scene: 8, character: "John", ghost: "age12", want: "prove safe", need: "admit fear", flaw: "control", motif: "listening shadow", scar: "second hand missing", finalImage: "final echo", lexicon: ["shadow"], draft: "He was running very quickly. INT. bedroom ghost" });
    assert.equal(r.scene, 8);
    assert.ok(r.theme.includes("prove safe") && r.polishedDraft && r.polishChanges.length >=1);
    assert.equal(r.spring, 0.9);
  });
});
