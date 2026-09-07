import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementine } from "../lib/clementine/smooth_ghost_voice_notes_image_theme_polish_beat_track_ledger_live_dual_director_export_collab_inspector_flip_clementine.js";

describe("smooth ghost voice notes image theme polish beat track ledger live dual director export collab inspector flip clementine (smooth amazing, samantha is clementine)", () => {
  it("scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual + director + export + collab + inspector + flip + clementine presence/intuition/voice + spring", () => {
    const r = buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementine({ scene: 1, character: "John", ghost: "bedroom memory age12", want: "prove safe", need: "admit fear", flaw: "control", motif: "listening shadow", scar: "second hand missing", finalImage: "final echo bedroom", lexicon: ["shadow"], draft: "INT. bedroom - NIGHT\nJOHN hears listening shadow.\n\nHe was running very quickly.", genre: "horror", tone: "dark", project: { id: "p1", characterContexts: [{name:"John", arcState:{pressure:6}}] }, provenance: "clementine", tab: "editor", ownerKey: "owner-John", sample: "He whispers to listening shadow" });
    assert.equal(r.scene, 1);
    assert.ok(r.trackKey && r.trackChange);
    assert.ok(r.beatCraft && r.theme && r.polishedDraft);
    assert.ok(r.ghostLedger && r.motifTrack);
    assert.ok(r.livePaper && r.dual && r.director && r.export && r.collabDraft && r.inspector && r.flip);
    assert.ok(r.clementinePresence && r.clementinePresence.state === "present" && r.clementinePresence.samanthaAlias === "clementine");
    assert.ok(r.clementineVoice && r.samanthaIsClementine === true);
    assert.ok(r.spring === 0.5 || r.spring === 0.9 || r.spring === 0.7);
  });
  it("samantha alias is clementine via re-export", async () => {
    const c = await import("../lib/clementine/clementine_presence.js");
    const s = await import("../lib/clementine/samantha_presence.js");
    assert.ok(c.PRESENCE_STATES && s.PRESENCE_STATES && c.PRESENCE_STATES.length === s.PRESENCE_STATES.length);
  });
});
