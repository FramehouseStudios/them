import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts", "release_public_surface_health.mjs");

async function withServer(handler, body) {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const port = server.address().port;
    const child = spawn(process.execPath, [script, "--allow-localhost", `--url=http://127.0.0.1:${port}/privacy`], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const [code] = await once(child, "close");
    body({ code, stdout, stderr });
  } finally {
    server.close();
    await once(server, "close").catch(() => {});
  }
}

test("[release-public-surface] accepts a canonical policy page", async () => {
  await withServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<html><title>io.them Privacy Policy</title><body>${"io.them privacy choices and data controls. ".repeat(12)}</body></html>`);
  }, ({ code, stdout, stderr }) => {
    assert.equal(code, 0, stderr);
    assert.match(stdout, /Public release surface is live/);
  });
});

test("[release-public-surface] rejects parked redirects", async () => {
  await withServer((_req, res) => {
    res.writeHead(302, { Location: "https://introvert.com/?domain=them.io" });
    res.end();
  }, ({ code, stderr }) => {
    assert.equal(code, 1);
    assert.match(stderr, /redirected/);
  });
});

test("[release-public-surface] rejects an unrelated privacy page containing only the generic word them", async () => {
  await withServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<html><title>Privacy Policy</title><body>${"We respect users and never share data with them. ".repeat(12)}</body></html>`);
  }, ({ code, stderr }) => {
    assert.equal(code, 1);
    assert.match(stderr, /does not identify io\.them/);
  });
});
