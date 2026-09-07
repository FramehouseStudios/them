import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { suggestCraftForWriter } from "../lib/clementine/craft_suggestion.js";
import { learnFromDraft } from "../lib/clementine/writer_learning.js";

describe("craft suggestion tailored to writer (partner learning)", () => {
  it("hedgy writer gets tighten craft", () => {
    const key = "craft-hedgy-" + Date.now();
    learnFromDraft({ ownerKey: key, draft: "He was very really just quickly. ".repeat(5) });
    const r = suggestCraftForWriter({ ownerKey: key, genre: "horror", tone: "dark" });
    assert.ok(r.craft && r.craft.id);
    assert.ok(r.reason.includes("tighten") || r.reason.includes("hedge") || r.profile.hedges > 2);
  });
});
