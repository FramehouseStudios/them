import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPlanPrompt, parseNextBeats } from "../lib/clementine/page_multipass.js";

describe("page_multipass next-beats", () => {
  it("parseNextBeats returns 0 for no Next lines", () => {
    assert.deepEqual(parseNextBeats("no beats here"), []);
    assert.deepEqual(parseNextBeats(""), []);
    assert.deepEqual(parseNextBeats(null), []);
  });
  it("parseNextBeats returns 1 for single Next line", () => {
    const plan = "outline\nNext: protagonist finds clue — cost: loses trust";
    assert.deepEqual(parseNextBeats(plan), ["protagonist finds clue — cost: loses trust"]);
  });
  it("parseNextBeats returns 3 for three Next lines", () => {
    const plan = "line\nNext: A — cost: x\nNext: B — cost: y\nNext: C — cost: z\nend";
    assert.deepEqual(parseNextBeats(plan), ["A — cost: x", "B — cost: y", "C — cost: z"]);
  });
  it("parseNextBeats truncates at 3 for 5 Next lines", () => {
    const plan = ["Next: 1", "Next: 2", "Next: 3", "Next: 4", "Next: 5"].join("\n");
    const out = parseNextBeats(plan);
    assert.equal(out.length, 3);
    assert.deepEqual(out, ["1", "2", "3"]);
  });
  it("parseNextBeats truncates long lines at 180 chars", () => {
    const long = "Next: " + "x".repeat(250);
    const out = parseNextBeats(long);
    assert.equal(out[0].length, 180);
    assert.equal(out[0], "x".repeat(180));
  });
  it("buildPlanPrompt contains no proper names", () => {
    const prompt = buildPlanPrompt("write a scene where she leaves");
    // Ensure demo names from scratch branch are not present
    assert.equal(/Jess/.test(prompt), false);
    assert.equal(/Marcus/.test(prompt), false);
    assert.equal(/JESS/.test(prompt), false);
    assert.equal(/MARCUS/.test(prompt), false);
    // Should contain generic protagonist wording and Next: instruction
    assert.match(prompt, /Next:/);
    assert.match(prompt, /protagonist/i);
  });
  it("buildPlanPrompt is roster-free when called with single arg", () => {
    const prompt = buildPlanPrompt("test utterance");
    // No roster hint leakage
    assert.equal(prompt.includes("Roster:"), false);
  });
});
