import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const qualityGate = readFileSync(new URL("../.github/workflows/quality-gate.yml", import.meta.url), "utf8");
const autoMerge = readFileSync(new URL("../.github/workflows/auto-merge-tier1.yml", import.meta.url), "utf8");

test("[ci-merge-safety] quality gate runs on pull requests with secret-backed gates disabled", () => {
  assert.match(qualityGate, /^\s+pull_request:\n\s+types: \[opened, synchronize, reopened, ready_for_review\]/m);
  assert.match(qualityGate, /RUN_EVAL: \$\{\{ github\.event_name == 'pull_request' && '0'/);
  assert.match(qualityGate, /RUN_CANON: \$\{\{ github\.event_name == 'pull_request' && '1'/);
  assert.match(qualityGate, /RUN_SPECULATIVE_REUSE_GATE: \$\{\{ github\.event_name == 'pull_request' && '0'/);
  assert.match(qualityGate, /RUN_SMOKE: \$\{\{ github\.event_name == 'pull_request' && '0'/);
  assert.match(qualityGate, /RUN_TALK_RECOVERY_GATE: \$\{\{ github\.event_name == 'pull_request' && '0'/);
  assert.match(qualityGate, /RUN_ALERT: \$\{\{ github\.event_name == 'pull_request' && '0'/);
});

test("[ci-merge-safety] auto-merge refuses risky release/auth/privacy paths", () => {
  const requiredFragments = [
    "^\\.github/",
    "^Dockerfile$",
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

test("[ci-merge-safety] auto-merge requires non-author cross-agent approval", () => {
  assert.match(autoMerge, /pr_author=\$\(echo "\$info" \| jq -r '\.author\.login \/\/ ""'\)/);
  assert.ok(autoMerge.includes('((.author.login // \\"\\") != \\$author)'));
  assert.match(autoMerge, /head_ref=\$\(echo "\$info" \| jq -r '\.headRefName \/\/ ""'\)/);
  assert.match(autoMerge, /head_agent="claude"/);
  assert.match(autoMerge, /head_agent="codex"/);
  assert.ok(autoMerge.includes('\\$head_agent == \\"claude\\" and (.body | test(\\"^Codex supervisor update: approved\\"))'));
  assert.ok(autoMerge.includes('\\$head_agent == \\"codex\\" and (.body | test(\\"^Claude supervisor update: approved\\"))'));
});
