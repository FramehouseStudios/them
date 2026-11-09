import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSceneCraftImage } from "../lib/clementine/scene_craft_image.js";

describe("scene craft image (writing craft)", () => {
  it("scene 1 clean, scene 8 scar kept with craft", () => {
    const a = buildSceneCraftImage({ sceneIndex: 1, character: "John", want: "prove safe", need: "admit fear", ghost: "age12", motif: "listening shadow", scar: "second hand missing", sequence: { title: "Status Quo", setpiece: "opening image" } });
    assert.ok(a.image.includes("clean") && a.want === "prove safe");
    const b = buildSceneCraftImage({ sceneIndex: 8, character: "John", motif: "listening shadow", scar: "second hand missing", sequence: { title: "Final Image", setpiece: "final image" } });
    assert.ok(b.image.includes("scar kept") && b.imageEcho.includes("listening shadow"));
  });
});
