import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "scripts/release_config_status.mjs");
const wrapper = path.join(repoRoot, "scripts/run_release_preflight.sh");
const template = path.join(repoRoot, "them/Release.local.env.example");

function run(args, env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

test("[release-config-status] reports missing private release inputs without printing secrets", () => {
  const r = run(["--json", "--no-xcodebuild"], {
    DEVELOPMENT_TEAM_ID: "",
    BACKEND_URL: "",
    APP_TOKEN_RELEASE: "",
  });
  assert.equal(r.status, 1, r.stderr);
  const payload = JSON.parse(r.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.envFile.exampleExists, true);
  assert.equal(payload.envFile.examplePath, "them/Release.local.env.example");
  assert.ok(payload.blockers.some((line) => /Development Team ID/.test(line)));
  assert.ok(payload.blockers.some((line) => /APP_TOKEN/.test(line)));
  assert.doesNotMatch(r.stdout, /super-secret-release-token/);
});

test("[release-config-status] release env template stays secret-free and complete", () => {
  const body = fs.readFileSync(template, "utf8");
  assert.match(body, /^DEVELOPMENT_TEAM_ID=/m);
  assert.match(body, /^BACKEND_URL=https:\/\/api\.them\.io$/m);
  assert.match(body, /^APP_TOKEN_RELEASE=/m);
  assert.doesNotMatch(body, /sk-|super-secret|wrapped-secret|Bearer\s+/i);
});

test("[release-config-status] accepts an explicit env file and redacts APP_TOKEN_RELEASE", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-release-config-"));
  const envFile = path.join(dir, "Release.local.env");
  fs.writeFileSync(
    envFile,
    [
      "DEVELOPMENT_TEAM_ID=ABCDE12345",
      "BACKEND_URL=https://api.them.io",
      "APP_TOKEN_RELEASE=super-secret-release-token-123456",
      "",
    ].join("\n"),
  );

  const relEnvFile = path.relative(repoRoot, envFile);
  const r = run(["--json", "--no-xcodebuild", `--release-env-file=${relEnvFile}`], {
    DEVELOPMENT_TEAM_ID: "",
    BACKEND_URL: "",
    APP_TOKEN_RELEASE: "",
  });
  assert.equal(r.status, 0, r.stderr);
  const payload = JSON.parse(r.stdout);
  assert.equal(payload.ok, true);
  const tokenCheck = payload.checks.find((check) => check.id === "app-token-release");
  assert.equal(tokenCheck.secret.present, true);
  assert.equal(tokenCheck.secret.length, "super-secret-release-token-123456".length);
  assert.doesNotMatch(r.stdout, /super-secret-release-token-123456/);
});

test("[run-release-preflight] stops at config status without leaking sourced token", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-release-wrapper-"));
  const envFile = path.join(dir, "Release.local.env");
  const secret = "wrapped-secret-release-token-abcdef";
  fs.writeFileSync(
    envFile,
    [
      "BACKEND_URL=https://api.them.io",
      `APP_TOKEN_RELEASE=${secret}`,
      "",
    ].join("\n"),
  );

  const binDir = path.join(dir, "bin");
  fs.mkdirSync(binDir);
  const xcodebuild = path.join(binDir, "xcodebuild");
  fs.writeFileSync(xcodebuild, "#!/usr/bin/env bash\nexit 1\n");
  fs.chmodSync(xcodebuild, 0o755);

  const r = spawnSync("bash", [wrapper], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
      RELEASE_ENV_FILE: envFile,
      DEVELOPMENT_TEAM_ID: "",
      BACKEND_URL: "",
      APP_TOKEN_RELEASE: "",
    },
    encoding: "utf8",
  });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /Release Config Status/);
  assert.match(r.stdout, /Apple Development Team ID is missing/);
  assert.doesNotMatch(`${r.stdout}\n${r.stderr}`, new RegExp(secret));
  assert.doesNotMatch(r.stdout, /App Store Preflight/);
});
