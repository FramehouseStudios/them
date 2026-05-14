// T-v1-voice-to-page-smoke — smoke test wrapping the V1 voice-to-page
// deterministic-prompt script so `npm test` / the canon umbrella
// catches prompt-path regressions automatically.

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
const script = path.join(repoRoot, "scripts", "v1_voice_to_page_smoke.mjs");

test("[v1-voice-to-page-smoke] passes against the canonical fixture", () => {
  const r = spawnSync("node", [script], { encoding: "utf8", cwd: repoRoot });
  assert.equal(
    r.status,
    0,
    `expected exit 0 (PASS); got ${r.status}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
  );
  assert.match(r.stdout, /result: PASS/);
});

test("[v1-voice-to-page-smoke] --json output is parseable + reports pass", () => {
  const r = spawnSync("node", [script, "--json"], { encoding: "utf8", cwd: repoRoot });
  assert.equal(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.pass, true);
  assert.deepEqual(parsed.findings, []);
  assert.ok(parsed.promptLength > 0);
});

test("[v1-voice-to-page-smoke] failing fixture surfaces the regression", () => {
  // Point the script at a deliberately broken inline fixture by
  // writing one to a temp path. The fixture asserts a substring
  // the real prompt cannot contain.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-v1-smoke-test-"));
  const fixturePath = path.join(tmpDir, "broken.json");
  fs.writeFileSync(fixturePath, JSON.stringify({
    persona: "P",
    userInput: "U",
    expected_prompt_contains: ["THIS_STRING_WILL_NEVER_APPEAR_IN_THE_PROMPT"],
    expected_prompt_ordering: [],
  }), "utf8");
  const r = spawnSync(
    "node",
    [script, `--fixture=${path.relative(repoRoot, fixturePath)}`],
    { encoding: "utf8", cwd: repoRoot },
  );
  assert.equal(r.status, 1, `expected exit 1 (FAIL); got ${r.status}`);
  assert.match(r.stdout, /result: FAIL/);
  assert.match(r.stdout, /missing_substring/);
});
