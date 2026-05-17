// T-v1-screenplay-smoke — node:test wrapper for the deterministic
// screenplay-export smoke so `npm test` catches Fountain-emitter
// regressions automatically.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "scripts", "v1_screenplay_smoke.mjs");

test("[v1-screenplay-smoke] passes against the canonical fixture", () => {
  const r = spawnSync("node", [script], { encoding: "utf8", cwd: repoRoot });
  assert.equal(
    r.status,
    0,
    `expected exit 0 (PASS); got ${r.status}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
  );
  assert.match(r.stdout, /result: PASS/);
});

test("[v1-screenplay-smoke] --json output is parseable + reports pass", () => {
  const r = spawnSync("node", [script, "--json"], { encoding: "utf8", cwd: repoRoot });
  assert.equal(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.pass, true);
  assert.deepEqual(parsed.findings, []);
  assert.ok(parsed.fountainBytes > 0);
});

test("[v1-screenplay-smoke] failing fixture surfaces the regression", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-v1-screenplay-smoke-test-"));
  const fixturePath = path.join(tmpDir, "broken.json");
  fs.writeFileSync(fixturePath, JSON.stringify({
    screenplay: { title: { title: "X" }, scenes: [] },
    expected_fountain_contains: ["THIS_STRING_WILL_NEVER_APPEAR_IN_FOUNTAIN_OUTPUT"],
    expected_fountain_ordering: [],
  }), "utf8");
  const r = spawnSync(
    "node",
    [script, `--fixture=${path.relative(repoRoot, fixturePath)}`],
    { encoding: "utf8", cwd: repoRoot },
  );
  assert.equal(r.status, 1, `expected exit 1; got ${r.status}`);
  assert.match(r.stdout, /result: FAIL/);
  assert.match(r.stdout, /missing_substring/);
});
