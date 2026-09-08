import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSmoothClementineSceneCraft } from "../lib/clementine/smooth_clementine_scene_craft.js";

describe("smooth clementine scene craft (smooth amazing, samantha is clementine)", () => {
  it("scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual + director + export + collab + inspector + flip + clementine + writer + prose polish + subtext + ghost payoff + coverage + marketability + theme throughline + sequence craft + image echo + final image echo + subplot + rewrite notes + beat sheet export + character voice + punchup + draft notes + polish pass + scene craft + spring", () => {
    const r = buildSmoothClementineSceneCraft({ scene: 3, character: "Sam", ghost: "second hand missing", want: "be brave", need: "trust shadow", flaw: "fear", motif: "listening shadow", scar: "clock tick", finalImage: "final echo bedroom door open with scar", lexicon: ["shadow"], draft: "INT. bedroom - NIGHT\nWe see Sam was running very quickly to listening shadow.\n\nSAM\nPlease stay with me, really.", genre: "horror", tone: "dark", project: { id: "p3" }, ownerKey: "owner-Sam-craft", sample: "Sam whispers", dialogueLine: "Please stay with me, really." });
    assert.equal(r.scene, 3);
    assert.ok(r.trackKey && r.trackChange);
    assert.ok(r.beatCraft && r.theme && r.polishedDraft);
    assert.ok(r.ghostLedger && r.motifTrack);
    assert.ok(r.livePaper && r.dual && r.director && r.export && r.collabDraft && r.inspector && r.flip);
    assert.ok(r.clementinePresence && r.samanthaIsClementine && r.writerLearned);
    assert.ok(r.prosePolish && r.dialogueSubtext);
    assert.ok(r.ghostPayoff && r.coverage && r.marketability);
    assert.ok(r.themeStatement && r.throughline && r.craftSequence);
    assert.ok(r.imageEcho && r.finalImageEcho);
    assert.ok(r.subplot && r.rewriteNotes);
    assert.ok(r.beatSheet && r.characterVoice && r.punchUp);
    assert.ok(r.draftNotes && r.polishPass);
    assert.ok(r.sceneCraft && r.sceneCraft.obstacle && r.sceneCraft.cost && r.sceneCraft.imageEcho);
    assert.ok(r.spring === 0.5 || r.spring === 0.7 || r.spring === 0.9);
  });
});
