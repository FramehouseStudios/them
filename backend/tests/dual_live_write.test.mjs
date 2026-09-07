import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dualLiveWrite } from "../lib/clementine/dual_live_write.js";

describe("dual live write (talk + Fountain concurrent)", () => {
  it("writes pages in correct Fountain 55-line while talking", async () => {
    const fakeSupplier = {
      chat: async ({ lane }) => {
        if (lane === "Page") return { text: "INT. BEDROOM\n\nJOHN\nHello\n\nSALLY\nHi\n", usage: { totalTokens: 10 } };
        return { text: "Here are 2 story thoughts: ...", usage: {} };
      }
    };
    const chunks = [];
    let convo = "";
    const res = await dualLiveWrite({
      req: { clementine: {} },
      parsed: { genre: "horror", setting: "bedroom", characters: ["John","Sally"], influences: { tones: ["dark"] } },
      project: { id: "p1" },
      chatSupplier: fakeSupplier,
      baseSystem: "You are Clementine",
      signal: null,
      chatModelPlan: {},
      onPageChunk: (c) => chunks.push(c),
      onConversationChunk: (t) => convo = t,
    });
    assert.ok(res.draft.includes("INT.") && res.draft.includes("JOHN"));
    assert.equal(res.pages.length >= 1, true);
    assert.ok(chunks.length >= 1 && chunks[0].pageText.includes("INT."));
    assert.ok(convo.includes("story thoughts") || res.conversationReply.includes("story thoughts"));
    assert.ok(res.livePaper.pages.length === res.pages.length);
    assert.ok(res.fdx.includes("<FinalDraft"));
  });
});
