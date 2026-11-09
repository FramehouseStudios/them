import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSceneGhostPayoff, trackSceneGhostPayoffs } from "../lib/clementine/scene_ghost_payoff.js";

describe("scene ghost payoff (writing partner)", () => {
  it("per-scene ghost payoff", () => {
    const r = buildSceneGhostPayoff({ scene: 3, character: "John", ghost: "age12", want: "prove safe", need: "admit fear", finalImage: "final echo" });
    assert.equal(r.scene, 3);
    assert.ok(r.payoff.includes("John") && r.paid);
  });
  it("track 8 scenes", () => {
    const scenes = Array.from({length:8}, (_,i)=>({ seq: i+1, character: "John", ghost: "age12", want: "prove safe", need: "admit fear" }));
    const arr = trackSceneGhostPayoffs({ scenes, finalImage: "final echo" });
    assert.equal(arr.length, 8);
    assert.ok(arr[0].payoff.includes("John"));
  });
});
