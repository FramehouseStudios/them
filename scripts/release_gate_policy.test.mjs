import test from 'node:test';
import assert from 'node:assert/strict';
import { requiresReleaseProviderKey } from './release_gate_policy.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('provider checks remain enabled by default, including empty flags', () => {
  assert.equal(requiresReleaseProviderKey({}), true);
  assert.equal(requiresReleaseProviderKey({ RUN_LIVE_STUDIO_STRUCTURAL_CANARY: '' }), true);
});

test('status reports explicitly skipped provider proof, but default policy still requires its key', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'them-gate-policy-'));
  try {
    const statusScript = fileURLToPath(new URL('./release_config_status.mjs', import.meta.url));
    const env = { ...process.env, DEVELOPMENT_TEAM_ID: 'ABCDE12345',
      APP_TOKEN_RELEASE: 'test-only-release-token-not-a-production-secret', OPENAI_API_KEY: '',
      BACKEND_URL: 'https://backend.example.org', RUN_LIVE_STUDIO_STRUCTURAL_CANARY: '0',
      RUN_QUALITY_GATE: '0', RUN_EVAL: '1', RUN_TALK_RECOVERY_GATE: '1',
      RUN_SPECULATIVE_REUSE_GATE: '1', RUN_SMOKE: '1' };
    const run = flags => spawnSync(process.execPath, [statusScript, '--json', '--no-xcodebuild',
      `--release-env-file=${path.join(root, 'absent.env')}`], { env: { ...env, ...flags }, encoding: 'utf8' });
    const skipped = run({});
    assert.equal(skipped.status, 0, skipped.stdout + skipped.stderr);
    const result = JSON.parse(skipped.stdout);
    assert.equal(result.checks.find(c => c.id === 'openai-api-key').skipped, true);
    assert.ok(result.warnings.some(w => w.includes('not live story-quality')));
    for (const flags of [{ RUN_LIVE_STUDIO_STRUCTURAL_CANARY: '1' }, { RUN_QUALITY_GATE: '1' }]) {
      const required = run(flags);
      assert.equal(required.status, 1);
      assert.ok(JSON.parse(required.stdout).missingInputs.includes('OPENAI_API_KEY'));
    }
  } finally { fs.rmdirSync(root); }
});

test('only explicitly disabling every provider-backed path removes key requirement', () => {
  const flags = { RUN_LIVE_STUDIO_STRUCTURAL_CANARY: '0', RUN_QUALITY_GATE: '1',
    RUN_EVAL: '0', RUN_TALK_RECOVERY_GATE: '0', RUN_SPECULATIVE_REUSE_GATE: '0', RUN_SMOKE: '0' };
  assert.equal(requiresReleaseProviderKey(flags), false);
  for (const key of Object.keys(flags).filter(key => key !== 'RUN_QUALITY_GATE')) {
    assert.equal(requiresReleaseProviderKey({ ...flags, [key]: '1' }), true, key);
  }
  assert.equal(requiresReleaseProviderKey({ RUN_LIVE_STUDIO_STRUCTURAL_CANARY: '0', RUN_QUALITY_GATE: '0' }), false);
});
