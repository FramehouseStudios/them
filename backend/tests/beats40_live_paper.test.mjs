import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLivePaperPayload } from "../lib/clementine/studio_live_paper.js";

describe("beats40 live paper C", () => {
  it("90p live paper has beats40 40 and beatCount 40", () => {
    const p = buildLivePaperPayload({ id: "p1", logline: "L", totalPages: 90, genre: "horror", beats: [{ title: "a" }] }, { totalPages: 90, currentPage: 1 });
    assert.equal(p.beatCount, 40);
    assert.ok(Array.isArray(p.beats40) && p.beats40.length === 40);
    assert.equal(p.beats40[0].beat, 1);
  });
  it("15p live paper stays without beats40", () => {
    const p = buildLivePaperPayload({ id: "p1", beats: [{ title: "a" }], totalPages: 15 }, { totalPages: 15 });
    assert.equal(p.beats40, null);
    assert.equal(p.beatCount, p.beats.length);
  });
});
