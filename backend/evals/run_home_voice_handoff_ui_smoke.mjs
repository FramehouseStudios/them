import { spawn, spawnSync } from 'node:child_process';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startBackend } from '../tests/helpers/backend_test_server.mjs';
import { startPromotionDelayProxy } from './promotion_delay_proxy.mjs';

// Deterministic transport/insertion/save proof, never microphone or model proof.
// Caller must erase a TASK-OWNED simulator before invoking this runner.
const root = fileURLToPath(new URL('../..', import.meta.url));
const destination = process.env.IOS_SIMULATOR_DESTINATION || '';
if (!/^platform=iOS Simulator,id=[A-F0-9-]+$/.test(destination)) {
  throw new Error('An explicit task-owned IOS_SIMULATOR_DESTINATION is required');
}
const allowedTests = [
  'themUITests/V1SmokeUITests/test_confirmed_home_voice_turn_opens_studio_writes_and_restores',
  'themUITests/V1SmokeUITests/test_home_raw_audio_uses_current_server_transcript_writes_and_restores',
  'themUITests/V1SmokeUITests/test_home_raw_audio_studio_stop_ends_capture_and_cancels_page',
  'themUITests/V1SmokeUITests/test_integrated_iphone_writer_loop_creates_saves_exports_and_restores',
  'themUITests/V1SmokeUITests/test_coverage_read_labels_earlier_snapshot_and_refreshes_current_draft',
  'themUITests/V1SmokeUITests/test_restored_unbound_draft_keeps_title_and_exact_bytes_after_promotion_and_relaunch',
  'themUITests/V1SmokeUITests/test_delayed_project_creation_cannot_save_or_bind_a_changed_page',
  'themUITests/V1SmokeUITests/test_screenplay_save_outbox_survives_relaunch_and_reconnects_once',
  'themUITests/V1SmokeUITests/test_studio_refused_write_preserves_saved_page_despite_page_selection',
  'themUITests/V1SmokeUITests/test_pages_navigator_controls_jump_and_preserve_source',
  'themUITests/V1SmokeUITests/test_talk_recovery_exports_current_owner_and_confirms_exact_deletion',
  'themUITests/V1SmokeUITests/test_initial_project_relaunch_replays_saved_identity_and_preserves_newer_edits',
  'themUITests/V1SmokeUITests/test_explicit_project_creation_preserves_existing_page_bytes',
  'themUITests/V1SmokeUITests/test_interrupted_talk_recovery_requires_confirmation_and_keeps_original_queue_on_relaunch',
  'themUITests/V1SmokeUITests/test_received_talk_reply_is_reviewed_and_exported_without_resend_after_relaunch',
  'themUITests/V1SmokeUITests/test_queued_talk_reply_plays_appends_saves_and_restores_once',
];
const tests = process.env.ONLY_TESTING ? [process.env.ONLY_TESTING] : allowedTests.slice(0, 2);
if (tests.some(test => !allowedTests.includes(test))) throw new Error('Unsupported Home voice proof test');
if (process.env.THEM_HOME_VOICE_LONG_AUDIO === '1' && (tests.length !== 1 || !tests[0].includes('home_raw_audio'))) throw new Error('Long audio regression requires the raw-audio case alone');
// Reuse the measured audio asset so Stop interrupts an active turn, rather
// than racing the short silence fixture; production timing is unchanged.
const needsInterruptibleAudio = tests.some(test => test.endsWith('/test_home_raw_audio_studio_stop_ends_capture_and_cancels_page'));
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
  THEM_HOME_VOICE_LONG_AUDIO: process.env.THEM_HOME_VOICE_LONG_AUDIO === '1' || needsInterruptibleAudio ? '1' : '0',
  THEM_PAGE_NAVIGATOR_PROOF: tests.some(test => test.includes('test_pages_navigator_controls')) ? '1' : '0',
  NODE_OPTIONS: `--import=${fixtureURL.href}`,
} });
let promotionProxy;
try {
  if (tests.some(test => test.includes('test_delayed_project_creation') || test.includes('test_initial_project_relaunch'))) promotionProxy = await startPromotionDelayProxy(server.baseUrl);
  writeFileSync(config, `THEM_UITEST_WRITER_LOOP_BACKEND_PORT = ${promotionProxy?.port || server.port}\n`, {mode: 0o600});
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
  const paginationResponses = server.stdout.join('').split('[proof-provider] observed_pagination_200').length - 1;
  if (tests.some(test => test.includes('test_pages_navigator_controls')) && paginationResponses < 1) throw new Error('Pages UI never reached real pagination HTTP');
  if (tests.some(test => test.includes('test_pages_navigator_controls'))) console.log(JSON.stringify({paginationResponses}));
  const reasons = server.stdout.join('').split('\n').filter(line => /screenplay_page_quality_exhausted reason=|studio_render(?:_stream)? quality_rejected reason=/.test(line));
  console.log(reasons.join('\n'));
  if (status !== 0 || summary.passedTests !== tests.length || summary.failedTests !== 0 || summary.skippedTests !== 0) throw new Error('UI proof failed');
  if (tests.some(test => test.includes('home_raw_audio')) && counts.stt < 1) throw new Error('Raw audio test never reached mocked server ASR');
  if (tests.some(test => test.includes('home_')) && counts.chat < 1) throw new Error('Home test never reached mocked generation');
  if (tests.some(test => test.includes('studio_refused_write')) && counts.chat < 1) throw new Error('Refusal test never reached mocked generation');
} finally {
  await promotionProxy?.stop();
  await server.stop();
  if (existsSync(config)) unlinkSync(config);
}
