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
  assert.match(r.stderr, /DEVELOPMENT_TEAM_ID and APP_TOKEN_RELEASE/);
  assert.doesNotMatch(r.stderr, /fill in DEVELOPMENT_TEAM_ID, BACKEND_URL, and APP_TOKEN_RELEASE/i);
});

test("[run-release-preflight] rejects placeholder local release config before preflight", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-release-env-"));
  const envPath = path.join(directory, "Release.local.env");
  fs.copyFileSync(path.join(repoRoot, "them", "Release.local.env.example"), envPath);
  fs.chmodSync(envPath, 0o600);

  const r = run({ RELEASE_ENV_FILE: envPath });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /missing real private value\(s\): DEVELOPMENT_TEAM_ID APP_TOKEN_RELEASE/);
  assert.doesNotMatch(r.stderr, /BACKEND_URL/);
  assert.doesNotMatch(r.stdout, /App Store Preflight/);
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

test("[run-release-preflight] gates adaptive Studio writer-block rescue across platforms", () => {
  assert.match(
    scriptSource,
    /RUN_STUDIO_INSTINCT_WRITER_BLOCK_GATE="\$\{RUN_STUDIO_INSTINCT_WRITER_BLOCK_GATE:-1\}"/,
  );
  assert.match(
    scriptSource,
    /npm --prefix "\$\{ROOT\}\/backend" run eval:studio-instinct-writer-block-ui/,
  );
  assert.match(scriptSource, /Skipping Studio instinct writer-block gate/);

  assert.match(workflowSource, /name: Verify Clementine Studio Writer Block Rescue/);
  assert.match(workflowSource, /working-directory: backend/);
  assert.match(workflowSource, /run: npm run eval:studio-instinct-writer-block-ui/);
  assert.match(workflowSource, /name: Upload Clementine Studio Evidence/);
  assert.match(workflowSource, /if: always\(\)/);
  assert.match(workflowSource, /name: clementine-studio-writer-block-evidence/);
  assert.match(workflowSource, /\/tmp\/them-smoke\/studio-instinct-writer-block\//);
  assert.match(workflowSource, /MAC_DESKTOP_CONFIGURATION: Mac Scaffold Release/);
  assert.match(workflowSource, /MAC_DESKTOP_ACTION: archive/);
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

  assert.match(workflowSource, /name: Verify Clementine Writer Block Quality Contract/);
  assert.match(workflowSource, /run: npm run eval:writer-block-rescue/);
  assert.ok(
    workflowSource.indexOf("run: npm run eval:writer-block-rescue") <
      workflowSource.indexOf("run: npm run eval:studio-instinct-writer-block-ui"),
  );
});

test("[run-release-preflight] gates live structural story quality before UI evidence", () => {
  assert.match(
    scriptSource,
    /RUN_LIVE_STUDIO_STRUCTURAL_CANARY="\$\{RUN_LIVE_STUDIO_STRUCTURAL_CANARY:-1\}"/,
  );
  assert.match(
    scriptSource,
    /npm --prefix "\$\{ROOT\}\/backend" run eval:live-studio-structural/,
  );
  assert.match(scriptSource, /Skipping live Studio structural canary/);
  assert.ok(
    scriptSource.indexOf("run eval:live-studio-structural") <
      scriptSource.indexOf("run eval:studio-instinct-writer-block-ui"),
  );

  assert.match(workflowSource, /name: Verify Live Scene Doctor And Feature Architecture/);
  assert.match(workflowSource, /run: npm run eval:live-studio-structural/);
  assert.ok(
    workflowSource.indexOf("run: npm run eval:live-studio-structural") <
      workflowSource.indexOf("run: npm run eval:studio-instinct-writer-block-ui"),
  );
});

test("[run-release-preflight] archives the production Mac app by default", () => {
  assert.match(scriptSource, /MAC_DESKTOP_CONFIGURATION="\$\{MAC_DESKTOP_CONFIGURATION:-Mac Scaffold Release\}"/);
  assert.match(scriptSource, /MAC_DESKTOP_ACTION="\$\{MAC_DESKTOP_ACTION:-archive\}"/);
  assert.match(scriptSource, /scripts\/desktop_preflight\.sh/);
});
