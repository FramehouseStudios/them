import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSmoothClementineVoiceLexicon } from "../lib/clementine/smooth_clementine_voice_lexicon.js";

describe("smooth clementine voice lexicon (smooth amazing, samantha is clementine)", () => {
  it("scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual + director + export + collab + inspector + flip + clementine + writer + prose polish + subtext + ghost payoff + coverage + marketability + theme throughline + sequence craft + image echo + final image echo + subplot + rewrite notes + beat sheet export + character voice + punchup + draft notes + polish pass + scene craft + beat craft 40 + voice lexicon polish + spring", () => {
    const r = buildSmoothClementineVoiceLexicon({ scene: 2, character: "John", ghost: "bedroom memory age12", want: "prove safe", need: "admit fear", flaw: "control", motif: "listening shadow", scar: "second hand missing", finalImage: "final echo bedroom door open with scar", lexicon: ["listening shadow"], draft: "INT. bedroom - NIGHT\nWe see John was running very quickly to listening shadow.\n\nJOHN\nPlease stay with me.", genre: "horror", tone: "dark", project: { id: "p2" }, ownerKey: "owner-John-lex", sample: "John whispers", dialogueLine: "Please stay with me." });
    assert.equal(r.scene, 2);
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
    assert.ok(r.lexiconPolish && r.lexiconPolish.polished.includes("listening shadow") && r.lexiconPolish.cadence);
    assert.ok(r.spring === 0.5 || r.spring === 0.7 || r.spring === 0.9);
  });
});
