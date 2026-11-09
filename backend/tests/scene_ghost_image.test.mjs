import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSceneGhostImage } from "../lib/clementine/scene_ghost_image.js";

describe("scene ghost image (writing craft)", () => {
  it("scene ghost + image echo", () => {
    const r = buildSceneGhostImage({ scene: 4, character: "John", ghost: "age12", want: "prove safe", need: "admit fear", motif: "listening shadow", scar: "second hand missing", finalImage: "final echo" });
    assert.equal(r.scene, 4);
    assert.ok(r.payoff.includes("John") && r.image.includes("listening shadow"));
    assert.ok(r.paid);
  });
});
