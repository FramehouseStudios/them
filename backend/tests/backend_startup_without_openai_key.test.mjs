import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  apiRequest,
  startBackend,
} from "./helpers/backend_test_server.mjs";

const BACKEND_ENTRY = fileURLToPath(new URL("../index.js", import.meta.url));

test("[startup] development boots without OPENAI_API_KEY and provider routes fail closed", async (t) => {
  const server = await startBackend({
    env: {
      NODE_ENV: "development",
    },
    unsetEnv: ["OPENAI_API_KEY"],
  });
  t.after(() => server.stop());

  const health = await apiRequest(server, "/health");
  assert.equal(health.status, 200);

  const signup = await apiRequest(server, "/auth/signup", {
    method: "POST",
    json: {
      email: "providerless-startup@example.com",
      password: "providerless-password-123",
    },
  });
  assert.equal(signup.status, 201);
  const authorization = "Bearer " + String(signup.json?.token || signup.json?.access_token || "");

  const realtimeCall = await apiRequest(server, "/realtime/call", {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/sdp",
    },
    body: "v=0\r\n",
  });
  assert.equal(realtimeCall.status, 503);
  assert.equal(realtimeCall.json?.stage, "realtime_call");
  assert.match(realtimeCall.json?.error || "", /OpenAI API key is missing/);

  const realtimeSecret = await apiRequest(server, "/realtime/client_secret", {
    method: "POST",
    headers: { Authorization: authorization },
    json: { instructions: "Keep it spare." },
  });
  assert.equal(realtimeSecret.status, 503);
  assert.equal(realtimeSecret.json?.code, "realtime_supplier_unauthorized");
  assert.equal(realtimeSecret.json?.fallback, false);
  assert.equal(realtimeSecret.json?.degraded, true);
  assert.equal(realtimeSecret.json?.client_secret, undefined);

  const talk = await apiRequest(server, "/talk", {
    method: "POST",
    headers: { Authorization: authorization },
  });
  assert.equal(talk.status, 503);
  assert.deepEqual(talk.json, {
    stage: "talk",
    code: "provider_not_configured",
    retryable: false,
    error: "Writing provider is not configured.",
  });
});

test("[startup] production still exits when OPENAI_API_KEY is absent", async (t) => {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    RUN_SERVER: "1",
  };
  delete env.OPENAI_API_KEY;

  const stderr = [];
  const child = spawn(process.execPath, [BACKEND_ENTRY], {
    cwd: path.dirname(BACKEND_ENTRY),
    env,
    stdio: ["ignore", "ignore", "pipe"],
  });
  child.stderr.on("data", (chunk) => stderr.push(String(chunk || "")));
  t.after(async () => {
    if (child.exitCode == null) {
      child.kill("SIGKILL");
      await once(child, "close").catch(() => {});
    }
  });

  let timeout;
  let exit;
  try {
    exit = await Promise.race([
      once(child, "close"),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Production backend did not exit")),
          5000
        );
        timeout.unref();
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }

  assert.equal(exit[0], 1);
  assert.equal(exit[1], null);
  assert.match(stderr.join(""), /OPENAI_API_KEY/);
});

test("[startup] unknown environments fail closed instead of inheriting local defaults", async (t) => {
  const env = {
    ...process.env,
    NODE_ENV: "staginng",
    RUN_SERVER: "1",
  };
  delete env.OPENAI_API_KEY;

  const stderr = [];
  const child = spawn(process.execPath, [BACKEND_ENTRY], {
    cwd: path.dirname(BACKEND_ENTRY),
    env,
    stdio: ["ignore", "ignore", "pipe"],
  });
  child.stderr.on("data", (chunk) => stderr.push(String(chunk || "")));
  t.after(async () => {
    if (child.exitCode == null) {
      child.kill("SIGKILL");
      await once(child, "close").catch(() => {});
    }
  });

  const exit = await once(child, "close");
  assert.equal(exit[0], 1);
  assert.match(stderr.join(""), /unsupported NODE_ENV=.*staginng/);
});
