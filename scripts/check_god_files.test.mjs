import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Deliberate fixture contract: all five currently protected production files.
const files = ["backend/index.js", "them/ScreenplayStudioScreen.swift", "them/RootExperienceView.swift",
  "them/ScreenplayLiveDraftBridge.swift", "them/BackendMemoryAPI.swift"];
const source = fileURLToPath(new URL("./check_god_files.mjs", import.meta.url));
function fixture(run, { omitBaseFile = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "them-god-base-"));
  const env = { ...process.env };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE", "GITHUB_BASE_REF"]) delete env[key];
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { env, stdio: "pipe" });
  try {
    fs.mkdirSync(path.join(root, "scripts"));
    fs.copyFileSync(source, path.join(root, "scripts/check_god_files.mjs"));
    for (const file of files) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), "baseline\n");
    }
    if (omitBaseFile) fs.unlinkSync(path.join(root, files[0]));
    git("init", "--quiet", "--initial-branch=main");
    git("add", ".");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "-c", "commit.gpgsign=false",
      "commit", "--quiet", "-m", "synthetic baseline");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    if (omitBaseFile) fs.writeFileSync(path.join(root, files[0]), "new protected file\n");
    const check = (base, args = ["--json"]) => spawnSync(process.execPath, ["scripts/check_god_files.mjs", ...args], {
      cwd: root, env: { ...env, ...(base === undefined ? {} : { GITHUB_BASE_REF: base }) }, encoding: "utf8",
    });
    return run({ root, git, check });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test("god gate compares every protected file to a real available baseline", () => fixture(({ check }) => {
  const result = check("main");
  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.failed, false);
  assert.equal(report.rows.length, files.length);
  assert.ok(report.rows.every(row => row.base === 1 && row.delta === 0));
}));

test("explicit missing base cannot silently fall back or pass without comparison", () => fixture(({ check }) => {
  const result = check("missing-task-base");
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).failed, true);
}));

test("allow-growth cannot waive an unresolved baseline", () => fixture(({ check }) => {
  const result = check("missing-task-base", ["--json", "--allow-growth"]);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).failed, true);
}));

test("no default baseline fails closed rather than claiming absolute counts prove a delta", () => fixture(({ git, check }) => {
  git("update-ref", "-d", "refs/remotes/origin/main");
  git("branch", "-m", "work");
  const result = check(undefined);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).failed, true);
}));

test("a protected file absent from the base is not a verified zero-growth result", () => fixture(({ check }) => {
  const result = check("main");
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).failed, true);
}, { omitBaseFile: true }));

test("real growth fails unless deliberately allowed and is never mislabeled no-growth", () => fixture(({ root, check }) => {
  fs.appendFileSync(path.join(root, files[0]), "growth\n");
  assert.equal(check("main").status, 1);
  const allowed = check("main", ["--allow-growth"]);
  assert.equal(allowed.status, 0);
  assert.doesNotMatch(allowed.stdout, /Pass: no god file grew/);
}));

test("human-readable missing-base output never says Pass", () => fixture(({ check }) => {
  const result = check("missing-task-base", []);
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout, /Pass:/);
  assert.match(result.stdout, /baseline|base reference/i);
}));
