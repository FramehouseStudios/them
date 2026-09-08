import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSmoothClementineGhostPage } from "../lib/clementine/smooth_clementine_ghost_page.js";

describe("smooth clementine ghost page (smooth amazing, samantha is clementine)", () => {
  it("scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual + director + export + collab + inspector + flip + clementine + writer + prose polish + subtext + ghost payoff + coverage + marketability + theme throughline + sequence craft + image echo + final image echo + subplot + rewrite notes + beat sheet export + character voice + punchup + draft notes + polish pass + scene craft + beat craft 40 + voice lexicon polish + ghost payoff ledger + image ledger + scene craft image + scene ghost image + ghost page + spring", () => {
    const r = buildSmoothClementineGhostPage({ scene: 1, character: "Sally", ghost: "bedroom silence age 14", want: "hold family", need: "let go fear", flaw: "avoidance", motif: "listening shadow", scar: "quiet hands", finalImage: "final echo bedroom door open with scar", lexicon: ["shadow"], draft: "INT. bedroom - NIGHT\nWe see Sally was running very quickly to listening shadow.\n\nSALLY\nPlease stay with me.", genre: "horror", tone: "tense", project: { id: "p1" }, ownerKey: "owner-Sally-ghostpage", sample: "Sally whispers", dialogueLine: "Please stay with me." });
    assert.equal(r.scene, 1);
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
    assert.ok(r.sceneCraft && r.beatCraft40);
    assert.ok(r.lexiconPolish && r.ghostPayoffLedger && r.imageLedger);
    assert.ok(r.craftImage && r.ghostImage);
    assert.ok(r.ghostPageDetail && r.ghostPageDetail.page.includes("GHOST PAGE") && r.ghostPageDetail.character.toUpperCase() === "SALLY");
    assert.ok(r.spring === 0.5 || r.spring === 0.7 || r.spring === 0.9);
  });
});
