import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSubtext, analyzeStatus } from "../lib/clementine/dialogue_subtext.js";
import { buildGhostPayoff, trackGhostPayoffs } from "../lib/clementine/ghost_payoff.js";

describe("dialogue subtext ghost payoff (writing craft)", () => {
  it("status up/down/even subtext", () => {
    const up = buildSubtext({ line: "We need to stay.", character: "John", status: "up" });
    assert.ok(up.subtext.includes("controls") && up.subtext.includes("We need to stay."));
    assert.equal(analyzeStatus({ line: "Please stay", character: "Sally" }), "down");
    assert.equal(analyzeStatus({ line: "We need to go", character: "John" }), "up");
  });
  it("ghost payoff per character + track", () => {
    const r = buildGhostPayoff({ character: "John", ghost: "bedroom memory age 12", want: "prove safe", need: "admit fear", finalImage: "INT. BEDROOM - echo scar" });
    assert.ok(r.payoff.includes("John") && r.payoff.includes("bedroom memory") && r.paid);
    const arr = trackGhostPayoffs({ characters: [{ name:"John", ghost:"age12", want:"prove safe", need:"admit fear" }, { name:"Sally", ghost:"remembered", want:"be remembered", need:"let go" }], finalImage: "final echo" });
    assert.equal(arr.length, 2);
    assert.ok(arr[0].payoff.includes("John") && arr[1].payoff.includes("Sally"));
  });
});
