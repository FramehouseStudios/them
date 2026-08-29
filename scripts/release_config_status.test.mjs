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
  assert.ok(payload.blockers.some((line) => /missing local release config/.test(line)));
  assert.ok(payload.blockers.some((line) => /Development Team ID/.test(line)));
  assert.ok(payload.blockers.some((line) => /APP_TOKEN_RELEASE/.test(line)));
  assert.ok(!payload.blockers.some((line) => /Release APP_TOKEN is missing/.test(line)));
  assert.ok(payload.missingInputs.includes("them/Release.local.env"));
  assert.ok(payload.missingInputs.includes("DEVELOPMENT_TEAM_ID"));
  assert.ok(payload.missingInputs.includes("APP_TOKEN_RELEASE"));
  assert.ok(payload.nextSteps.some((line) => /Create them\/Release\.local\.env/.test(line)));
  const tokenCheck = payload.checks.find((check) => check.id === "app-token-release");
  assert.equal(tokenCheck.secret.present, false);
  assert.equal(tokenCheck.secret.placeholder, true);
  assert.doesNotMatch(r.stdout, /super-secret-release-token/);
});

test("[release-config-status] text output gives the first env-file recovery steps", () => {
  const r = run(["--no-xcodebuild"], {
    DEVELOPMENT_TEAM_ID: "",
    BACKEND_URL: "",
    APP_TOKEN_RELEASE: "",
  });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /Release setup still missing or invalid:/);
  assert.match(r.stdout, /- them\/Release\.local\.env/);
  assert.match(r.stdout, /Next steps:/);
  assert.match(r.stdout, /Create them\/Release\.local\.env from them\/Release\.local\.env\.example/);
  assert.match(r.stdout, /chmod 600 them\/Release\.local\.env/);
  assert.match(r.stdout, /Fill missing private inputs: DEVELOPMENT_TEAM_ID, BACKEND_URL, APP_TOKEN_RELEASE/);
});

test("[release-config-status] release env template stays secret-free and complete", () => {
  const body = fs.readFileSync(template, "utf8");
  assert.match(body, /^DEVELOPMENT_TEAM_ID=/m);
  assert.match(body, /^BACKEND_URL=https:\/\/api\.them\.io$/m);
  assert.match(body, /^APP_TOKEN_RELEASE=/m);
  assert.match(body, /^OPENAI_API_KEY=/m);
  assert.match(body, /^PRIVACY_POLICY_URL=https:\/\/them\.io\/privacy$/m);
  assert.doesNotMatch(body, /sk-|super-secret|wrapped-secret|Bearer\s+/i);
});

test("[release-docs] operator docs point at the iPhone release wrapper", () => {
  const checklist = fs.readFileSync(path.join(repoRoot, "them/APP_STORE_SUBMISSION_CHECKLIST.md"), "utf8");
  const runbook = fs.readFileSync(path.join(repoRoot, "them/RELEASE_RUNBOOK.md"), "utf8");
  const qualityGate = fs.readFileSync(path.join(repoRoot, "them/QUALITY_GATE.md"), "utf8");
  const privacyMapping = fs.readFileSync(path.join(repoRoot, "them/APP_STORE_PRIVACY_MAPPING.md"), "utf8");
  const combined = `${checklist}\n${runbook}\n${qualityGate}\n${privacyMapping}`;
  assert.match(checklist, /^# io\.them iPhone TestFlight Submission Checklist/);
  assert.match(combined, /scripts\/run_release_preflight\.sh/);
  assert.match(combined, /them\/Release\.local\.env\.example/);
  assert.match(combined, /Keep `BACKEND_URL=https:\/\/api\.them\.io`/);
  assert.match(combined, /Mac Studio scaffold is outside V1|macOS command is a separate scaffold diagnostic/i);
  assert.doesNotMatch(combined, /macOS App Store/);
  assert.doesNotMatch(combined, /macOS is dormant scaffolding/);
  assert.doesNotMatch(combined, /\/Users\/halfmutantfilms\/Desktop\/io\.them/);
  assert.doesNotMatch(combined, /Fill `DEVELOPMENT_TEAM_ID`, `BACKEND_URL`, and `APP_TOKEN_RELEASE`/);
  assert.doesNotMatch(combined, /Set `(?:DEVELOPMENT_TEAM_ID|APP_TOKEN_RELEASE)` in .*Config\.xcconfig/);
  assert.doesNotMatch(combined, /Release APP_TOKEN is missing/);
  assert.match(combined, /Do not put production values in tracked `Config\.xcconfig`/);
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
  fs.chmodSync(envFile, 0o600);

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
  assert.equal(tokenCheck.secret.placeholder, false);
  assert.equal(tokenCheck.secret.length, "super-secret-release-token-123456".length);
  assert.doesNotMatch(r.stdout, /super-secret-release-token-123456/);
});

test("[release-config-status] rejects insecure permissions without reading private values", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-release-config-mode-"));
  const envFile = path.join(dir, "Release.local.env");
  const secret = "insecure-release-token-123456";
  fs.writeFileSync(
    envFile,
    `DEVELOPMENT_TEAM_ID=ABCDE12345\nBACKEND_URL=https://api.them.io\nAPP_TOKEN_RELEASE=${secret}\n`,
    { mode: 0o644 },
  );
  fs.chmodSync(envFile, 0o644);

  const r = run(["--json", "--no-xcodebuild", `--release-env-file=${envFile}`], {
    DEVELOPMENT_TEAM_ID: "",
    BACKEND_URL: "",
    APP_TOKEN_RELEASE: "",
  });
  assert.equal(r.status, 1, r.stderr);
  const payload = JSON.parse(r.stdout);
  const security = payload.checks.find((check) => check.id === "release-env-file-security");
  assert.equal(security.ok, false);
  assert.equal(security.mode, "644");
  assert.match(security.message, /must have mode 600/);
  assert.doesNotMatch(r.stdout, new RegExp(secret));
});

test("[release-config-status] rejects a symlink without reading its target", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-release-config-link-"));
  const target = path.join(dir, "target.env");
  const envFile = path.join(dir, "Release.local.env");
  const secret = "linked-release-token-123456";
  fs.writeFileSync(target, `APP_TOKEN_RELEASE=${secret}\n`, { mode: 0o600 });
  fs.symlinkSync(target, envFile);

  const r = run(["--json", "--no-xcodebuild", `--release-env-file=${envFile}`], {
    DEVELOPMENT_TEAM_ID: "",
    BACKEND_URL: "",
    APP_TOKEN_RELEASE: "",
  });
  assert.equal(r.status, 1, r.stderr);
  const payload = JSON.parse(r.stdout);
  const security = payload.checks.find((check) => check.id === "release-env-file-security");
  assert.equal(security.ok, false);
  assert.equal(security.symlink, true);
  assert.match(security.message, /must not be a symlink/);
  assert.doesNotMatch(r.stdout, new RegExp(secret));
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
  fs.chmodSync(envFile, 0o600);

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

test("[run-release-preflight] skips live backend and desktop preflight when config is still invalid", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-release-wrapper-invalid-"));
  const envFile = path.join(dir, "Release.local.env");
  fs.writeFileSync(
    envFile,
    [
      "BACKEND_URL=https://api.them.io",
      "APP_TOKEN_RELEASE=",
      "",
    ].join("\n"),
  );
  fs.chmodSync(envFile, 0o600);

  const desktopMarker = path.join(dir, "desktop-ran");
  const r = spawnSync("bash", [wrapper], {
    cwd: repoRoot,
    env: {
      ...process.env,
      RELEASE_ENV_FILE: envFile,
      DEVELOPMENT_TEAM_ID: "",
      BACKEND_URL: "",
      APP_TOKEN_RELEASE: "",
      MAC_DESKTOP_DERIVED_DATA_PATH: desktopMarker,
    },
    encoding: "utf8",
  });

  assert.equal(r.status, 1);
  assert.match(r.stderr, /APP_TOKEN_RELEASE/);
  assert.doesNotMatch(r.stdout, /Live Backend Health/);
  assert.doesNotMatch(r.stdout, /Mac Desktop Preflight/);
});
