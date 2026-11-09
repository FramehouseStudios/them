import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSceneImageEcho2 } from "../lib/clementine/scene_image_echo2.js";

describe("scene image echo2 (writing craft)", () => {
  it("scene 1 clean, scene 2 stain, scene 3 scar", () => {
    const a = buildSceneImageEcho2({ scene: 1, motif: "listening shadow" });
    assert.ok(a.image.includes("clean"));
    const b = buildSceneImageEcho2({ scene: 2, motif: "listening shadow" });
    assert.ok(b.image.includes("stain"));
    const c = buildSceneImageEcho2({ scene: 3, motif: "listening shadow" });
    assert.ok(c.image.includes("scar"));
  });
});
