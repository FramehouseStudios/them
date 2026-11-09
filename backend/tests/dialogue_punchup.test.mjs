import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { punchUpDialogue } from "../lib/clementine/dialogue_punchup.js";

describe("dialogue punchup (screenwriting craft)", () => {
  it("John short control punchup", () => {
    const r = punchUpDialogue({ line: "I really want to stay very much,", character: "John", note: "punch-up tighten" });
    assert.ok(r.rewritten && r.character === "John" && r.cadence.includes("control"));
    assert.ok(!r.rewritten.includes("really") || r.rewritten.includes("."));
  });
  it("Sally lyrical punchup adds lexicon word if present", () => {
    const r = punchUpDialogue({ line: "We need to go.", character: "Sally", note: "subtext unsaid" });
    assert.ok(r.cadence.includes("lyrical"));
    assert.ok(r.rewritten.includes("We need to go."));
  });
});
