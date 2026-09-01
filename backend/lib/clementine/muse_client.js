// Thin Muse Spark client stub (D008 / T-clementine-muse-runtime-skeleton).
//
// Mirrors the shape of backend/lib/openai_text_generation.js + realtime
// supplier injectability (fetchImpl, env keys). Points at Meta Model API
// Responses endpoint. No real key required in unit tests — inject fetchImpl.
//
// Plug-in point: talk / page pipelines call createMuseClient() the same way
// createRealtimeSupplier() / requestOpenAIText() are used today. OpenAI
// adapters remain until cutover (D008 consequences).

import { buildPromptCacheKey } from "./cache_policy.js";

const DEFAULT_BASE_URL = "https://api.meta.ai/v1";
const DEFAULT_MODEL = "muse-spark-1.2";
const DEFAULT_TIMEOUT_MS = 30_000;
const EFFORTS = new Set(["none", "minimal", "low", "medium", "high"]);

function trimToString(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

function resolveApiKey(explicit) {
  const fromArg = trimToString(explicit);
  if (fromArg) return fromArg;
  return (
    trimToString(process.env.MODEL_API_KEY) ||
    trimToString(process.env.MUSE_API_KEY) ||
    ""
  );
}

function normalizeEffort(value, fallback = "low") {
  const n = trimToString(value).toLowerCase();
  if (EFFORTS.has(n)) return n;
  const f = trimToString(fallback).toLowerCase();
  return EFFORTS.has(f) ? f : "low";
}

/**
 * Build a Responses API request for Muse Spark Standard.
 * Companion chat always sets store:false.
 */
function buildMuseResponsesRequest({
  model = process.env.MUSE_MODEL || DEFAULT_MODEL,
  instructions = "",
  input = [],
  maxOutputTokens = 512,
  reasoningEffort = "low",
  store = false,
  promptCacheKey = null,
  stream = false,
  baseUrl = process.env.MUSE_API_BASE || DEFAULT_BASE_URL,
} = {}) {
  const url = `${trimToString(baseUrl).replace(/\/$/, "")}/responses`;
  const body = {
    model: trimToString(model) || DEFAULT_MODEL,
    max_output_tokens: Math.max(1, Math.round(Number(maxOutputTokens) || 1)),
    reasoning: { effort: normalizeEffort(reasoningEffort) },
    store: store === true,
    prompt_cache_key: trimToString(promptCacheKey) || buildPromptCacheKey(),
  };
  const instr = trimToString(instructions);
  if (instr) body.instructions = instr;
  if (Array.isArray(input)) body.input = input;
  else if (trimToString(input)) body.input = trimToString(input);
  if (stream) body.stream = true;
  return { url, body };
}

function createMuseClient({
  apiKey = undefined,
  baseUrl = process.env.MUSE_API_BASE || DEFAULT_BASE_URL,
  defaultModel = process.env.MUSE_MODEL || DEFAULT_MODEL,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const key = resolveApiKey(apiKey);

  async function createResponse(opts = {}) {
    if (!key) {
      const err = new Error("MODEL_API_KEY or MUSE_API_KEY is required for Muse client");
      err.code = "muse_client_unauthorized";
      err.status = 503;
      throw err;
    }
    if (typeof fetchImpl !== "function") {
      const err = new Error("fetch is not available; pass fetchImpl explicitly");
      err.code = "muse_client_unauthorized";
      err.status = 500;
      throw err;
    }

    const request = buildMuseResponsesRequest({
      ...opts,
      model: opts.model || defaultModel,
      baseUrl,
      // Companion default: never store. Callers may override for non-companion.
      store: opts.store === true,
    });

    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    let resp;
    try {
      resp = await fetchImpl(request.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request.body),
        signal: controller?.signal,
      });
    } catch (e) {
      const aborted = e?.name === "AbortError";
      const err = new Error(aborted
        ? "Muse responses request timed out"
        : `Muse responses request failed: ${e?.message || e}`);
      err.code = "muse_client_request_failed";
      err.status = aborted ? 504 : 502;
      throw err;
    } finally {
      if (timeout) clearTimeout(timeout);
    }

    const rawText = await resp.text();
    let payload = null;
    try { payload = rawText ? JSON.parse(rawText) : null; } catch (_e) { payload = null; }
    if (!resp.ok) {
      const err = new Error(rawText || `Muse responses returned ${resp.status}`);
      err.code = "muse_client_request_failed";
      err.status = resp.status;
      err.payload = payload;
      throw err;
    }
    return { ok: true, status: resp.status, payload, request };
  }

  return {
    kind: "muse",
    baseUrl: trimToString(baseUrl).replace(/\/$/, "") || DEFAULT_BASE_URL,
    defaultModel: trimToString(defaultModel) || DEFAULT_MODEL,
    hasApiKey: Boolean(key),
    buildRequest: (opts) => buildMuseResponsesRequest({
      ...opts,
      model: opts?.model || defaultModel,
      baseUrl,
    }),
    createResponse,
  };
}

export {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  buildMuseResponsesRequest,
  createMuseClient,
  normalizeEffort,
  resolveApiKey,
};
