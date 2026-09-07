import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectCraftCards, CRAFT_CARDS } from "../lib/clementine/craft_cards.js";
import { getFeatureBeats } from "../lib/clementine/feature_structure_knowledge.js";
import { buildPresenceHeaders, applyClementineTalkHeaders } from "../lib/clementine/talk_clementine_headers.js";

describe("presence-craft-feature-next", () => {
  it("dark ↔ tense synonym: dark tone matches dark+tense cards", () => {
    const dark = selectCraftCards({ tone: "dark" });
    const tense = selectCraftCards({ tone: "tense" });
    // craft_cards: at least one card that is dark-only should now be visible for tense and vice versa
    // cc-01 has dark+tense, but cc-03 is melancholic/dark/uplifting (no tense) — dark should find it, tense now should also find it via synonym
    const darkIds = new Set(dark.map(c=>c.id));
    const tenseIds = new Set(tense.map(c=>c.id));
    // cc-03 must be in both after synonym
    assert.ok(darkIds.has("cc-03"), "dark should include cc-03");
    assert.ok(tenseIds.has("cc-03"), "tense should include cc-03 via dark→tense synonym");
    // symmetry: a tense-only-ish card like cc-02 (dark/tense/cynical) is in both regardless, but check dark includes a tense-leaning card
    // Ensure at least 5 matches each tone
    assert.ok(dark.length >= 5);
    assert.ok(tense.length >= 5);
  });

  it("feature 90p has 40 beats, 15p does not", () => {
    const f90 = getFeatureBeats({ genre: "horror", tone: "dark", totalPages: 90 });
    assert.equal(f90.totalPages, 90);
    assert.equal(f90.beatCount, 40);
    assert.ok(Array.isArray(f90.beats40) && f90.beats40.length === 40);
    assert.equal(f90.beats40[0].beat, 1);
    assert.equal(f90.beats40[39].beat, 40);
    // pages monotonic
    for (let i=1;i<f90.beats40.length;i++) assert.ok(f90.beats40[i].page >= f90.beats40[i-1].page);
    const f15 = getFeatureBeats({ genre: "horror", totalPages: 15 });
    assert.equal(f15.beatCount, f15.acts.flatMap(a=>a.beats).length);
    assert.equal(f15.beats40, null);
  });

  it("presence 20-history header wired", () => {
    const project = { samanthaPresence: { state: "present", history: ["idle","listening","present","barge_in","present"], lastBargeInAt: 123, lastBargeInReason: "barge_in" }, characterContexts: [{name:"John"}] };
    const h = buildPresenceHeaders({ project });
    assert.equal(h.state, "present");
    assert.deepEqual(h.history, ["idle","listening","present","barge_in","present"]);
    const headers = {};
    const res = { setHeader(k,v){ headers[k.toLowerCase()] = String(v); } };
    applyClementineTalkHeaders(res, { project, draft: "x", parsed: null, quality: { confidence: "high" } });
    assert.ok(headers["x-samantha-presence"]);
    assert.ok(headers["x-presence-history"]);
    assert.equal(headers["x-presence-barge-at"], "123");
    assert.ok(headers["x-presence-barge-reason"]);
    // x-samantha-presence is encoded
    decodeURIComponent(headers["x-samantha-presence"]);
    decodeURIComponent(headers["x-presence-history"]);
  });

  it("god file gate unaffected", () => {
    // sanity: craft_cards still exports 20 cards
    assert.equal(CRAFT_CARDS.length, 20);
  });
});
