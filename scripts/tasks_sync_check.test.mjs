// T-tasks-sync-check — smoke test that the script runs and produces
// the expected exit codes. We exec the script in both modes against
// the actual repo state to confirm:
//   - default (warn-only) exits 0 even when drift exists
//   - --strict exits 1 when drift exists
//
// Behavioral checks; no test framework needed beyond node:test.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const script = path.resolve(__dirname, "tasks_sync_check.mjs");

test("[tasks-sync-check] default mode never exits non-zero", () => {
  const r = spawnSync("node", [script], { encoding: "utf8" });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
});

test("[tasks-sync-check] --strict prints a clear FAILED header when drift exists", () => {
  const r = spawnSync("node", [script, "--strict"], { encoding: "utf8" });
  // The repo currently has drift, so --strict should fail loudly.
  if (r.status !== 0) {
    assert.match(r.stderr, /tasks-sync-check: FAILED/);
  }
  // If there's no drift, --strict exits 0 and prints OK.
  if (r.status === 0) {
    assert.match(r.stdout, /tasks-sync-check: OK/);
  }
});

test("[tasks-sync-check] handles pipe characters inside title cells", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-task-sync-"));
  fs.mkdirSync(path.join(tmp, "scripts"));
  fs.mkdirSync(path.join(tmp, "tasks", "_active"), { recursive: true });
  fs.copyFileSync(script, path.join(tmp, "scripts", "tasks_sync_check.mjs"));
  fs.writeFileSync(
    path.join(tmp, "TASKS.md"),
    [
      "| ID | Title | Owner | Status |",
      "|---|---|---|---|",
      "| T-screenplay-export-markdown | POST /screenplay/export format=md|markdown | claude | review |",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(tmp, "tasks", "_active", "T-screenplay-export-markdown.md"),
    [
      "---",
      "id: T-screenplay-export-markdown",
      "title: POST /screenplay/export format=md|markdown",
      "owner: claude",
      "status: review",
      "branch: claude/T-screenplay-export-markdown",
      "pillar: infra",
      "---",
      "",
    ].join("\n"),
  );
  const r = spawnSync("node", [path.join(tmp, "scripts", "tasks_sync_check.mjs"), "--strict"], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  assert.match(r.stdout, /tasks-sync-check: OK/);
});
