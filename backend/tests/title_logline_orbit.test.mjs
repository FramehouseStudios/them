import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTitle, buildLogline, buildOrbitFakeTitlePage } from "../lib/clementine/title_logline.js";

describe("title logline orbit (screenwriting craft)", () => {
  it("title glitches with listening shadow motif", () => {
    const t = buildTitle({ setting: "bedroom", genre: "horror", motif: "listening shadow" });
    assert.ok(t.includes("BEDROOM") && t.includes("glitch"));
    const t2 = buildTitle({ setting: "kitchen", genre: "drama", motif: "window" });
    assert.ok(!t2.includes("glitch"));
  });
  it("logline includes characters, want/need, comps", () => {
    const l = buildLogline({ characters: ["John","Sally"], setting: "bedroom", genre: "horror", want: "prove safe", need: "admit fear", motif: "listening shadow" });
    assert.ok(l.includes("John & Sally") && l.includes("prove safe") && l.includes("admit fear") && l.includes("Hereditary"));
  });
  it("orbit fake title page bundles title+logline", () => {
    const p = buildOrbitFakeTitlePage({ project: { setting: "bedroom", genre: "horror", characters: [{name:"John"}] }, genre: "horror", setting: "bedroom", motif: "listening shadow" });
    assert.ok(p.title && p.logline && p.orbitFake === true);
    assert.ok(Array.isArray(p.comps) && p.comps.length===2);
  });
});
