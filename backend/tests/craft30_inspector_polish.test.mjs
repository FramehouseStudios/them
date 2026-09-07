import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CRAFT_CARDS, selectCraftCards } from "../lib/clementine/craft_cards.js";
import { revertToProvenance } from "../lib/clementine/inspector_ux.js";

describe("craft30 inspector polish", () => {
  it("craft 30 cards, new ids cc-21..30 selectable", () => {
    assert.equal(CRAFT_CARDS.length, 30);
    const ids = new Set(CRAFT_CARDS.map(c=>c.id));
    for (let i=21;i<=30;i++) assert.ok(ids.has(`cc-${String(i).padStart(2,"0")}`));
    const dark = selectCraftCards({ tone: "dark" });
    assert.ok(dark.length >= 5);
    // new card cc-21 is sci-fi/mystery/drama dark -> should appear for sci-fi dark
    const sciDark = selectCraftCards({ genre: "sci-fi", tone: "dark" });
    assert.ok(sciDark.some(c=>c.id==="cc-21"));
  });
  it("provenance revert truncates", () => {
    const r = revertToProvenance({ history: ["user","clementine","coverage","user","beat"], target: "coverage" });
    assert.equal(r.reverted, true);
    assert.deepEqual(r.history, ["user","clementine","coverage"]);
  });
  it("InspectorProvenanceTimeline.swift exists not gated", async () => {
    const fs = await import("node:fs");
    assert.ok(fs.existsSync(new URL("../../them/InspectorProvenanceTimeline.swift", import.meta.url)));
  });
});
