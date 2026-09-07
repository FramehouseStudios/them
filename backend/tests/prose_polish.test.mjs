import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { polishActionLine } from "../lib/clementine/prose_polish.js";

describe("prose polish (writing craft)", () => {
  it("cuts we see + is scared -> grip tightens", () => {
    const r = polishActionLine({ line: "We see John is scared in the bedroom", motif: "listening shadow", imageEcho: "shadow with stain" });
    assert.ok(!r.polished.toLowerCase().includes("we see"));
    assert.ok(r.polished.includes("grip tightens"));
  });
  it("adds motif echo when thin", () => {
    const r = polishActionLine({ line: "The room holds its breath.", motif: "listening shadow" });
    assert.ok(r.polished.includes("listening shadow"));
  });
});
