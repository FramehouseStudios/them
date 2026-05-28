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

test("[v1-manual-qa] --json emits the five V1 manual gates", () => {
  const r = run(["--json"]);
  assert.equal(r.status, 0, r.stderr);
  const payload = JSON.parse(r.stdout);
  assert.equal(payload.manualFlows.length, 5);
  assert.deepEqual(
    payload.manualFlows.map((f) => f.pillar),
    ["Talk Pipeline", "Screenplay Studio", "Creative Memory", "Realtime", "iOS Release Readiness"],
  );
  assert.ok(payload.parked.some((p) => p.prs.includes("#94")));
  assert.ok(payload.parked.some((p) => /core memory export is approved/.test(p.reason)));
  assert.ok(payload.automatedProof.some((p) => p.command.includes("eval:v1-smokes")));
  assert.ok(payload.platformPosture.includes("V1 is iPhone only."));
  assert.match(payload.currentLocalProof, /2026-05-28/);
  assert.match(payload.currentLocalProof, /authenticated backend smoke/);
  assert.match(payload.currentLocalProof, /APP_TOKEN_RELEASE/);
});

test("[v1-manual-qa] markdown output names pass criteria and parked gates", () => {
  const r = run([]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /## Manual App Flows/);
  assert.match(r.stdout, /## Platform Posture/);
  assert.match(r.stdout, /V1 is iPhone only\./);
  assert.match(r.stdout, /Pass: Reply text is visible/);
  assert.match(r.stdout, /#212/);
});

test("[v1-manual-qa] --prompt emits a Launch Doctor result block template", () => {
  const r = run(["--prompt"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Overall V1 manual smoke: PASS\/FAIL - <notes>/);
  assert.match(r.stdout, /^Talk Pipeline: PASS\/FAIL\/IN PROGRESS\/NOT STARTED - <notes>/m);
  assert.match(r.stdout, /^Screenplay Studio: PASS\/FAIL\/IN PROGRESS\/NOT STARTED - <notes>/m);
  assert.match(r.stdout, /^Creative Memory: PASS\/FAIL\/IN PROGRESS\/NOT STARTED - <notes>/m);
  assert.match(r.stdout, /^Realtime: PASS\/FAIL\/IN PROGRESS\/NOT STARTED - <notes>/m);
  assert.match(r.stdout, /^iOS Release Readiness: PASS\/FAIL\/IN PROGRESS\/NOT STARTED - <notes>/m);
  assert.doesNotMatch(r.stdout, /## Manual App Flows/);
});

test("[v1-manual-qa] --write creates a reusable markdown artifact", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-v1-manual-qa-"));
  const out = path.join(tmpDir, "preflight.md");
  const rel = path.relative(repoRoot, out);
  const r = run([`--write=${rel}`]);
  assert.equal(r.status, 0, r.stderr);
  const body = fs.readFileSync(out, "utf8");
  assert.match(body, /^# io\.them V1 TestFlight Preflight/);
  assert.match(body, /Generated from `scripts\/v1_manual_qa_checklist\.mjs`/);
});
