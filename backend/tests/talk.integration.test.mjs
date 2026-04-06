import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = resolve(THIS_DIR, "..");
const DOTENV_PATH = resolve(BACKEND_DIR, ".env");
const WAV_PATH = resolve(BACKEND_DIR, "test.wav");
const BASE_URL = String(process.env.TEST_BACKEND_URL || "http://127.0.0.1:3000");
const SPAWN_BACKEND_FOR_TESTS = String(process.env.TEST_SPAWN_BACKEND || "") === "1";
const TALK_TEST_ENFORCE = String(process.env.TALK_TEST_ENFORCE || "").trim().toLowerCase();
const TALK_TEST_RECOVERY_ONLY = String(process.env.TALK_TEST_RECOVERY_ONLY || "").trim().toLowerCase();
const BACKEND_PORT = String(
  process.env.TEST_PORT ||
  Number(new URL(BASE_URL).port || 3000)
);

function parseDotEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const output = {};
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    output[key] = value;
  }
  return output;
}

function lowerHeaderMap(headers) {
  const map = {};
  for (const [key, value] of headers.entries()) {
    map[String(key || "").toLowerCase()] = String(value || "");
  }
  return map;
}

async function waitForHealth(url, timeoutMs = 20_000) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.status === 200) return true;
    } catch (_) {
      // server not ready yet
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  return false;
}

const envFile = parseDotEnvFile(DOTENV_PATH);
const APP_TOKEN = process.env.APP_TOKEN || envFile.APP_TOKEN || "them-dev";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || envFile.OPENAI_API_KEY || "";
const TALK_TESTS_ENABLED = Boolean(OPENAI_API_KEY);
const TALK_TESTS_REQUIRED = TALK_TEST_ENFORCE === "1" || TALK_TEST_ENFORCE === "true" || TALK_TEST_ENFORCE === "yes";
const RECOVERY_ONLY_MODE = TALK_TEST_RECOVERY_ONLY === "1" || TALK_TEST_RECOVERY_ONLY === "true" || TALK_TEST_RECOVERY_ONLY === "yes";
const TALK_TEST_DEBUG_FAILURE_ENABLED = (() => {
  const raw = String(
    process.env.TALK_TEST_DEBUG_FAILURE_ENABLED ??
    envFile.TALK_TEST_DEBUG_FAILURE_ENABLED ??
    ""
  ).trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
})();
const FORCED_FAILURE_TEST_ENABLED = TALK_TESTS_ENABLED && (SPAWN_BACKEND_FOR_TESTS || TALK_TEST_DEBUG_FAILURE_ENABLED);

if (TALK_TESTS_REQUIRED && !TALK_TESTS_ENABLED) {
  throw new Error(
    "TALK_TEST_ENFORCE=1 requires OPENAI_API_KEY (env or backend/.env) so reliability tests cannot be silently skipped."
  );
}

let serverProc = null;
let serverLogs = "";
let testAudioBuffer = null;
let clientToken = "";
let lastTurnId = "";

before(async () => {
  assert.ok(existsSync(WAV_PATH), `Missing test audio fixture: ${WAV_PATH}`);
  testAudioBuffer = readFileSync(WAV_PATH);
  assert.ok(testAudioBuffer.length > 0, "test.wav is empty");

  if (SPAWN_BACKEND_FOR_TESTS) {
    const childEnv = {
      ...process.env,
      ...envFile,
      PORT: BACKEND_PORT,
      RUN_SERVER: "1",
      TALK_TEST_DEBUG_TRANSCRIPT_ENABLED: "1",
      TALK_TEST_DEBUG_FAILURE_ENABLED: "1",
      TALK_STREAM_AUDIO_ENABLED: "0",
    };
    serverProc = spawn(process.execPath, ["index.js"], {
      cwd: BACKEND_DIR,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    serverProc.stdout.on("data", (chunk) => { serverLogs += String(chunk || ""); });
    serverProc.stderr.on("data", (chunk) => { serverLogs += String(chunk || ""); });
  }

  const healthy = await waitForHealth(BASE_URL, 25_000);
  assert.equal(
    healthy,
    true,
    SPAWN_BACKEND_FOR_TESTS
      ? `Backend failed to start on ${BASE_URL}\n${serverLogs}`
      : `Backend not reachable at ${BASE_URL}. Start it first, or run with TEST_SPAWN_BACKEND=1.`
  );

  const sessionRes = await fetch(`${BASE_URL}/session`, {
    method: "POST",
    headers: {
      "X-APP-TOKEN": APP_TOKEN,
    },
  });
  assert.equal(sessionRes.status, 201, `POST /session failed: ${sessionRes.status}`);
  const sessionJson = await sessionRes.json();
  clientToken = String(sessionJson?.client_token || "").trim();
  assert.ok(clientToken, "No client_token returned from /session");
});

after(async () => {
  if (!SPAWN_BACKEND_FOR_TESTS) return;
  if (!serverProc || serverProc.killed) return;
  serverProc.kill("SIGTERM");
  await new Promise((resolveDone) => setTimeout(resolveDone, 300));
  if (!serverProc.killed) serverProc.kill("SIGKILL");
});

async function postTalk(debugTranscript, options = {}) {
  const extraHeaders = options?.headers && typeof options.headers === "object"
    ? options.headers
    : {};
  const extraFields = options?.fields && typeof options.fields === "object"
    ? options.fields
    : {};
  const form = new FormData();
  form.append("debug_transcript", String(debugTranscript || "").trim());
  for (const [fieldKey, fieldValue] of Object.entries(extraFields)) {
    if (fieldValue == null) continue;
    form.append(String(fieldKey), String(fieldValue));
  }
  form.append("file", new Blob([testAudioBuffer], { type: "audio/wav" }), "test.wav");

  const res = await fetch(`${BASE_URL}/talk`, {
    method: "POST",
    headers: {
      "X-APP-TOKEN": APP_TOKEN,
      "X-Client-Token": clientToken,
      ...extraHeaders,
    },
    body: form,
  });
  const audio = Buffer.from(await res.arrayBuffer());
  const headers = lowerHeaderMap(res.headers);
  return { res, audio, headers };
}

async function getTurnMeta(turnId) {
  const response = await fetch(`${BASE_URL}/talk/turn/${encodeURIComponent(String(turnId || ""))}`, {
    headers: {
      "X-APP-TOKEN": APP_TOKEN,
      "X-Client-Token": clientToken,
    },
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (_) {
    body = {};
  }
  return { response, body, raw: text };
}

test(
  "talk returns audio with commit headers",
  { timeout: 120_000, skip: !TALK_TESTS_ENABLED || RECOVERY_ONLY_MODE },
  async () => {
    const { res, audio, headers } = await postTalk("hello from integration test");
    assert.equal(res.status, 200, `POST /talk status=${res.status}`);
    assert.equal(String(headers["content-type"] || "").toLowerCase().startsWith("audio/mpeg"), true);
    assert.ok(audio.length > 1024, `audio too small: ${audio.length}`);

    const turnId = String(headers["x-turn-id"] || "").trim();
    assert.ok(turnId, "missing x-turn-id");
    assert.ok(String(headers["x-session-id"] || "").trim(), "missing x-session-id");
    assert.ok(String(headers["x-state-version"] || "").trim(), "missing x-state-version");
    assert.equal(String(headers["x-turn-status"] || "").trim(), "responded");
    assert.equal(String(headers["x-turn-meta-available"] || "").trim(), "1");
    lastTurnId = turnId;
  }
);

test(
  "talk turn endpoint returns transcript and reply",
  { timeout: 120_000, skip: !TALK_TESTS_ENABLED || RECOVERY_ONLY_MODE },
  async () => {
    assert.ok(lastTurnId, "missing lastTurnId from previous test");
    const { response, body, raw } = await getTurnMeta(lastTurnId);
    assert.equal(response.status, 200, `GET /talk/turn failed status=${response.status} body=${raw}`);
    assert.equal(String(body.turn_id || "").trim(), lastTurnId);
    assert.ok(String(body.transcript || "").length > 0, "missing transcript in turn meta");
    assert.ok(String(body.reply || "").length > 0, "missing reply in turn meta");
  }
);

test(
  "local actions are confirmation-gated and support cancel",
  { timeout: 180_000, skip: !TALK_TESTS_ENABLED || RECOVERY_ONLY_MODE },
  async () => {
    const firstActionPrompt =
      "send email to qa@example.com subject Integration Check body This is a confirmation gate test";

    const pendingTurn = await postTalk(firstActionPrompt);
    assert.equal(pendingTurn.res.status, 200);
    const pendingTurnId = String(pendingTurn.headers["x-turn-id"] || "").trim();
    assert.ok(pendingTurnId, "pending turn missing x-turn-id");
    assert.equal(pendingTurn.headers["x-email-status"], undefined, "email executed before confirmation");

    const pendingMeta = await getTurnMeta(pendingTurnId);
    assert.equal(pendingMeta.response.status, 200);
    const pendingReply = String(pendingMeta.body.reply || "").toLowerCase();
    assert.equal(
      pendingReply.includes("say \"confirm\" to run it"),
      true,
      `pending reply missing confirmation gate text: ${pendingMeta.raw}`
    );

    const cancelTurn = await postTalk("cancel action");
    assert.equal(cancelTurn.res.status, 200);
    assert.equal(cancelTurn.headers["x-email-status"], undefined, "cancel turn should not execute email action");
    const cancelTurnId = String(cancelTurn.headers["x-turn-id"] || "").trim();
    assert.ok(cancelTurnId, "cancel turn missing x-turn-id");

    const postCancelConfirm = await postTalk("confirm");
    assert.equal(postCancelConfirm.res.status, 200);
    assert.equal(
      postCancelConfirm.headers["x-email-status"],
      undefined,
      "confirm after cancel should not execute pending email action"
    );

    const rependingTurn = await postTalk(firstActionPrompt);
    assert.equal(rependingTurn.res.status, 200);

    const confirmTurn = await postTalk("confirm");
    assert.equal(confirmTurn.res.status, 200);
    const emailStatus = String(confirmTurn.headers["x-email-status"] || "").trim().toLowerCase();
    assert.ok(
      ["composed", "failed", "needs_recipient", "needs_content", "duplicate", "disabled"].includes(emailStatus),
      `confirm did not execute email action. x-email-status=${emailStatus || "(missing)"}`
    );
  }
);

test(
  "talk forced runtime failure returns recovered audio contract",
  { timeout: 120_000, skip: !FORCED_FAILURE_TEST_ENABLED },
  async () => {
    const { res, audio, headers } = await postTalk(
      "forced failure contract test",
      { headers: { "X-Debug-Force-Error": "server" } }
    );
    assert.equal(res.status, 200, `POST /talk forced-error status=${res.status}`);
    assert.equal(String(headers["content-type"] || "").toLowerCase().startsWith("audio/mpeg"), true);
    assert.ok(audio.length > 1024, `recovery audio too small: ${audio.length}`);
    assert.equal(String(headers["x-turn-status"] || "").trim(), "error_recovered");
    assert.equal(String(headers["x-turn-error-stage"] || "").trim().toLowerCase(), "server");
    assert.ok(String(headers["x-turn-error-message"] || "").trim().length > 0, "missing x-turn-error-message");
  }
);

test(
  "talk forced tts failure returns recovered audio contract",
  { timeout: 120_000, skip: !FORCED_FAILURE_TEST_ENABLED },
  async () => {
    const { res, audio, headers } = await postTalk(
      "forced tts failure contract test",
      { headers: { "X-Debug-Force-Error": "tts" } }
    );
    assert.equal(res.status, 200, `POST /talk forced-tts-error status=${res.status}`);
    assert.equal(String(headers["content-type"] || "").toLowerCase().startsWith("audio/mpeg"), true);
    assert.ok(audio.length > 1024, `recovery audio too small: ${audio.length}`);
    assert.equal(String(headers["x-turn-status"] || "").trim(), "error_recovered");
    assert.equal(String(headers["x-turn-error-stage"] || "").trim().toLowerCase(), "tts");
    assert.ok(String(headers["x-turn-error-message"] || "").trim().length > 0, "missing x-turn-error-message");
  }
);
