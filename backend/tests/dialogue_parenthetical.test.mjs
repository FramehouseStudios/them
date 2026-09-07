import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildParenthetical } from "../lib/clementine/dialogue_parenthetical.js";

describe("dialogue parenthetical (writing craft)", () => {
  it("up controlling, down yielding", () => {
    const up = buildParenthetical({ line: "We need to stay.", character: "John", status: "up" });
    assert.ok(up.parenthetical.includes("controlling") && up.formatted.includes("JOHN") || up.formatted.includes("John"));
    const down = buildParenthetical({ line: "Please stay.", character: "Sally", status: "down" });
    assert.ok(down.parenthetical.includes("yielding"));
  });
});
