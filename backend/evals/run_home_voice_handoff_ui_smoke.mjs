import { spawn, spawnSync } from 'node:child_process';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startBackend } from '../tests/helpers/backend_test_server.mjs';

// Deterministic transport/insertion/save proof, never microphone or model proof.
// Caller must erase a TASK-OWNED simulator before invoking this runner.
// A frozen backend snapshot may drive the current native working tree without
// loading its private environment files. Default remains the adjacent app.
const root = process.env.THEM_HOME_VOICE_APP_ROOT || fileURLToPath(new URL('../..', import.meta.url));
const destination = process.env.IOS_SIMULATOR_DESTINATION || '';
if (!/^platform=iOS Simulator,id=[A-F0-9-]+$/.test(destination)) {
  throw new Error('An explicit task-owned IOS_SIMULATOR_DESTINATION is required');
}
const allowedTests = [
  'themUITests/V1SmokeUITests/test_confirmed_home_voice_turn_opens_studio_writes_and_restores',
  'themUITests/V1SmokeUITests/test_home_raw_audio_uses_current_server_transcript_writes_and_restores',
  'themUITests/V1SmokeUITests/test_home_raw_audio_studio_stop_ends_capture_and_cancels_page',
  'themUITests/V1SmokeUITests/test_integrated_iphone_writer_loop_creates_saves_exports_and_restores',
  'themUITests/V1SmokeUITests/test_studio_refused_write_preserves_saved_page_despite_page_selection',
];
const tests = process.env.ONLY_TESTING ? [process.env.ONLY_TESTING] : allowedTests.slice(0, 2);
if (tests.some(test => !allowedTests.includes(test))) throw new Error('Unsupported Home voice proof test');
if (process.env.THEM_HOME_VOICE_LONG_AUDIO === '1' && (tests.length !== 1 || !tests[0].includes('home_raw_audio'))) throw new Error('Long audio regression requires the raw-audio case alone');
const bundle = process.env.THEM_HOME_VOICE_RESULT_BUNDLE || `/tmp/them-home-voice-${process.pid}.xcresult`;
if (existsSync(bundle)) throw new Error('Refusing to overwrite an existing result bundle');
const config = `/tmp/them-home-voice-${process.pid}.xcconfig`;
const fixtureURL = new URL('./home_voice_provider_fixture.mjs', import.meta.url);
const server = await startBackend({ unsetEnv: ['DATABASE_URL', 'REDIS_URL'], env: {
  APP_TOKEN: 'them-dev', REQUIRE_USER_AUTH: '1', CLEMENTINE_PROVIDER: 'openai',
  CLEMENTINE_MUSE_ENABLED: '0', TALK_TEST_DEBUG_TRANSCRIPT_ENABLED: '0',
  MUSE_ENABLED: '0', LLM_PROVIDER: 'openai',
  TALK_TEST_DEBUG_OFFLINE_ENABLED: '0', TALK_STREAM_AUDIO_ENABLED: '0',
  KNOWLEDGE_RAG_EMBEDDINGS_ENABLED: '0', THEM_HOME_VOICE_PROVIDER_FIXTURE: '1',
  THEM_HOME_VOICE_LONG_AUDIO: process.env.THEM_HOME_VOICE_LONG_AUDIO === '1' ? '1' : '0',
  NODE_OPTIONS: `--import=${fixtureURL.href}`,
} });
try {
  writeFileSync(config, `THEM_UITEST_WRITER_LOOP_BACKEND_PORT = ${server.port}\n`, {mode: 0o600});
  const child = spawn('bash', ['scripts/run_v1_ui_smoke.sh', '-quiet', '-resultBundlePath', bundle, ...tests.slice(1).map(test => '-only-testing:' + test)], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env,
      ONLY_TESTING: tests[0], THEM_UITEST_RESTORE_XCCONFIG_PATH: config,
      IOS_SIMULATOR_DESTINATION: destination,
    },
  });
  // Keep the event loop free to drain the backend pipes during Xcode's run.
  child.stdout.on('data', data => process.stdout.write(data));
  child.stderr.on('data', data => process.stderr.write(data));
  const status = await new Promise((resolve, reject) => {
    child.on('error', reject); child.on('close', resolve);
  });
  const report = spawnSync('xcrun', ['xcresulttool', 'get', 'test-results', 'summary', '--path', bundle], {encoding: 'utf8'});
  if (report.status !== 0) throw new Error('Missing xcresult summary');
  const summary = JSON.parse(report.stdout);
  const counts = Object.fromEntries(['stt', 'chat', 'tts'].map(name => [name, server.stdout.join('').split('mocked_' + name).length - 1]));
  console.log(JSON.stringify({bundle, passed: summary.passedTests, failed: summary.failedTests, skipped: summary.skippedTests, mockedProviderCalls: counts, failures: summary.testFailures}));
  const reasons = server.stdout.join('').split('\n').filter(line => /screenplay_page_quality_exhausted reason=|studio_render(?:_stream)? quality_rejected reason=/.test(line));
  console.log(reasons.join('\n'));
  if (status !== 0 || summary.passedTests !== tests.length || summary.failedTests !== 0 || summary.skippedTests !== 0) throw new Error('UI proof failed');
  if (tests.some(test => test.includes('home_raw_audio')) && counts.stt < 1) throw new Error('Raw audio test never reached mocked server ASR');
  if (tests.some(test => test.includes('home_')) && counts.chat < 1) throw new Error('Home test never reached mocked generation');
  if (tests.some(test => test.includes('studio_refused_write')) && counts.chat < 1) throw new Error('Refusal test never reached mocked generation');
} finally {
  await server.stop();
  if (existsSync(config)) unlinkSync(config);
}
