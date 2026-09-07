import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGhostLedger, flagUnpaidGhosts } from "../lib/clementine/ghost_ledger.js";

describe("ghost ledger (writing craft)", () => {
  it("ledger per scene ghost present middle, payoff final", () => {
    const scenes = Array.from({length:8}, (_,i)=>({ seq: i+1, title: `S${i+1}` }));
    const ghosts = [{ character:"John", ghost:"age12"}, { character:"Sally", ghost:"remembered"}];
    const l = buildGhostLedger({ scenes, ghosts });
    assert.equal(l.length, 8);
    assert.equal(l[0].present, false);
    assert.equal(l[3].present, true);
    assert.ok(l[7].payoff.includes("paid"));
    const flags = flagUnpaidGhosts({ ledger: l });
    assert.ok(flags.length === 7); // only final is paid
  });
});
