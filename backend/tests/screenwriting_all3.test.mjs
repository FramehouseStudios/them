import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCharacterContexts } from "../lib/clementine/short_film_character_context.js";
import { rewriteLine } from "../lib/clementine/dialogue_notes.js";
import { getSequenceBeats, getSevenPointBeats, SEQUENCE_8 } from "../lib/clementine/story_structure_knowledge.js";

describe("screenwriting all3: want/need/ghost + dialogue notes + 8seq", () => {
  it("per-character want/need/flaw/ghost distinct for John/Sally/Sam", () => {
    const ctxs = buildCharacterContexts({ characters: ["John","Sally","Sam"], genre: "horror", setting: "bedroom" });
    assert.equal(ctxs.length, 3);
    const john = ctxs.find(c=>c.name==="John");
    assert.ok(john.want && john.need && john.flaw && john.ghost);
    assert.ok(john.ghost.includes("John") && john.ghost.includes("ghost"));
    const sally = ctxs.find(c=>c.name==="Sally");
    assert.notEqual(john.want, sally.want);
    assert.notEqual(john.flaw, sally.flaw);
  });
  it("dialogue notes status/subtext/punch", () => {
    const r1 = rewriteLine({ line: "We need to stay.", character: "John", note: "status", style: "lower" });
    assert.ok(r1.rewritten.includes("just") || r1.rewritten === "We need to stay.");
    const r2 = rewriteLine({ line: "I really want to go.", note: "punch-up tighten" });
    assert.ok(!r2.rewritten.includes("really"));
    const r3 = rewriteLine({ line: "Hello.", note: "subtext unsaid" });
    assert.ok(r3.rewritten.includes("subtext"));
  });
  it("8 sequences x ~11p each, pageStart/End for 90p, 7pt still there", () => {
    const seq = getSequenceBeats({ genre: "horror", totalPages: 90 });
    assert.equal(seq.framework, "8seq");
    assert.equal(seq.sequences.length, 8);
    assert.equal(SEQUENCE_8.length, 8);
    assert.equal(seq.sequences[3].title, "Midpoint");
    assert.ok(seq.sequences[3].setpiece.includes("midpoint"));
    assert.ok(seq.sequences[0].pageStart === 1 && seq.sequences[7].pageEnd === 90);
    const seven = getSevenPointBeats({ genre: "horror" });
    assert.equal(seven.sevenPoint.length, 7);
  });
});
