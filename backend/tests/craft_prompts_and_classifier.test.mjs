// T21 unit tests: craft_prompts + craft_classifier.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCraftContextBlock,
  buildClassificationPromptBlock,
  CRAFT_BLOCK_OPEN,
  CRAFT_BLOCK_CLOSE,
  CLASSIFY_BLOCK_OPEN,
} from "../lib/craft_prompts.js";
import {
  createDeterministicClassifier,
  createLLMClassifier,
  createDefaultClassifier,
} from "../lib/craft_classifier.js";

// ---------- craft_prompts ----------

test("buildCraftContextBlock returns empty string when nothing is supplied", () => {
  assert.equal(buildCraftContextBlock({}), "");
  assert.equal(buildCraftContextBlock({ framework: null, report: null }), "");
});

test("buildCraftContextBlock resolves a framework by id and emits required beats", () => {
  const block = buildCraftContextBlock({ framework: "save-the-cat" });
  assert.ok(block.startsWith(CRAFT_BLOCK_OPEN));
  assert.ok(block.endsWith(CRAFT_BLOCK_CLOSE));
  assert.ok(block.includes("Save the Cat!"));
  assert.ok(block.includes("required-major-turns: catalyst, midpoint, all-is-lost, finale"));
  assert.ok(block.includes("required-beats:"));
  assert.ok(block.includes("catalyst (Catalyst)"));
});

test("buildCraftContextBlock summarizes report coverage when present", () => {
  const block = buildCraftContextBlock({
    framework: "save-the-cat",
    report: {
      coverage: {
        requiredMajorTurnCount: 4,
        detectedMajorTurnCount: 3,
        overriddenMajorTurnCount: 0,
        missingMajorTurnCount: 1,
        complete: false,
      },
      drift: { status: "drifting" },
      majorTurns: [
        { turnId: "all-is-lost", label: "All Is Lost", required: true, detected: false, status: "missing", expectedPage: 75 },
      ],
    },
  });
  assert.ok(block.includes("complete=no"));
  assert.ok(block.includes("drift: drifting"));
  assert.ok(block.includes("missing-or-drifting:"));
  assert.ok(block.includes("all-is-lost"));
});

test("buildClassificationPromptBlock embeds the candidate beats and scene excerpt", () => {
  const block = buildClassificationPromptBlock({
    framework: "three-act",
    scene: { title: "INT. MOTEL - NIGHT", text: "ALICE\nThe walls keep moving." },
  });
  assert.ok(block.startsWith(CLASSIFY_BLOCK_OPEN));
  assert.ok(block.includes("Three-Act Structure"));
  assert.ok(block.includes("inciting-incident|Inciting Incident"));
  assert.ok(block.includes("INT. MOTEL - NIGHT"));
  assert.ok(block.includes("The walls keep moving."));
  assert.ok(block.includes("Respond as JSON"));
});

test("buildClassificationPromptBlock returns empty string for unknown framework", () => {
  assert.equal(buildClassificationPromptBlock({ framework: "no-such" }), "");
});

// ---------- craft_classifier ----------

test("deterministic classifier produces partial covering all required major turns", async () => {
  const c = createDeterministicClassifier();
  const out = await c.classifyScreenplay({ frameworkId: "save-the-cat", framework: "save-the-cat", screenplay: {} });
  assert.equal(c.kind, "deterministic-stub");
  assert.equal(out.source, "deterministic-stub");
  assert.equal(out.coverage.requiredMajorTurnCount, 4);
  assert.equal(out.coverage.detectedMajorTurnCount, 4);
  assert.equal(out.coverage.complete, true);
  assert.equal(out.majorTurns.length, 4);
});

test("LLM classifier rejects construction without OPENAI_API_KEY", () => {
  assert.throws(
    () => createLLMClassifier({ openaiApiKey: "", fetchImpl: () => {} }),
    /OPENAI_API_KEY is required/,
  );
});

test("LLM classifier classifyScene parses a strict-JSON model response", async () => {
  const recordedBody = [];
  const fetchImpl = async (url, init) => {
    recordedBody.push({ url, body: JSON.parse(init.body) });
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [
            { message: { content: '{"beatId":"midpoint","confidence":0.83,"rationale":"a clear pivot"}' } },
          ],
        };
      },
    };
  };
  const c = createLLMClassifier({ openaiApiKey: "test-key", fetchImpl });
  const result = await c.classifyScene({
    framework: "save-the-cat",
    scene: { title: "INT. ROOFTOP - DAWN", text: "she finds the letter." },
  });
  assert.equal(result.beatId, "midpoint");
  assert.equal(result.confidence, 0.83);
  assert.equal(result.rationale, "a clear pivot");
  assert.equal(recordedBody.length, 1);
  assert.equal(recordedBody[0].url, "https://api.openai.com/v1/chat/completions");
  assert.equal(recordedBody[0].body.model, "gpt-4o-mini");
  assert.equal(recordedBody[0].body.temperature, 0);
  assert.equal(recordedBody[0].body.response_format.type, "json_object");
});

test("LLM classifier classifyScene returns null beatId on unparseable response", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    async json() {
      return { choices: [{ message: { content: "no json here" } }] };
    },
  });
  const c = createLLMClassifier({ openaiApiKey: "k", fetchImpl });
  const r = await c.classifyScene({
    framework: "three-act",
    scene: { title: "x", text: "y" },
  });
  assert.equal(r.beatId, null);
  assert.equal(r.confidence, 0);
});

test("LLM classifier classifyScene throws on non-OK response", async () => {
  const fetchImpl = async () => ({ ok: false, status: 500 });
  const c = createLLMClassifier({ openaiApiKey: "k", fetchImpl });
  await assert.rejects(
    () => c.classifyScene({ framework: "save-the-cat", scene: { title: "t", text: "x" } }),
    /openai classify request failed: 500/,
  );
});

test("createDefaultClassifier returns deterministic when no API key is set", () => {
  const c = createDefaultClassifier({ env: {} });
  assert.equal(c.kind, "deterministic-stub");
});

test("createDefaultClassifier returns LLM when OPENAI_API_KEY is present", () => {
  const c = createDefaultClassifier({
    env: { OPENAI_API_KEY: "test" },
    fetchImpl: () => {},
  });
  assert.equal(c.kind, "openai");
});
