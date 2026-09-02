// Muse Standard provider selection + chatSupplier adapter (D008 cutover).
//
// Gate: CLEMENTINE_MUSE_ENABLED=1 or CLEMENTINE_PROVIDER=muse, AND a server
// key (MODEL_API_KEY or MUSE_API_KEY). Keys never leave the server.
// When gated off / missing key → callers keep the OpenAI chatSupplier path.
// Reflex never uses Muse Spark.

import {
  buildPromptCacheKey,
  partitionPromptParts,
} from "./cache_policy.js";
import {
  createMuseClient,
  normalizeEffort,
  resolveApiKey,
  DEFAULT_MODEL,
} from "./muse_client.js";
import { LANE } from "./lanes.js";

function trimToString(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

function envFlagTruthy(value) {
  const n = trimToString(value).toLowerCase();
  return n === "1" || n === "true" || n === "yes" || n === "on";
}

/**
 * True when Companion/Page/Deep generation should use Muse Standard.
 * Reflex stays no-Spark regardless.
 */
function isClementineMuseEnabled(env = process.env) {
  const provider = trimToString(env.CLEMENTINE_PROVIDER).toLowerCase();
  const enabled =
    provider === "muse" || envFlagTruthy(env.CLEMENTINE_MUSE_ENABLED);
  if (!enabled) return false;
  return Boolean(resolveApiKey(undefined));
}

function isReflexLane(lane) {
  const n = trimToString(lane);
  return n === LANE.REFLEX || n.toLowerCase() === "reflex";
}

/**
 * Whether this chat call should go through Muse (vs OpenAI).
 * Pass lane from req.clementine when available.
 */
function shouldUseMuseForLane(lane, env = process.env) {
  if (!isClementineMuseEnabled(env)) return false;
  if (isReflexLane(lane)) return false;
  return true;
}

function extractMuseOutputText(payload) {
  const direct = trimToString(payload?.output_text ?? payload?.outputText);
  if (direct) return direct;
  const parts = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const entry of Array.isArray(item?.content) ? item.content : []) {
      const typ = trimToString(entry?.type).toLowerCase();
      if (typ && typ !== "output_text" && typ !== "text") continue;
      const text = trimToString(entry?.text);
      if (text) parts.push(text);
    }
  }
  return parts.join("\n").trim();
}

function normalizeMuseUsage(payload) {
  const usage = payload?.usage && typeof payload.usage === "object" ? payload.usage : {};
  const inputTokens = Math.max(
    0,
    Math.round(Number(usage.input_tokens ?? usage.prompt_tokens ?? 0) || 0)
  );
  const outputTokens = Math.max(
    0,
    Math.round(Number(usage.output_tokens ?? usage.completion_tokens ?? 0) || 0)
  );
  const reasoningTokens = Math.max(
    0,
    Math.round(
      Number(
        usage.output_tokens_details?.reasoning_tokens ??
          usage.completion_tokens_details?.reasoning_tokens ??
          0
      ) || 0
    )
  );
  const totalTokens = Math.max(
    inputTokens + outputTokens,
    Math.round(Number(usage.total_tokens || 0) || 0)
  );
  return { inputTokens, outputTokens, reasoningTokens, totalTokens };
}

/**
 * Map OpenAI-style chat messages → Muse Responses instructions + input.
 * Uses cache_policy partition helpers for prompt_cache_key.
 */
function messagesToMuseParts(messages = []) {
  const list = Array.isArray(messages) ? messages : [];
  const systemChunks = [];
  const input = [];
  for (const msg of list) {
    if (!msg || typeof msg !== "object") continue;
    const role = trimToString(msg.role).toLowerCase() || "user";
    const content = trimToString(msg.content);
    if (!content) continue;
    if (role === "system" || role === "developer") {
      systemChunks.push(content);
      continue;
    }
    input.push({
      role: role === "assistant" ? "assistant" : "user",
      content,
    });
  }
  const personaText = systemChunks[0] || "";
  const voiceSpecText = systemChunks.slice(1).join("\n\n");
  const parts = partitionPromptParts({
    personaText,
    voiceSpecText,
    dynamicContext: "",
    userUtterance: "",
  });
  // Prefer full system join as instructions when talk_handler packs a rich system prompt.
  const instructions =
    systemChunks.length > 0 ? systemChunks.join("\n\n").trim() : parts.instructions;
  return {
    instructions,
    input,
    promptCacheKey: parts.prompt_cache_key || buildPromptCacheKey(),
  };
}

function buildChatCompletionsShapedRaw(text, usage, model) {
  return JSON.stringify({
    id: "muse_local",
    model: model || DEFAULT_MODEL,
    choices: [{ message: { role: "assistant", content: String(text || "") } }],
    usage: {
      prompt_tokens: usage.inputTokens,
      completion_tokens: usage.outputTokens,
      total_tokens: usage.totalTokens,
      completion_tokens_details: { reasoning_tokens: usage.reasoningTokens },
    },
  });
}

/**
 * Wrap an OpenAI chatSupplier so Companion/Page/Deep can cut over to Muse
 * when the feature flag + server key are present. Same .chat / .stream surface.
 */
function createMuseAwareChatSupplier({
  openaiChatSupplier,
  museClient = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!openaiChatSupplier || typeof openaiChatSupplier.chat !== "function") {
    throw new Error("createMuseAwareChatSupplier requires openaiChatSupplier");
  }

  const muse =
    museClient ||
    createMuseClient({
      apiKey: resolveApiKey(undefined),
      fetchImpl,
    });

  async function chatViaMuse({
    model: requestedModel = "",
    maxTokens = 512,
    messages = [],
    reasoningEffort = "",
    effort = "",
    signal = null,
    promptCacheKey = null,
  } = {}) {
    const mapped = messagesToMuseParts(messages);
    const resolvedEffort = normalizeEffort(effort || reasoningEffort || "low");
    const result = await muse.createResponse({
      model: String(requestedModel || "").trim() || undefined,
      instructions: mapped.instructions,
      input: mapped.input,
      maxOutputTokens: maxTokens,
      reasoningEffort: resolvedEffort,
      store: false,
      promptCacheKey: promptCacheKey || mapped.promptCacheKey,
      signal,
    });
    const text = extractMuseOutputText(result.payload);
    const usage = normalizeMuseUsage(result.payload);
    const model = trimToString(result.payload?.model) || muse.defaultModel || DEFAULT_MODEL;
    const rawText = buildChatCompletionsShapedRaw(text, usage, model);
    return {
      response: {
        ok: true,
        status: Number(result.status || 200),
        text: async () => rawText,
      },
      rawText,
      model,
      apiMode: "responses",
      reasoningEffort: resolvedEffort,
      fallbackUsed: false,
      usage,
      provider: "muse",
      museRequest: result.request || null,
    };
  }

  return Object.freeze({
    kind: "muse-aware-chat",
    museEnabled: () => isClementineMuseEnabled(env),
    async stream(args = {}) {
      const prefer = String(args.preferProvider || args.provider || "").trim().toLowerCase();
      const useMuse =
        prefer !== "openai" &&
        shouldUseMuseForLane(args.lane, env) &&
        muse.hasApiKey;
      if (useMuse) {
        const chatResult = await chatViaMuse(args);
        let reply = "";
        try {
          const parsed = JSON.parse(chatResult.rawText || "{}");
          reply = trimToString(parsed?.choices?.[0]?.message?.content);
        } catch (_e) {
          reply = "";
        }
        return {
          reply,
          firstSentence: reply,
          model: chatResult.model,
          apiMode: chatResult.apiMode,
          reasoningEffort: chatResult.reasoningEffort,
          fallbackUsed: false,
          usage: chatResult.usage,
          provider: "muse",
        };
      }
      return openaiChatSupplier.stream(args);
    },
    async chat(args = {}) {
      const prefer = String(args.preferProvider || args.provider || "").trim().toLowerCase();
      const useMuse =
        prefer !== "openai" &&
        shouldUseMuseForLane(args.lane, env) &&
        muse.hasApiKey;
      if (useMuse) {
        return chatViaMuse(args);
      }
      return openaiChatSupplier.chat(args);
    },
  });
}

export {
  isClementineMuseEnabled,
  shouldUseMuseForLane,
  isReflexLane,
  messagesToMuseParts,
  extractMuseOutputText,
  normalizeMuseUsage,
  createMuseAwareChatSupplier,
};
