import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildThemeStatement, buildThroughline } from "../lib/clementine/theme_throughline.js";

describe("theme throughline (screenwriting craft)", () => {
  it("theme statement want vs need flaw", () => {
    const t = buildThemeStatement({ want: "prove safe", need: "admit fear", flaw: "control" });
    assert.ok(t.includes("prove safe") && t.includes("admit fear") && t.includes("control"));
  });
  it("throughline evolves 8 seq flaw protects→costs→chosen", () => {
    const seqs = Array.from({length:8}, (_,i)=>({ seq: i+1, title: `S${i+1}`, turn: "turn" }));
    const tl = buildThroughline({ sequences: seqs, want: "prove safe", need: "admit fear" });
    assert.equal(tl.length, 8);
    assert.equal(tl[0].evolution, "flaw protects");
    assert.equal(tl[3].evolution, "flaw costs");
    assert.equal(tl[6].evolution, "need chosen");
    assert.ok(tl[0].theme.includes("prove safe"));
  });
});
