import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const recorder = path.join(repoRoot, "scripts", "v1_launch_doctor_report.mjs");
const launchRoom = path.join(repoRoot, "scripts", "v1_launch_room.mjs");

function run(args, options = {}) {
  return spawnSync(process.execPath, [recorder, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    input: options.input,
  });
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "io-them-launch-doctor-report-"));
}

test("[v1-launch-doctor-report] writes explicit flow statuses without inventing missing passes", () => {
  const directory = tempDir();
  const jsonPath = path.join(directory, "io_them_v1_launch_doctor.latest.json");
  const r = run([
    "--generated-at=2026-05-16T12:00:00.000Z",
    "--talk=pass",
    "--studio=fail",
    "--studio-notes=Export failed after save.",
    "--memory=in-progress",
    "--realtime-evidence=Not run yet.",
    "--release-evidence=Missing them/Release.local.env.",
    `--write=${jsonPath}`,
  ]);
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.source, "io.them.v1_launch_doctor");
  assert.equal(report.overallStatus, "failed");
  assert.deepEqual(report.summary, {
    total: 5,
    passed: 1,
    failed: 1,
    inProgress: 1,
    notStarted: 2,
  });
  assert.equal(report.results.find((result) => result.flow === "realtime").status, "not_started");
  assert.equal(report.results.find((result) => result.flow === "realtime").evidence, "Not run yet.");
  assert.equal(report.results.find((result) => result.flow === "release_readiness").evidence, "Missing them/Release.local.env.");
  assert.match(fs.readFileSync(jsonPath.replace(/\.json$/, ".md"), "utf8"), /Export failed after save/);
});

test("[v1-launch-doctor-report] parses the manual QA result block", () => {
  const block = [
    "Talk Pipeline: PASS - voice reply worked and saved",
    "Screenplay Studio: PASS - save/export/reopen worked",
    "Creative Memory: FAIL - later suggestion forgot June",
    "Realtime: IN PROGRESS - primary minted; fallback still pending",
    "iOS Release Readiness: NOT STARTED - missing signing and release env",
    "Overall V1 manual smoke: FAIL - memory regression",
  ].join("\n");
  const r = run(["--from-result-block=-", "--generated-at=2026-05-16T12:00:00.000Z"], {
    input: block,
  });
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.equal(report.overallStatus, "failed");
  assert.deepEqual(report.summary, {
    total: 5,
    passed: 2,
    failed: 1,
    inProgress: 1,
    notStarted: 1,
  });
  assert.match(report.results.find((result) => result.flow === "creative_memory").notes, /forgot June/);
  assert.match(report.results.find((result) => result.flow === "release_readiness").notes, /missing signing/);
});

test("[v1-launch-doctor-report] refuses placeholder prompt blocks", () => {
  const block = [
    "Talk Pipeline: PASS/FAIL - <notes>",
    "Screenplay Studio: PASS/FAIL - <notes>",
    "Creative Memory: PASS/FAIL - <notes>",
    "Realtime: PASS/FAIL - <notes>",
    "iOS Release Readiness: PASS/FAIL - <notes>",
    "Overall V1 manual smoke: PASS/FAIL - <notes>",
  ].join("\n");
  const r = run(["--from-result-block=-"], { input: block });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no Launch Doctor results supplied/);
});

test("[v1-launch-doctor-report] output is readable by the launch room unchanged", () => {
  const directory = tempDir();
  const jsonPath = path.join(directory, "io_them_v1_launch_doctor.latest.json");
  const r = run([
    "--talk=pass",
    "--studio=pass",
    "--memory=pass",
    "--realtime=pass",
    "--release=pass",
    `--write=${jsonPath}`,
  ]);
  assert.equal(r.status, 0, r.stderr);

  const room = spawnSync(process.execPath, [launchRoom, "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      V1_LAUNCH_DOCTOR_REPORT: jsonPath,
    },
  });
  assert.equal(room.status, 0, room.stderr);
  const payload = JSON.parse(room.stdout);
  assert.equal(payload.launchDoctor.status, "found");
  assert.equal(payload.launchDoctor.overallStatus, "passed");
  assert.equal(payload.launchDoctor.passed, 5);
  assert.equal(payload.launchDoctor.total, 5);
});
