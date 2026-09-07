import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDual } from "../lib/clementine/smooth_ghost_voice_notes_image_theme_polish_beat_track_ledger_live_dual.js";

describe("smooth ghost voice notes image theme polish beat track ledger live dual (smooth amazing)", () => {
  it("scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual channel + spring", () => {
    const r = buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDual({ scene: 3, character: "Sam", ghost: "second hand missing", want: "be brave", need: "trust shadow", flaw: "fear", motif: "listening shadow", scar: "clock tick", finalImage: "final echo bedroom door open", lexicon: ["shadow"], draft: "INT. bedroom - NIGHT\nSAM whispers to listening shadow.\n\nHe was running very quickly.", genre: "horror", tone: "dark", project: { logline: "bedroom horror", synopsis: "John Sally Sam" } });
    assert.equal(r.scene, 3);
    assert.ok(r.trackKey && r.trackChange);
    assert.ok(r.beatCraft && r.theme && r.polishedDraft);
    assert.ok(r.ghostLedger && r.motifTrack);
    assert.ok(r.livePaper && r.dual && r.dual.streaming === true && Array.isArray(r.dualPages));
    assert.ok(r.spring === 0.5 || r.spring === 0.9 || r.spring === 0.7);
  });
});
