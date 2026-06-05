import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

function createTestDataDir(prefix = "them-backend-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function getFreePort() {
  const server = net.createServer();
  server.unref();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = Number(address?.port || 0);
  server.close();
  return port;
}

async function waitForServer(baseUrl, timeoutMs = 15000) {
  const startedAt = Date.now();
  let lastError = null;
  while ((Date.now() - startedAt) < timeoutMs) {
    try {
      const response = await fetch(baseUrl + "/health");
      if (response.ok) return;
      lastError = new Error("health returned " + response.status);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError || new Error("Timed out waiting for " + baseUrl);
}

export async function startBackend({
  dataDir = createTestDataDir(),
  env = {},
  port: requestedPort = null,
} = {}) {
  const port = requestedPort == null ? await getFreePort() : Number(requestedPort);
  const stdout = [];
  const stderr = [];
  const childEnv = {
    ...process.env,
    PORT: String(port),
    RUN_SERVER: "1",
    NODE_ENV: "test",
    APP_TOKEN: "them-test-app-token",
    JWT_SECRET: "them-test-jwt-secret",
    REQUIRE_USER_AUTH: env.REQUIRE_USER_AUTH == null ? "1" : String(env.REQUIRE_USER_AUTH),
    AUTH_APPLE_AUDIENCE: "io.them.them",
    OPENAI_API_KEY: "test-openai-key",
    OUTBOX_WORKER_ENABLED: "0",
    KNOWLEDGE_RAG_WARMUP_DELAY_MS: "600000",
    BACKEND_SQLITE_PATH: path.join(dataDir, "backend_store.sqlite"),
    USER_STORE_PATH: path.join(dataDir, "user_store.json"),
    USER_MEMORY_STORE_PATH: path.join(dataDir, "user_memory_store.json"),
    SCREENPLAY_STORE_PATH: path.join(dataDir, "screenplay_store.json"),
    OUTBOX_STORE_PATH: path.join(dataDir, "outbox_store.json"),
    ASSISTANT_IDENTITY_STORE_PATH: path.join(dataDir, "assistant_identity_store.json"),
    // T07: isolate the persistence adapter's JSON root per test run so
    // dual-writes from screenplay/embeddings/etc. don't carry state
    // across tests via the shared backend/data/persistence/ default.
    PERSISTENCE_JSON_ROOT: path.join(dataDir, "persistence"),
    ...env,
  };
  const child = spawn(process.execPath, ["index.js"], {
    cwd: BACKEND_DIR,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => {
    stdout.push(String(chunk || ""));
  });
  child.stderr.on("data", (chunk) => {
    stderr.push(String(chunk || ""));
  });

  const baseUrl = "http://127.0.0.1:" + port;
  try {
    await waitForServer(baseUrl, 20000);
  } catch (error) {
    child.kill("SIGKILL");
    throw new Error(
      "Backend failed to start: " + String(error?.message || error) +
      "\nstdout:\n" + stdout.join("") +
      "\nstderr:\n" + stderr.join("")
    );
  }

  return {
    child,
    port,
    baseUrl,
    dataDir,
    env: childEnv,
    stdout,
    stderr,
    async stop() {
      if (child.exitCode != null) return;
      child.kill("SIGTERM");
      const exited = await Promise.race([
        once(child, "exit").then(() => true).catch(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), 1000)),
      ]);
      if (!exited && child.exitCode == null) {
        child.kill("SIGKILL");
        await once(child, "exit").catch(() => {});
      }
    },
  };
}

export async function apiRequest(server, pathname, {
  method = "GET",
  headers = {},
  json,
  body,
} = {}) {
  const response = await fetch(server.baseUrl + pathname, {
    method,
    headers: {
      "X-APP-TOKEN": server.env.APP_TOKEN,
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : body,
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_) {
    payload = null;
  }
  return {
    response,
    status: response.status,
    headers: response.headers,
    text,
    json: payload,
  };
}
