import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "scripts/v1_manual_qa_checklist.mjs");

function run(args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

test("[v1-manual-qa] --json emits the five V1 manual flows", () => {
  const r = run(["--json"]);
  assert.equal(r.status, 0, r.stderr);
  const payload = JSON.parse(r.stdout);
  assert.equal(payload.manualFlows.length, 5);
  assert.deepEqual(
    payload.manualFlows.map((f) => f.pillar),
    ["Talk Pipeline", "Screenplay Studio", "Creative Memory", "Realtime", "iOS Release Readiness"],
  );
  assert.equal(payload.parked.length, 0);
  assert.ok(!payload.parked.some((p) => p.prs.includes("#99")));
  assert.ok(payload.outOfV1.some((p) => p.prs.includes("#99")));
  assert.ok(payload.outOfV1.some((p) => p.reason.includes("V1 core-only export already shipped in #94")));
  assert.ok(payload.automatedProof.some((p) => p.command.includes("eval:v1-smokes")));
  assert.ok(payload.automatedProof.some((p) => p.command.includes("v1-build-test-readiness")));
});

test("[v1-manual-qa] markdown output names pass criteria and current V1 decisions", () => {
  const r = run([]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /## Manual App Flows/);
  assert.match(r.stdout, /### Current app build and tests/);
  assert.match(r.stdout, /### iOS Release Readiness/);
  assert.match(r.stdout, /Pass: Reply text is visible/);
  assert.match(r.stdout, /Pass: Release config is real, preflight is green/);
  assert.match(r.stdout, /## Explicitly Out of V1/);
  assert.match(r.stdout, /Decision record: `docs\/memory-export-delete-decision-packet\.md`/);
  assert.doesNotMatch(r.stdout, /Postgres eval gate/);
  assert.doesNotMatch(r.stdout, /#33/);
  assert.doesNotMatch(r.stdout, /#212/);
  assert.match(r.stdout, /V1 core-only export already shipped in #94/);
});

test("[v1-manual-qa] --write creates a reusable markdown artifact", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-v1-manual-qa-"));
  const out = path.join(tmpDir, "preflight.md");
  const rel = path.relative(repoRoot, out);
  const r = run([`--write=${rel}`]);
  assert.equal(r.status, 0, r.stderr);
  const body = fs.readFileSync(out, "utf8");
  assert.match(body, /^# io\.them V1 TestFlight Preflight/);
  assert.match(body, /### Current app build and tests/);
  assert.match(body, /Generated from `scripts\/v1_manual_qa_checklist\.mjs`/);
});

test("[v1-manual-qa] --prompt prints a compact result block for human signoff", () => {
  const r = run(["--prompt"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^V1 human smoke prompt/);
  assert.match(r.stdout, /Talk Pipeline: PASS\/FAIL - <notes>/);
  assert.match(r.stdout, /iOS Release Readiness: PASS\/FAIL - <notes>/);
  assert.match(r.stdout, /Explicitly out of V1:/);
  assert.match(r.stdout, /Decision record: docs\/memory-export-delete-decision-packet\.md/);
  assert.match(r.stdout, /Overall V1 manual smoke: PASS\/FAIL - <notes>/);
  assert.match(r.stdout, /Status command: npm run v1:status/);
});
