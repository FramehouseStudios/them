import assert from "node:assert/strict";
import http from "node:http";
import { Readable } from "node:stream";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";

import express from "express";

import { TALK_UPLOAD_LIMITS, talkUpload } from "../app.js";
import { startBackend, apiRequest } from "./helpers/backend_test_server.mjs";

let baseURL = "";
let server = null;
let acceptedUploads = 0;
const failedUploads = [];

before(async () => {
  const harness = express();
  harness.use((req, res, next) => {
    res.once("finish", () => {
      if (res.statusCode < 400) return;
      failedUploads.push({
        bufferedFileBytes: Object.values(req.files || {}).flat().reduce((total, file) => total + (file.buffer?.length || 0), 0),
        byteCounterAttached: req.listeners("data").some(listener => listener.name === "countBytes"),
      });
    });
    next();
  });
  harness.post("/talk", talkUpload, (req, res) => {
    acceptedUploads += 1;
    const files = Object.values(req.files || {}).flat();
    return res.status(200).json({
      fields: req.body,
      files: files.map((file) => ({
        fieldname: file.fieldname,
        originalname: file.originalname,
        size: file.size,
      })),
    });
  });
  harness.get("/health", (_req, res) => res.status(200).json({ ok: true }));
  server = http.createServer(harness);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseURL = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function formWithFile(fieldname = "file") {
  const form = new FormData();
  form.append("project_id", "project-1");
  form.append(fieldname, new Blob(["voice"], { type: "audio/wav" }), "voice.wav");
  return form;
}

async function postForm(form) {
  const response = await fetch(`${baseURL}/talk`, { method: "POST", body: form, signal: AbortSignal.timeout(15000) });
  const body = await response.json();
  return { response, body };
}

function nativeVoiceFieldNames() {
  const source = readFileSync(new URL("../../them/BackendClient.swift", import.meta.url), "utf8");
  const start = source.indexOf("let audioData = try fileDataOverride");
  const end = source.indexOf("request.httpBody = body", start);
  assert.ok(start >= 0 && end > start, "Locate the native voice multipart builder.");
  const builder = source.slice(start, end);
  const direct = [...builder.matchAll(/name=\\"([a-z_]+)\\"/g)].map(match => match[1]);
  const helpers = [...builder.matchAll(/appendStudio\w*Field\(\s*"([a-z_]+)"/g)].map(match => match[1]);
  return [...new Set([...direct, ...helpers])].filter(name => name !== "file");
}

async function postChunkedMultipart(chunks, url = `${baseURL}/talk`, headers = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const deadline = setTimeout(() => rejectPromise(new Error("Chunked upload response timed out.")), 15000);
    const resolve = result => { clearTimeout(deadline); resolvePromise(result); };
    const reject = error => { clearTimeout(deadline); rejectPromise(error); };
    const request = http.request(url, {
      method: "POST", agent: false, signal: AbortSignal.timeout(15000),
      headers: { "content-type": "multipart/form-data; boundary=byte-budget", ...(!headers["content-length"] ? { "transfer-encoding": "chunked" } : {}), ...headers },
    }, response => {
      const received = [];
      response.on("data", chunk => received.push(chunk));
      response.on("error", reject);
      response.on("end", () => {
        try { resolve({ status: response.statusCode, headers: response.headers, body: JSON.parse(Buffer.concat(received)) }); }
        catch (error) { reject(error); }
      });
    });
    // An early auth rejection can close the write side while a chunked body
    // is in flight. Still require its complete JSON response; the abort signal
    // rejects on deadline if no response arrives. Never retry the request.
    request.on("error", error => { if (error.code !== "EPIPE") reject(error); });
    Readable.from(chunks).pipe(request);
  });
}

function metadataChunks(count) {
  const value = Buffer.alloc(TALK_UPLOAD_LIMITS.fieldSize - 1, "x");
  return Array.from({ length: count }, (_, index) => [
    `--byte-budget\r\nContent-Disposition: form-data; name="context_${index}"\r\n\r\n`, value, "\r\n",
  ]).flat();
}

test("[talk-upload] limits match the bounded voice endpoint contract", () => {
  assert.deepEqual(TALK_UPLOAD_LIMITS, {
    fileSize: 25 * 1024 * 1024,
    files: 1,
    fields: 80,
    parts: 82,
    fieldNameSize: 128,
    fieldSize: 1024 * 1024,
    fieldNestingDepth: 0,
    fieldArrayIndexLimit: 0,
  });
});

for (const fieldname of ["file", "audio"]) {
  test(`[talk-upload] accepts one ${fieldname} payload with metadata`, async () => {
    const { response, body } = await postForm(formWithFile(fieldname));
    assert.equal(response.status, 200);
    assert.equal(body.fields.project_id, "project-1");
    assert.deepEqual(body.files, [{ fieldname, originalname: "voice.wav", size: 5 }]);
  });
}

test("[talk-upload] accepts 64 fields and one file", async () => {
  const form = formWithFile();
  for (let index = 1; index < 64; index += 1) form.append(`field_${index}`, "ok");
  const { response } = await postForm(form);
  assert.equal(response.status, 200);
});

test("[talk-upload] accepts every field name the current Swift voice builder can emit", async () => {
  // Contract proof uses actual client source, not a copied field list that can
  // silently drift. This exercises production parsing, not a live ASR/model.
  const fields = nativeVoiceFieldNames();
  assert.ok(fields.includes("screenplay_target_pages"), "Include the complete Studio field region.");
  assert.ok(fields.length > 64, "Exercise the current full envelope, not the old 64-field fixture.");
  const form = new FormData();
  for (const name of fields) form.append(name, "synthetic-value");
  form.append("file", new Blob(["voice"], { type: "audio/wav" }), "voice.wav");
  const { response, body } = await postForm(form);
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(body.fields).sort(), fields.sort());
  assert.equal(body.files.length, 1);
});

test("[talk-upload] accepts the full metadata ceiling and one file", async () => {
  const form = formWithFile();
  for (let index = 1; index < TALK_UPLOAD_LIMITS.fields; index += 1) form.append(`field_${index}`, "ok");
  const { response, body } = await postForm(form);
  assert.equal(response.status, 200);
  assert.equal(Object.keys(body.fields).length, TALK_UPLOAD_LIMITS.fields);
  assert.equal(body.files.length, 1);
});

test("[talk-upload] accepts maximum audio with 120 pages and the complete native field envelope", async () => {
  const fields = nativeVoiceFieldNames();
  assert.ok(fields.includes("screenplay_draft_excerpt"));
  assert.ok(fields.length > 64);
  // FormData serializes text newlines as CRLF. Compare the actual wire text.
  const screenplay = Array.from({ length: 120 * 55 }, (_, index) => `Action ${index}: the astronaut discovers the stage behind the stars.`).join("\r\n");
  const transcript = "Write the opening scene: two astronauts discover their spacecraft is a film set.";
  const form = new FormData();
  // Deliberately larger than the client's current 6,000-character excerpt.
  // This proves parser headroom, not native transmission of a full screenplay.
  for (const name of fields) form.append(name, name === "screenplay_draft_excerpt" ? screenplay : name === "client_transcript" ? transcript : "synthetic-value");
  form.append("file", new Blob([new Uint8Array(TALK_UPLOAD_LIMITS.fileSize)]), "maximum.wav");
  const { response, body } = await postForm(form);
  assert.equal(response.status, 200);
  assert.equal(body.fields.screenplay_draft_excerpt, screenplay);
  assert.equal(body.fields.client_transcript, transcript);
  assert.deepEqual(Object.keys(body.fields).sort(), fields.sort());
  assert.equal(body.files[0].size, TALK_UPLOAD_LIMITS.fileSize);
});

test("[talk-upload] rejects metadata above the ceiling with a bounded 413", async () => {
  const form = new FormData();
  for (let index = 0; index <= TALK_UPLOAD_LIMITS.fields; index += 1) form.append(`field_${index}`, "x");
  const { response, body } = await postForm(form);
  assert.equal(response.status, 413);
  assert.equal(body.code, "upload_too_large");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("[talk-upload] rejects two files", async () => {
  const form = formWithFile("file");
  form.append("audio", new Blob(["second"]), "second.wav");
  const { response, body } = await postForm(form);
  assert.equal(response.status, 413);
  assert.equal(body.code, "upload_too_large");
});

for (const fieldname of ["nested[value]", "indexed[1]"]) {
  test(`[talk-upload] rejects structured field name ${fieldname}`, async () => {
    const form = new FormData();
    form.append(fieldname, "x");
    const { response, body } = await postForm(form);
    assert.equal(response.status, 400);
    assert.equal(body.code, "invalid_multipart_upload");
  });
}

test("[talk-upload] rejects an oversized field name", async () => {
  const form = new FormData();
  form.append("x".repeat(129), "value");
  const { response, body } = await postForm(form);
  assert.equal(response.status, 400);
  assert.equal(body.code, "invalid_multipart_upload");
});

test("[talk-upload] rejects an empty field name", async () => {
  const form = new FormData();
  form.append("", "value");
  const { response, body } = await postForm(form);
  assert.equal(response.status, 400);
  assert.equal(body.code, "invalid_multipart_upload");
});

test("[talk-upload] rejects an oversized text field", async () => {
  const form = new FormData();
  form.append("context", "x".repeat(TALK_UPLOAD_LIMITS.fieldSize + 1));
  const { response, body } = await postForm(form);
  assert.equal(response.status, 413);
  assert.equal(body.code, "upload_too_large");
});

test("[talk-upload] rejects aggregate metadata above the request budget even when every field is legal", async () => {
  const requestBudget = TALK_UPLOAD_LIMITS.fileSize + 8 * 1024 * 1024;
  const form = new FormData();
  const value = "x".repeat(TALK_UPLOAD_LIMITS.fieldSize - 1);
  const legalField = new FormData();
  legalField.append("context", value);
  assert.equal((await postForm(legalField)).response.status, 200);
  const fieldCount = Math.floor(requestBudget / value.length) + 1;
  assert.ok(fieldCount < TALK_UPLOAD_LIMITS.fields);
  assert.ok(fieldCount * Buffer.byteLength(value) > requestBudget);
  for (let i = 0; i < fieldCount; i += 1) form.append(`context_${i}`, value);
  const { response, body } = await postForm(form);
  assert.equal(response.status, 413);
  assert.equal(body.code, "upload_too_large");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(JSON.stringify(body).includes(value.slice(0, 100)), false);
  assert.equal((await fetch(`${baseURL}/health`)).status, 200);
  assert.equal((await postForm(formWithFile())).response.status, 200);
});

test("[talk-upload] rejects an oversized voice file", async () => {
  const form = new FormData();
  form.append(
    "audio",
    new Blob([new Uint8Array(TALK_UPLOAD_LIMITS.fileSize + 1)]),
    "oversized.wav"
  );
  const { response, body } = await postForm(form);
  assert.equal(response.status, 413);
  assert.equal(body.code, "file_too_large");
  assert.match(body.error, /25MB/);
});

test("[talk-upload] rejects aggregate chunked metadata without a Content-Length", async () => {
  const result = await postChunkedMultipart([...metadataChunks(34), "--byte-budget--\r\n"]);
  assert.equal(result.status, 413);
  assert.equal(result.body.code, "upload_too_large");
  assert.equal(result.headers["cache-control"], "no-store");
  assert.ok(JSON.stringify(result.body).length < 300);
  assert.equal((await postForm(formWithFile())).response.status, 200);
});

test("[talk-upload] rejects an excessive declared length before waiting for its body", async () => {
  const result = await postChunkedMultipart([], `${baseURL}/talk`, {
    "content-length": String(TALK_UPLOAD_LIMITS.fileSize + 8 * 1024 * 1024 + 1),
  });
  assert.equal(result.status, 413);
  assert.equal(result.body.stage, "upload");
  assert.equal(result.body.code, "upload_too_large");
  assert.equal(result.headers["cache-control"], "no-store");
  assert.equal((await postForm(formWithFile())).response.status, 200);
});

for (const excess of [0, 1]) {
  test(`[talk-upload] enforces the exact wire-byte boundary (${excess} excess bytes)`, async () => {
    const budget = TALK_UPLOAD_LIMITS.fileSize + 8 * 1024 * 1024;
    const chunks = [...metadataChunks(33), "--byte-budget--\r\n"];
    const wireBytes = chunks.reduce((total, chunk) => total + Buffer.byteLength(chunk), 0);
    const lastValueIndex = chunks.length - 3;
    chunks[lastValueIndex] = chunks[lastValueIndex].subarray(0, chunks[lastValueIndex].length - (wireBytes - budget) + excess);
    assert.equal(chunks.reduce((total, chunk) => total + Buffer.byteLength(chunk), 0), budget + excess);
    const result = await postChunkedMultipart(chunks);
    assert.equal(result.status, excess === 0 ? 200 : 413);
    if (excess) assert.equal(result.body.code, "upload_too_large");
  });
}

test("[talk-upload] settles a chunked byte-limit failure during an active audio file", async () => {
  const acceptedBefore = acceptedUploads;
  const chunks = metadataChunks(9);
  chunks.push('--byte-budget\r\nContent-Disposition: form-data; name="audio"; filename="voice.wav"\r\nContent-Type: audio/wav\r\n\r\n');
  for (let index = 0; index < 25; index += 1) chunks.push(Buffer.alloc(1024 * 1024));
  chunks.push("\r\n--byte-budget--\r\n");
  const result = await postChunkedMultipart(chunks);
  assert.equal(result.status, 413);
  assert.equal(result.body.code, "upload_too_large");
  assert.equal(acceptedUploads, acceptedBefore, "Never invoke the downstream talk handler.");
  assert.deepEqual(failedUploads.at(-1), { bufferedFileBytes: 0, byteCounterAttached: false });
  assert.equal((await fetch(`${baseURL}/health`)).status, 200);
  assert.equal((await postForm(formWithFile())).response.status, 200);
});

test("[talk-upload] removes a completed in-memory file when later metadata exceeds the byte limit", async () => {
  const acceptedBefore = acceptedUploads;
  const chunks = ['--byte-budget\r\nContent-Disposition: form-data; name="file"; filename="voice.wav"\r\nContent-Type: audio/wav\r\n\r\n'];
  for (let index = 0; index < 25; index += 1) chunks.push(Buffer.alloc(1024 * 1024));
  chunks.push("\r\n", ...metadataChunks(9), "--byte-budget--\r\n");
  const result = await postChunkedMultipart(chunks);
  assert.equal(result.status, 413);
  assert.equal(result.body.code, "upload_too_large");
  assert.equal(acceptedUploads, acceptedBefore);
  assert.deepEqual(failedUploads.at(-1), { bufferedFileBytes: 0, byteCounterAttached: false });
  assert.equal((await postForm(formWithFile())).response.status, 200);
});

test("[talk-upload] rejects an unexpected file field", async () => {
  const { response, body } = await postForm(formWithFile("attachment"));
  assert.equal(response.status, 400);
  assert.equal(body.code, "invalid_multipart_upload");
});

test("[talk-upload] rejects malformed multipart and remains healthy", async () => {
  const response = await fetch(`${baseURL}/talk`, {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=broken" },
    body: "--broken\r\nContent-Disposition: form-data; name=\"field\"\r\n\r\nunfinished",
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "invalid_multipart_upload");

  const health = await fetch(`${baseURL}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });
});

test("[talk-upload] real backend requires auth and rejects unsafe uploads before generation", async () => {
  const backend = await startBackend({ env: { REQUIRE_USER_AUTH: "true" } });
  const unsafeForm = () => {
    const form = new FormData();
    form.append("unsafe[999999]", "synthetic");
    return form;
  };
  try {
    const anonymous = await apiRequest(backend, "/talk", { method: "POST", body: unsafeForm() });
    assert.equal(anonymous.status, 401);
    const signup = await apiRequest(backend, "/auth/signup", {
      method: "POST", json: { email: "upload-contract@example.com", password: "synthetic-upload-contract-password" },
    });
    assert.equal(signup.status, 201);
    const headers = { Authorization: `Bearer ${signup.json.token || signup.json.access_token}` };
    const rejected = await apiRequest(backend, "/talk", { method: "POST", headers, body: unsafeForm() });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.json.stage, "upload");
    assert.equal(rejected.json.code, "invalid_multipart_upload");
    const form = new FormData();
    for (let i = 0; i <= TALK_UPLOAD_LIMITS.fields; i += 1) form.append(`field_${i}`, "x");
    const limited = await apiRequest(backend, "/talk", { method: "POST", headers, body: form });
    assert.equal(limited.status, 413);
    assert.equal(limited.json.code, "upload_too_large");
    const chunks = [...metadataChunks(34), "--byte-budget--\r\n"];
    const anonymousAggregate = await postChunkedMultipart(chunks, `${backend.baseUrl}/talk`);
    assert.equal(anonymousAggregate.status, 401);
    const aggregate = await postChunkedMultipart(chunks, `${backend.baseUrl}/talk`, headers);
    assert.equal(aggregate.status, 413);
    assert.equal(aggregate.body.stage, "upload");
    assert.equal(aggregate.body.code, "upload_too_large");
    assert.equal((await apiRequest(backend, "/health")).status, 200);
  } finally { await backend.stop(); }
});
