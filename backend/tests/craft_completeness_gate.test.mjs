// T23: tests for the craft completeness gate script.
// Spawns the script as a subprocess against the three checked-in
// fixtures and asserts pass/fail behavior.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  _resetCraftStores,
  analyzeScreenplay,
  configureCraftAnalysis,
  getStoredReport,
  storeReport,
} from "../lib/craft_analysis.js";
import { craftStorageProjectId } from "../lib/craft_routes.js";
import { createPersistence } from "../lib/persistence_adapter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const SCRIPT = path.join(ROOT, "scripts", "check_craft_completeness.mjs");
const FIXTURES = path.join(ROOT, "backend", "fixtures", "craft");
const CONTRACT_EVAL = path.join(ROOT, "backend", "evals", "run_craft_analysis_contract_eval.mjs");
const ANALYSIS_CASES = path.join(FIXTURES, "analysis_cases.json");

function tempReportPath(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `io-them-craft-gate-${label}-`));
  return path.join(root, "report.json");
}

async function generateFreshCompleteReport(label) {
  const output = tempReportPath(label);
  const result = await runNode([CONTRACT_EVAL, "--write-complete-report", output]);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  return output;
}

function runNode(args = [], { env = {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: ROOT,
      env: { ...process.env, ...env },
    });
    const chunks = { stdout: [], stderr: [] };
    child.stdout.on("data", (b) => chunks.stdout.push(String(b)));
    child.stderr.on("data", (b) => chunks.stderr.push(String(b)));
    child.on("close", (code) => {
      resolve({
        code,
        stdout: chunks.stdout.join(""),
        stderr: chunks.stderr.join(""),
      });
    });
  });
}

function runScript(args = [], options = {}) {
  return runNode([SCRIPT, ...args], options);
}

async function generateFreshOverriddenReport() {
  const fixture = JSON.parse(fs.readFileSync(ANALYSIS_CASES, "utf8"));
  const testCase = fixture.cases.find(
    (item) => item.frameworkId === "save-the-cat" && item.state === "missing",
  );
  assert.ok(testCase, "missing Save the Cat contract fixture should exist");
  const projectId = "craft-persisted-override";
  const versionId = "v-gate-1";
  const turnId = testCase.expected.missingTurnIds[0];
  const labelsBySceneId = new Map(
    testCase.scenes.map((scene) => [scene.id, scene.semanticBeatId]),
  );
  const classifier = {
    kind: "gate-persistence-fixture",
    async classifyScene({ scene }) {
      const beatId = labelsBySceneId.get(scene.id) || null;
      return {
        status: "classified",
        beatId,
        confidence: beatId ? 0.99 : 0,
        source: "gate-persistence-fixture",
      };
    },
  };
  const override = {
    id: "ov-persisted-gate",
    projectId,
    versionId,
    frameworkId: testCase.frameworkId,
    turnId,
    action: "mark-present",
    reason: "Writer confirmed the turn for the persisted gate regression.",
    userId: "craft-gate-owner",
    createdAt: "2026-08-31T12:00:00.000Z",
  };
  return analyzeScreenplay({
    screenplay: {
      pageCount: 110,
      title: "Persisted override gate regression",
      scenes: testCase.scenes,
    },
    frameworkId: testCase.frameworkId,
    projectId,
    versionId,
    generatedAt: "2026-08-31T12:00:00.000Z",
    classifier,
    overrides: [override],
  });
}

test("[T23] passes a freshly generated evidence-backed complete report", async () => {
  const reportPath = await generateFreshCompleteReport("complete");
  const r = await runScript(["--file", reportPath]);
  assert.equal(r.code, 0, `expected exit 0, got ${r.code}; stderr=${r.stderr}`);
  assert.match(r.stdout, /craft completeness gate: PASS/);
  assert.match(r.stdout, /required=4/);
  assert.match(r.stdout, /detected=4/);
});

test("[T23] resolves an owner-scoped persisted report without changing its public override scope", async () => {
  const jsonRoot = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-craft-gate-persisted-"));
  // The CLI below deliberately reads this JSON root. Do not let an ambient
  // integration-test DATABASE_URL send the writer to a different adapter.
  const persistence = createPersistence({ databaseUrl: "", jsonRoot });
  assert.equal(persistence.kind, "json", "the fixture writer and CLI reader must use the same JSON store");
  configureCraftAnalysis({ persistence });
  try {
    const report = await generateFreshOverriddenReport();
    const storageProjectId = craftStorageProjectId("craft-gate-owner", report.projectId);
    await storeReport(report, { storageProjectId });

    assert.equal(
      await persistence.get({
        domain: "craft_reports",
        key: `${report.projectId}:${report.versionId}`,
      }),
      null,
      "owner-scoped report must not be written under the public project id",
    );
    const stored = await getStoredReport({ storageProjectId, versionId: report.versionId });
    assert.equal(stored.projectId, report.projectId);
    assert.equal(stored.majorTurns.find((turn) => turn.override)?.override.projectId, report.projectId);
    assert.equal(stored.coverage.overriddenMajorTurnCount, 1);

    const r = await runScript(
      ["--project", report.projectId, "--version", report.versionId],
      { env: { DATABASE_URL: "", PERSISTENCE_JSON_ROOT: jsonRoot } },
    );
    assert.equal(r.code, 0, `expected exit 0, got ${r.code}; stderr=${r.stderr}`);
    assert.match(r.stdout, /craft completeness gate: PASS/);
    assert.match(r.stdout, /overridden=1/);
  } finally {
    _resetCraftStores();
    await persistence.close();
  }
});

test("[T23] rejects legacy static complete fixtures with evidence-free detected turns", async () => {
  const r = await runScript(["--file", path.join(FIXTURES, "report_complete.json")]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /INVALID REPORT/);
  assert.match(r.stderr, /semantic evidence/);
});

test("[T23] rejects forged complete=true when a detected turn loses its evidence", async () => {
  const reportPath = await generateFreshCompleteReport("forged");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  report.majorTurns[0].evidence = [];
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const r = await runScript(["--file", reportPath]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /detected turn has no semantic evidence/);
});

test("[T23] fails a coherent incomplete report with actionable diagnostics", async () => {
  const reportPath = await generateFreshCompleteReport("incomplete");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const turn = report.majorTurns[0];
  turn.status = "missing";
  turn.detected = false;
  turn.evidence = [];
  delete turn.actualPage;
  delete turn.actualPageRange;
  delete turn.sceneId;
  delete turn.sceneTitle;
  delete turn.driftPages;
  delete turn.confidence;
  report.coverage.detectedMajorTurnCount -= 1;
  report.coverage.missingMajorTurnCount = 1;
  report.coverage.complete = false;
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const r = await runScript(["--file", reportPath]);
  assert.equal(r.code, 1, `expected exit 1, got ${r.code}; stdout=${r.stdout}`);
  assert.match(r.stderr, /craft completeness gate: FAIL/);
  assert.match(r.stderr, /Missing required major turns:/);
  assert.match(r.stderr, new RegExp(turn.turnId));
  assert.match(r.stderr, /POST \/craft\/overrides/);
});

test("[T23] surfaces a clear error when no fixture or project is supplied", async () => {
  const r = await runScript([]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /pass --file <path> or --project <id>/);
});

test("[T23] surfaces a clear error when --file points at a missing fixture", async () => {
  const r = await runScript(["--file", "/tmp/does-not-exist-craft.json"]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /fixture not found/);
});
