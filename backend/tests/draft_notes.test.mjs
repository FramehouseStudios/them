import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDraftNotes } from "../lib/clementine/draft_notes.js";

describe("draft notes (screenwriting craft)", () => {
  it("ghost note", () => {
    const r = buildDraftNotes({ draft: "INT. BEDROOM\nghost remembers", sequences: [{ seq:4, title:"Midpoint", setpiece:"midpoint p45" }] });
    assert.ok(r.notes.some(n=> n.includes("Ghost")) && r.count >=2);
  });
  it("polish changes included", () => {
    const r = buildDraftNotes({ draft: "He was running very quickly.", sequences: [] });
    assert.ok(r.polish.changes.length >=1 && r.notes.some(n=> n.includes("Polish")));
  });
});
