import assert from "node:assert/strict";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";

const qualityGate = readFileSync(new URL("../.github/workflows/quality-gate.yml", import.meta.url), "utf8");
const migrationsCheck = readFileSync(new URL("../.github/workflows/migrations-check.yml", import.meta.url), "utf8");
const autoMerge = readFileSync(new URL("../.github/workflows/auto-merge-tier1.yml", import.meta.url), "utf8");

const postgresGate = readFileSync(new URL("../.github/workflows/eval-gate-postgres.yml", import.meta.url), "utf8");
const qualityJob = qualityGate.slice(qualityGate.indexOf("\n  quality-gate:\n"));
const liveFlags = ["RUN_EVAL", "RUN_SPECULATIVE_REUSE_GATE", "RUN_SMOKE", "RUN_TALK_RECOVERY_GATE", "RUN_ALERT", "RUN_LOAD"];
const requests = ["run_eval", "run_speculative_reuse_gate", "run_smoke", "run_talk_recovery_gate", "run_alert", "run_load"];
const fakeKey = "sk-ci-contract-not-a-provider-key";

// Read the actual flat env/run blocks; fail if their shape changes. The evaluator
// covers only the boolean/string expression subset used here, not all Actions.
function flatEnv(section, indent) {
  const lines = section.split("\n"), start = lines.indexOf(`${" ".repeat(indent)}env:`);
  if (start < 0) return {};
  const values = {};
  for (const line of lines.slice(start + 1)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (line.search(/\S/) <= indent) break;
    const entry = line.match(new RegExp(`^ {${indent + 2}}([A-Z_]+): (.+)$`));
    assert.ok(entry, `Unsupported env mapping: ${line}`);
    values[entry[1]] = entry[2];
  }
  return values;
}
function step(name, source = qualityJob) {
  const marker = `      - name: ${name}\n`, start = source.indexOf(marker);
  assert.ok(start >= 0, `Missing workflow step ${name}`);
  const tail = source.slice(start + marker.length);
  const boundary = tail.search(/\n(?: {6}- | {2}[a-zA-Z0-9_-]+:\n)/);
  return source.slice(start, boundary < 0 ? undefined : start + marker.length + boundary);
}
function evaluate(value, context) {
  const expression = value.match(/^\$\{\{ (.*) \}\}$/);
  if (expression) return runInNewContext(expression[1], context, { timeout: 100 });
  if (/^".*"$/.test(value)) return JSON.parse(value);
  if (/^'.*'$/.test(value)) return value.slice(1, -1);
  return value;
}
function environment(values, context) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(evaluate(value, context) ?? "")]));
}
function mode(event, approved, requested = true, attempt = "1") {
  const inputs = Object.fromEntries(requests.map(key => [key, requested]));
  inputs.live_approved = approved;
  inputs.run_canon = true;
  const context = { github: { event_name: event, run_attempt: attempt }, inputs,
    secrets: { OPENAI_API_KEY: fakeKey, APP_TOKEN: "ci-contract-app-token" } };
  const job = environment(flatEnv(qualityJob, 4), context);
  return { context: { ...context, env: job }, job };
}
function stepEnvironment(name, selected) {
  return { ...selected.job, ...environment(flatEnv(step(name), 8), selected.context) };
}
function stepRun(name, workflow = qualityJob) {
  const source = step(name, workflow), marker = "        run: |\n", start = source.indexOf(marker);
  assert.ok(start >= 0, `Missing shell body for ${name}`);
  return source.slice(start + marker.length).split("\n").map(line => line.replace(/^          /, "")).join("\n");
}
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "them-ci-provider-contract-"));
  for (const directory of ["bin", "scripts", "backend"]) mkdirSync(path.join(root, directory));
  copyFileSync(new URL("./quality_gate.sh", import.meta.url), path.join(root, "scripts/quality_gate.sh"));
  const capture = path.join(root, "startup.json");
  writeFileSync(path.join(root, "bin/npm"), `#!${process.execPath}\n`
    + `const fs = require('node:fs');\n`
    + `if (process.argv[2] === 'start') {\n`
    + `fs.writeFileSync(process.env.CI_CONTRACT_CAPTURE, JSON.stringify(Object.fromEntries(${JSON.stringify(["OPENAI_API_KEY", "KNOWLEDGE_RAG_WARMUP_ON_BOOT", ...liveFlags])}.map(k => [k, process.env[k] ?? null]))));\n`
    + `console.log('Backend listening on owned fixture'); setInterval(() => {}, 1000); }\n`);
  writeFileSync(path.join(root, "bin/curl"), `#!${process.execPath}\n`
    + `const fs = require('node:fs'); const args = process.argv.slice(2);\n`
    + `const index = args.indexOf('-o'); if (index >= 0 && args[index + 1] !== '/dev/null') fs.writeFileSync(args[index + 1], 'FAKE_PROVIDER_BODY_MUST_NOT_APPEAR');\n`
    + `if (args.includes('-w')) process.stdout.write(process.env.CI_CONTRACT_HTTP_STATUS || '200');\n`);
  for (const name of ["npm", "curl"]) chmodSync(path.join(root, "bin", name), 0o700);
  return { root, capture, env: { ...process.env, PATH: `${path.join(root, "bin")}:${process.env.PATH}`,
    NODE_OPTIONS: "", CI_CONTRACT_CAPTURE: capture, LOG_FILE: path.join(root, "backend.log"),
    GITHUB_STEP_SUMMARY: path.join(root, "summary.md"), BASE_URL: "http://127.0.0.1:1",
    RUN_PAGE_CRAFT: "0", RUN_CRAFT_COMPLETENESS_GATE: "0" } };
}
function runBody(body, selected, name, owned, extra = {}) {
  // Scope the legacy response-file path to this fixture too: never touch a
  // concurrent session's /tmp/openai-validate.json while proving disclosure.
  const scoped = body.replaceAll("/tmp/openai-validate.json", path.join(owned.root, "response.json"));
  return spawnSync("bash", ["-c", scoped], { cwd: owned.root, encoding: "utf8", timeout: 10_000,
    env: { ...owned.env, ...stepEnvironment(name, selected), ...extra } });
}

test("[ci-merge-safety] PRs retain their deterministic canon and required triggers", () => {
  const trigger = qualityGate.match(/^  pull_request:\n(?:    #[^\n]*\n)*    types: \[([^\]]+)\]/m);
  assert.ok(trigger);
  assert.deepEqual(trigger[1].split(",").map(type => type.trim()), ["opened", "synchronize", "reopened"]);
  assert.equal(mode("pull_request", false).job.RUN_CANON, "1");
});

for (const [event, approved, requested, attempt = "1"] of [
  ["pull_request", true, true], ["push", true, true], ["schedule", true, true],
  ["workflow_dispatch", false, true], ["workflow_dispatch", "true", true],
  ["workflow_dispatch", true, false], ["workflow_dispatch", true, true, "2"],
]) {
  test(`[ci-merge-safety] no paid scope for ${event}/${JSON.stringify(approved)}/${requested}/attempt${attempt}`, () => {
    const selected = mode(event, approved, requested, attempt);
    assert.equal(selected.job.OPENAI_API_KEY, "");
    assert.equal(selected.job.KNOWLEDGE_RAG_WARMUP_ON_BOOT, "0");
    for (const flag of liveFlags) assert.equal(selected.job[flag], "0", flag);
    for (const name of ["Validate Required Secrets", "Validate OPENAI_API_KEY format", "Run repo quality gate"])
      assert.equal(stepEnvironment(name, selected).OPENAI_API_KEY, "", name);
  });
}

test("[ci-merge-safety] requested but unapproved live gates fail before startup", () => {
  const owned = fixture();
  try {
    const approval = step("Validate live scope approval");
    const condition = approval.match(/^        if: (.+)$/m)?.[1];
    assert.ok(condition);
    for (const [event, approved, attempt = "1"] of [["pull_request", true], ["push", true], ["schedule", true],
      ["workflow_dispatch", false], ["workflow_dispatch", "true"], ["workflow_dispatch", true, "2"]]) {
      const selected = mode(event, approved, true, attempt);
      assert.equal(Boolean(evaluate(`\${{ ${condition} }}`, selected.context)), true);
      const result = runBody(stepRun("Validate live scope approval"), selected, "Validate live scope approval", owned);
      assert.equal(result.status, 1);
      assert.match(result.stdout + result.stderr, /Requested paid gates require/);
      assert.equal(existsSync(owned.capture), false);
    }
    assert.equal(Boolean(evaluate(`\${{ ${condition} }}`, mode("workflow_dispatch", true).context)), false);
    assert.equal(Boolean(evaluate(`\${{ ${condition} }}`, mode("push", false, false, "2").context)), false);
  } finally { rmSync(owned.root, { recursive: true, force: true }); }
});

test("[ci-merge-safety] approved scope reaches validation and canonical startup only through step credentials", () => {
  const owned = fixture();
  try {
    for (const approved of [false, true]) {
      const selected = mode("workflow_dispatch", approved, false);
      selected.context.inputs.run_eval = approved;
      selected.job = environment(flatEnv(qualityJob, 4), selected.context);
      selected.context.env = selected.job;
      assert.equal(selected.job.OPENAI_API_KEY, "", "Install/native steps must never inherit the provider key.");
      assert.equal(selected.job.RUN_EVAL, approved ? "1" : "0");
      assert.equal(selected.job.KNOWLEDGE_RAG_WARMUP_ON_BOOT, "0");
      const required = runBody(stepRun("Validate Required Secrets"), selected, "Validate Required Secrets", owned);
      assert.equal(required.status, 0, required.stderr || required.stdout);
      if (approved) {
        const validation = runBody(stepRun("Validate OPENAI_API_KEY format"), selected, "Validate OPENAI_API_KEY format", owned);
        assert.equal(validation.status, 0, validation.stderr || validation.stdout);
      }
      const gate = spawnSync("bash", ["scripts/quality_gate.sh"], { cwd: owned.root, encoding: "utf8", timeout: 10_000,
        env: { ...owned.env, ...stepEnvironment("Run repo quality gate", selected) } });
      assert.equal(gate.status, 0, gate.stderr || gate.stdout);
      const startup = JSON.parse(readFileSync(owned.capture, "utf8"));
      assert.equal(startup.OPENAI_API_KEY, approved ? fakeKey : "");
      assert.equal(startup.KNOWLEDGE_RAG_WARMUP_ON_BOOT, "0");
      assert.equal(startup.RUN_EVAL, approved ? "1" : "0");
    }
  } finally { rmSync(owned.root, { recursive: true, force: true }); }
});

test("[ci-merge-safety] provider rejection reports status without printing a response body", () => {
  const owned = fixture();
  try {
    const selected = mode("workflow_dispatch", true);
    const result = runBody(stepRun("Validate OPENAI_API_KEY format"), selected,
      "Validate OPENAI_API_KEY format", owned, { CI_CONTRACT_HTTP_STATUS: "402" });
    assert.equal(result.status, 1);
    assert.match(result.stdout + result.stderr, /HTTP 402/);
    assert.doesNotMatch(result.stdout + result.stderr, /FAKE_PROVIDER_BODY_MUST_NOT_APPEAR/);
  } finally { rmSync(owned.root, { recursive: true, force: true }); }
});

test("[ci-merge-safety] optional Postgres live gate fails unapproved dispatch and parks automatic coverage", () => {
  const events = postgresGate.slice(postgresGate.indexOf("\non:\n"), postgresGate.indexOf("\npermissions:"));
  assert.doesNotMatch(events, /^  (push|schedule):/m);
  const pgJob = postgresGate.slice(postgresGate.indexOf("\n  eval-gate-postgres:\n"));
  const guard = pgJob.match(/^    if: (.+)$/m)?.[1];
  assert.ok(guard);
  assert.match(pgJob, /^    needs: live-approval$/m);
  const owned = fixture();
  try {
    for (const event of ["push", "schedule", "workflow_dispatch"])
      for (const live_approved of [false, true]) for (const run_attempt of ["1", "2"]) {
        const context = { github: { event_name: event, run_attempt }, inputs: { live_approved },
          secrets: { OPENAI_API_KEY: fakeKey } };
        const eligible = event === "workflow_dispatch" && live_approved;
        const allowed = eligible && run_attempt === "1";
        assert.equal(Boolean(evaluate(`\${{ ${guard} }}`, context)), eligible);
        const approvalEnv = environment(flatEnv(step("Validate live approval", postgresGate), 8), context);
        const result = spawnSync("bash", ["-c", stepRun("Validate live approval", postgresGate)],
          { encoding: "utf8", cwd: owned.root, env: { ...owned.env, ...approvalEnv } });
        assert.equal(result.status, allowed ? 0 : 1, result.stderr || result.stdout);
        // A job-only retry may retain an earlier successful needs result, so
        // execute the paid job's own fresh-dispatch check independently too.
        const jobEnv = environment(flatEnv(pgJob, 4), context);
        const fresh = spawnSync("bash", ["-c", stepRun("Validate fresh live dispatch", pgJob)],
          { encoding: "utf8", cwd: owned.root, env: { ...owned.env, ...jobEnv } });
        assert.equal(fresh.status, allowed ? 0 : 1, fresh.stderr || fresh.stdout);
        for (const name of ["Validate required secrets", "Run eval gate against Postgres"]) {
          const env = environment(flatEnv(step(name, pgJob), 8), { ...context, env: jobEnv });
          assert.equal(env.OPENAI_API_KEY, allowed ? fakeKey : "");
        }
      }
    assert.equal(evaluate(flatEnv(pgJob, 4).KNOWLEDGE_RAG_WARMUP_ON_BOOT, {}), "0");
    assert.equal(evaluate(flatEnv(pgJob, 4).OPENAI_API_KEY, {}), "");
  } finally { rmSync(owned.root, { recursive: true, force: true }); }
});

test("[ci-merge-safety] readiness does not duplicate gates or create a skipped-job green", () => {
  const jobs = qualityGate.slice(qualityGate.indexOf("\njobs:\n"));
  assert.doesNotMatch(qualityGate, /ready_for_review/);
  assert.doesNotMatch(jobs, /pull_request\.draft|github\.event\.action/,
    "Draft state or readiness must not skip required jobs/steps and manufacture a passing check.");
  for (const name of ["God-file gate (D009)", "Backend tests", "Quality Gate"]) {
    assert.ok(jobs.includes(`name: ${name}`), `Required check ${name} must remain.`);
  }
  assert.match(jobs, /Run iOS unit bundle themTests \(required\)/);
  assert.match(jobs, /Run integrated iPhone writer loop \(required\)/);
  assert.match(jobs, /Run iOS V1 UI smoke tests \(required\)/);
  assert.match(jobs, /Run iPhone voice-fault smoke and macOS scaffold build \(required\)/);
});

test("[ci-merge-safety] complete backend tests gate pull requests and main pushes without provider secrets", () => {
  assert.match(qualityGate, /^\s+push:\n\s+branches:\n\s+- main/m);
  const backendJob = qualityGate.match(/\n  backend-tests:\n[\s\S]*?\n  quality-gate:/)?.[0] || "";
  assert.match(backendJob, /name: Backend tests/);
  assert.match(backendJob, /working-directory: backend\n\s+run: npm ci/);
  assert.match(backendJob, /working-directory: backend\n\s+run: npm test/);
  assert.doesNotMatch(backendJob, /OPENAI_API_KEY|APP_TOKEN|secrets\./);
});

test("[ci-merge-safety] persistence changes exercise the migration workflow on PRs and main", () => {
  assert.match(migrationsCheck, /^\s+pull_request:\n\s+paths:/m);
  assert.match(migrationsCheck, /^\s+push:\n\s+branches:\n\s+- main\n\s+paths:/m);
  assert.match(migrationsCheck, /backend\/lib\/persistence_postgres\.js/);
  assert.match(migrationsCheck, /backend\/tests\/persistence_adapter\.test\.mjs/);
  assert.match(migrationsCheck, /backend\/tests\/persistence_postgres_live\.test\.mjs/);
  assert.match(migrationsCheck, /working-directory: backend\n\s+run: npm ci/);
  assert.match(migrationsCheck, /node --test backend\/tests\/persistence_postgres_live\.test\.mjs/);
});

test("[ci-merge-safety] auto-merge refuses risky release/auth/privacy paths", () => {
  const requiredFragments = [
    "^\\.github/",
    "(^|/)Dockerfile$",
    "^backend/render\\.yaml$",
    "\\.entitlements$",
    "PrivacyInfo\\.xcprivacy$",
    "^backend/config\\.js$",
    "^backend/migrations/",
    "quality_gate",
    "pre_flight",
    "Release\\.local\\.env$",
    "\\.env",
    "user_auth",
    "auth_routes",
    "account_routes",
    "account_lifecycle_store",
    "memory_route_auth",
    "screenplay_route_auth",
    "memory-export-delete-decision-packet",
  ];

  assert.match(autoMerge, /risky_path_re=/);
  for (const fragment of requiredFragments) {
    assert.ok(
      autoMerge.includes(fragment),
      `auto-merge risky path deny list is missing ${fragment}`,
    );
  }
  assert.match(autoMerge, /touches risky path\(s\); refusing agent auto-merge/);
});

test("[ci-merge-safety] auto-merge requires trusted project approval", () => {
  assert.match(autoMerge, /approved_via_review=/);
  assert.match(autoMerge, /OWNER.*MEMBER.*COLLABORATOR/);
  assert.ok(autoMerge.includes('^(Codex|Project) supervisor update: approved'));
  assert.match(autoMerge, /There is no quiet-time\s+# fallback/);
  assert.match(autoMerge, /for forbidden in tier-2 tier-3 needs-human do-not-merge block-merge/);
});
