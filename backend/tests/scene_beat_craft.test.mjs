import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSceneBeatCraft } from "../lib/clementine/scene_beat_craft.js";

describe("scene beat craft (writing craft)", () => {
  it("scene 1 beats 1-5, scene 8 beats 36-40", () => {
    const s1 = buildSceneBeatCraft({ sceneIndex: 1, genre: "horror" });
    assert.equal(s1.length, 5);
    assert.equal(s1[0].beat, 1);
    assert.equal(s1[4].beat, 5);
    const s8 = buildSceneBeatCraft({ sceneIndex: 8, genre: "horror" });
    assert.equal(s8[0].beat, 36);
    assert.equal(s8[4].beat, 40);
  });
});
