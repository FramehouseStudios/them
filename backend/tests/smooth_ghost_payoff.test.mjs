import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSmoothGhostPayoff } from "../lib/clementine/smooth_ghost_payoff.js";

describe("smooth ghost payoff (smooth amazing)", () => {
  it("scene 8 heavy spring 0.9, scene 4 0.7", () => {
    const a = buildSmoothGhostPayoff({ scene: 8, character: "John", ghost: "age12", want: "prove safe", need: "admit fear", finalImage: "final echo" });
    assert.equal(a.spring, 0.9);
    assert.equal(a.haptic, "heavy");
    const b = buildSmoothGhostPayoff({ scene: 4, character: "John", ghost: "age12", want: "prove safe", need: "admit fear", finalImage: "final echo" });
    assert.equal(b.spring, 0.7);
  });
});
