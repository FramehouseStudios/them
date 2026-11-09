import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { transformEdit, applyCollabEdits } from "../lib/clementine/collab_edit.js";

describe("collab_edit alias (dedicated filename)", () => {
  it("transformEdit shifts b when same page+line+character", () => {
    const a = { page: 1, line: 2, character: "John" };
    const b = { page: 1, line: 2, character: "John", newText: "hi" };
    const t = transformEdit("", a, b);
    assert.equal(t.line, 3);
  });
  it("applyCollabEdits replaces line", () => {
    const draft = "INT. BEDROOM\n\nJOHN\nHello\n\nSALLY\nHi";
    const out = applyCollabEdits(draft, [{ page: 1, line: 3, newText: "JOHN\nHola" }]);
    assert.ok(out.includes("Hola"));
  });
});
