// T-coordination-state-eval — smoke test that the schema check runs
// cleanly against the actual repo state.

import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const script = path.resolve(__dirname, "coordination_state_schema_check.mjs");

test("[coord-schema] runs cleanly against the current docs/coordination.json", () => {
  const r = spawnSync("node", [script], { encoding: "utf8" });
  assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  assert.match(r.stdout, /coordination-state-schema-check: OK/);
});
