import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedger } from "../lib/clementine/smooth_ghost_voice_notes_image_theme_polish_beat_track_ledger.js";

describe("smooth ghost voice notes image theme polish beat track ledger (smooth amazing)", () => {
  it("scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + spring", () => {
    const r = buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedger({ scene: 1, character: "John", ghost: "age12 bedroom memory", want: "prove safe", need: "admit fear", flaw: "control", motif: "listening shadow", scar: "second hand missing", finalImage: "final echo bedroom", lexicon: ["shadow"], draft: "INT. bedroom — listening shadow. He was running very quickly.", genre: "horror", tone: "dark" });
    assert.equal(r.scene, 1);
    assert.ok(r.trackKey && r.trackChange);
    assert.equal(r.beat, 1);
    assert.ok(r.theme && r.polishedDraft && r.beatCraft);
    assert.ok(r.ghostLedger && r.ghostLedger.character === "John");
    assert.ok(r.motifTrack && r.motifTrack.motif === "listening shadow" && Array.isArray(r.motifTrack.counts));
    assert.ok(r.spring === 0.5 || r.spring === 0.9);
  });
});
