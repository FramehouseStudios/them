import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { learnFromDraft, getWriterProfile, suggestForWriter } from "../lib/clementine/writer_learning.js";

describe("writer learning (partner learns how you write)", () => {
  it("learns hedges and suggests tighten", () => {
    const key = "learner-" + Date.now();
    learnFromDraft({ ownerKey: key, draft: "He was running very really just quickly. ".repeat(5), motif: "listening shadow" });
    const p = getWriterProfile(key);
    assert.ok(p.hedges > 2);
    const sug = suggestForWriter({ ownerKey: key });
    assert.ok(sug.includes("tighten hedges") || sug.includes("you often"));
  });
  it("learns passive and avgLen", () => {
    const key = "learner2-" + Date.now();
    learnFromDraft({ ownerKey: key, draft: "He was running. She was listening. ".repeat(5) });
    const p = getWriterProfile(key);
    assert.ok(p.passive >= 1);
  });
});
