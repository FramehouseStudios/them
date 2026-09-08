import assert from "node:assert/strict";
import http from "node:http";
import test, { after, before } from "node:test";

import express from "express";

import { TALK_UPLOAD_LIMITS, talkUpload } from "../app.js";

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
    fields: 64,
    parts: 66,
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

test("[talk-upload] rejects a 65th metadata field with a bounded 413", async () => {
  const form = new FormData();
  for (let index = 0; index < 65; index += 1) form.append(`field_${index}`, "x");
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
