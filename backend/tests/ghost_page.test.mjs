import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGhostPage } from "../lib/clementine/ghost_page.js";

describe("ghost page (screenwriting craft)", () => {
  it("ghost page includes want/need/flaw + setting header", () => {
    const r = buildGhostPage({ character: "John", ghost: "bedroom memory age 12", want: "prove safe", need: "admit fear", flaw: "control", setting: "bedroom" });
    assert.ok(r.page.includes("INT. BEDROOM - GHOST PAGE - John"));
    assert.ok(r.page.includes("Want: prove safe") && r.page.includes("Need: admit fear"));
    assert.ok(r.ghost.includes("memory age 12"));
  });
});
