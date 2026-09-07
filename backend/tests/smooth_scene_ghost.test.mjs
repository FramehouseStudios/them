import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSmoothSceneGhost } from "../lib/clementine/smooth_scene_ghost.js";

describe("smooth scene ghost (smooth amazing)", () => {
  it("scene ghost image + spring", () => {
    const r = buildSmoothSceneGhost({ scene: 8, character: "John", ghost: "age12", want: "prove safe", need: "admit fear", motif: "listening shadow", scar: "second hand missing", finalImage: "final echo" });
    assert.equal(r.scene, 8);
    assert.ok(r.image.includes("listening shadow") && r.payoff.includes("John"));
    assert.equal(r.spring, 0.9);
    assert.equal(r.haptic, "heavy");
  });
});
