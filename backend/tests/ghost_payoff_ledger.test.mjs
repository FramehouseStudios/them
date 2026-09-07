import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGhostPayoffLedger, flagUnpaidGhostLedger } from "../lib/clementine/ghost_payoff_ledger.js";

describe("ghost payoff ledger (writing craft)", () => {
  it("ledger per character paid", () => {
    const l = buildGhostPayoffLedger({ characters: [{ name:"John", ghost:"age12", want:"prove safe", need:"admit fear" }, { name:"Sally", ghost:"remembered", want:"be remembered", need:"let go" }], finalImage: "final echo" });
    assert.equal(l.length, 2);
    assert.ok(l[0].paid && l[0].payoff.includes("John"));
    const flags = flagUnpaidGhostLedger({ ledger: l });
    assert.equal(flags.length, 0);
  });
});
