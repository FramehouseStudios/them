import { pathToFileURL } from 'node:url';

// Match the release wrapper's existing flag semantics: unset/empty defaults
// to enabled; only the exact value "1" enables an explicitly supplied flag.
export function requiresReleaseProviderKey(env = process.env) {
  const enabled = name => String(env[name] || '1') === '1';
  return enabled('RUN_LIVE_STUDIO_STRUCTURAL_CANARY') ||
    (enabled('RUN_QUALITY_GATE') && ['RUN_EVAL', 'RUN_TALK_RECOVERY_GATE',
      'RUN_SPECULATIVE_REUSE_GATE', 'RUN_SMOKE'].some(enabled));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(requiresReleaseProviderKey() ? '1\n' : '0\n');
}
