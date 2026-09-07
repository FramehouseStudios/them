import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { suggestCraftPerScene } from "../lib/clementine/scene_craft_suggestion.js";
import { learnFromDraft } from "../lib/clementine/writer_learning.js";

describe("scene craft suggestion (partner learning)", () => {
  it("8 seq each with tailored craft", () => {
    const key = "scene-craft-" + Date.now();
    learnFromDraft({ ownerKey: key, draft: "He was very really just quickly. ".repeat(5) });
    const scenes = suggestCraftPerScene({ ownerKey: key, genre: "horror", tone: "dark", totalPages: 90 });
    assert.equal(scenes.length, 8);
    assert.ok(scenes[0].craft && scenes[0].craft.id);
    assert.equal(scenes[0].seq, 1);
  });
});
