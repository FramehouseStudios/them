import assert from "node:assert/strict";
import { test } from "node:test";
import { fork } from "node:child_process";
import { once } from "node:events";
import http from "node:http";

async function fixture(run) {
  const child = fork(new URL("./helpers/upload_security_server.mjs", import.meta.url), [], {
    env: { ...process.env, NODE_ENV: "test", REQUIRE_APP_TOKEN: "false",
      APP_TOKEN: "fixture-only-upload", OPENAI_API_KEY: "fixture-only-no-live" },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  // Drain output without exposing bodies or accidentally promoting expected
  // child-process crashes into test-runner crashes.
  child.stdout.resume(); child.stderr.resume();
  try {
    const [{ port }] = await once(child, "message", { signal: AbortSignal.timeout(10000) });
    const base = `http://127.0.0.1:${port}`;
    const send = (body, headers) => fetch(base + "/upload", { method: "POST", body, headers,
      signal: AbortSignal.timeout(10000) });
    await run({ send, base, child });
  } finally {
    if (child.exitCode == null && child.signalCode == null) {
      const stopped = once(child, "exit"); child.kill("SIGTERM"); await stopped;
    }
  }
}

test("voice upload preserves both supported audio fields and text", () => fixture(async ({ send }) => {
  for (const name of ["file", "audio"]) {
    const form = new FormData();
    form.append("text", "synthetic screenplay fixture");
    form.append(name, new Blob([new Uint8Array([0, 1, 2, 255])], { type: "audio/wav" }), "voice.wav");
    const response = await send(form);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true,
      files: [{ field: name, bytes: 4, hex: "000102ff" }], text: "synthetic screenplay fixture" });
  }
}));

test("crafted multipart field names are rejected without killing the voice server", () => fixture(async ({ send, base, child }) => {
  const form = new FormData();
  form.append("items[4294967294]", "x"); form.append("items[]", "y");
  const response = await send(form);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).stage, "upload");
  assert.equal(child.exitCode, null);
  assert.equal((await fetch(base + "/health")).status, 200);
}));

test("unexpected audio fields and duplicate uploads fail with a safe upload error", () => fixture(async ({ send, base }) => {
  for (const names of [["unexpected"], ["audio", "audio"]]) {
    const form = new FormData();
    for (const name of names) form.append(name, new Blob(["fixture"]), "voice.wav");
    const response = await send(form);
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.stage, "upload");
    assert.equal(body.error, "Invalid audio upload.");
  }
  assert.equal((await fetch(base + "/health")).status, 200);
}));

test("oversized voice retains the existing413 contract and server survives", () => fixture(async ({ send, base }) => {
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(25 * 1024 * 1024 + 1)]), "voice.wav");
  const response = await send(form);
  assert.equal(response.status, 413);
  assert.equal((await response.json()).stage, "upload");
  assert.equal((await fetch(base + "/health")).status, 200);
}));

test("truncated multipart voice returns a safe client error", () => fixture(async ({ send, base }) => {
  const response = await send('--fixture\r\nContent-Disposition: form-data; name="audio"; filename="voice.wav"\r\n\r\npartial',
    { "Content-Type": "multipart/form-data; boundary=fixture" });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).stage, "upload");
  assert.equal((await fetch(base + "/health")).status, 200);
}));

test("disconnecting during voice upload does not kill the server", () => fixture(async ({ base, child }) => {
  const entered = once(child, "message", { signal: AbortSignal.timeout(5000) });
  const request = http.request(base + "/upload", { method: "POST", headers: {
    "Content-Type": "multipart/form-data; boundary=fixture" } });
  request.on("error", () => {}); // Expected client disconnect, not a provider failure.
  request.write('--fixture\r\nContent-Disposition: form-data; name="audio"; filename="voice.wav"\r\n\r\npartial');
  const [message] = await entered;
  assert.equal(message.uploadStarted, true);
  const closed = new Promise((resolve) => request.once("close", resolve));
  request.destroy(); await closed;
  assert.equal((await fetch(base + "/health")).status, 200);
  assert.equal(child.exitCode, null);
}));
