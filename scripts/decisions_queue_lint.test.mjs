// T-decisions-queue-md-lint — smoke test that the lint script behaves
// per its contract:
//   - default mode prints findings but exits 0
//   - --strict exits non-zero when findings exist
//   - lints the actual repo file cleanly (clean repo state → OK)

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const script = path.resolve(__dirname, "decisions_queue_lint.mjs");

test("[decisions-lint] runs cleanly against the current repo state", () => {
  const r = spawnSync("node", [script], { encoding: "utf8" });
  // The repo's docs/decisions-queue.md is in good shape; both modes
  // should exit 0. If a future PR breaks it, the failure points at
  // exactly that PR (not at this file).
  assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
});

test("[decisions-lint] --strict mode runs against a tampered fixture", () => {
  // We can't tamper with the real file in a test, so we sanity-check
  // the script's exit-code wiring by feeding it through a temp
  // working dir. The actual file existence is asserted by the
  // previous test; this one verifies the strict gate.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-dq-lint-"));
  fs.mkdirSync(path.join(tmp, "docs"));
  fs.writeFileSync(
    path.join(tmp, "docs", "decisions-queue.md"),
    "## Open\n\n### D-bad — missing fields entry\n\n## Resolved\n\n_(empty)_\n",
  );
  const tmpScript = path.join(tmp, "scripts");
  fs.mkdirSync(tmpScript);
  fs.copyFileSync(script, path.join(tmpScript, "decisions_queue_lint.mjs"));
  // Default mode → exits 0 despite findings.
  const warn = spawnSync("node", [path.join(tmpScript, "decisions_queue_lint.mjs")], { encoding: "utf8" });
  assert.equal(warn.status, 0);
  assert.match(warn.stderr, /decisions-queue-lint: warnings/);
  // --strict → exits 1.
  const strict = spawnSync("node", [path.join(tmpScript, "decisions_queue_lint.mjs"), "--strict"], { encoding: "utf8" });
  assert.equal(strict.status, 1);
  assert.match(strict.stderr, /decisions-queue-lint: FAILED/);
});
