import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const BACKEND_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("[auth-startup] production exits instead of loading local sessions when Postgres is unavailable", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-auth-startup-"));
  const stdout = [];
  const stderr = [];
  const child = spawn(process.execPath, ["index.js"], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      NODE_ENV: "production",
      RUN_SERVER: "0",
      DATABASE_URL: "postgres://user:pass@127.0.0.1:1/them",
      JWT_SECRET: "production-startup-test-secret",
      OPENAI_API_KEY: "production-startup-test-openai-key",
      APP_TOKEN: "production-startup-test-app-token",
      AUTH_APPLE_AUDIENCE: "io.them.them",
      SCALE_BACKPLANE_ENABLED: "0",
      OUTBOX_SNAPSHOT_ENABLED: "0",
      OUTBOX_WORKER_ENABLED: "0",
      KNOWLEDGE_RAG_WARMUP_DELAY_MS: "600000",
      USER_STORE_PATH: path.join(dataDir, "user_store.json"),
      PERSISTENCE_JSON_ROOT: path.join(dataDir, "persistence"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => stdout.push(String(chunk || "")));
  child.stderr.on("data", (chunk) => stderr.push(String(chunk || "")));

  let timeoutId;
  const result = await Promise.race([
    once(child, "exit").then(([code, signal]) => ({ code, signal })),
    new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve({ timedOut: true }), 10_000);
    }),
  ]);
  clearTimeout(timeoutId);
  if (result.timedOut) {
    child.kill("SIGKILL");
    await once(child, "exit").catch(() => {});
    assert.fail("production backend did not fail closed within 10 seconds");
  }

  assert.notEqual(result.code, 0);
  const output = stdout.join("") + stderr.join("");
  assert.match(output, /user_store_adapter_unavailable/);
  assert.doesNotMatch(output, /listening on/i);
});
