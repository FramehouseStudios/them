import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
function run(args, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "them-mentor-eval-fail-"));
  const report = path.join(dir, "report.json");
  fs.writeFileSync(report, JSON.stringify({ gate: { ok: true }, staleFixture: true }));
  const env = { ...process.env, NODE_ENV: "test", OPENAI_API_KEY: "fixture-only-no-live",
    APP_TOKEN: "fixture-only-app", JWT_SECRET: "fixture-only-jwt", RUN_SERVER: "0",
    OUTBOX_WORKER_ENABLED: "0", KNOWLEDGE_RAG_EMBEDDINGS_ENABLED: "0",
    KNOWLEDGE_RAG_WARMUP_DELAY_MS: "600000", PERSISTENCE_JSON_ROOT: path.join(dir, "persistence"),
    USER_STORE_PATH: path.join(dir, "users.json"), USER_MEMORY_STORE_PATH: path.join(dir, "memory.json"),
    SCREENPLAY_STORE_PATH: path.join(dir, "scripts.json"), OUTBOX_STORE_PATH: path.join(dir, "outbox.json"),
    ASSISTANT_IDENTITY_STORE_PATH: path.join(dir, "identity.json"), BACKEND_SQLITE_PATH: path.join(dir, "db.sqlite"),
    MENTOR_GOLDEN_REPORT: report, STUDIO_RENDER_TEST_REPLY: "", MENTOR_EVAL_FIXTURE_SUCCESS: "0", ...overrides };
  for (const key of ["DATABASE_URL", "REDIS_URL", "NODE_OPTIONS"]) delete env[key];
  try {
    const result = spawnSync(process.execPath, ["--import", "./tests/helpers/mentor_eval_provider_failure.mjs",
      "./evals/run_mentor_golden_eval.mjs", ...args], { cwd: root, env, encoding: "utf8", timeout: 20000 });
    assert.ifError(result.error);
    assert.equal(fs.existsSync(report) && JSON.parse(fs.readFileSync(report, "utf8")).staleFixture, undefined);
    return { status: result.status, output: result.stdout + result.stderr,
      report: fs.existsSync(report) ? JSON.parse(fs.readFileSync(report, "utf8")) : null };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test("live evaluation stops after the first provider failure and retains an incomplete report", () => {
  const result = run(["--live"]);
  assert.equal(result.status, 1);
  assert.equal(result.output.match(/mentor-eval-fixture-provider-call/g)?.length, 1);
  assert.equal(result.report.results.length, 1);
  assert.equal(result.report.summary.selected, 40);
  assert.equal(result.report.summary.unattempted, 39);
  assert.equal(result.report.gate.complete, false);
  assert.equal(result.report.gate.ok, false);
  assert.doesNotMatch(result.output + JSON.stringify(result.report), /fixture-error-secret-canary/);
  assert.match(result.report.results[0].error, /401/);
});

test("live evaluation refuses the application's fixed-reply bypass before provider access", () => {
  const result = run(["--live"], { STUDIO_RENDER_TEST_REPLY: "fixture reply" });
  assert.equal(result.status, 2);
  assert.equal(result.report.gate.ok, false);
  assert.equal(result.report.summary.unattempted, 40);
  assert.doesNotMatch(result.output, /mentor-eval-fixture-provider-call|MENTOR GOLDEN SET OK/);
});

test("an empty selection cannot pass either offline or live evaluation", () => {
  for (const args of [["--only=not-a-real-case"], ["--live", "--only=not-a-real-case"]]) {
    const result = run(args);
    assert.equal(result.status, 2);
    assert.equal(result.report.gate.ok, false);
    assert.equal(result.report.summary.selected, 0);
    assert.doesNotMatch(result.output, /mentor-eval-fixture-provider-call|MENTOR GOLDEN SET OK/);
  }
});

test("a complete selected run can pass through the actual render and scoring path", () => {
  const result = run(["--live", "--only=pitch-talk-to-me"], { MENTOR_EVAL_FIXTURE_SUCCESS: "1" });
  assert.equal(result.status, 0, result.output);
  assert.equal(result.output.match(/mentor-eval-fixture-provider-call/g)?.length, 1);
  assert.equal(result.report.summary.selected, 1);
  assert.equal(result.report.summary.unattempted, 0);
  assert.equal(result.report.gate.complete, true);
  assert.equal(result.report.gate.ok, true);
});

test("missing credentials block before any provider request", () => {
  const result = run(["--live"], { OPENAI_API_KEY: "" });
  assert.equal(result.status, 2);
  assert.equal(result.report.gate.ok, false);
  assert.doesNotMatch(result.output, /mentor-eval-fixture-provider-call|MENTOR GOLDEN SET OK/);
});
