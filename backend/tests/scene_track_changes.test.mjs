import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recordSceneChange, getSceneChanges, summarizeSceneChanges } from "../lib/clementine/scene_track_changes.js";

describe("scene track changes (writing partner)", () => {
  it("per-scene record and summary", () => {
    const scene = 3 + Math.floor(Date.now()%1000);
    recordSceneChange({ scene, line: 1, from: "Hello", to: "Hola" });
    const changes = getSceneChanges({ scene });
    assert.equal(changes.length >=1, true);
    const sum = summarizeSceneChanges({ scene });
    assert.ok(sum.summary.includes(`Scene ${scene}`) && sum.count >=1);
  });
});
