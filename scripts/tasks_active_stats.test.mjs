// T-tasks-active-stats — smoke test that the script runs cleanly
// against the actual repo state.

import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const script = path.resolve(__dirname, "tasks_active_stats.mjs");

test("[tasks-stats] default mode exits 0 with summary", () => {
  const r = spawnSync("node", [script], { encoding: "utf8" });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.match(r.stdout, /tasks_active_stats: \d+ task file/);
  assert.match(r.stdout, /by owner:/);
  assert.match(r.stdout, /by status:/);
});

test("[tasks-stats] --json mode emits valid JSON with the expected keys", () => {
  const r = spawnSync("node", [script, "--json"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  const obj = JSON.parse(r.stdout);
  assert.equal(typeof obj.total, "number");
  assert.ok(obj.byOwner && typeof obj.byOwner === "object");
  assert.ok(obj.byStatus && typeof obj.byStatus === "object");
  assert.ok(obj.byPillar && typeof obj.byPillar === "object");
  assert.ok(Array.isArray(obj.unrecognized));
});
