import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assignCraftPerBeat } from "../lib/clementine/beat_craft.js";

describe("beat craft (screenwriting craft)", () => {
  it("40 beats each with craft", () => {
    const b = assignCraftPerBeat({ genre: "horror", tone: "dark", totalPages: 90 });
    assert.equal(b.length, 40);
    assert.ok(b[0].craft && b[0].craft.id);
    assert.equal(b[0].beat, 1);
    assert.equal(b[39].beat, 40);
    assert.ok(b.every(x=> x.page >=1 && x.page <=90));
  });
});
