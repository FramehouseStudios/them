import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("./check_god_files.mjs", import.meta.url));

function fixture(t, { commit = true, fileAtBase = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "them-d009-baseline-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(root, "backend"), { recursive: true });
  fs.copyFileSync(source, path.join(root, "scripts/check_god_files.mjs"));
  const file = path.join(root, "backend/index.js");
  if (fileAtBase) fs.writeFileSync(file, "first\nsecond\n");
  // Never inherit Git directory/index/config overrides into a fixture repo.
  const env = {
    PATH: process.env.PATH,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
  };
  const git = (...args) => execFileSync("git", ["-C", root, ...args], {
    env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  git("init", "-q", "-b", "main");
  if (commit) {
    git("add", ".");
    git("-c", "user.name=D009 Fixture", "-c", "user.email=fixture@example.invalid",
      "-c", "commit.gpgsign=false", "commit", "-q", "--no-verify", "-m", "fixture baseline");
    git("update-ref", "refs/remotes/origin/main", git("rev-parse", "HEAD"));
  }
  return {
    file,
    run(args = [], base = "main") {
      return spawnSync(process.execPath, [path.join(root, "scripts/check_god_files.mjs"), ...args], {
        cwd: root, env: { ...env, GITHUB_BASE_REF: base }, encoding: "utf8", timeout: 10_000,
      });
    },
  };
}

function indexRow(report) {
  return report.rows.find((row) => row.file === "backend/index.js");
}

test("D009 compares an available parent without changing successful JSON", (t) => {
  const f = fixture(t);
  const result = f.run(["--json"]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.failed, false);
  assert.equal(report.ref, "origin/main");
  assert.deepEqual(indexRow(report), {
    file: "backend/index.js", head: 2, base: 2, delta: 0, status: "ok", ref: "origin/main",
  });
});

test("D009 still rejects genuine growth and permits an explicit growth diagnostic", (t) => {
  const f = fixture(t);
  fs.appendFileSync(f.file, "third\n");
  const strict = f.run(["--json"]);
  assert.equal(strict.status, 1);
  const report = JSON.parse(strict.stdout);
  assert.equal(report.failed, true);
  assert.equal(indexRow(report).delta, 1);
  assert.equal(indexRow(report).status, "grew");
  const allowed = f.run(["--json", "--allow-growth"]);
  assert.equal(allowed.status, 0);
  assert.equal(JSON.parse(allowed.stdout).failed, false);
});

test("D009 rejects a missing requested parent instead of falling back to main", (t) => {
  const f = fixture(t);
  const result = f.run(["--json"], "not-fetched");
  assert.equal(result.status, 1, result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.failed, true);
  assert.equal(report.ref, "origin/not-fetched");
  assert.equal(indexRow(report).status, "unverified");
  assert.ok(report.errors.some((error) => error.includes("origin/not-fetched")));
});

test("allow-growth does not authorize an unavailable comparison", (t) => {
  const f = fixture(t);
  const result = f.run(["--json", "--allow-growth"], "not-fetched");
  assert.equal(result.status, 1, result.stdout);
  assert.equal(JSON.parse(result.stdout).failed, true);
});

test("D009 rejects no baseline rather than calling absolute counts a pass", (t) => {
  const f = fixture(t, { commit: false });
  const result = f.run(["--json"], "");
  assert.equal(result.status, 1, result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ref, null);
  assert.equal(report.failed, true);
  assert.equal(indexRow(report).status, "unverified");
});

test("D009 treats a newly added monitored file as growth from zero", (t) => {
  const f = fixture(t, { fileAtBase: false });
  fs.writeFileSync(f.file, "first\nsecond\n");
  const result = f.run(["--json"]);
  assert.equal(result.status, 1, result.stdout);
  const row = indexRow(JSON.parse(result.stdout));
  assert.equal(row.base, 0);
  assert.equal(row.delta, 2);
  assert.equal(row.status, "grew");
});

test("D009 text output explains missing authority without a success footer", (t) => {
  const f = fixture(t);
  const result = f.run([], "not-fetched");
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /Failing:.*comparison/i);
  assert.match(result.stdout, /fetch/i);
  assert.doesNotMatch(result.stdout, /Pass: no god file grew/);
});
