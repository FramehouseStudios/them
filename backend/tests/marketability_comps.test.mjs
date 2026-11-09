import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMarketability } from "../lib/clementine/marketability.js";

describe("marketability comps (screenwriting craft)", () => {
  it("horror micro A24 Hereditary meets Babadook", () => {
    const m = buildMarketability({ genre: "horror", setting: "bedroom", characters: ["John","Sally"] });
    assert.ok(m.comps.includes("Hereditary") && m.audience.includes("A24"));
    assert.equal(m.budget, "micro");
    assert.ok(m.logline.includes("Hereditary meets The Babadook"));
  });
  it("sci-fi festival Ex Machina", () => {
    const m = buildMarketability({ genre: "sci-fi", setting: "lab" });
    assert.ok(m.comps.includes("Ex Machina"));
    assert.equal(m.budget, "low");
  });
});
