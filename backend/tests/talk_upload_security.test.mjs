import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";

import express from "express";

import { TALK_UPLOAD_LIMITS, talkUpload } from "../app.js";
import { startBackend, apiRequest } from "./helpers/backend_test_server.mjs";

let baseURL = "";
let server = null;

before(async () => {
  const harness = express();
  harness.post("/talk", talkUpload, (req, res) => {
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
  const response = await fetch(`${baseURL}/talk`, { method: "POST", body: form });
  const body = await response.json();
  return { response, body };
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
  const source = readFileSync(new URL("../../them/BackendClient.swift", import.meta.url), "utf8");
  const start = source.indexOf("let audioData = try fileDataOverride");
  const end = source.indexOf("request.httpBody = body", start);
  assert.ok(start >= 0 && end > start, "Locate the native voice multipart builder.");
  const builder = source.slice(start, end);
  const direct = [...builder.matchAll(/name=\\"([a-z_]+)\\"/g)].map(match => match[1]);
  const helpers = [...builder.matchAll(/appendStudio\w*Field\(\s*"([a-z_]+)"/g)].map(match => match[1]);
  const fields = [...new Set([...direct, ...helpers])].filter(name => name !== "file");
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
    assert.equal((await apiRequest(backend, "/health")).status, 200);
  } finally { await backend.stop(); }
});
