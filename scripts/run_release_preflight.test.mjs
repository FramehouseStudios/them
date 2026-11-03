import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "scripts", "run_release_preflight.sh");
const scriptSource = fs.readFileSync(script, "utf8");
const workflowSource = fs.readFileSync(
  path.join(repoRoot, ".github", "workflows", "release-preflight.yml"),
  "utf8",
);

function run(env = {}) {
  return spawnSync(script, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("[run-release-preflight] fails clearly when local release config is missing", () => {
  const missingPath = path.join(os.tmpdir(), `io-them-missing-release-${Date.now()}.env`);
  const r = run({ RELEASE_ENV_FILE: missingPath });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Missing local release config/);
  assert.match(r.stderr, /Release\.local\.env\.example/);
  assert.match(r.stderr, /DEVELOPMENT_TEAM_ID, APP_TOKEN_RELEASE, and OPENAI_API_KEY/);
  assert.doesNotMatch(r.stderr, /fill in DEVELOPMENT_TEAM_ID, BACKEND_URL, and APP_TOKEN_RELEASE/i);
});

test("[run-release-preflight] rejects placeholder local release config before preflight", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-release-env-"));
  const envPath = path.join(directory, "Release.local.env");
  fs.copyFileSync(path.join(repoRoot, "them", "Release.local.env.example"), envPath);
  fs.chmodSync(envPath, 0o600);

  const r = run({ RELEASE_ENV_FILE: envPath });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /missing real private value\(s\): DEVELOPMENT_TEAM_ID APP_TOKEN_RELEASE OPENAI_API_KEY/);
  assert.doesNotMatch(r.stderr, /BACKEND_URL/);
  assert.doesNotMatch(r.stdout, /App Store Preflight/);
});

test("[run-release-preflight] rejects a group/world-readable release config before sourcing it", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-release-mode-"));
  const envPath = path.join(directory, "Release.local.env");
  const secret = "mode-leak-token_1234567890";
  fs.writeFileSync(envPath, `APP_TOKEN_RELEASE=${secret}\n`, { mode: 0o644 });
  fs.chmodSync(envPath, 0o644);

  const r = run({ RELEASE_ENV_FILE: envPath });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /must have mode 600 \(found 644\)/);
  assert.doesNotMatch(`${r.stdout}\n${r.stderr}`, new RegExp(secret));
});

test("[run-release-preflight] rejects a release config symlink before sourcing it", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-release-link-"));
  const target = path.join(directory, "target.env");
  const envPath = path.join(directory, "Release.local.env");
  fs.writeFileSync(target, "APP_TOKEN_RELEASE=symlink-token_1234567890\n", { mode: 0o600 });
  fs.symlinkSync(target, envPath);

  const r = run({ RELEASE_ENV_FILE: envPath });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /must not be a symlink/);
  assert.doesNotMatch(`${r.stdout}\n${r.stderr}`, /symlink-token_1234567890/);
});

test("[run-release-preflight] enables the deterministic voice latency gate by default", () => {
  assert.match(scriptSource, /RUN_VOICE_LATENCY_GATE="\$\{RUN_VOICE_LATENCY_GATE:-1\}"/);
  assert.match(scriptSource, /scripts\/run_voice_latency_gate\.sh/);
  assert.match(scriptSource, /Skipping voice latency gate/);
});

test("[run-release-preflight] enables cross-platform voice network-fault smokes by default", () => {
  assert.match(scriptSource, /RUN_VOICE_NETWORK_FAULT_GATE="\$\{RUN_VOICE_NETWORK_FAULT_GATE:-1\}"/);
  assert.match(scriptSource, /scripts\/run_voice_network_fault_smokes\.sh/);
  assert.match(scriptSource, /Skipping voice network-fault gate/);
});

test("[run-release-preflight] gates adaptive Studio writer-block rescue", () => {
  assert.match(
    scriptSource,
    /RUN_STUDIO_INSTINCT_WRITER_BLOCK_GATE="\$\{RUN_STUDIO_INSTINCT_WRITER_BLOCK_GATE:-1\}"/,
  );
  assert.match(
    scriptSource,
    /npm --prefix "\$\{ROOT\}\/backend" run eval:studio-instinct-writer-block-ui/,
  );
  assert.match(scriptSource, /Skipping Studio instinct writer-block gate/);

  assert.match(workflowSource, /name: Upload Clementine Studio Evidence/);
  assert.match(workflowSource, /if: always\(\)/);
  assert.match(workflowSource, /name: clementine-studio-writer-block-evidence/);
  assert.match(workflowSource, /\/tmp\/them-smoke\/studio-instinct-writer-block\//);
  assert.match(workflowSource, /RUN_MAC_DESKTOP_PREFLIGHT: 0/);
});

test("[run-release-preflight] gates writer-block craft quality before UI evidence", () => {
  assert.match(
    scriptSource,
    /RUN_WRITER_BLOCK_QUALITY_GATE="\$\{RUN_WRITER_BLOCK_QUALITY_GATE:-1\}"/,
  );
  assert.match(
    scriptSource,
    /npm --prefix "\$\{ROOT\}\/backend" run eval:writer-block-rescue/,
  );
  assert.match(scriptSource, /Skipping deterministic writer-block quality gate/);
  assert.ok(
    scriptSource.indexOf("run eval:writer-block-rescue") <
      scriptSource.indexOf("run eval:studio-instinct-writer-block-ui"),
  );

  assert.match(workflowSource, /run: bash \.\/scripts\/run_release_preflight\.sh/);
});

test("[run-release-preflight] gates live structural story quality before UI evidence", () => {
  assert.match(
    scriptSource,
    /RUN_LIVE_STUDIO_STRUCTURAL_CANARY="\$\{RUN_LIVE_STUDIO_STRUCTURAL_CANARY:-1\}"/,
  );
  assert.match(
    scriptSource,
    /npm --prefix "\$\{ROOT\}\/backend" run eval:live-studio-story-quality/,
  );
  assert.match(scriptSource, /Skipping live Studio story-quality canary/);
  assert.ok(
    scriptSource.indexOf("run eval:live-studio-story-quality") <
      scriptSource.indexOf("run eval:studio-instinct-writer-block-ui"),
  );

  assert.match(workflowSource, /live-structural-canary:/);
  assert.match(workflowSource, /name: Live Scene Doctor, Feature Architecture, And Continuation Corrections/);
  assert.match(workflowSource, /name: Require OpenAI Provider Secret/);
  assert.match(workflowSource, /name: Score Live Story And Correction Quality/);
  assert.match(workflowSource, /run: npm run eval:live-studio-story-quality/);
  assert.match(workflowSource, /needs: live-structural-canary/);
});

test("[run-release-preflight] keeps the Mac scaffold outside the iPhone V1 gate by default", () => {
  assert.match(scriptSource, /RUN_MAC_DESKTOP_PREFLIGHT="\$\{RUN_MAC_DESKTOP_PREFLIGHT:-0\}"/);
  assert.match(scriptSource, /MAC_DESKTOP_CONFIGURATION="\$\{MAC_DESKTOP_CONFIGURATION:-Mac Scaffold Release\}"/);
  assert.match(scriptSource, /MAC_DESKTOP_ACTION="\$\{MAC_DESKTOP_ACTION:-archive\}"/);
  assert.match(scriptSource, /scripts\/desktop_preflight\.sh/);
  assert.match(scriptSource, /Mac scaffold is outside the iPhone-only V1 release gate/);
});

test("[run-release-preflight] runs the signed iPhone V1 UI suite by default", () => {
  assert.match(scriptSource, /RUN_V1_UI_SMOKE_GATE="\$\{RUN_V1_UI_SMOKE_GATE:-1\}"/);
  assert.match(scriptSource, /scripts\/run_v1_ui_smoke\.sh/);
  assert.match(scriptSource, /Skipping signed iPhone V1 UI smoke/);
});

test("[run-release-preflight] requires OpenAI for every enabled OpenAI consumer", () => {
  assert.match(scriptSource, /RUN_QUALITY_GATE="\$\{RUN_QUALITY_GATE:-1\}"/);
  assert.match(scriptSource, /RUN_EVAL="\$\{RUN_EVAL:-1\}"/);
  assert.match(scriptSource, /RUN_TALK_RECOVERY_GATE="\$\{RUN_TALK_RECOVERY_GATE:-1\}"/);
  assert.match(scriptSource, /RUN_SPECULATIVE_REUSE_GATE="\$\{RUN_SPECULATIVE_REUSE_GATE:-1\}"/);
  assert.match(scriptSource, /RUN_SMOKE="\$\{RUN_SMOKE:-1\}"/);
  assert.match(scriptSource, /RUN_LIVE_STUDIO_STRUCTURAL_CANARY.*requires_openai/s);
  assert.match(scriptSource, /RUN_QUALITY_GATE.*RUN_EVAL.*RUN_TALK_RECOVERY_GATE.*RUN_SPECULATIVE_REUSE_GATE.*RUN_SMOKE.*requires_openai/s);
});

test("[run-release-preflight] checks the exact privacy URL shipped in Info-Release.plist", () => {
  assert.match(scriptSource, /plutil -extract PRIVACY_POLICY_URL raw/);
  assert.match(scriptSource, /PRIVACY_POLICY_URL.*does not match the URL shipped in Info-Release\.plist/);
  assert.match(scriptSource, /--url="\$\{shipped_privacy_url\}"/);
});

test("[run-release-preflight] records every gate and prints a PARTIAL/GREEN summary", () => {
  const gates = [
    ["voice-latency", "RUN_VOICE_LATENCY_GATE"],
    ["voice-network-fault", "RUN_VOICE_NETWORK_FAULT_GATE"],
    ["writer-block-quality", "RUN_WRITER_BLOCK_QUALITY_GATE"],
    ["live-studio-story-quality", "RUN_LIVE_STUDIO_STRUCTURAL_CANARY"],
    ["studio-instinct-writer-block", "RUN_STUDIO_INSTINCT_WRITER_BLOCK_GATE"],
    ["v1-ui-smoke", "RUN_V1_UI_SMOKE_GATE"],
    ["live-backend-health", "RUN_LIVE_BACKEND_CHECK"],
    ["public-privacy-policy", "RUN_PUBLIC_RELEASE_SURFACE_CHECK"],
  ];
  for (const [name, flag] of gates) {
    assert.match(scriptSource, new RegExp(`record_gate_ran "${name}"`), name);
    assert.match(scriptSource, new RegExp(`record_gate_skipped "${name}" ${flag} 1`), name);
  }
  assert.match(scriptSource, /record_gate_skipped "mac-desktop-preflight" RUN_MAC_DESKTOP_PREFLIGHT 0/);
  assert.match(scriptSource, /record_gate_ran "appstore-preflight"/);
  assert.match(scriptSource, /record_gate_skipped "quality-gate" RUN_QUALITY_GATE 1/);
  for (const [name, flag] of [
    ["canon", "RUN_CANON"],
    ["page-craft", "RUN_PAGE_CRAFT"],
    ["regression-eval", "RUN_EVAL"],
    ["strict-case-minimums", "RUN_STRICT_CASE_MINS"],
    ["speculative-reuse", "RUN_SPECULATIVE_REUSE_GATE"],
    ["smoke", "RUN_SMOKE"],
    ["talk-recovery", "RUN_TALK_RECOVERY_GATE"],
    ["ops-alerts", "RUN_ALERT"],
    ["craft-completeness", "RUN_CRAFT_COMPLETENESS_GATE"],
  ]) {
    assert.match(scriptSource, new RegExp(`"${name}:${flag}:1"`), name);
  }
  assert.match(scriptSource, /"load-profile:RUN_LOAD:0"/);
  assert.match(scriptSource, /print_preflight_summary\n*$/);
  assert.match(scriptSource, /PARTIAL: default-on gate\(s\) were skipped/);
  assert.match(scriptSource, /return 2/);
});

test("[run-release-preflight] summary helpers say PARTIAL only when a default-on gate is skipped", () => {
  const start = scriptSource.indexOf("# Gate bookkeeping");
  const end = scriptSource.indexOf('if [[ -e "${RELEASE_ENV_FILE}"');
  assert.ok(start > 0 && end > start, "gate bookkeeping helpers must precede env loading");
  const helpers = scriptSource.slice(start, end);

  const runHelpers = (body) => spawnSync("bash", ["-c", `set -euo pipefail\n${helpers}\n${body}`], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, RUN_LIVE_BACKEND_CHECK: "0", RUN_MAC_DESKTOP_PREFLIGHT: "0" },
  });

  const green = runHelpers(
    'record_gate_ran "v1-ui-smoke"\nrecord_gate_skipped "mac-desktop-preflight" RUN_MAC_DESKTOP_PREFLIGHT 0\nprint_preflight_summary',
  );
  assert.equal(green.status, 0, green.stderr);
  assert.match(green.stdout, /ran:\s+v1-ui-smoke/);
  assert.match(green.stdout, /skipped:\s+mac-desktop-preflight \(RUN_MAC_DESKTOP_PREFLIGHT=0\)/);
  assert.match(green.stdout, /GREEN: every required iPhone release gate ran and passed/);
  assert.doesNotMatch(green.stdout, /PARTIAL/);

  const partial = runHelpers(
    'record_gate_ran "v1-ui-smoke"\nrecord_gate_skipped "live-backend-health" RUN_LIVE_BACKEND_CHECK 1\nprint_preflight_summary',
  );
  assert.equal(partial.status, 2, partial.stderr);
  assert.match(partial.stdout, /skipped:\s+live-backend-health \(RUN_LIVE_BACKEND_CHECK=0\)/);
  assert.match(partial.stdout, /PARTIAL: default-on gate\(s\) were skipped; this run does not prove release readiness/);
  assert.doesNotMatch(partial.stdout, /GREEN/);

  const empty = runHelpers("print_preflight_summary");
  assert.equal(empty.status, 2, empty.stderr);
  assert.match(empty.stdout, /ran:\s+\(none\)/);
  assert.match(empty.stdout, /skipped:\s+\(none\)/);
  assert.match(empty.stdout, /PARTIAL/);
});

test("[run-release-preflight] a skipped quality gate makes the summary fail PARTIAL", () => {
  const start = scriptSource.indexOf("# Gate bookkeeping");
  const end = scriptSource.indexOf('if [[ -e "${RELEASE_ENV_FILE}"');
  const helpers = scriptSource.slice(start, end);
  const result = spawnSync("bash", ["-c", `set -euo pipefail
${helpers}
RUN_QUALITY_GATE=0
record_quality_gate_results
print_preflight_summary`], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, RUN_QUALITY_GATE: "0" },
  });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /quality-gate \(RUN_QUALITY_GATE=0\)/);
  assert.match(result.stdout, /PARTIAL/);
  assert.doesNotMatch(result.stdout, /GREEN/);
});

test("[run-release-preflight] a skipped nested quality check makes the summary fail PARTIAL", () => {
  const start = scriptSource.indexOf("# Gate bookkeeping");
  const end = scriptSource.indexOf('if [[ -e "${RELEASE_ENV_FILE}"');
  const helpers = scriptSource.slice(start, end);
  const flags = [
    "RUN_CANON", "RUN_PAGE_CRAFT", "RUN_EVAL", "RUN_STRICT_CASE_MINS",
    "RUN_SPECULATIVE_REUSE_GATE", "RUN_SMOKE", "RUN_TALK_RECOVERY_GATE",
    "RUN_ALERT", "RUN_CRAFT_COMPLETENESS_GATE",
  ];
  const assignments = flags.map((flag) => `${flag}=1`).join("\n");
  const result = spawnSync("bash", ["-c", `set -euo pipefail
${helpers}
RUN_QUALITY_GATE=1
RUN_LOAD=0
${assignments}
RUN_EVAL=0
record_quality_gate_results
print_preflight_summary`], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /quality-gate\/regression-eval \(RUN_EVAL=0\)/);
  assert.match(result.stdout, /quality-gate\/load-profile \(RUN_LOAD=0\)/);
  assert.match(result.stdout, /PARTIAL/);
  assert.doesNotMatch(result.stdout, /GREEN/);
});

test("[run-release-preflight] gate controls reject values other than zero or one", () => {
  const start = scriptSource.indexOf("# Gate bookkeeping");
  const end = scriptSource.indexOf('if [[ -e "${RELEASE_ENV_FILE}"');
  const helpers = scriptSource.slice(start, end);
  const result = spawnSync("bash", ["-c", `set -euo pipefail
${helpers}
RUN_QUALITY_GATE=yes
validate_gate_flag RUN_QUALITY_GATE`], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /RUN_QUALITY_GATE must be 0 or 1/);
});
