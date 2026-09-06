import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, "live_backend_health.mjs");

async function withServer(handler, fn) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(baseURL);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function run(args, env = {}) {
  const child = spawn(process.execPath, [script, ...args], {
    env: { ...process.env, ...env },
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const status = await new Promise((resolve) => child.on("close", resolve));
  return { status, stdout, stderr };
}

function sendJSON(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

test("[live-backend-health] accepts a live THEM health surface with token", async () => {
  await withServer((req, res) => {
    if (req.url === "/healthz") return sendJSON(res, 200, { ok: true, persistence: "ok" });
    if (req.url === "/api/version") {
      assert.equal(req.headers["x-app-token"], "release-token");
      return sendJSON(res, 200, { ok: true, schema_version: 1, backend_build: "test" });
    }
    return sendJSON(res, 404, { ok: false });
  }, async (baseURL) => {
    const r = await run(["--allow-localhost", `--url=${baseURL}`], { APP_TOKEN_RELEASE: "release-token" });
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /\[OK\] \/healthz is live and ready/);
    assert.match(r.stdout, /\[OK\] \/api\/version is live/);
    assert.doesNotMatch(r.stdout, /release-token/);
  });
});

test("[live-backend-health] accepts app-token protected api/version when no token is available", async () => {
  await withServer((req, res) => {
    if (req.url === "/healthz") return sendJSON(res, 200, { ok: true, persistence: "ok" });
    if (req.url === "/api/version") return sendJSON(res, 401, { stage: "auth", error: "Unauthorized" });
    return sendJSON(res, 404, { ok: false });
  }, async (baseURL) => {
    const r = await run(["--allow-localhost", `--url=${baseURL}`], { APP_TOKEN: "", APP_TOKEN_RELEASE: "" });
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /app-token protected/);
  });
});

test("[live-backend-health] rejects parked domain redirects", async () => {
  await withServer((_req, res) => {
    res.writeHead(302, {
      location: "https://introvert.com/?domain=them.io",
      "content-type": "text/html",
    });
    res.end("<html>parked</html>");
  }, async (baseURL) => {
    const r = await run(["--allow-localhost", `--url=${baseURL}`]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /parked them\.io domain/);
  });
});

test("[live-backend-health] rejects Render no-server routing", async () => {
  await withServer((_req, res) => {
    res.writeHead(404, {
      "x-render-routing": "no-server",
      "content-type": "text/plain",
    });
    res.end("Not Found");
  }, async (baseURL) => {
    const r = await run(["--allow-localhost", `--url=${baseURL}`]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /Render has no server routed/);
  });
});

test("[live-backend-health] rejects localhost unless explicitly allowed", async () => {
  await withServer((_req, res) => sendJSON(res, 200, { ok: true }), async (baseURL) => {
    const r = await run([`--url=${baseURL}`]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /must not point to localhost/);
  });
});
