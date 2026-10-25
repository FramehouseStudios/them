import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../..", import.meta.url));
const runner = path.join(root, "backend/evals/run_mentor_golden_eval.mjs");

function run(args, { approved = false, failProvider = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "them-mentor-runner-"));
  const calls = path.join(dir, "calls.txt");
  const report = path.join(dir, "report.json");
  const loader = path.join(dir, "loader.mjs");
  // Exercise the real CLI loop, replacing only its provider-facing index
  // import. Unexpected network access is disabled independently as well.
  fs.writeFileSync(loader, `
    export async function resolve(specifier, context, nextResolve) {
      if (specifier === "../index.js" && context.parentURL?.endsWith("/run_mentor_golden_eval.mjs")) {
        const code = ${JSON.stringify(`
          import fs from "node:fs";
          export async function renderStudioRealtimeText() {
            fs.appendFileSync(process.env.MENTOR_TEST_CALLS, "called\\n");
            throw new Error("injected provider unavailable");
          }
        `)};
        return { url: "data:text/javascript," + encodeURIComponent(code), shortCircuit: true };
      }
      return nextResolve(specifier, context);
    }
  `);
  const preload = path.join(dir, "no-network.mjs");
  fs.writeFileSync(preload, "globalThis.fetch = async () => { throw new Error('Network disabled in mentor runner checks'); };\n");
  const env = {
    PATH: process.env.PATH,
    OPENAI_API_KEY: "test-only-not-a-real-key",
    MENTOR_GOLDEN_REPORT: report,
    MENTOR_TEST_CALLS: calls,
    ...(approved ? { MENTOR_GOLDEN_LIVE_APPROVED: "1" } : {}),
  };
  const result = spawnSync(process.execPath, [
    "--import", preload,
    ...(failProvider ? ["--experimental-loader", loader] : []),
    runner, ...args,
  ], { cwd: root, env, encoding: "utf8", timeout: 15_000 });
  return { ...result, calls, report };
}

test("[mentor-golden-runner] a key alone never authorizes paid measurement", () => {
  const r = run(["--live", "--only=pitch"]);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /obtain fresh human approval/);
  assert.equal(fs.existsSync(r.calls), false);
  assert.equal(fs.existsSync(r.report), false);
});

test("[mentor-golden-runner] unknown scope fails closed instead of passing zero cases", () => {
  for (const args of [["--only=unknown-case"], ["--live", "--only=unknown-case"]]) {
    const r = run(args, { approved: true });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /must match a case id or category/);
    assert.equal(fs.existsSync(r.calls), false);
    assert.equal(fs.existsSync(r.report), false);
  }
});

test("[mentor-golden-runner] first provider failure records a failed partial report and stops", () => {
  const r = run(["--live", "--only=pitch"], { approved: true, failProvider: true });
  assert.equal(r.status, 1, r.stderr);
  assert.equal(fs.readFileSync(r.calls, "utf8"), "called\n");
  const report = JSON.parse(fs.readFileSync(r.report, "utf8"));
  assert.equal(report.summary.requestedCases, 8);
  assert.equal(report.summary.total, 1);
  assert.equal(report.summary.fail, 1);
  assert.equal(report.results[0].error, "injected provider unavailable");
  assert.equal(report.gate.ok, false);
  assert.match(r.stderr, /remaining cases were not called/);
});
