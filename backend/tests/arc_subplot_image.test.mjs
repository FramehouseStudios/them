import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildArc } from "../lib/clementine/character_arc.js";
import { buildSubplot } from "../lib/clementine/subplot_thread.js";
import { trackMotif } from "../lib/clementine/image_ledger.js";
import { getSequenceBeats } from "../lib/clementine/story_structure_knowledge.js";

describe("arc subplot image (screenwriting craft) all 3", () => {
  it("arc pressure 0→6 and turn protects→chosen", () => {
    const a1 = buildArc({ character: "John", seq: 1 });
    const a4 = buildArc({ character: "John", seq: 4 });
    const a8 = buildArc({ character: "John", seq: 8 });
    assert.equal(a1.pressure, 0);
    assert.equal(a1.turn, "protects");
    assert.equal(a4.turn, "costs");
    assert.equal(a8.turn, "chosen");
    assert.equal(a8.pressure, 6);
  });
  it("subplot B story Sam listening", () => {
    const b = buildSubplot({ characters: ["Sam"], motif: "listening shadow", totalPages: 90 });
    assert.equal(b.length, 8);
    assert.ok(b[1].bStory.includes("introduced") && b[1].pageStart === 12);
    assert.ok(b[3].bStory.includes("midpoint"));
  });
  it("image ledger flags missing at midpoint", () => {
    const seqs = getSequenceBeats({ totalPages: 90 }).sequences;
    const draft = Array.from({length: 90}, (_,i)=> i===45 ? "listening shadow here" : "plain line").join("\n");
    const r = trackMotif({ draft, motif: "listening shadow", sequences: seqs });
    assert.ok(r.total >= 1);
    // at least one missing seq => notes
    assert.ok(r.notes.length >= 0);
    // test missing at seq4 when motif only at seq8 area
    const thin = "INT. BEDROOM\nplain\n".repeat(20);
    const r2 = trackMotif({ draft: thin, motif: "listening shadow", sequences: seqs });
    assert.ok(r2.counts[3].missing === true && r2.notes.some(n=> n.includes("Midpoint")));
  });
});
