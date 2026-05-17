import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "scripts", "release_config_status.mjs");

function run(args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function tempEnv(contents, mode = 0o600) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-release-config-"));
  const file = path.join(dir, "Release.local.env");
  fs.writeFileSync(file, contents, { mode });
  fs.chmodSync(file, mode);
  return file;
}

test("[release-config-status] reports a missing local file without failing the command", () => {
  const missing = path.join(os.tmpdir(), `missing-release-${Date.now()}.env`);
  const r = run(["--json", `--release-env-file=${missing}`]);
  assert.equal(r.status, 0, r.stderr);
  const payload = JSON.parse(r.stdout);
  assert.equal(payload.overall, "missing");
  assert.ok(payload.blockers.some((item) => item.includes("missing local release config")));
});

test("[release-config-status] rejects placeholders from the template", () => {
  const file = tempEnv(`
export DEVELOPMENT_TEAM_ID="REPLACE_WITH_APPLE_TEAM_ID"
export BACKEND_URL="https://api.example.com"
export APP_TOKEN="REPLACE_WITH_PRODUCTION_APP_TOKEN"
`);
  const r = run(["--json", `--release-env-file=${file}`]);
  assert.equal(r.status, 0, r.stderr);
  const payload = JSON.parse(r.stdout);
  assert.equal(payload.overall, "blocked");
  assert.equal(payload.blockers.length, 3);
});

test("[release-config-status] rejects localhost Release backend URLs", () => {
  const file = tempEnv(`
DEVELOPMENT_TEAM_ID=ABCDE12345
BACKEND_URL=http://127.0.0.1:3000
APP_TOKEN=prod-token
`);
  const r = run(["--json", `--release-env-file=${file}`]);
  assert.equal(r.status, 0, r.stderr);
  const payload = JSON.parse(r.stdout);
  assert.equal(payload.overall, "blocked");
  assert.ok(payload.blockers.some((item) => item.includes("localhost")));
});

test("[release-config-status] reports ready without printing token values", () => {
  const file = tempEnv(`
export DEVELOPMENT_TEAM_ID="ABCDE12345"
export BACKEND_URL="https://api.io.them.example"
export APP_TOKEN="super-secret-token"
`);
  const r = run([`--release-env-file=${file}`]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Overall: ready/);
  assert.match(r.stdout, /APP_TOKEN is present \(redacted\)/);
  assert.doesNotMatch(r.stdout, /super-secret-token/);
});

test("[release-config-status] warns when local config permissions are broad", () => {
  const file = tempEnv(`
DEVELOPMENT_TEAM_ID=ABCDE12345
BACKEND_URL=https://api.io.them.example
APP_TOKEN=prod-token
`, 0o644);
  const r = run(["--json", `--release-env-file=${file}`]);
  assert.equal(r.status, 0, r.stderr);
  const payload = JSON.parse(r.stdout);
  assert.equal(payload.overall, "ready");
  assert.ok(payload.warnings.some((item) => item.includes("chmod 600")));
});
