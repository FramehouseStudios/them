// T13: OpenAI Realtime supplier.
//
// Extracts the existing OpenAI client-secret minting logic from
// backend/index.js into a self-contained module that satisfies the
// supplier interface in `realtime_supplier.js`. Production callers
// route through `createRealtimeSupplier()`; this module is also
// importable directly for unit tests that want to stub `fetchImpl`.

const DEFAULT_OPENAI_REALTIME_MODEL = "gpt-realtime-1.5";
const DEFAULT_OPENAI_REALTIME_VOICE = "marin";
const DEFAULT_INPUT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

function trimToString(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

function clampTtlSeconds(requested, fallback = 60, min = 30, max = 300) {
  const n = Math.floor(Number(requested) || 0);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(min, Math.min(max, n));
}

function createOpenAIRealtimeSupplier({
  apiKey = process.env.OPENAI_API_KEY,
  defaultModel = process.env.OPENAI_REALTIME_MODEL || DEFAULT_OPENAI_REALTIME_MODEL,
  defaultVoice = process.env.OPENAI_REALTIME_VOICE || DEFAULT_OPENAI_REALTIME_VOICE,
  defaultInputTranscriptionModel = process.env.OPENAI_REALTIME_INPUT_TRANSCRIPTION_MODEL || DEFAULT_INPUT_TRANSCRIPTION_MODEL,
  defaultTtlSeconds = 60,
  fetchImpl = globalThis.fetch,
  endpoint = process.env.OPENAI_REALTIME_ENDPOINT || "https://api.openai.com/v1/realtime/client_secrets",
  timeoutMs = 12_000,
} = {}) {
  function buildSessionConfig({ model, voice, instructions } = {}) {
    const session = {
      type: "realtime",
      model: trimToString(model) || defaultModel,
      audio: {
        input: {
          turn_detection: {
            type: "server_vad",
            threshold: 0.45,
            prefix_padding_ms: 300,
            silence_duration_ms: 360,
            create_response: true,
            interrupt_response: true,
          },
        },
        output: {
          voice: trimToString(voice) || defaultVoice,
        },
      },
    };
    if (defaultInputTranscriptionModel) {
      session.audio.input.transcription = { model: defaultInputTranscriptionModel };
    }
    const trimmedInstructions = trimToString(instructions);
    if (trimmedInstructions) session.instructions = trimmedInstructions;
    return session;
  }

  async function mintClientSecret({
    instructions = "",
    voice = "",
    model = "",
    ttlSeconds = null,
  } = {}) {
    if (!apiKey) {
      const err = new Error("OPENAI_API_KEY is required for the OpenAI realtime supplier");
      err.code = "realtime_supplier_unauthorized";
      err.status = 503;
      throw err;
    }
    if (!fetchImpl) {
      const err = new Error("fetch is not available; pass fetchImpl explicitly");
      err.code = "realtime_supplier_unauthorized";
      err.status = 500;
      throw err;
    }
    const sessionConfig = buildSessionConfig({ model, voice, instructions });
    const ttl = clampTtlSeconds(ttlSeconds, defaultTtlSeconds);

    let resp;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      resp = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expires_after: { anchor: "created_at", seconds: ttl },
          session: sessionConfig,
        }),
        signal: controller?.signal,
      });
    } catch (e) {
      const aborted = e?.name === "AbortError";
      const err = new Error(aborted
        ? "OpenAI realtime client_secret request timed out"
        : `OpenAI realtime client_secret request failed: ${e?.message || e}`);
      err.code = "realtime_supplier_request_failed";
      err.status = aborted ? 504 : 502;
      throw err;
    } finally {
      if (timeout) clearTimeout(timeout);
    }

    const rawText = await resp.text();
    if (!resp.ok) {
      const err = new Error(rawText || `OpenAI realtime client_secret returned ${resp.status}`);
      err.code = "realtime_supplier_request_failed";
      err.status = resp.status;
      throw err;
    }

    let payload = null;
    try { payload = rawText ? JSON.parse(rawText) : null; } catch (_e) { payload = null; }

    const value = String(
      payload?.value ||
      payload?.client_secret?.value ||
      payload?.clientSecret?.value ||
      ""
    ).trim();
    const expiresAt = Math.max(0, Number(
      payload?.expires_at ||
      payload?.client_secret?.expires_at ||
      payload?.clientSecret?.expiresAt ||
      0
    ));

    if (!value || !expiresAt) {
      const err = new Error("OpenAI realtime client_secret response missing value or expires_at");
      err.code = "realtime_supplier_response_invalid";
      err.status = 502;
      err.raw = payload;
      throw err;
    }

    return { value, expiresAt, sessionConfig, raw: payload };
  }

  return {
    kind: "openai",
    buildSessionConfig,
    mintClientSecret,
  };
}

export {
  createOpenAIRealtimeSupplier,
  DEFAULT_OPENAI_REALTIME_MODEL,
  DEFAULT_OPENAI_REALTIME_VOICE,
};
