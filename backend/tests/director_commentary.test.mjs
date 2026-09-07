import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCommentary } from "../lib/clementine/director_commentary.js";

describe("director_commentary alias", () => {
  it("buildCommentary returns coverage and notes", () => {
    const r = buildCommentary({ project: { characterContexts: [{ name: "John" }] }, draft: "INT. BEDROOM\n\nJOHN\nHi", page: 1 });
    assert.ok(r.coverage);
    assert.ok(Array.isArray(r.notes));
    assert.equal(typeof r.xCommentary, "string");
  });
});
