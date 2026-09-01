// D010 / D009 — TTS synthesis helpers extracted from index.js.
// Kinds: openai | elevenlabs_platform | elevenlabs_byok
// BYOK uses a request-scoped user xi-api-key only (never persisted here).

import {
  normalizeElevenLabsVoiceId,
  normalizeSnippet,
  parseNumberInRange,
  parseOneOf,
} from "./utils.js";

export const TTS_KIND_OPENAI = "openai";
export const TTS_KIND_ELEVENLABS_PLATFORM = "elevenlabs_platform";
export const TTS_KIND_ELEVENLABS_BYOK = "elevenlabs_byok";

/** Legacy env / persona value `elevenlabs` means platform-paid key. */
export const TTS_PROVIDER_LEGACY_OPTIONS = Object.freeze(new Set(["openai", "elevenlabs"]));
export const TTS_KIND_OPTIONS = Object.freeze(
  new Set([TTS_KIND_OPENAI, TTS_KIND_ELEVENLABS_PLATFORM, TTS_KIND_ELEVENLABS_BYOK, "elevenlabs"])
);

const ELEVENLABS_VOICES_URL = "https://api.elevenlabs.io/v1/voices";

export function normalizeTtsProviderKind(value, fallback = TTS_KIND_OPENAI) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "elevenlabs" || raw === "elevenlabs_platform") {
    return TTS_KIND_ELEVENLABS_PLATFORM;
  }
  if (raw === "elevenlabs_byok" || raw === "byok") {
    return TTS_KIND_ELEVENLABS_BYOK;
  }
  if (raw === "openai" || raw === "default") {
    return TTS_KIND_OPENAI;
  }
  return fallback;
}

/** Strip secrets from strings that may land in logs / thrown Error.message. */
export function redactElevenLabsSecrets(value) {
  let text = String(value ?? "");
  if (!text) return text;
  text = text.replace(/xi-api-key["'\s:=]+[A-Za-z0-9_\-]{8,}/gi, "xi-api-key=[redacted]");
  text = text.replace(/X-ElevenLabs-Api-Key["'\s:=]+[A-Za-z0-9_\-]{8,}/gi, "X-ElevenLabs-Api-Key=[redacted]");
  text = text.replace(/sk_[A-Za-z0-9]{16,}/g, "sk_[redacted]");
  // ElevenLabs user keys are often bare alphanumeric; if we see header dump patterns, scrub.
  text = text.replace(/(api[_-]?key["'\s:=]+)([A-Za-z0-9_\-]{20,})/gi, "$1[redacted]");
  return text;
}

export function isLikelyMp3Buffer(buffer) {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (source.length < 2) return false;
  const startsWithId3 = source.length >= 3 && source.subarray(0, 3).toString("utf8") === "ID3";
  const startsWithFrameSync = source[0] === 0xff && (source[1] & 0xe0) === 0xe0;
  return startsWithId3 || startsWithFrameSync;
}

/**
 * Read request-scoped BYOK credentials. Never store — caller must treat as ephemeral.
 */
export function readElevenLabsByokFromRequest(req) {
  const headerProvider = String(req?.get?.("X-Tts-Provider") || req?.headers?.["x-tts-provider"] || "")
    .trim()
    .toLowerCase();
  const bodyProvider = String(req?.body?.tts_provider || req?.body?.ttsProvider || "")
    .trim()
    .toLowerCase();
  const providerKind = normalizeTtsProviderKind(headerProvider || bodyProvider, "");

  const apiKey = String(
    req?.get?.("X-ElevenLabs-Api-Key") ||
      req?.headers?.["x-elevenlabs-api-key"] ||
      req?.body?.elevenlabs_api_key ||
      req?.body?.elevenlabsApiKey ||
      ""
  ).trim();

  const voiceId = normalizeElevenLabsVoiceId(
    req?.get?.("X-ElevenLabs-Voice-Id") ||
      req?.headers?.["x-elevenlabs-voice-id"] ||
      req?.body?.elevenlabs_voice_id ||
      req?.body?.elevenlabsVoiceId ||
      "",
    ""
  );

  const wantsByok =
    providerKind === TTS_KIND_ELEVENLABS_BYOK ||
    (Boolean(apiKey) && (providerKind === TTS_KIND_ELEVENLABS_PLATFORM || headerProvider === "elevenlabs"));

  return {
    wantsByok: Boolean(wantsByok && apiKey),
    providerKind: wantsByok && apiKey ? TTS_KIND_ELEVENLABS_BYOK : providerKind || "",
    apiKey: wantsByok && apiKey ? apiKey : "",
    voiceId,
  };
}

export function buildElevenLabsSpeakRequest({
  text,
  voiceId,
  modelId,
  outputFormat,
  voiceSettings = {},
  defaults = {},
}) {
  const effectiveVoiceId = normalizeElevenLabsVoiceId(voiceId, defaults.defaultVoiceId || "");
  const effectiveModelId =
    String(modelId || defaults.modelId || "eleven_turbo_v2_5").trim() || "eleven_turbo_v2_5";
  const format =
    String(outputFormat || defaults.outputFormat || "mp3_44100_128").trim().toLowerCase() ||
    "mp3_44100_128";
  const url =
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(effectiveVoiceId)}/stream` +
    `?output_format=${encodeURIComponent(format)}`;

  const body = {
    text: String(text || "").replace(/\s+/g, " ").trim(),
    model_id: effectiveModelId,
    voice_settings: {
      stability: parseNumberInRange(
        voiceSettings.stability,
        0,
        1,
        defaults.stability ?? 0.45
      ),
      similarity_boost: parseNumberInRange(
        voiceSettings.similarityBoost,
        0,
        1,
        defaults.similarityBoost ?? 0.8
      ),
      style: parseNumberInRange(voiceSettings.style, 0, 1, defaults.style ?? 0.22),
      use_speaker_boost:
        voiceSettings.useSpeakerBoost == null
          ? defaults.speakerBoost !== false
          : Boolean(voiceSettings.useSpeakerBoost),
    },
  };

  return { url, body, voiceId: effectiveVoiceId, modelId: effectiveModelId };
}

export function createTtsSpeechRuntime({
  OPENAI_API_KEY,
  ALLOWED_TTS_VOICES,
  TTS_VOICE = "nova",
  TTS_PROVIDER = "openai",
  TTS_PROVIDER_FALLBACK_OPENAI = true,
  TTS_TIMEOUT_MS = 30_000,
  ELEVENLABS_API_KEY = "",
  ELEVENLABS_VOICE_ID = "",
  ELEVENLABS_DEFAULT_VOICE_ID = "vZzlAds9NzvLsFSWp0qk",
  ELEVENLABS_MODEL_ID = "eleven_turbo_v2_5",
  ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128",
  ELEVENLABS_STABILITY = 0.45,
  ELEVENLABS_SIMILARITY_BOOST = 0.8,
  ELEVENLABS_STYLE = 0.22,
  ELEVENLABS_SPEAKER_BOOST = true,
  ELEVENLABS_BLOCK_MS_ON_PLAN_ERROR = 30 * 60 * 1000,
  ELEVENLABS_BLOCK_MS_ON_QUOTA_ERROR = 5 * 60 * 1000,
  CLEMENTINE_VOICE = null,
  fetchWithTimeout,
  isAbortError,
  logger = console,
} = {}) {
  if (typeof fetchWithTimeout !== "function") {
    throw new Error("tts_speech missing fetchWithTimeout");
  }
  if (typeof isAbortError !== "function") {
    throw new Error("tts_speech missing isAbortError");
  }

  let elevenLabsBlockedUntilMs = 0;
  let elevenLabsBlockedReason = "";

  const platformDefaults = {
    defaultVoiceId: ELEVENLABS_DEFAULT_VOICE_ID,
    modelId: ELEVENLABS_MODEL_ID,
    outputFormat: ELEVENLABS_OUTPUT_FORMAT,
    stability: ELEVENLABS_STABILITY,
    similarityBoost: ELEVENLABS_SIMILARITY_BOOST,
    style: ELEVENLABS_STYLE,
    speakerBoost: ELEVENLABS_SPEAKER_BOOST,
  };

  function resolveTtsProviderPlan(voiceProfile = null, { byokApiKey = "" } = {}) {
    const preferredKind = normalizeTtsProviderKind(
      voiceProfile?.provider || TTS_PROVIDER || TTS_KIND_OPENAI,
      TTS_KIND_OPENAI
    );
    const effectiveElevenLabsVoiceId = normalizeElevenLabsVoiceId(
      voiceProfile?.elevenlabsVoiceId || ELEVENLABS_VOICE_ID,
      ELEVENLABS_DEFAULT_VOICE_ID
    );
    const cleanByokKey = String(byokApiKey || voiceProfile?.byokApiKey || "").trim();

    if (preferredKind === TTS_KIND_ELEVENLABS_BYOK) {
      if (!cleanByokKey) {
        return {
          provider: TTS_KIND_ELEVENLABS_BYOK,
          reason: "elevenlabs_byok_missing_api_key",
          invalid: true,
        };
      }
      if (!effectiveElevenLabsVoiceId) {
        return {
          provider: TTS_KIND_ELEVENLABS_BYOK,
          reason: "elevenlabs_byok_missing_voice",
          invalid: true,
        };
      }
      return {
        provider: TTS_KIND_ELEVENLABS_BYOK,
        reason: "elevenlabs_byok_configured",
        elevenlabsVoiceId: effectiveElevenLabsVoiceId,
        apiKey: cleanByokKey,
        // BYOK must not fall back to platform key or OpenAI silently.
        allowOpenAIFallback: false,
      };
    }

    if (preferredKind === TTS_KIND_ELEVENLABS_PLATFORM) {
      const now = Date.now();
      if (TTS_PROVIDER_FALLBACK_OPENAI && elevenLabsBlockedUntilMs > now) {
        return {
          provider: TTS_KIND_OPENAI,
          reason: `elevenlabs_blocked_${elevenLabsBlockedReason || "cooldown"}`,
        };
      }
      if (!ELEVENLABS_API_KEY) {
        if (TTS_PROVIDER_FALLBACK_OPENAI) {
          return {
            provider: TTS_KIND_OPENAI,
            reason: "elevenlabs_missing_api_key_fallback",
          };
        }
        return {
          provider: TTS_KIND_ELEVENLABS_PLATFORM,
          reason: "elevenlabs_missing_api_key",
          invalid: true,
        };
      }
      if (!effectiveElevenLabsVoiceId) {
        if (TTS_PROVIDER_FALLBACK_OPENAI) {
          return {
            provider: TTS_KIND_OPENAI,
            reason: "elevenlabs_missing_voice_fallback",
          };
        }
        return {
          provider: TTS_KIND_ELEVENLABS_PLATFORM,
          reason: "elevenlabs_missing_voice",
          invalid: true,
        };
      }
      return {
        provider: TTS_KIND_ELEVENLABS_PLATFORM,
        reason: "elevenlabs_configured",
        elevenlabsVoiceId: effectiveElevenLabsVoiceId,
        apiKey: ELEVENLABS_API_KEY,
        allowOpenAIFallback: TTS_PROVIDER_FALLBACK_OPENAI,
      };
    }

    return {
      provider: TTS_KIND_OPENAI,
      reason: "openai_default",
    };
  }

  async function synthesizeSpeechMp3OpenAI({
    inputText,
    speed,
    voice,
    instructions = "",
    signal = null,
  }) {
    let ttsResp;
    try {
      ttsResp = await fetchWithTimeout(
        "https://api.openai.com/v1/audio/speech",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini-tts",
            voice: parseOneOf(voice, ALLOWED_TTS_VOICES, TTS_VOICE),
            format: "mp3",
            speed,
            input: inputText,
            ...(String(instructions || "").trim()
              ? { instructions: String(instructions).trim() }
              : {}),
          }),
          signal,
        },
        TTS_TIMEOUT_MS
      );
    } catch (err) {
      if (isAbortError(err)) {
        if (signal?.aborted) {
          const abortErr = new Error("Speech synthesis aborted.");
          abortErr.stage = "tts";
          abortErr.status = 499;
          abortErr.name = "AbortError";
          abortErr.code = "ABORT_ERR";
          throw abortErr;
        }
        const timeoutErr = new Error("Speech synthesis timed out.");
        timeoutErr.stage = "tts";
        timeoutErr.status = 504;
        throw timeoutErr;
      }
      throw err;
    }

    if (!ttsResp.ok) {
      const ttsText = await ttsResp.text();
      const apiErr = new Error(redactElevenLabsSecrets(ttsText || "Speech synthesis failed."));
      apiErr.stage = "tts";
      apiErr.status = ttsResp.status;
      throw apiErr;
    }

    const mp3Buffer = Buffer.from(await ttsResp.arrayBuffer());
    return { buffer: mp3Buffer, provider: TTS_KIND_OPENAI };
  }

  async function synthesizeSpeechMp3ElevenLabs({
    inputText,
    voiceId,
    modelId,
    voiceSettings = {},
    apiKey = "",
    kind = TTS_KIND_ELEVENLABS_PLATFORM,
    signal = null,
  }) {
    const effectiveApiKey = String(apiKey || "").trim();
    if (!effectiveApiKey) {
      const err = new Error(
        kind === TTS_KIND_ELEVENLABS_BYOK
          ? "ElevenLabs BYOK key missing for this request."
          : "ElevenLabs API key missing."
      );
      err.stage = "tts";
      err.status = kind === TTS_KIND_ELEVENLABS_BYOK ? 400 : 500;
      throw err;
    }

    const request = buildElevenLabsSpeakRequest({
      text: inputText,
      voiceId,
      modelId,
      outputFormat: ELEVENLABS_OUTPUT_FORMAT,
      voiceSettings,
      defaults: platformDefaults,
    });

    let ttsResp;
    try {
      ttsResp = await fetchWithTimeout(
        request.url,
        {
          method: "POST",
          headers: {
            "xi-api-key": effectiveApiKey,
            Accept: "audio/mpeg",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request.body),
          signal,
        },
        TTS_TIMEOUT_MS
      );
    } catch (err) {
      if (isAbortError(err)) {
        if (signal?.aborted) {
          const abortErr = new Error("Speech synthesis aborted.");
          abortErr.stage = "tts";
          abortErr.status = 499;
          abortErr.name = "AbortError";
          abortErr.code = "ABORT_ERR";
          throw abortErr;
        }
        const timeoutErr = new Error("Speech synthesis timed out.");
        timeoutErr.stage = "tts";
        timeoutErr.status = 504;
        throw timeoutErr;
      }
      throw err;
    }

    if (!ttsResp.ok) {
      const ttsText = await ttsResp.text();
      const apiErr = new Error(
        redactElevenLabsSecrets(ttsText || "ElevenLabs speech synthesis failed.")
      );
      apiErr.stage = "tts";
      apiErr.status = ttsResp.status;
      throw apiErr;
    }

    const mp3Buffer = Buffer.from(await ttsResp.arrayBuffer());
    return {
      buffer: mp3Buffer,
      provider: kind === TTS_KIND_ELEVENLABS_BYOK ? TTS_KIND_ELEVENLABS_BYOK : TTS_KIND_ELEVENLABS_PLATFORM,
      // Keep legacy label for response headers that historically said "elevenlabs".
      providerLabel: kind === TTS_KIND_ELEVENLABS_BYOK ? "elevenlabs_byok" : "elevenlabs",
    };
  }

  async function listElevenLabsVoices({ apiKey, signal = null } = {}) {
    const effectiveApiKey = String(apiKey || "").trim();
    if (!effectiveApiKey) {
      const err = new Error("ElevenLabs BYOK key missing.");
      err.stage = "tts";
      err.status = 400;
      throw err;
    }
    let resp;
    try {
      resp = await fetchWithTimeout(
        ELEVENLABS_VOICES_URL,
        {
          method: "GET",
          headers: {
            "xi-api-key": effectiveApiKey,
            Accept: "application/json",
          },
          signal,
        },
        TTS_TIMEOUT_MS
      );
    } catch (err) {
      if (isAbortError(err)) {
        const abortErr = new Error("ElevenLabs voice list aborted.");
        abortErr.stage = "tts";
        abortErr.status = 499;
        abortErr.name = "AbortError";
        abortErr.code = "ABORT_ERR";
        throw abortErr;
      }
      throw err;
    }
    const rawText = await resp.text();
    if (!resp.ok) {
      const apiErr = new Error(redactElevenLabsSecrets(rawText || "ElevenLabs voice list failed."));
      apiErr.stage = "tts";
      apiErr.status = resp.status;
      throw apiErr;
    }
    let payload;
    try {
      payload = JSON.parse(rawText || "{}");
    } catch {
      const err = new Error("ElevenLabs voice list returned invalid JSON.");
      err.stage = "tts";
      err.status = 502;
      throw err;
    }
    const voices = Array.isArray(payload?.voices) ? payload.voices : [];
    return voices.map((voice) => ({
      voiceId: String(voice?.voice_id || "").trim(),
      name: String(voice?.name || "").trim(),
      category: String(voice?.category || "").trim(),
      description: normalizeSnippet(voice?.description, 240),
      previewUrl: String(voice?.preview_url || "").trim(),
    })).filter((v) => v.voiceId);
  }

  async function synthesizeSpeechMp3({
    text,
    speed,
    rid,
    label = "full",
    voiceProfile = CLEMENTINE_VOICE,
    providerOverride = "",
    byokApiKey = "",
    signal = null,
  }) {
    const inputText = String(text || "").replace(/\s+/g, " ").trim();
    if (!inputText) {
      const err = new Error("Speech synthesis input was empty.");
      err.stage = "tts";
      err.status = 400;
      throw err;
    }

    const startedAt = Date.now();
    const requestedProvider = normalizeTtsProviderKind(
      providerOverride || voiceProfile?.provider || CLEMENTINE_VOICE?.provider || TTS_PROVIDER || TTS_KIND_OPENAI,
      TTS_KIND_OPENAI
    );
    const effectiveVoiceProfile = {
      provider: requestedProvider,
      openaiVoice: parseOneOf(
        voiceProfile?.openaiVoice,
        ALLOWED_TTS_VOICES,
        CLEMENTINE_VOICE?.openaiVoice || TTS_VOICE
      ),
      openaiInstructions: normalizeSnippet(voiceProfile?.openaiInstructions, 600),
      emotionLane: normalizeSnippet(voiceProfile?.emotionLane, 64) || "curious_steady",
      elevenlabsVoiceId: normalizeElevenLabsVoiceId(
        voiceProfile?.elevenlabsVoiceId || CLEMENTINE_VOICE?.elevenlabsVoiceId,
        ELEVENLABS_DEFAULT_VOICE_ID
      ),
      elevenlabsModelId:
        String(
          voiceProfile?.elevenlabsModelId || CLEMENTINE_VOICE?.elevenlabsModelId || ELEVENLABS_MODEL_ID
        ).trim() || ELEVENLABS_MODEL_ID,
      elevenlabsSettings: voiceProfile?.elevenlabsSettings || {},
      byokApiKey: String(byokApiKey || voiceProfile?.byokApiKey || "").trim(),
    };

    const providerPlan = resolveTtsProviderPlan(effectiveVoiceProfile, {
      byokApiKey: effectiveVoiceProfile.byokApiKey,
    });
    if (providerPlan.invalid) {
      const err = new Error(
        providerPlan.reason === "elevenlabs_byok_missing_api_key"
          ? "TTS provider is ElevenLabs BYOK but the user API key was not provided."
          : providerPlan.reason === "elevenlabs_byok_missing_voice"
            ? "TTS provider is ElevenLabs BYOK but voice_id is missing."
            : providerPlan.reason === "elevenlabs_missing_api_key"
              ? "TTS provider is ElevenLabs but ELEVENLABS_API_KEY is missing."
              : "TTS provider is ElevenLabs but ELEVENLABS_VOICE_ID is missing."
      );
      err.stage = "tts";
      err.status = providerPlan.reason?.startsWith("elevenlabs_byok") ? 400 : 500;
      throw err;
    }

    let result;
    if (
      providerPlan.provider === TTS_KIND_ELEVENLABS_PLATFORM ||
      providerPlan.provider === TTS_KIND_ELEVENLABS_BYOK
    ) {
      try {
        result = await synthesizeSpeechMp3ElevenLabs({
          inputText,
          voiceId: providerPlan.elevenlabsVoiceId || effectiveVoiceProfile.elevenlabsVoiceId,
          modelId: effectiveVoiceProfile.elevenlabsModelId,
          voiceSettings: effectiveVoiceProfile.elevenlabsSettings,
          apiKey: providerPlan.apiKey,
          kind: providerPlan.provider,
          signal,
        });
      } catch (err) {
        const errMsg = String(err?.message || err || "");
        const isPlanGate = /paid_plan_required|payment_required|library voices/i.test(errMsg);
        const isQuotaGate =
          /quota_exceeded|insufficient[_\s-]?credits?|credits?\s+remaining|rate[_\s-]?limit/i.test(
            errMsg
          );
        const allowFallback =
          providerPlan.allowOpenAIFallback !== false &&
          providerPlan.provider === TTS_KIND_ELEVENLABS_PLATFORM &&
          TTS_PROVIDER_FALLBACK_OPENAI;

        if (allowFallback && isPlanGate) {
          elevenLabsBlockedUntilMs = Date.now() + Math.max(60_000, ELEVENLABS_BLOCK_MS_ON_PLAN_ERROR);
          elevenLabsBlockedReason = "plan_required";
        }
        if (allowFallback && isQuotaGate) {
          elevenLabsBlockedUntilMs =
            Date.now() + Math.max(30_000, ELEVENLABS_BLOCK_MS_ON_QUOTA_ERROR);
          elevenLabsBlockedReason = "quota_exceeded";
        }
        if (allowFallback) {
          logger.log?.(
            `[${rid}] tts_provider_fallback from=elevenlabs_platform to=openai reason=${redactElevenLabsSecrets(
              String(err?.message || err)
            )}`
          );
          if (isPlanGate || isQuotaGate) {
            const remainingMs = Math.max(0, elevenLabsBlockedUntilMs - Date.now());
            logger.log?.(
              `[${rid}] elevenlabs_temp_block reason=${elevenLabsBlockedReason} until_ms=${elevenLabsBlockedUntilMs} remaining_ms=${remainingMs}`
            );
          }
          result = await synthesizeSpeechMp3OpenAI({
            inputText,
            speed,
            voice: effectiveVoiceProfile.openaiVoice,
            instructions: effectiveVoiceProfile.openaiInstructions,
            signal,
          });
        } else {
          throw err;
        }
      }
    } else {
      result = await synthesizeSpeechMp3OpenAI({
        inputText,
        speed,
        voice: effectiveVoiceProfile.openaiVoice,
        instructions: effectiveVoiceProfile.openaiInstructions,
        signal,
      });
    }

    const mp3Buffer = Buffer.from(result?.buffer || []);
    const provider = String(result?.provider || providerPlan.provider || TTS_KIND_OPENAI);
    const providerLabel =
      String(result?.providerLabel || "") ||
      (provider === TTS_KIND_ELEVENLABS_PLATFORM
        ? "elevenlabs"
        : provider === TTS_KIND_ELEVENLABS_BYOK
          ? "elevenlabs_byok"
          : "openai");
    const elapsedMs = Date.now() - startedAt;
    if (!mp3Buffer.length) {
      const err = new Error("Speech synthesis returned empty audio.");
      err.stage = "tts";
      err.status = 502;
      throw err;
    }
    if (!isLikelyMp3Buffer(mp3Buffer)) {
      const signatureHex = mp3Buffer.subarray(0, 8).toString("hex");
      const err = new Error(`Speech synthesis output was not MP3 (sig=${signatureHex}).`);
      err.stage = "tts";
      err.status = 502;
      throw err;
    }
    if (process.env.NODE_ENV !== "production") {
      logger.log?.(
        `[${rid}] tts_segment label=${label} provider=${providerLabel} chars=${inputText.length} bytes=${mp3Buffer.length} ms=${elapsedMs}`
      );
    }

    return {
      buffer: mp3Buffer,
      elapsedMs,
      text: inputText,
      provider: providerLabel,
      kind: provider,
      voice:
        provider === TTS_KIND_OPENAI || providerLabel === "openai"
          ? effectiveVoiceProfile.openaiVoice
          : effectiveVoiceProfile.elevenlabsVoiceId,
      emotionLane: effectiveVoiceProfile.emotionLane,
      // Explicit: BYOK audio is billed to the user's ElevenLabs account, not io.them wallet.
      walletBillable: provider !== TTS_KIND_ELEVENLABS_BYOK && providerLabel !== "elevenlabs_byok",
    };
  }

  return {
    supportedKinds: Object.freeze([
      TTS_KIND_OPENAI,
      TTS_KIND_ELEVENLABS_PLATFORM,
      TTS_KIND_ELEVENLABS_BYOK,
    ]),
    resolveTtsProviderPlan,
    synthesizeSpeechMp3OpenAI,
    synthesizeSpeechMp3ElevenLabs,
    synthesizeSpeechMp3,
    listElevenLabsVoices,
    isLikelyMp3Buffer,
    redactElevenLabsSecrets,
    getElevenLabsBlockState: () => ({
      untilMs: elevenLabsBlockedUntilMs,
      reason: elevenLabsBlockedReason,
    }),
    // test/helpers
    _setElevenLabsBlockStateForTests(untilMs, reason = "") {
      elevenLabsBlockedUntilMs = Number(untilMs) || 0;
      elevenLabsBlockedReason = String(reason || "");
    },
  };
}
