// POST /talk/transcribe: the words of an utterance, so the app routes a
// voice turn on what was said (live 2026-09-29: routing on the previous
// turn's text re-wrote a page every ~15 s). One STT owner: lib/talk_stt.js.
import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import multer from "multer";

import { mountTalkPipelineRoutes } from "../lib/talk_pipeline.js";
import { transcribeTalkAudio, talkAudioUploadProblem, uploadedTalkAudio } from "../lib/talk_stt.js";
import { listenEphemeral } from "./helpers/ephemeral_server.mjs";

const silentLogger = { log() {} };
const failure = (fields) => Object.assign(new Error(fields.message || "stt failed"), { stage: fields.providerStage, ...fields });
const diagnostics = (_err, fields) => ({ supportMessage: "x", ...fields });

function supplierReturning(...texts) {
  const calls = [];
  return {
    calls,
    async transcribe(args) {
      calls.push(args);
      const text = texts[Math.min(calls.length - 1, texts.length - 1)];
      if (text instanceof Error) throw text;
      if (typeof text === "object") return text;
      return { model: args.modelName, elapsedMs: 5, response: { ok: true, status: 200 }, rawText: JSON.stringify({ text }) };
    },
  };
}

const audio = { buffer: Buffer.from("RIFF...."), size: 40_000, mimetype: "audio/wav", originalname: "recording.wav" };

test("[talk-stt] returns the words", async () => {
  const sttSupplier = supplierReturning("Write the next scene where June lies");
  const heard = await transcribeTalkAudio({ sttSupplier, uploadedFile: audio, rid: "r1", logger: silentLogger, config: { STT_MODEL_PRIMARY: "primary" }, buildTalkFailureDiagnostics: diagnostics, createTalkFailureError: failure });
  assert.equal(heard.transcript, "Write the next scene where June lies");
  assert.equal(heard.model, "primary");
  assert.equal(sttSupplier.calls.length, 1);
});

test("[talk-stt] an empty result retries with the fallback model", async () => {
  const sttSupplier = supplierReturning("", "The page");
  const heard = await transcribeTalkAudio({
    sttSupplier, uploadedFile: audio, rid: "r2", logger: silentLogger,
    config: { STT_MODEL_PRIMARY: "primary", STT_MODEL_FALLBACK: "fallback", STT_EMPTY_RETRY_ENABLED: true, STT_EMPTY_RETRY_MIN_BYTES: 1000 },
    buildTalkFailureDiagnostics: diagnostics, createTalkFailureError: failure,
  });
  assert.equal(heard.transcript, "The page");
  assert.equal(heard.model, "fallback");
  assert.deepEqual(sttSupplier.calls.map((c) => c.modelName), ["primary", "fallback"]);
});

test("[talk-stt] a provider refusal is a stt failure, not an empty transcript", async () => {
  const sttSupplier = supplierReturning({ model: "primary", response: { ok: false, status: 429 }, rawText: '{"error":{"code":"insufficient_quota"}}' });
  await assert.rejects(
    transcribeTalkAudio({ sttSupplier, uploadedFile: audio, rid: "r3", logger: silentLogger, config: {}, buildTalkFailureDiagnostics: diagnostics, createTalkFailureError: failure }),
    (err) => err.providerStage === "stt" && err.status === 429
  );
});

test("[talk-stt] upload checks are the same for /talk and /talk/transcribe", () => {
  const multipart = { headers: { "content-type": "multipart/form-data; boundary=x" } };
  assert.equal(talkAudioUploadProblem({ headers: { "content-type": "application/json" } }, audio).status, 415);
  assert.equal(talkAudioUploadProblem(multipart, null).status, 400);
  assert.equal(talkAudioUploadProblem(multipart, { ...audio, mimetype: "text/plain", originalname: "notes.txt" }).status, 415);
  assert.equal(talkAudioUploadProblem(multipart, audio), null);
  assert.equal(uploadedTalkAudio({ files: { audio: [audio] } }), audio);
});

test("[talk-transcribe-route] mounted with the talk guards and answers with the words", async () => {
  const seen = [];
  const guard = (name) => (_req, _res, next) => { seen.push(name); next(); };
  const upload = multer({ storage: multer.memoryStorage() }).single("file");
  const handleTalkRequest = (_req, res) => res.status(200).json({ ok: true });
  handleTalkRequest.transcribe = (req, res) => res.json({ transcript: `heard ${req.file?.size || 0} bytes` });

  const app = express();
  mountTalkPipelineRoutes(app, {
    talkRateLimitGuard: guard("rate"),
    requireClientTokenForTalk: guard("client_token"),
    talkIdempotencyGuard: guard("idempotency"),
    talkSessionSerialGuard: guard("session_serial"),
    talkConcurrencyGuard: guard("concurrency"),
    talkUpload: upload,
    handleTalkRequest,
    normalizeTalkTurnId: (v) => String(v || "").trim(),
    getTalkTurnMeta: () => null,
    canReadTalkTurnMeta: () => true,
  });
  const server = listenEphemeral(app);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const form = new FormData();
    form.append("file", new Blob([Buffer.alloc(1234)], { type: "audio/wav" }), "recording.wav");
    const r = await fetch(`http://127.0.0.1:${server.address().port}/talk/transcribe`, { method: "POST", body: form });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { transcript: "heard 1234 bytes" });
    assert.deepEqual(seen, ["rate", "client_token", "concurrency"]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
