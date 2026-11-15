import assert from "node:assert/strict";
import test from "node:test";
import { createTalkHandler } from "../lib/talk_handler.js";

// The real orchestration, supplier catch, diagnostic conversion and recovery
// response run here. Only external supplier/persistence dependencies are injected.
test("[talk-handler] STT cause reaches private support log without changing recovery wire", async (t) => {
  const privateText = "PRIVATE_TRANSCRIPTION_CAUSE_DO_NOT_LOG";
  const original = new TypeError(`fetch failed ${privateText}`, {
    cause: new AggregateError([
      Object.assign(new Error(privateText), { code: "UND_ERR_CONNECT_TIMEOUT", address: privateText }),
    ], privateText),
  });
  const logs = [], metrics = [], emitted = [];
  let sttCalls = 0, recoveryCalls = 0, memoryWrites = 0, generatedTurns = 0;
  t.mock.method(console, "error", (...parts) => { logs.push(parts.join(" ")); });
  const audio = Buffer.from([0x49, 0x44, 0x33, 0x00]);
  const handler = createTalkHandler({
    OPENAI_API_KEY: "fixture-not-a-provider-key",
    CLEMENTINE_PROFILE: { voice: { openaiVoice: "fixture-voice" } },
    recordTalkMetric: (value) => metrics.push(value),
    scaleBackplane: { emitTalkCommit: async (value) => { emitted.push(value); } },
    storeTalkTurnMeta: () => { generatedTurns += 1; },
    resolveCanonicalWritableMemoryContext: async () => ({ requesterIp: "127.0.0.1", memory: {} }),
    createTalkMemoryCommitter: () => async () => { memoryWrites += 1; },
    clientIp: () => "127.0.0.1",
    commitTalkIdempotencySuccess: () => {},
    isAuthoritativeTalkScreenplayOutput: () => false,
    normalizeAcceptedCausalFacts: () => [],
    applyClementineVoiceDirection: (profile) => profile,
    logger: { log() {} },
    parseTalkStreamMode: () => "off",
    pickThinkingDurationMs: () => 0,
    normalizeClientIp: (value) => String(value || ""),
    normalizeClientToken: (value) => String(value || "").trim(),
    normalizeSnippet: (value) => String(value || "").trim(),
    normalizeTalkMultilineSnippet: (value) => String(value || "").trim(),
    sanitizeStudioTurnMetadata: () => ({}),
    clearTalkIdempotencyPending: () => {},
    captureTalkResponseHeaders: (res) => ({ ...res.headers }),
    isLikelyMp3Buffer: (value) => Buffer.isBuffer(value) && value.subarray(0, 3).equals(audio.subarray(0, 3)),
    API_SCHEMA_VERSION: 1, BACKEND_BUILD: "fixture", BACKEND_BOOT_ID: "fixture",
    TALK_RUNTIME_RECOVERY_PROMPT_TEXT: "Please try again.",
    sttSupplier: { transcribe: async () => { sttCalls += 1; throw original; } },
    chatSupplier: { chat: async () => { throw new Error("Generation must not run after STT failure"); } },
    ttsSupplier: { synthesizeOpenAI: async () => { recoveryCalls += 1; return { buffer: audio }; } },
  });
  const req = {
    requestId: "req_stt_transport_handler",
    headers: { "content-type": "multipart/form-data; boundary=fixture" },
    body: {},
    file: { buffer: Buffer.from("fixture audio"), size: 13, originalname: "fixture.wav", mimetype: "audio/wav" },
    get(name) { return this.headers[name.toLowerCase()] || ""; },
  };
  const res = {
    headersSent: false, headers: {}, statusCode: 200, body: null,
    setHeader(key, value) { this.headers[key.toLowerCase()] = String(value); },
    status(value) { this.statusCode = value; return this; },
    send(value) { this.body = value; this.headersSent = true; return this; },
    json(value) { this.body = value; this.headersSent = true; return this; },
  };
  await handler(req, res);
  assert.equal(sttCalls, 1);
  assert.equal(recoveryCalls, 1);
  assert.equal(memoryWrites, 0);
  assert.equal(generatedTurns, 0);
  assert.equal(logs.length, 1, "the original failure must recover without a second handler failure");
  assert.match(logs[0], /stage=stt class=provider_unavailable status=500/);
  assert.match(logs[0], /transport_code=UND_ERR_CONNECT_TIMEOUT/);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, audio);
  assert.equal(res.headers["x-turn-status"], "error_recovered");
  assert.equal(res.headers["x-turn-error-stage"], "stt");
  assert.equal(res.headers["x-turn-error-class"], "provider_unavailable");
  assert.equal(res.headers["x-turn-meta-available"], "0");
  assert.equal(metrics.length, 1);
  assert.equal(emitted.length, 1);
  assert.ok(!Object.keys(res.headers).some((key) => /transport|cause/.test(key)));
  const publicSerialized = JSON.stringify({ headers: res.headers, metrics, emitted });
  assert.ok(!publicSerialized.includes("UND_ERR_CONNECT_TIMEOUT"));
  assert.ok(!JSON.stringify({ logs, publicSerialized }).includes(privateText));
});
