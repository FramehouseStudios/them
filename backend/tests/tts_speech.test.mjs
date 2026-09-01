import assert from "node:assert/strict";
import test from "node:test";
import {
  buildElevenLabsSpeakRequest,
  createTtsSpeechRuntime,
  normalizeTtsProviderKind,
  readElevenLabsByokFromRequest,
  redactElevenLabsSecrets,
  TTS_KIND_ELEVENLABS_BYOK,
  TTS_KIND_ELEVENLABS_PLATFORM,
  TTS_KIND_OPENAI,
} from "../lib/tts_speech.js";

const ALLOWED_TTS_VOICES = new Set(["nova", "marin", "coral"]);

function makeRuntime({ fetchImpl } = {}) {
  return createTtsSpeechRuntime({
    OPENAI_API_KEY: "sk-test",
    ALLOWED_TTS_VOICES,
    TTS_VOICE: "nova",
    TTS_PROVIDER: "openai",
    TTS_PROVIDER_FALLBACK_OPENAI: true,
    TTS_TIMEOUT_MS: 5_000,
    ELEVENLABS_API_KEY: "platform-el-key-aaaaaaaaaaaa",
    ELEVENLABS_VOICE_ID: "platformVoiceId01",
    ELEVENLABS_DEFAULT_VOICE_ID: "platformVoiceId01",
    ELEVENLABS_MODEL_ID: "eleven_turbo_v2_5",
    CLEMENTINE_VOICE: {
      provider: "elevenlabs",
      openaiVoice: "nova",
      elevenlabsVoiceId: "platformVoiceId01",
      elevenlabsModelId: "eleven_turbo_v2_5",
    },
    fetchWithTimeout: fetchImpl || (async () => {
      throw new Error("unexpected fetch");
    }),
    isAbortError: (err) => !!err && (err.name === "AbortError" || err.code === "ABORT_ERR"),
    logger: { log() {} },
  });
}

test("[tts_speech] normalizeTtsProviderKind maps legacy elevenlabs to platform", () => {
  assert.equal(normalizeTtsProviderKind("elevenlabs"), TTS_KIND_ELEVENLABS_PLATFORM);
  assert.equal(normalizeTtsProviderKind("elevenlabs_platform"), TTS_KIND_ELEVENLABS_PLATFORM);
  assert.equal(normalizeTtsProviderKind("elevenlabs_byok"), TTS_KIND_ELEVENLABS_BYOK);
  assert.equal(normalizeTtsProviderKind("openai"), TTS_KIND_OPENAI);
  assert.equal(normalizeTtsProviderKind("default"), TTS_KIND_OPENAI);
});

test("[tts_speech] buildElevenLabsSpeakRequest encodes stream URL + body", () => {
  const built = buildElevenLabsSpeakRequest({
    text: "  Hello   world \n",
    voiceId: "abcdefghijkl",
    modelId: "eleven_flash_v2_5",
    outputFormat: "mp3_44100_128",
    voiceSettings: { stability: 0.4, similarityBoost: 0.7, style: 0.1 },
    defaults: {
      defaultVoiceId: "fallbackVoice12",
      modelId: "eleven_turbo_v2_5",
      outputFormat: "mp3_44100_128",
      stability: 0.45,
      similarityBoost: 0.8,
      style: 0.22,
      speakerBoost: true,
    },
  });
  assert.equal(
    built.url,
    "https://api.elevenlabs.io/v1/text-to-speech/abcdefghijkl/stream?output_format=mp3_44100_128"
  );
  assert.equal(built.body.text, "Hello world");
  assert.equal(built.body.model_id, "eleven_flash_v2_5");
  assert.equal(built.body.voice_settings.stability, 0.4);
  assert.equal(built.body.voice_settings.use_speaker_boost, true);
  // Request JSON must never embed the API key.
  assert.equal(JSON.stringify(built.body).includes("xi-api-key"), false);
  assert.equal(JSON.stringify(built).includes("platform-el-key"), false);
});

test("[tts_speech] redactElevenLabsSecrets strips keys from loggable text", () => {
  const raw = 'header xi-api-key: sk_live_abcdefghijklmnop and X-ElevenLabs-Api-Key=userkeyABCDEFGHIJKLMNOP';
  const redacted = redactElevenLabsSecrets(raw);
  assert.equal(redacted.includes("sk_live_abcdefghijklmnop"), false);
  assert.equal(redacted.includes("userkeyABCDEFGHIJKLMNOP"), false);
  assert.match(redacted, /\[redacted\]/);
});

test("[tts_speech] readElevenLabsByokFromRequest is request-scoped only", () => {
  const req = {
    get(name) {
      const map = {
        "X-Tts-Provider": "elevenlabs_byok",
        "X-ElevenLabs-Api-Key": "user-secret-key-zzzzzzzzzzzz",
        "X-ElevenLabs-Voice-Id": "userCloneVoice01",
      };
      return map[name] || "";
    },
    headers: {},
    body: {},
  };
  const byok = readElevenLabsByokFromRequest(req);
  assert.equal(byok.wantsByok, true);
  assert.equal(byok.providerKind, TTS_KIND_ELEVENLABS_BYOK);
  assert.equal(byok.apiKey, "user-secret-key-zzzzzzzzzzzz");
  assert.equal(byok.voiceId, "userCloneVoice01");
});

test("[tts_speech] BYOK synthesize uses user key header encoding and not platform key", async () => {
  const calls = [];
  const mp3 = Buffer.from([0xff, 0xe0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const runtime = makeRuntime({
    fetchImpl: async (url, options) => {
      calls.push({
        url: String(url),
        headers: { ...(options?.headers || {}) },
        body: options?.body ? JSON.parse(options.body) : null,
      });
      return {
        ok: true,
        status: 200,
        async arrayBuffer() {
          return mp3;
        },
        async text() {
          return "";
        },
      };
    },
  });

  const result = await runtime.synthesizeSpeechMp3({
    text: "Speak softly",
    speed: 1,
    rid: "test1",
    voiceProfile: {
      provider: TTS_KIND_ELEVENLABS_BYOK,
      elevenlabsVoiceId: "userCloneVoice01",
      byokApiKey: "user-secret-key-zzzzzzzzzzzz",
    },
  });

  assert.equal(result.provider, "elevenlabs_byok");
  assert.equal(result.kind, TTS_KIND_ELEVENLABS_BYOK);
  assert.equal(result.walletBillable, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers["xi-api-key"], "user-secret-key-zzzzzzzzzzzz");
  assert.equal(calls[0].headers["xi-api-key"] === "platform-el-key-aaaaaaaaaaaa", false);
  assert.match(calls[0].url, /\/v1\/text-to-speech\/userCloneVoice01\/stream/);
  assert.equal(calls[0].body.text, "Speak softly");
  // Ensure logs helper would not leak key if error text included it
  assert.equal(
    redactElevenLabsSecrets(JSON.stringify(calls[0].headers)).includes("user-secret-key-zzzzzzzzzzzz"),
    false
  );
});

test("[tts_speech] BYOK abort rejects without completing fetch body", async () => {
  const controller = new AbortController();
  const runtime = makeRuntime({
    fetchImpl: async (_url, options) => {
      assert.ok(options?.signal);
      // Simulate abort before response
      controller.abort();
      const err = new Error("Aborted");
      err.name = "AbortError";
      err.code = "ABORT_ERR";
      throw err;
    },
  });

  await assert.rejects(
    () =>
      runtime.synthesizeSpeechMp3({
        text: "Abort me",
        speed: 1,
        rid: "abort1",
        signal: controller.signal,
        voiceProfile: {
          provider: TTS_KIND_ELEVENLABS_BYOK,
          elevenlabsVoiceId: "userCloneVoice01",
          byokApiKey: "user-secret-key-zzzzzzzzzzzz",
        },
      }),
    (err) => err?.name === "AbortError" || err?.code === "ABORT_ERR" || /abort/i.test(String(err?.message || ""))
  );
});

test("[tts_speech] BYOK missing key does not fall back to platform OpenAI", async () => {
  const runtime = makeRuntime();
  await assert.rejects(
    () =>
      runtime.synthesizeSpeechMp3({
        text: "No key",
        speed: 1,
        rid: "nokey",
        voiceProfile: {
          provider: TTS_KIND_ELEVENLABS_BYOK,
          elevenlabsVoiceId: "userCloneVoice01",
        },
      }),
    (err) => err?.status === 400 && /BYOK/i.test(String(err?.message || ""))
  );
});

test("[tts_speech] platform elevenlabs still uses env key", async () => {
  const calls = [];
  const mp3 = Buffer.from([0xff, 0xe0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const runtime = makeRuntime({
    fetchImpl: async (url, options) => {
      calls.push(options?.headers?.["xi-api-key"]);
      return {
        ok: true,
        status: 200,
        async arrayBuffer() {
          return mp3;
        },
        async text() {
          return "";
        },
      };
    },
  });
  const result = await runtime.synthesizeSpeechMp3({
    text: "Platform",
    speed: 1,
    rid: "plat",
    providerOverride: "elevenlabs",
    voiceProfile: {
      provider: "elevenlabs",
      elevenlabsVoiceId: "platformVoiceId01",
    },
  });
  assert.equal(result.provider, "elevenlabs");
  assert.equal(calls[0], "platform-el-key-aaaaaaaaaaaa");
  assert.equal(result.walletBillable, true);
});
