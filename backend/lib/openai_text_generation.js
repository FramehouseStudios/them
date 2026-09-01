const CHAT_COMPLETIONS_MODE = "chat_completions";
const RESPONSES_MODE = "responses";
const REASONING_EFFORTS = new Set(["none", "low", "medium", "high", "xhigh", "max"]);
const FALLBACK_STATUSES = new Set([400, 403, 404, 408, 409, 422, 429, 500, 502, 503, 504]);

function normalizeOpenAIApiMode(value, fallback = CHAT_COMPLETIONS_MODE) {
  return String(value || "").trim().toLowerCase() === RESPONSES_MODE
    ? RESPONSES_MODE
    : fallback;
}

function normalizeReasoningEffort(value, fallback = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (REASONING_EFFORTS.has(normalized)) return normalized;
  const normalizedFallback = String(fallback || "").trim().toLowerCase();
  return REASONING_EFFORTS.has(normalizedFallback) ? normalizedFallback : "";
}

function resolveReasoningOutputTokenLimit(maxTokens, reasoningEffort = "medium") {
  const visibleBudget = Math.max(1, Math.round(Number(maxTokens || 1)));
  const effort = normalizeReasoningEffort(reasoningEffort, "medium");
  const ratio = effort === "none"
    ? 0
    : effort === "low"
      ? 0.30
      : effort === "medium"
        ? 0.75
        : effort === "high"
          ? 1.25
          : 1.75;
  const floor = effort === "none"
    ? 0
    : effort === "low"
      ? 768
      : effort === "medium"
        ? 1_536
        : effort === "high"
          ? 3_072
          : 4_096;
  const reasoningHeadroom = Math.max(floor, Math.ceil(visibleBudget * ratio));
  return Math.min(16_000, visibleBudget + reasoningHeadroom);
}

function buildOpenAITextRequest({
  apiMode = CHAT_COMPLETIONS_MODE,
  model,
  messages = [],
  temperature,
  maxTokens,
  reasoningEffort = "",
  stream = false,
} = {}) {
  const normalizedMode = normalizeOpenAIApiMode(apiMode);
  const normalizedMaxTokens = Math.max(1, Math.round(Number(maxTokens || 1)));
  const normalizedMessages = Array.isArray(messages) ? messages : [];
  if (normalizedMode === RESPONSES_MODE) {
    const effort = normalizeReasoningEffort(reasoningEffort, "medium");
    return {
      apiMode: RESPONSES_MODE,
      url: "https://api.openai.com/v1/responses",
      body: {
        model: String(model || "").trim(),
        input: normalizedMessages,
        max_output_tokens: resolveReasoningOutputTokenLimit(normalizedMaxTokens, effort),
        reasoning: { effort },
        store: false,
        ...(stream ? { stream: true } : {}),
      },
    };
  }

  return {
    apiMode: CHAT_COMPLETIONS_MODE,
    url: "https://api.openai.com/v1/chat/completions",
    body: {
      model: String(model || "").trim(),
      temperature: Number(temperature),
      max_tokens: normalizedMaxTokens,
      ...(stream ? { stream: true } : {}),
      ...(stream ? { stream_options: { include_usage: true } } : {}),
      messages: normalizedMessages,
    },
  };
}

function extractOpenAIResponseText(payload) {
  const direct = String(payload?.output_text ?? payload?.outputText ?? "").trim();
  if (direct) return direct;

  const parts = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const entry of Array.isArray(item?.content) ? item.content : []) {
      if (entry?.type !== "output_text" && entry?.type !== "text") continue;
      const text = String(entry?.text || "").trim();
      if (text) parts.push(text);
    }
  }
  return parts.join("\n").trim();
}

function normalizeOpenAIUsage(payload) {
  const usage = payload?.usage && typeof payload.usage === "object" ? payload.usage : {};
  const inputTokens = Math.max(0, Math.round(Number(
    usage.input_tokens ?? usage.prompt_tokens ?? 0
  ) || 0));
  const outputTokens = Math.max(0, Math.round(Number(
    usage.output_tokens ?? usage.completion_tokens ?? 0
  ) || 0));
  const reasoningTokens = Math.max(0, Math.round(Number(
    usage.output_tokens_details?.reasoning_tokens ??
    usage.completion_tokens_details?.reasoning_tokens ??
    0
  ) || 0));
  const totalTokens = Math.max(
    inputTokens + outputTokens,
    Math.round(Number(usage.total_tokens || 0) || 0)
  );
  return { inputTokens, outputTokens, reasoningTokens, totalTokens };
}

function normalizeOpenAITextResponseRaw(rawText, apiMode, { model = "" } = {}) {
  if (normalizeOpenAIApiMode(apiMode) !== RESPONSES_MODE) {
    return String(rawText || "");
  }

  let payload;
  try {
    payload = JSON.parse(String(rawText || ""));
  } catch {
    return String(rawText || "");
  }
  const content = extractOpenAIResponseText(payload);
  if (!content) return String(rawText || "");
  return JSON.stringify({
    id: payload?.id || null,
    model: payload?.model || model || null,
    choices: [{ message: { role: "assistant", content } }],
    usage: payload?.usage || null,
    response: payload,
  });
}

function parseOpenAITextStreamLine(line, apiMode) {
  const trimmed = String(line || "").trim();
  if (!trimmed || trimmed.startsWith(":") || !trimmed.startsWith("data:")) {
    return { handled: false, done: false, delta: "", error: "", usage: null };
  }
  const data = trimmed.slice(5).trim();
  if (!data) return { handled: false, done: false, delta: "", error: "", usage: null };
  if (data === "[DONE]") {
    return { handled: true, done: true, delta: "", error: "", usage: null };
  }

  let payload;
  try {
    payload = JSON.parse(data);
  } catch {
    return { handled: false, done: false, delta: "", error: "", usage: null };
  }
  if (normalizeOpenAIApiMode(apiMode) === RESPONSES_MODE) {
    if (payload?.type === "response.output_text.delta") {
      return {
        handled: true,
        done: false,
        delta: typeof payload?.delta === "string" ? payload.delta : "",
        error: "",
        usage: null,
      };
    }
    if (payload?.type === "response.completed") {
      return {
        handled: true,
        done: true,
        delta: "",
        error: "",
        usage: normalizeOpenAIUsage(payload?.response),
      };
    }
    if (payload?.type === "response.failed" || payload?.type === "error") {
      const error = String(
        payload?.response?.error?.message || payload?.error?.message || "Responses stream failed."
      ).trim();
      return { handled: true, done: true, delta: "", error, usage: null };
    }
    return { handled: true, done: false, delta: "", error: "", usage: null };
  }

  return {
    handled: true,
    done: false,
    delta: typeof payload?.choices?.[0]?.delta?.content === "string"
      ? payload.choices[0].delta.content
      : "",
    error: "",
    usage: payload?.usage ? normalizeOpenAIUsage(payload) : null,
  };
}

async function requestOpenAIText({
  apiKey,
  apiMode = CHAT_COMPLETIONS_MODE,
  model,
  messages,
  temperature,
  maxTokens,
  reasoningEffort = "",
  stream = false,
  fallbackModel = "",
  fetchWithTimeout,
  timeoutMs,
  signal = null,
} = {}) {
  if (typeof fetchWithTimeout !== "function") {
    throw new Error("requestOpenAIText requires fetchWithTimeout");
  }
  const primary = buildOpenAITextRequest({
    apiMode,
    model,
    messages,
    temperature,
    maxTokens,
    reasoningEffort,
    stream,
  });
  const perform = (request) => fetchWithTimeout(
    request.url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request.body),
      ...(signal ? { signal } : {}),
    },
    timeoutMs
  );

  const primaryResponse = await perform(primary);
  const normalizedFallbackModel = String(fallbackModel || "").trim();
  const canFallback =
    !primaryResponse?.ok &&
    primary.apiMode === RESPONSES_MODE &&
    normalizedFallbackModel &&
    normalizedFallbackModel !== String(model || "").trim() &&
    FALLBACK_STATUSES.has(Number(primaryResponse?.status || 0));
  if (!canFallback) {
    return {
      response: primaryResponse,
      apiMode: primary.apiMode,
      model: String(model || "").trim(),
      reasoningEffort: primary.apiMode === RESPONSES_MODE
        ? normalizeReasoningEffort(reasoningEffort, "medium")
        : "",
      fallbackUsed: false,
      primaryErrorText: "",
    };
  }

  const primaryErrorText = await primaryResponse.text();
  const fallback = buildOpenAITextRequest({
    apiMode: CHAT_COMPLETIONS_MODE,
    model: normalizedFallbackModel,
    messages,
    temperature,
    maxTokens,
    stream,
  });
  return {
    response: await perform(fallback),
    apiMode: fallback.apiMode,
    model: normalizedFallbackModel,
    reasoningEffort: "",
    fallbackUsed: true,
    primaryErrorText,
  };
}

export {
  CHAT_COMPLETIONS_MODE,
  RESPONSES_MODE,
  buildOpenAITextRequest,
  extractOpenAIResponseText,
  normalizeOpenAIApiMode,
  normalizeOpenAITextResponseRaw,
  normalizeOpenAIUsage,
  normalizeReasoningEffort,
  parseOpenAITextStreamLine,
  requestOpenAIText,
  resolveReasoningOutputTokenLimit,
};
