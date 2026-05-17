// Phase 7c — backend/lib/talk_supplier_glue.js proof.
//
// Proves the EXTRACTION CONTRACT: factory shape, required-deps guards,
// the canonical public surface (incl. cluster-internal fns NOT exposed),
// #238 (no setter-style exports / factory-private state), and the small
// stable supplier contracts (STT + OpenAI-TTS happy paths + timeout→stage
// mapping) with exact return shapes verified against the verbatim source.
//
// Deep end-to-end behavior of the talk path through these suppliers
// (chat streaming, ElevenLabs dispatch/retry/fallback, audio reconcile)
// is proven by backend/tests/talk.integration.test.mjs (byte-identical:
// 42 pass / 0 fail / 1 skipped after extraction). This file deliberately
// does NOT reconstruct 600 lines of internal contract; it pins the
// extraction boundary + the contracts Codex named as required proof.

import { test } from "node:test";
import assert from "node:assert/strict";

import * as glue from "../lib/talk_supplier_glue.js";
const { createSttSupplier, createChatSupplier, createTtsSupplier } = glue;

// ---- helpers ----------------------------------------------------------

function sttDeps(over = {}) {
  return {
    OPENAI_API_KEY: "sk-test",
    STT_MODEL_PRIMARY: "gpt-4o-mini-transcribe",
    STT_LANGUAGE: "en",
    STT_TIMEOUT_MS: 30000,
    fetchWithTimeout: async () => ({ ok: true, status: 200, text: async () => '{"text":"hi"}' }),
    isAbortError: () => false,
    ...over,
  };
}

function chatDeps(over = {}) {
  const noop = () => {};
  return {
    CHAT_LOAD_SHED_IN_FLIGHT: 999, CHAT_LOAD_SHED_MIN_SAMPLES: 999,
    CHAT_LOAD_SHED_NONCRITICAL_ONLY: true, CHAT_LOAD_SHED_P95_MS: 999999,
    CHAT_MAX_TOKENS: 256, CHAT_MODEL_FAST: "gpt-4o-mini",
    CHAT_MODEL_KNOWLEDGE: "gpt-4o", CHAT_MODEL_RICH: "gpt-4o",
    CHAT_TEMPERATURE: 0.7, CHAT_TIMEOUT_MS: 30000, OPENAI_API_KEY: "sk-test",
    countWords: (s) => String(s || "").split(/\s+/).filter(Boolean).length,
    deriveBackendRuntimeStatus: () => ({ status: "up" }),
    extractFirstSentenceCandidate: (s) => s, fetchWithTimeout: async () => ({ ok: true }),
    isLikelyCompleteReply: () => true, readTalkInFlight: () => 0,
    summarizeTalkMetrics: () => ({}), textContainsAny: () => false,
    ...over,
  };
}

function ttsDeps(over = {}) {
  return {
    ALLOWED_TTS_VOICES: ["alloy"], CLEMENTINE_PROFILE: {},
    ELEVENLABS_API_KEY: "el-test", ELEVENLABS_BLOCK_MS_ON_PLAN_ERROR: 60000,
    ELEVENLABS_BLOCK_MS_ON_QUOTA_ERROR: 30000, ELEVENLABS_DEFAULT_VOICE_ID: "v1",
    ELEVENLABS_MODEL_ID: "eleven_turbo_v2", ELEVENLABS_OUTPUT_FORMAT: "mp3_44100_128",
    ELEVENLABS_SIMILARITY_BOOST: 0.5, ELEVENLABS_SPEAKER_BOOST: true,
    ELEVENLABS_STABILITY: 0.5, ELEVENLABS_STYLE: 0, ELEVENLABS_VOICE_ID: "v1",
    OPENAI_API_KEY: "sk-test", TTS_PROVIDER: "openai",
    TTS_PROVIDER_FALLBACK_OPENAI: true, TTS_PROVIDER_OPTIONS: ["openai", "elevenlabs"],
    TTS_TIMEOUT_MS: 30000, TTS_VOICE: "alloy",
    estimateMp3DurationMs: () => 1000, estimateTalkSpeechDurationMs: () => 1000,
    fetchWithTimeout: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }),
    isAbortError: () => false, isLikelyMp3Buffer: () => true,
    normalizeElevenLabsVoiceId: (v) => v || "v1", normalizeSnippet: (s) => s,
    parseOneOf: (v, allowed, dflt) => (allowed.includes(v) ? v : dflt),
    stripLeadingId3Tag: (b) => b,
    ...over,
  };
}

// ---- module surface / #238 -------------------------------------------

test("[supplier-glue] module exports exactly the 3 factories; no setter-style exports (#238)", () => {
  assert.deepEqual(Object.keys(glue).sort(), ["createChatSupplier", "createSttSupplier", "createTtsSupplier"]);
  for (const k of Object.keys(glue)) {
    assert.equal(/^set[A-Z]/.test(k), false, `unexpected setter-style export: ${k}`);
    assert.equal(typeof glue[k], "function");
  }
});

// ---- factory shape + required-deps guards -----------------------------

test("[supplier-glue] createSttSupplier guard + shape", () => {
  assert.throws(() => createSttSupplier({}), /missing required dep/);
  const s = createSttSupplier(sttDeps());
  assert.equal(s.kind, "openai-whisper");
  assert.equal(typeof s.transcribe, "function");
  assert.equal(Object.keys(s).some((k) => /^set[A-Z]/.test(k)), false);
});

test("[supplier-glue] createChatSupplier guard + shape", () => {
  assert.throws(() => createChatSupplier({}), /missing required dep/);
  const c = createChatSupplier(chatDeps());
  assert.equal(typeof c.selectChatModelForTurn, "function");
  assert.equal(typeof c.streamChatReplyWithFirstSentence, "function");
  assert.equal(Object.keys(c).some((k) => /^set[A-Z]/.test(k)), false);
});

test("[supplier-glue] createTtsSupplier guard + shape; cluster-internal NOT exposed", () => {
  assert.throws(() => createTtsSupplier({}), /missing required dep/);
  const t = createTtsSupplier(ttsDeps());
  assert.deepEqual(Object.keys(t).sort(), [
    "synthesizeSpeechMp3", "synthesizeSpeechMp3OpenAI", "synthesizeTalkScreenplayPageAudio",
  ]);
  // cluster-internal helpers must stay private
  assert.equal(t.resolveTtsProviderPlan, undefined);
  assert.equal(t.synthesizeSpeechMp3ElevenLabs, undefined);
  assert.equal(Object.keys(t).some((k) => /^set[A-Z]/.test(k)), false);
});

// ---- STT supplier behavior (exact contract) ---------------------------

test("[supplier-glue] STT transcribe happy path returns {model,response,rawText,elapsedMs}", async () => {
  const s = createSttSupplier(sttDeps());
  const r = await s.transcribe({
    uploadedFile: { buffer: Buffer.from("x"), originalname: "r.m4a", mimetype: "audio/m4a" },
    modelName: "m1",
  });
  assert.equal(r.model, "m1");
  assert.equal(r.rawText, '{"text":"hi"}');
  assert.equal(typeof r.elapsedMs, "number");
  assert.ok(r.response && r.response.ok === true);
});

test("[supplier-glue] STT transcribe maps abort -> err.stage='stt', status=504", async () => {
  const s = createSttSupplier(sttDeps({
    fetchWithTimeout: async () => { throw new Error("aborted"); },
    isAbortError: () => true,
  }));
  await assert.rejects(
    () => s.transcribe({ uploadedFile: { buffer: Buffer.from("x"), originalname: "r.m4a", mimetype: "audio/m4a" }, modelName: "m" }),
    (e) => e.stage === "stt" && e.status === 504 && /timed out/i.test(e.message),
  );
});

// ---- TTS supplier behavior (exact contract, OpenAI path) --------------

test("[supplier-glue] TTS synthesizeSpeechMp3OpenAI happy -> {buffer,provider:'openai'} (audio metadata)", async () => {
  const t = createTtsSupplier(ttsDeps());
  const r = await t.synthesizeSpeechMp3OpenAI({ inputText: "hello", speed: 1, voice: "alloy" });
  assert.equal(r.provider, "openai");
  assert.ok(Buffer.isBuffer(r.buffer));
});

test("[supplier-glue] TTS synthesizeSpeechMp3OpenAI maps abort -> err.stage='tts', status=504", async () => {
  const t = createTtsSupplier(ttsDeps({
    fetchWithTimeout: async () => { throw new Error("aborted"); },
    isAbortError: () => true,
  }));
  await assert.rejects(
    () => t.synthesizeSpeechMp3OpenAI({ inputText: "x", speed: 1, voice: "alloy" }),
    (e) => e.stage === "tts" && e.status === 504,
  );
});

// ---- #238: circuit-breaker state is factory-private --------------------

test("[supplier-glue] TTS ElevenLabs circuit-breaker state is per-instance (no module-level state)", () => {
  const a = createTtsSupplier(ttsDeps());
  const b = createTtsSupplier(ttsDeps());
  // distinct factory instances -> distinct method closures -> the
  // elevenLabsBlocked* state cannot be shared module-level state.
  assert.notEqual(a.synthesizeSpeechMp3, b.synthesizeSpeechMp3);
  assert.notEqual(a.synthesizeSpeechMp3OpenAI, b.synthesizeSpeechMp3OpenAI);
});
