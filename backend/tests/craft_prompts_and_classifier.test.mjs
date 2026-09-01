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
  DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
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

test("buildCraftContextBlock does not mislabel unavailable analysis as a missing beat", () => {
  const block = buildCraftContextBlock({
    framework: "three-act",
    report: {
      coverage: {
        requiredMajorTurnCount: 3,
        detectedMajorTurnCount: 0,
        overriddenMajorTurnCount: 0,
        missingMajorTurnCount: 0,
        unavailableMajorTurnCount: 3,
        complete: false,
      },
      drift: { status: "unavailable" },
      majorTurns: [
        { turnId: "midpoint-twist", label: "Midpoint Twist", required: true, detected: false, status: "unavailable" },
      ],
    },
  });
  assert.ok(block.includes("unavailable=3"));
  assert.ok(block.includes("analysis-unavailable:"));
  assert.ok(!block.includes("missing-or-drifting:"));
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

test("buildClassificationPromptBlock bounds structured scene metadata", () => {
  const block = buildClassificationPromptBlock({
    framework: "three-act",
    scene: { title: "T".repeat(500), text: "X".repeat(5_000) },
  });
  assert.ok(block.includes("T".repeat(200)));
  assert.ok(!block.includes("T".repeat(201)));
  assert.ok(block.includes("X".repeat(1_200)));
  assert.ok(!block.includes("X".repeat(1_201)));
});

// ---------- craft_classifier ----------

test("deterministic classifier truthfully reports semantic analysis unavailable", async () => {
  const c = createDeterministicClassifier();
  const out = await c.classifyScreenplay({ frameworkId: "save-the-cat", framework: "save-the-cat", screenplay: {} });
  assert.equal(c.kind, "deterministic-stub");
  assert.equal(out.source, "deterministic-stub");
  assert.equal(out.coverage.complete, false);
  assert.equal(out.coverage.confidence, 0);
  assert.equal(out.majorTurns.length, 0);
  assert.ok(out.beats.every((beat) => beat.status === "unavailable"));
  const scene = await c.classifyScene({ framework: "save-the-cat", scene: { text: "A decoy." } });
  assert.equal(scene.status, "unavailable");
  assert.equal(scene.beatId, null);
  assert.equal(scene.confidence, 0);
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
    recordedBody.push({ url, body: JSON.parse(init.body), signal: init.signal });
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
  assert.equal(result.status, "classified");
  assert.equal(result.confidence, 0.83);
  assert.equal(result.rationale, "a clear pivot");
  assert.equal(recordedBody.length, 1);
  assert.equal(recordedBody[0].url, "https://api.openai.com/v1/chat/completions");
  assert.equal(recordedBody[0].body.model, "gpt-4o-mini");
  assert.equal(recordedBody[0].body.temperature, 0);
  assert.equal(recordedBody[0].body.max_tokens, DEFAULT_OPENAI_MAX_OUTPUT_TOKENS);
  assert.equal(recordedBody[0].body.response_format.type, "json_object");
  assert.ok(recordedBody[0].signal instanceof AbortSignal);
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
  assert.equal(r.status, "unavailable");
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

test("LLM classifier times out a hung request and opens its failure circuit", async () => {
  let calls = 0;
  const fetchImpl = async (_url, init) => {
    calls += 1;
    return await new Promise((_, reject) => {
      init.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });
  };
  const c = createLLMClassifier({
    openaiApiKey: "k",
    fetchImpl,
    timeoutMs: 100,
    failureThreshold: 1,
    circuitCooldownMs: 5_000,
  });
  await assert.rejects(
    () => c.classifyScene({ framework: "save-the-cat", scene: { title: "t", text: "x" } }),
    (error) => error?.code === "craft_classifier_timeout",
  );
  await assert.rejects(
    () => c.classifyScene({ framework: "save-the-cat", scene: { title: "t2", text: "y" } }),
    (error) => error?.code === "craft_classifier_circuit_open",
  );
  assert.equal(calls, 1, "an open circuit must not issue another paid request");
});

test("LLM classifier clamps caller-supplied output budgets", async () => {
  let requestBody = null;
  const c = createLLMClassifier({
    openaiApiKey: "k",
    maxOutputTokens: 50_000,
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        async json() {
          return { choices: [{ message: { content: '{"beatId":null,"confidence":0,"rationale":"none"}' } }] };
        },
      };
    },
  });
  await c.classifyScene({ framework: "save-the-cat", scene: { title: "t", text: "x" } });
  assert.equal(requestBody.max_tokens, 256);
});

test("LLM classifier aggregate never fabricates macro coverage", async () => {
  const c = createLLMClassifier({ openaiApiKey: "k", fetchImpl: async () => ({ ok: true }) });
  const out = await c.classifyScreenplay({
    framework: "save-the-cat",
    screenplay: { pageCount: 110, title: "Smoke" },
  });
  assert.equal(out.source, "openai-scene-classifier");
  assert.equal(typeof out._classifyScene, "function");
  assert.equal(out.coverage.complete, false);
  assert.ok(out.beats.every((beat) => beat.status === "unavailable"));
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
