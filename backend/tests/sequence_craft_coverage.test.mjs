import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assignCraftPerSequence, buildCoverageNotes } from "../lib/clementine/sequence_craft_coverage.js";

describe("sequence craft coverage (8seq + craft per seq + reader notes)", () => {
  it("8 sequences each get a craft card", () => {
    const a = assignCraftPerSequence({ genre: "horror", tone: "dark", totalPages: 90 });
    assert.equal(a.length, 8);
    assert.ok(a[0].craft && a[0].craft.id);
    assert.equal(a[0].seq, 1);
    assert.ok(a[3].setpiece.includes("midpoint") || a[3].title === "Midpoint");
    // craft ids rotate through selectCraftCards
    assert.ok(a.every(x=> x.craft.technique && x.craft.motif));
  });
  it("coverage notes reader-style overall/verdict", () => {
    const thin = buildCoverageNotes({ draft: "hi", genre: "horror" });
    assert.ok(thin.overall <= 3);
    assert.equal(thin.verdict, "PASS");
    assert.ok(thin.notes.length >= 2);
    const good = buildCoverageNotes({ draft: "INT. BEDROOM\n\nJOHN\nHello\n" + "x".repeat(900), genre: "horror", tone: "dark" });
    assert.ok(good.hasHeading && good.hasDialogue);
    assert.ok(good.overall >= 3);
  });
});
