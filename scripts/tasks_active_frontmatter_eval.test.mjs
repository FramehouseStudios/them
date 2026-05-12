// T-tasks-active-frontmatter-eval — smoke test that the script runs
// cleanly against the actual repo state in both default and strict
// modes.

import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const script = path.resolve(__dirname, "tasks_active_frontmatter_eval.mjs");

test("[task-frontmatter] default mode exits 0 against current repo", () => {
  const r = spawnSync("node", [script], { encoding: "utf8" });
  assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
});

test("[task-frontmatter] --strict mode also exits 0 (repo is clean)", () => {
  const r = spawnSync("node", [script, "--strict"], { encoding: "utf8" });
  assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  assert.match(r.stdout, /tasks-active-frontmatter-eval: OK/);
});
