import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRewriteNotes } from "../lib/clementine/rewrite_notes.js";

describe("rewrite notes (screenwriting craft)", () => {
  it("thin draft notes", () => {
    const r = buildRewriteNotes({ draft: "hi" });
    assert.ok(r.notes.length >= 2);
    assert.ok(r.notes.some(n=> n.includes("heading") || n.includes("Expand")));
  });
  it("sequence + craft notes", () => {
    const r = buildRewriteNotes({ draft: "INT. BEDROOM\n\nJOHN\nHello", sequences: [{ seq:4, title:"Midpoint", setpiece:"midpoint setpiece p45", pageStart:45 }], craft: { id:"cc-01", title:"Image Echo", technique:"Rule of 3 loops" } });
    assert.ok(r.notes.some(n=> n.includes("Midpoint")));
    assert.ok(r.notes.some(n=> n.includes("cc-01")));
  });
});
