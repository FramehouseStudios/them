import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFinalImageEcho, buildPerBeatLoglines } from "../lib/clementine/final_image_echo.js";

describe("final image echo (screenwriting craft)", () => {
  it("echo same composition with scar", () => {
    const r = buildFinalImageEcho({ openingImage: "INT. BEDROOM - NIGHT clean", motif: "listening shadow", cost: "being remembered", scar: "second hand missing" });
    assert.ok(r.final.includes("INT. BEDROOM") && r.final.includes("second hand missing") && r.final.includes("being remembered"));
    assert.ok(r.echo.includes("listening shadow"));
  });
  it("per-beat loglines 8", () => {
    const beats = [{title:"Hook"},{title:"Inciting"}];
    const seqs = [{title:"Status Quo"},{title:"Debate"}];
    const out = buildPerBeatLoglines({ beats, sequences: seqs });
    assert.equal(out.length, 8);
    assert.equal(out[0].order, 1);
    assert.ok(out[0].logline.includes("Hook"));
  });
});
