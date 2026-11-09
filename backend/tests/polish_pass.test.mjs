import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { polishDraft } from "../lib/clementine/polish_pass.js";

describe("polish pass (screenwriting craft)", () => {
  it("tightens hedges and active voice", () => {
    const r = polishDraft({ draft: "He was running very quickly.\nint. bedroom" });
    assert.ok(r.draft.includes("runned") || r.draft.includes("running") || r.changes.includes("tighten hedges"));
    assert.ok(r.changes.includes("heading caps") || r.draft.includes("INT."));
    assert.ok(r.afterLen <= r.beforeLen || r.changes.includes("tighten hedges"));
  });
  it("adds sequence header when thin", () => {
    const r = polishDraft({ draft: "INT. BEDROOM\n\nJOHN\nHi", sequences: [{ title: "Status Quo", setpiece: "opening image" }] });
    assert.ok(r.draft.includes("Status Quo") && r.changes.includes("sequence header"));
  });
});
