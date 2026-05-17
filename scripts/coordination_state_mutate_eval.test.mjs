// T-coordination-state-mutate-eval — smoke test that the eval
// runs cleanly.

import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const script = path.resolve(__dirname, "coordination_state_mutate_eval.mjs");

test("[coord-mutate] eval exits 0 against the current CLI", () => {
  const r = spawnSync("node", [script], { encoding: "utf8" });
  assert.equal(r.status, 0, `stderr:\n${r.stderr}\nstdout:\n${r.stdout}`);
  assert.match(r.stdout, /coordination-state mutate eval: OK/);
});
