import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const qualityGate = readFileSync(new URL("../.github/workflows/quality-gate.yml", import.meta.url), "utf8");
const migrationsCheck = readFileSync(new URL("../.github/workflows/migrations-check.yml", import.meta.url), "utf8");
const autoMerge = readFileSync(new URL("../.github/workflows/auto-merge-tier1.yml", import.meta.url), "utf8");

test("[ci-merge-safety] quality gate runs on pull requests with secret-backed gates disabled", () => {
  const prTrigger = qualityGate.match(/^  pull_request:\n(?:    #[^\n]*\n)*    types: \[([^\]]+)\]/m);
  assert.ok(prTrigger, "Required PR gates must have an explicit trigger, including draft opens and every new head.");
  assert.deepEqual(prTrigger[1].split(",").map(type => type.trim()), ["opened", "synchronize", "reopened"]);
  assert.match(qualityGate, /RUN_EVAL: \$\{\{ github\.event_name == 'pull_request' && '0'/);
  assert.match(qualityGate, /RUN_CANON: \$\{\{ github\.event_name == 'pull_request' && '1'/);
  assert.match(qualityGate, /RUN_SPECULATIVE_REUSE_GATE: \$\{\{ github\.event_name == 'pull_request' && '0'/);
  assert.match(qualityGate, /RUN_SMOKE: \$\{\{ github\.event_name == 'pull_request' && '0'/);
  assert.match(qualityGate, /RUN_TALK_RECOVERY_GATE: \$\{\{ github\.event_name == 'pull_request' && '0'/);
  assert.match(qualityGate, /RUN_ALERT: \$\{\{ github\.event_name == 'pull_request' && '0'/);
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
