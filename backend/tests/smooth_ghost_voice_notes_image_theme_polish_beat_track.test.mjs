import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSmoothGhostVoiceNotesImageThemePolishBeatTrack } from "../lib/clementine/smooth_ghost_voice_notes_image_theme_polish_beat_track.js";

describe("smooth ghost voice notes image theme polish beat track (smooth amazing)", () => {
  it("scene ghost + voice + notes + image + theme + polish + beat craft + track + spring", () => {
    const r = buildSmoothGhostVoiceNotesImageThemePolishBeatTrack({ scene: 1, character: "John", ghost: "age12", want: "prove safe", need: "admit fear", flaw: "control", motif: "listening shadow", scar: "second hand missing", finalImage: "final echo", lexicon: ["shadow"], draft: "He was running very quickly. INT. bedroom ghost", genre: "horror", tone: "dark" });
    assert.equal(r.scene, 1);
    assert.ok(r.trackKey.includes("scene-1-John") && r.trackChange);
    assert.equal(r.beat, 1);
    assert.ok(r.theme.includes("prove safe") && r.polishedDraft && r.beatCraft);
    assert.ok(r.spring === 0.5 || r.spring === 0.9);
  });
});
