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
});

test("[run-release-preflight] rejects placeholder local release config before preflight", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-release-env-"));
  const envPath = path.join(directory, "Release.local.env");
  fs.copyFileSync(path.join(repoRoot, "them", "Release.local.env.example"), envPath);
  fs.chmodSync(envPath, 0o600);

  const r = run({ RELEASE_ENV_FILE: envPath });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /missing real value\(s\): DEVELOPMENT_TEAM_ID APP_TOKEN_RELEASE/);
  assert.doesNotMatch(r.stdout, /App Store Preflight/);
});
