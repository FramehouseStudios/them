import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recordChange, getChanges, revertChange } from "../lib/clementine/track_changes.js";

describe("track changes (writing craft)", () => {
  it("record and revert", () => {
    const k = "test-" + Date.now();
    recordChange({ key: k, line: 4, from: "Hello", to: "Hola" });
    const changes = getChanges({ key: k });
    assert.equal(changes.length, 1);
    assert.equal(changes[0].to, "Hola");
    const rev = revertChange({ key: k, line: 4 });
    assert.equal(rev.from, "Hello");
  });
});
