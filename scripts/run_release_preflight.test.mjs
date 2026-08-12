import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "scripts", "run_release_preflight.sh");
const scriptSource = fs.readFileSync(script, "utf8");

function run(env = {}) {
  return spawnSync(script, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("[run-release-preflight] fails clearly when local release config is missing", () => {
  const missingPath = path.join(os.tmpdir(), `io-them-missing-release-${Date.now()}.env`);
  const r = run({ RELEASE_ENV_FILE: missingPath });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Missing local release config/);
  assert.match(r.stderr, /Release\.local\.env\.example/);
  assert.match(r.stderr, /DEVELOPMENT_TEAM_ID and APP_TOKEN_RELEASE/);
  assert.doesNotMatch(r.stderr, /fill in DEVELOPMENT_TEAM_ID, BACKEND_URL, and APP_TOKEN_RELEASE/i);
});

test("[run-release-preflight] rejects placeholder local release config before preflight", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-release-env-"));
  const envPath = path.join(directory, "Release.local.env");
  fs.copyFileSync(path.join(repoRoot, "them", "Release.local.env.example"), envPath);
  fs.chmodSync(envPath, 0o600);

  const r = run({ RELEASE_ENV_FILE: envPath });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /missing real private value\(s\): DEVELOPMENT_TEAM_ID APP_TOKEN_RELEASE/);
  assert.doesNotMatch(r.stderr, /BACKEND_URL/);
  assert.doesNotMatch(r.stdout, /App Store Preflight/);
});

test("[run-release-preflight] enables the deterministic voice latency gate by default", () => {
  assert.match(scriptSource, /RUN_VOICE_LATENCY_GATE="\$\{RUN_VOICE_LATENCY_GATE:-1\}"/);
  assert.match(scriptSource, /scripts\/run_voice_latency_gate\.sh/);
  assert.match(scriptSource, /Skipping voice latency gate/);
});

test("[run-release-preflight] enables cross-platform voice network-fault smokes by default", () => {
  assert.match(scriptSource, /RUN_VOICE_NETWORK_FAULT_GATE="\$\{RUN_VOICE_NETWORK_FAULT_GATE:-1\}"/);
  assert.match(scriptSource, /scripts\/run_voice_network_fault_smokes\.sh/);
  assert.match(scriptSource, /Skipping voice network-fault gate/);
});

test("[run-release-preflight] archives the production Mac app by default", () => {
  assert.match(scriptSource, /MAC_DESKTOP_CONFIGURATION="\$\{MAC_DESKTOP_CONFIGURATION:-Mac Scaffold Release\}"/);
  assert.match(scriptSource, /MAC_DESKTOP_ACTION="\$\{MAC_DESKTOP_ACTION:-archive\}"/);
  assert.match(scriptSource, /scripts\/desktop_preflight\.sh/);
});
