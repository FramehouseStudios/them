import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "scripts", "v1_launch_room.mjs");
const missingLaunchDoctorReport = path.join(repoRoot, ".codex_tmp", "missing-v1-launch-doctor.json");

function run(args, env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      V1_LAUNCH_DOCTOR_REPORT: missingLaunchDoctorReport,
      ...env,
    },
  });
}

test("[v1-launch-room] --json exposes V1 status and launch lanes", () => {
  const r = run(["--json"]);
  assert.equal(r.status, 0, r.stderr);
  const payload = JSON.parse(r.stdout);
  assert.ok(payload.v1.total > 0);
  assert.ok(payload.v1.done <= payload.v1.total);
  assert.match(payload.claudeNext.request, /Support V1 manual smoke failures/);
  assert.match(payload.codexNext.action, /V1 smoke handoff|Review Claude PR|human smoke/);
  assert.ok(payload.humanOptions.some((option) => option.command.includes("v1_manual_qa_checklist")));
  assert.ok(payload.humanOptions.some((option) => option.command.includes("V1 Launch Doctor")));
  assert.ok(payload.humanOptions.some((option) => option.why.includes("iOS Release Readiness")));
  assert.equal(payload.launchDoctor.status, "missing");
  assert.ok(Array.isArray(payload.release.blockers));
  assert.match(payload.release.result, /fail=1, warn=0/);
  assert.ok(payload.release.blockers.some((blocker) => blocker.includes("DEVELOPMENT_TEAM_ID")));
  assert.ok(!payload.release.blockers.some((blocker) => /BACKEND_URL.*(?:missing|unset|placeholder)/i.test(blocker)));
  assert.ok(payload.release.blockers.some((blocker) => blocker.includes("https://api.them.io")));
  assert.equal(payload.releaseLocalConfig.overall, "missing");
  assert.ok(payload.releaseLocalConfig.blockers.some((blocker) => blocker.includes("missing local release config")));
  assert.ok(!payload.humanGated.some((pr) => pr.status === "closed"));
});

test("[v1-launch-room] Claude role prints one deep backend task", () => {
  const r = run(["--role=claude"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^io\.them V1 Launch Room/);
  assert.match(r.stdout, /Claude Launch Options/);
  assert.match(r.stdout, /Do now: Support V1 manual smoke failures/);
  assert.doesNotMatch(r.stdout, /Human Launch Options/);
});

test("[v1-launch-room] human role prints choices and decision queue", () => {
  const r = run(["--role=human"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Human Launch Options/);
  assert.match(r.stdout, /Open Data Controls -> V1 Launch Doctor/);
  assert.match(r.stdout, /node scripts\/v1_manual_qa_checklist\.mjs --prompt/);
  assert.match(r.stdout, /scripts\/run_release_preflight\.sh/);
  assert.match(r.stdout, /Launch Doctor: no report yet/);
  assert.match(r.stdout, /Release local config: missing/);
  assert.match(r.stdout, /Open decisions:/);
  assert.doesNotMatch(r.stdout, /Claude Launch Options/);
});

test("[v1-launch-room] reads the latest Launch Doctor report when present", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-launch-doctor-"));
  const reportPath = path.join(directory, "io_them_v1_launch_doctor.latest.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: "2026-05-15T00:00:00.000Z",
      overallStatus: "passed",
      summary: { total: 5, passed: 5, failed: 0, inProgress: 0, notStarted: 0 },
      results: [],
    }),
    "utf8"
  );

  const r = run(["--json"], { V1_LAUNCH_DOCTOR_REPORT: reportPath });
  assert.equal(r.status, 0, r.stderr);
  const payload = JSON.parse(r.stdout);
  assert.equal(payload.launchDoctor.status, "found");
  assert.equal(payload.launchDoctor.overallStatus, "passed");
  assert.equal(payload.launchDoctor.passed, 5);
  assert.equal(payload.launchDoctor.total, 5);
});

test("[v1-launch-room] rejects unknown roles", () => {
  const r = run(["--role=wizard"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /invalid --role=wizard/);
});
