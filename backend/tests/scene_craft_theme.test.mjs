import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSceneCraft, threadMotifThroughScenes } from "../lib/clementine/scene_craft.js";
import { getSequenceBeats } from "../lib/clementine/story_structure_knowledge.js";

describe("scene craft theme (want/obstacle/cost + motif threading)", () => {
  it("per-scene want/obstacle/cost + theme + imageEcho", () => {
    const seq = getSequenceBeats({ totalPages: 90 }).sequences[3]; // Midpoint
    const s = buildSceneCraft({ sceneIndex: 4, totalScenes: 8, character: "John", want: "prove safe", need: "admit fear", ghost: "bedroom ghost age 12", sequence: seq, motif: "listening shadow", theme: "cost of being remembered" });
    assert.equal(s.scene, 4);
    assert.ok(s.obstacle.toLowerCase().includes("midpoint"));
    assert.ok(s.cost.includes("admit fear"));
    assert.ok(s.imageEcho.includes("listening shadow"));
    assert.ok(s.logline.includes("S4:"));
  });
  it("threadMotifThroughScenes alternates echo", () => {
    const scenes = [{ scene: 1 }, { scene: 2 }, { scene: 3 }];
    const threaded = threadMotifThroughScenes({ scenes, motif: "fake set glitch" });
    assert.equal(threaded[0].motifThread, "fake set glitch");
    assert.equal(threaded[1].motifThread, "fake set glitch echo");
    assert.equal(threaded.length, 3);
  });
  it("buildSceneCraft distinct for John vs Sally want/need", () => {
    const a = buildSceneCraft({ sceneIndex: 1, character: "John", want: "prove safe", need: "admit fear" });
    const b = buildSceneCraft({ sceneIndex: 1, character: "Sally", want: "be remembered", need: "let go" });
    assert.notEqual(a.want, b.want);
    assert.notEqual(a.need, b.need);
  });
});
