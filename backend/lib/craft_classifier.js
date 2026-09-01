// Beat classifier (T21).
//
// Two implementations behind one interface:
//   - createDeterministicClassifier()  — an honest offline fallback. It can
//                                        establish no semantic evidence.
//   - createLLMClassifier({ openaiApiKey, model, fetchImpl }) — uses
//                                        OpenAI chat completions and the
//                                        prompt block from craft_prompts.js.
//
// `createDefaultClassifier()` picks LLM when OPENAI_API_KEY is set,
// deterministic otherwise. Tests inject a stub fetchImpl to exercise
// the LLM branch without a real network call.
//
// Scene classification is the production boundary consumed by
// analyzeScreenplay. Page coordinates never substitute for semantic evidence.

import {
  getFrameworkById,
  isKnownFrameworkId,
} from "./craft_frameworks.js";
import { buildClassificationPromptBlock } from "./craft_prompts.js";

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_OPENAI_TIMEOUT_MS = 10_000;
const MAX_OPENAI_TIMEOUT_MS = 15_000;
const DEFAULT_OPENAI_MAX_OUTPUT_TOKENS = 160;
const MAX_OPENAI_OUTPUT_TOKENS = 256;
const DEFAULT_OPENAI_FAILURE_THRESHOLD = 2;
const DEFAULT_OPENAI_CIRCUIT_COOLDOWN_MS = 30_000;

function boundedInteger(value, fallback, { min, max }) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function classifierError(message, code, cause = null) {
  const err = new Error(message);
  err.code = code;
  if (cause) err.cause = cause;
  return err;
}

// ---------- deterministic classifier ----------

function createDeterministicClassifier() {
  return {
    kind: "deterministic-stub",
    async classifyScene() {
      return {
        status: "unavailable",
        beatId: null,
        confidence: 0,
        rationale: "Semantic craft classification is unavailable without a configured classifier.",
        source: "deterministic-stub",
      };
    },
    async classifyScreenplay({ framework, screenplay = {} }) {
      const fw = typeof framework === "string"
        ? getFrameworkById(framework)
        : framework;
      if (!fw) throw new Error("unknown framework");
      const beats = (fw.beats || []).map((beatDef) => ({
        frameworkBeatId: beatDef.id,
        label: beatDef.label,
        status: "unavailable",
        classificationSource: "deterministic-stub",
        evidence: [],
        expectedPageRange: beatDef.expectedPageRange ? { ...beatDef.expectedPageRange } : undefined,
        summary: beatDef.summary,
        majorTurnId: beatDef.majorTurnId,
      }));
      return {
        beats,
        majorTurns: [],
        coverage: { complete: false, confidence: 0 },
        drift: {
          status: "unavailable",
          summary: "Analysis unavailable: the offline classifier has no semantic evidence.",
          timeline: [],
        },
        source: "deterministic-stub",
      };
    },
  };
}

// ---------- LLM classifier ----------

function safeJson(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  // Best-effort extraction of the first {...} block.
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch (_e) {
    return null;
  }
}

function createLLMClassifier({
  openaiApiKey = process.env.OPENAI_API_KEY,
  model = DEFAULT_OPENAI_MODEL,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_OPENAI_TIMEOUT_MS,
  maxOutputTokens = DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
  failureThreshold = DEFAULT_OPENAI_FAILURE_THRESHOLD,
  circuitCooldownMs = DEFAULT_OPENAI_CIRCUIT_COOLDOWN_MS,
  now = () => Date.now(),
} = {}) {
  if (!openaiApiKey) {
    const err = new Error("OPENAI_API_KEY is required for the LLM classifier");
    err.code = "craft_classifier_no_api_key";
    throw err;
  }
  if (!fetchImpl) {
    throw new Error("fetch is not available; pass fetchImpl explicitly");
  }

  const requestTimeoutMs = boundedInteger(
    timeoutMs,
    DEFAULT_OPENAI_TIMEOUT_MS,
    { min: 100, max: MAX_OPENAI_TIMEOUT_MS },
  );
  const outputTokenBudget = boundedInteger(
    maxOutputTokens,
    DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
    { min: 32, max: MAX_OPENAI_OUTPUT_TOKENS },
  );
  const circuitFailureThreshold = boundedInteger(
    failureThreshold,
    DEFAULT_OPENAI_FAILURE_THRESHOLD,
    { min: 1, max: 5 },
  );
  const circuitResetMs = boundedInteger(
    circuitCooldownMs,
    DEFAULT_OPENAI_CIRCUIT_COOLDOWN_MS,
    { min: 1_000, max: 5 * 60_000 },
  );
  let consecutiveFailures = 0;
  let circuitOpenedAt = 0;

  function assertCircuitAvailable() {
    if (consecutiveFailures < circuitFailureThreshold) return;
    if ((now() - circuitOpenedAt) >= circuitResetMs) {
      consecutiveFailures = 0;
      circuitOpenedAt = 0;
      return;
    }
    throw classifierError(
      "openai craft classifier circuit is open",
      "craft_classifier_circuit_open",
    );
  }

  function recordFailure() {
    consecutiveFailures += 1;
    if (consecutiveFailures >= circuitFailureThreshold) circuitOpenedAt = now();
  }

  function recordSuccess() {
    consecutiveFailures = 0;
    circuitOpenedAt = 0;
  }

  async function classifyScene({ framework, scene }) {
    assertCircuitAvailable();
    const promptBlock = buildClassificationPromptBlock({ framework, scene });
    const body = {
      model,
      temperature: 0,
      max_tokens: outputTokenBudget,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a screenplay structure classifier. Respond with strict JSON." },
        { role: "user", content: promptBlock },
      ],
    };
    const controller = new AbortController();
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(classifierError(
          `openai craft classifier timed out after ${requestTimeoutMs}ms`,
          "craft_classifier_timeout",
        ));
      }, requestTimeoutMs);
    });
    const request = (async () => {
      const resp = await fetchImpl("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!resp || !resp.ok) {
        const status = resp?.status || 0;
        const err = classifierError(
          `openai classify request failed: ${status}`,
          "craft_classifier_request_failed",
        );
        err.status = status;
        throw err;
      }
      return resp.json();
    })();

    try {
      const data = await Promise.race([request, timeout]);
      const text = data?.choices?.[0]?.message?.content || "";
      const parsed = safeJson(text);
      if (!parsed) {
        recordFailure();
        return {
          status: "unavailable",
          beatId: null,
          confidence: 0,
          rationale: "could not parse classifier response",
          source: `openai:${model}`,
        };
      }
      recordSuccess();
      return {
        status: "classified",
        beatId: typeof parsed.beatId === "string" ? parsed.beatId : null,
        confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
        rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
        source: `openai:${model}`,
      };
    } catch (error) {
      recordFailure();
      if (error?.code) throw error;
      throw classifierError(
        `openai classify request failed: ${error?.message || "unknown error"}`,
        "craft_classifier_request_failed",
        error,
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    kind: "openai",
    async classifyScreenplay({ framework, screenplay = {} }) {
      const fw = typeof framework === "string"
        ? getFrameworkById(framework)
        : framework;
      if (!fw) throw new Error("unknown framework");
      const stub = await createDeterministicClassifier().classifyScreenplay({ framework, screenplay });
      return { ...stub, source: "openai-scene-classifier", _classifyScene: classifyScene };
    },
    classifyScene,
  };
}

// ---------- factory ----------

function createDefaultClassifier({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (env?.OPENAI_API_KEY) {
    try {
      return createLLMClassifier({
        openaiApiKey: env.OPENAI_API_KEY,
        fetchImpl,
        timeoutMs: env.CRAFT_CLASSIFIER_TIMEOUT_MS,
        maxOutputTokens: env.CRAFT_CLASSIFIER_MAX_OUTPUT_TOKENS,
        failureThreshold: env.CRAFT_CLASSIFIER_FAILURE_THRESHOLD,
        circuitCooldownMs: env.CRAFT_CLASSIFIER_CIRCUIT_COOLDOWN_MS,
      });
    } catch (_e) {
      return createDeterministicClassifier();
    }
  }
  return createDeterministicClassifier();
}

export {
  DEFAULT_OPENAI_CIRCUIT_COOLDOWN_MS,
  DEFAULT_OPENAI_FAILURE_THRESHOLD,
  DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
  DEFAULT_OPENAI_TIMEOUT_MS,
  MAX_OPENAI_OUTPUT_TOKENS,
  MAX_OPENAI_TIMEOUT_MS,
  createDeterministicClassifier,
  createLLMClassifier,
  createDefaultClassifier,
  isKnownFrameworkId,
};
