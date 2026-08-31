import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  apiRequest,
  startBackend,
} from "./helpers/backend_test_server.mjs";

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDIO = fs.readFileSync(path.join(BACKEND_DIR, "test.wav"));

async function createSession(server) {
  const response = await apiRequest(server, "/session", { method: "POST" });
  assert.equal(response.status, 201, response.text);
  const token = String(response.json?.client_token || "").trim();
  assert.ok(token, "session returns a client token");
  return token;
}

async function startStreamingTalk(server, clientToken, transcript) {
  const form = new FormData();
  form.append("debug_transcript", transcript);
  form.append("file", new Blob([AUDIO], { type: "audio/wav" }), "test.wav");
  const response = await fetch(`${server.baseUrl}/talk`, {
    method: "POST",
    headers: {
      "X-APP-TOKEN": server.env.APP_TOKEN,
      "X-Client-Token": clientToken,
      "X-Talk-Stream": "audio",
    },
    body: form,
  });
  return {
    response,
    body: response.arrayBuffer(),
  };
}

async function waitForTalkCount(server, expected, timeoutMs = 2_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const metrics = await apiRequest(server, "/ops/metrics");
    if (Number(metrics.json?.talk_in_flight || 0) === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`talk_in_flight did not reach ${expected}`);
}

async function canOpenSocket(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = (accepted) => {
      socket.destroy();
      resolve(accepted);
    };
    socket.setTimeout(150, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function waitForSocketRefusal(port, timeoutMs = 1_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!(await canOpenSocket(port))) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("backend continued accepting new sockets during shutdown");
}

async function waitForExit(child, timeoutMs = 5_000) {
  if (child.exitCode != null) return child.exitCode;
  let timer = null;
  const result = await Promise.race([
    once(child, "exit").then(([code]) => ({ exited: true, code })),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve({ exited: false, code: null }), timeoutMs);
    }),
  ]);
  if (timer) clearTimeout(timer);
  assert.equal(result.exited, true, "backend exits within the shutdown grace period");
  return result.code;
}

test("[shutdown-integration] SIGTERM drains two active talk streams and refuses new sockets", {
  timeout: 30_000,
}, async () => {
  const server = await startBackend({
    env: {
      REQUIRE_USER_AUTH: "0",
      TALK_TEST_DEBUG_TRANSCRIPT_ENABLED: "1",
      TALK_TEST_DEBUG_OFFLINE_ENABLED: "1",
      TALK_TEST_DEBUG_STREAM_END_DELAY_MS: "300",
      TALK_STREAM_AUDIO_ENABLED: "1",
      SHUTDOWN_GRACE_MS: "3000",
    },
  });

  try {
    const [firstToken, secondToken] = await Promise.all([
      createSession(server),
      createSession(server),
    ]);
    const first = await startStreamingTalk(server, firstToken, "First active shutdown turn");
    const second = await startStreamingTalk(server, secondToken, "Second active shutdown turn");
    await waitForTalkCount(server, 2);

    assert.equal(server.child.kill("SIGTERM"), true);
    await waitForSocketRefusal(server.port);

    const [firstBody, secondBody] = await Promise.all([first.body, second.body]);
    assert.equal(first.response.status, 200);
    assert.equal(second.response.status, 200);
    assert.ok(firstBody.byteLength > 0);
    assert.ok(secondBody.byteLength > 0);
    assert.equal(await waitForExit(server.child), 0);

    const output = server.stdout.join("") + server.stderr.join("");
    assert.match(output, /shutdown_started/);
    assert.match(output, /shutdown_done/);
    assert.doesNotMatch(output, /shutdown_timeout/);
  } finally {
    if (server.child.exitCode == null) {
      await server.stop();
    }
  }
});
