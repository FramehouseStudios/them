import test from "node:test";
import assert from "node:assert/strict";
import { runShortFilmLane } from "../lib/clementine/short_film_lane.js";
import { generateOfflineShortFilmDraft } from "../lib/clementine/short_film_prompt.js";
import { resolveShortFilmCraftContext } from "../lib/clementine/short_film_craft_context.js";

const parsed = { totalPages: 15, requestedPages: 5, genre: "horror", setting: "bedroom", characters: ["John","Sally","Sam"] };

test("lane generates 5-page via injected offline draft (plain Fountain)", async () => {
  const req = { clementine: { lane: "Page" } };
  const { draft, pages } = await runShortFilmLane({ req, parsed, offlineDraftFn: generateOfflineShortFilmDraft });
  assert.equal(pages, 5);
  assert.ok(draft.includes("INT. BEDROOM"), "missing INT. BEDROOM");
  assert.ok(!draft.includes("--- PAGE"), "should not contain PAGE markers — plain Fountain");
  assert.ok(/John/i.test(draft) && /Sally/i.test(draft) && /Sam/i.test(draft));
});

test("lane throws without draft when no supplier and no injection", async () => {
  const req = { clementine: { lane: "Page" } };
  await assert.rejects(() => runShortFilmLane({ req, parsed }), (e) => e.code === "short_film_no_draft");
});

test("lane surfaces provider error as talk failure", async () => {
  const req = { clementine: { lane: "Page" } };
  const failingSupplier = { chat: async () => { const err = new Error("provider down"); err.status = 500; throw err; } };
  await assert.rejects(() => runShortFilmLane({ req, parsed, chatSupplier: failingSupplier }), (e) => e.message === "provider down");
});

test("lane aborts on signal", async () => {
  const req = { clementine: { lane: "Page" } };
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => runShortFilmLane({ req, parsed, signal: controller.signal, offlineDraftFn: generateOfflineShortFilmDraft }), (e) => e.code === "page_generation_cancelled");
});

test("lane uses live supplier when provided", async () => {
  const req = { clementine: { lane: "Page" } };
  const fakeSupplier = {
    chat: async () => ({ text: "INT. BEDROOM\nLive draft", usage: { outputTokens: 500 } })
  };
  const { draft } = await runShortFilmLane({ req, parsed, chatSupplier: fakeSupplier });
  assert.ok(draft.includes("Live draft") || draft.includes("INT. BEDROOM"));
});

test("lane forwards caller's system + short-film block to supplier", async () => {
  const req = { clementine: { lane: "Page" } };
  let capturedSystem = "";
  const fakeSupplier = {
    chat: async ({ messages }) => {
      capturedSystem = messages.find(m => m.role === "system")?.content || "";
      return { text: "INT. BEDROOM\nok", usage: { outputTokens: 10 } };
    }
  };
  const baseSystem = "You are Clementine. Persona + contract.";
  await runShortFilmLane({ req, parsed, chatSupplier: fakeSupplier, baseSystem, chatModelPlan: { model: "test-model", apiMode: "chat_completions", reasoningEffort: "low", fallbackModel: "fallback" } });
  assert.ok(capturedSystem.includes("You are Clementine"), "should include caller's system");
  assert.ok(capturedSystem.includes("INT. BEDROOM"), "should include short-film block");
});

test("lane passes apiMode/reasoningEffort/fallbackModel from chatModelPlan", async () => {
  const req = { clementine: { lane: "Page", effort: "medium" } };
  let captured = null;
  const fakeSupplier = {
    chat: async (opts) => {
      captured = opts;
      return { text: "INT. BEDROOM\nok", usage: { outputTokens: 10 } };
    }
  };
  const plan = { model: "gpt-5.6-sol", apiMode: "responses", reasoningEffort: "medium", fallbackModel: "gpt-4o", maxTokens: 3000, temperature: 0.8 };
  await runShortFilmLane({ req, parsed, chatSupplier: fakeSupplier, chatModelPlan: plan });
  assert.equal(captured.apiMode, "responses");
  assert.equal(captured.fallbackModel, "gpt-4o");
  assert.equal(captured.model, "gpt-5.6-sol");
});

test("lane wires selected craft into the live supplier prompt", async () => {
  const craftParsed = {
    ...parsed,
    totalPages: 90,
    influences: { tones: ["tense"] },
  };
  const selected = resolveShortFilmCraftContext(craftParsed);
  let capturedSystem = "";
  await runShortFilmLane({
    req: { clementine: { lane: "Page" } },
    parsed: craftParsed,
    chatSupplier: {
      chat: async ({ messages }) => {
        capturedSystem = messages.find((message) => message.role === "system")?.content || "";
        return { text: "INT. BEDROOM - NIGHT\n\nJOHN\nStay close.", usage: { outputTokens: 10 } };
      },
    },
  });
  assert.equal(selected.cards.length, 2);
  for (const card of selected.cards) assert.ok(capturedSystem.includes(card.title));
});
