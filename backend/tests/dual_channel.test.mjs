import test from "node:test";
import assert from "node:assert/strict";
import { splitDualChannel, runDualChannel } from "../lib/clementine/dual_channel.js";

test("splitDualChannel separates page and conversation systems", () => {
  const parsed = { genre:"horror", setting:"bedroom", characters:["John"], influences:{directors:["Nolan"], tones:["tense"]} };
  const { pageSystem, conversationSystem } = splitDualChannel({ baseSystem:"BASE", parsed });
  assert.ok(pageSystem.includes("Fountain"));
  assert.ok(!conversationSystem.includes("Fountain"));
  assert.ok(conversationSystem.includes("discussing story ideas"));
});

test("runDualChannel parallel page + convo (mock)", async () => {
  const parsed = { genre:"sci-fi", setting:"space", characters:["Alex","Maya"], influences:{tones:["tense"]}, totalPages:15, requestedPages:1 };
  const chatSupplier = {
    chat: async ({ lane }) => {
      if (lane==="Page") return { text: "INT. SPACE\n\nALEX\nWe go.", usage:{outputTokens:100} };
      return { text: "Here are 2 ideas: 1) fake set twist. 2) midnight chase.", usage:{outputTokens:20} };
    }
  };
  const r = await runDualChannel({ req:{clementine:{}}, parsed, project:null, chatSupplier, baseSystem:"BASE" });
  assert.ok(r.draft.includes("INT. SPACE"));
  assert.ok(r.conversationReply.includes("ideas"));
  assert.notEqual(r.draft, r.conversationReply);
});
