import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts", "write_release_xcconfig.mjs");

function run(output, env = {}) {
  return spawnSync(process.execPath, [script, `--output=${path.relative(repoRoot, output)}`], {
    cwd: repoRoot,
    env: { ...process.env, DEVELOPMENT_TEAM_ID: "", APP_TOKEN_RELEASE: "", BACKEND_URL: "", ...env },
    encoding: "utf8",
  });
}

test("[release-xcconfig] writes a redacted, mode-600 Xcode include", () => {
  const output = path.join(repoRoot, "them", `Release.local.xcconfig.test-${process.pid}`);
  const token = "release-token_1234567890";
  try {
    const result = run(output, {
      DEVELOPMENT_TEAM_ID: "ABCDE12345",
      APP_TOKEN_RELEASE: token,
      BACKEND_URL: "https://api.them.io",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(token));
    const body = fs.readFileSync(output, "utf8");
    assert.match(body, /^DEVELOPMENT_TEAM_ID = ABCDE12345$/m);
    assert.match(body, /^APP_TOKEN_RELEASE = release-token_1234567890$/m);
    assert.match(body, /^BACKEND_URL = https:\/\$\(\)\/api\.them\.io$/m);
    assert.equal(fs.statSync(output).mode & 0o777, 0o600);
    assert.equal(fs.readdirSync(path.dirname(output)).some((name) => name.startsWith(`${path.basename(output)}.`) && name.endsWith(".tmp")), false);
  } finally {
    fs.rmSync(output, { force: true });
  }
});

test("[release-xcconfig] atomically replaces an existing file", () => {
  const output = path.join(repoRoot, "them", `Release.local.xcconfig.test-${process.pid}-replace`);
  try {
    fs.writeFileSync(output, "old release config\n", { mode: 0o644 });
    const result = run(output, {
      DEVELOPMENT_TEAM_ID: "ABCDE12345",
      APP_TOKEN_RELEASE: "replacement-token_1234567890",
      BACKEND_URL: "https://release-api.them.io",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(fs.readFileSync(output, "utf8"), /old release config/);
    assert.equal(fs.statSync(output).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(output, { force: true });
  }
});

test("[release-xcconfig] replaces rather than follows an output symlink", () => {
  const output = path.join(repoRoot, "them", `Release.local.xcconfig.test-${process.pid}-link`);
  const target = path.join(os.tmpdir(), `io-them-xcconfig-symlink-target-${process.pid}`);
  try {
    fs.writeFileSync(target, "do not overwrite\n");
    fs.symlinkSync(target, output);
    const result = run(output, {
      DEVELOPMENT_TEAM_ID: "ABCDE12345",
      APP_TOKEN_RELEASE: "symlink-safe-token_1234567890",
      BACKEND_URL: "https://api.them.io",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.lstatSync(output).isSymbolicLink(), false);
    assert.equal(fs.readFileSync(target, "utf8"), "do not overwrite\n");
  } finally {
    fs.rmSync(output, { force: true });
    fs.rmSync(target, { force: true });
  }
});

test("[release-xcconfig] rejects unsafe token syntax without creating a file", () => {
  const output = path.join(repoRoot, "them", `Release.local.xcconfig.test-${process.pid}-unsafe`);
  try {
    const result = run(output, {
      DEVELOPMENT_TEAM_ID: "ABCDE12345",
      APP_TOKEN_RELEASE: "secret $(INJECT) value",
      BACKEND_URL: "https://api.them.io",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /URL-safe characters/);
    assert.equal(fs.existsSync(output), false);
  } finally {
    fs.rmSync(output, { force: true });
  }
});

test("[release-xcconfig] rejects a non-origin or unsafe backend URL", () => {
  const output = path.join(repoRoot, "them", `Release.local.xcconfig.test-${process.pid}-backend`);
  try {
    for (const backend of [
      "http://api.them.io",
      "https://localhost:3000",
      "https://api.them.io/v1",
      "https://api.them.io/?token=secret",
      "https://api.them.io/$(INJECT)",
    ]) {
      const result = run(output, {
        DEVELOPMENT_TEAM_ID: "ABCDE12345",
        APP_TOKEN_RELEASE: "release-token_1234567890",
        BACKEND_URL: backend,
      });
      assert.equal(result.status, 1, `${backend}\n${result.stderr}`);
      assert.match(result.stderr, /BACKEND_URL must be/);
      assert.equal(fs.existsSync(output), false);
    }
  } finally {
    fs.rmSync(output, { force: true });
  }
});
