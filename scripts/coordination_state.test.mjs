// T-coordination-state-cli-validate — smoke test for the new
// `validate` subcommand.

import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const script = path.resolve(__dirname, "coordination_state.mjs");

test("[coordination-state-validate] runs cleanly against current repo state", () => {
  const r = spawnSync("node", [script, "validate"], { encoding: "utf8" });
  assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  assert.match(r.stdout, /coordination_state validate: OK/);
});

test("[coordination-state-validate] unknown subcommand exits 1", () => {
  const r = spawnSync("node", [script, "definitely-not-a-real-command"], { encoding: "utf8" });
  assert.equal(r.status, 1);
});
