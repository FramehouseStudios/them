import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildImageEcho, threadImageEcho } from "../lib/clementine/image_echo.js";

describe("image echo (writing craft)", () => {
  it("scene 1 clean, scene 8 scar kept", () => {
    const a = buildImageEcho({ scene: 1, motif: "listening shadow", scar: "second hand missing" });
    assert.ok(a.image.includes("clean") && a.motif === "listening shadow");
    const b = buildImageEcho({ scene: 8, motif: "listening shadow", scar: "second hand missing" });
    assert.ok(b.image.includes("scar kept") && b.image.includes("second hand missing"));
  });
  it("thread 8 scenes", () => {
    const scenes = Array.from({length:8}, (_,i)=>({ seq: i+1 }));
    const threaded = threadImageEcho({ scenes, motif: "listening shadow", scar: "scar" });
    assert.equal(threaded.length, 8);
    assert.ok(threaded[0].imageEcho.includes("clean") && threaded[7].imageEcho.includes("scar kept"));
  });
});
