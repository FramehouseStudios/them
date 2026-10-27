import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { startBackend, apiRequest } from './helpers/backend_test_server.mjs';
import { createJsonPersistence } from '../lib/persistence_json.js';
import { createAdapterWalletPersistence } from '../lib/clementine/wallet_persistence.js';

// Use the default client header budget. T1172's canonical metadata and bounded
// headers must remain usable when the real Page budget is enforced.
async function sendAudio(server, headers, form) {
  const response = await fetch(server.baseUrl + '/talk', { method: 'POST',
    headers: { ...headers, 'X-APP-TOKEN': server.env.APP_TOKEN }, body: form });
  return { status: response.status, headers: response.headers,
    body: Buffer.from(await response.arrayBuffer()) };
}

test('raw microphone Page requests classify the actual ASR words before generation', { timeout: 60_000 }, async () => {
  const options = { unsetEnv: ['DATABASE_URL', 'REDIS_URL'], env: {
    APP_TOKEN: 'raw-voice-page-proof', REQUIRE_USER_AUTH: '1',
    CLEMENTINE_PROVIDER: 'openai', CLEMENTINE_MUSE_ENABLED: '0', MUSE_ENABLED: '0', LLM_PROVIDER: 'openai',
    TALK_TEST_DEBUG_TRANSCRIPT_ENABLED: '0', TALK_TEST_DEBUG_OFFLINE_ENABLED: '0',
    TALK_STREAM_AUDIO_ENABLED: '0', KNOWLEDGE_RAG_EMBEDDINGS_ENABLED: '0',
    THEM_HOME_VOICE_PROVIDER_FIXTURE: '1',
    NODE_OPTIONS: `--import=${new URL('../evals/home_voice_provider_fixture.mjs', import.meta.url).href}`,
  } };
  let server = await startBackend(options);
  try {
    const signup = await apiRequest(server, '/auth/signup', { method: 'POST', json: {
      email: `raw-page-${randomUUID()}@example.test`, password: 'Synthetic-proof-only-aA1!',
    } });
    assert.equal(signup.status, 201);
    const ownerId = signup.json.user.user_id;
    const auth = { Authorization: `Bearer ${signup.json.access_token || signup.json.token}` };
    const dataDir = server.dataDir;
    await server.stop();
    const persistence = createJsonPersistence({ jsonRoot: path.join(dataDir, 'persistence') });
    await createAdapterWalletPersistence({ persistence }).putBalance({
      ownerId, pageMilliturns: 100, companionMilliturns: 0,
      grantedPageMilliturns: 100, grantedCompanionMilliturns: 0,
    });
    server = await startBackend({ ...options, dataDir });
    const session = await apiRequest(server, '/session', { method: 'POST', headers: auth, json: {} });
    assert.equal(session.status, 201);
    const headers = { ...auth, 'X-Client-Token': session.json.client_token };
    const created = await apiRequest(server, '/screenplay/projects', { method: 'POST', headers, json: { title: 'Raw voice proof' } });
    assert.equal(created.status, 201);
    const projectId = created.json.project_id || created.json.project?.id;
    assert.ok(projectId);
    const form = new FormData();
    form.set('screenplay_project_id', projectId);
    form.set('screenplay_target', 'page');
    form.set('screenplay_prompt_source', 'voice');
    form.set('max_output_tokens', '400');
    form.set('speech_ms', '3000');
    form.set('tail_silence_ms', '900');
    form.set('file', new Blob([fs.readFileSync(new URL('../test.wav', import.meta.url))], { type: 'audio/wav' }), 'microphone.wav');
    // Deliberately no client/debug/generation transcript: only server ASR knows the words.
    for (const { cap, intent } of [{}, { cap: '0' }, { cap: '1' }, { cap: '1', intent: 'advise' }]) {
      if (cap === undefined) form.delete('max_output_tokens');
      else form.set('max_output_tokens', cap);
      if (intent) form.set('clementine_intent', intent);
      else form.delete('clementine_intent');
      const denied = await sendAudio(server, headers, form);
      assert.equal(denied.status, 402, `server budget must reject underfunded cap ${cap}`);
      assert.equal(JSON.parse(denied.body).error_class, 'wallet_empty');
      assert.notEqual(denied.headers.get('x-screenplay-authoritative'), '1');
    }
    const deniedLog = server.stdout.join('');
    assert.equal(deniedLog.split('[proof-provider] mocked_stt').length - 1, 4);
    assert.equal(deniedLog.includes('[proof-provider] mocked_chat'), false, 'no paid chat before real budget is held');
    assert.equal(deniedLog.includes('[proof-provider] mocked_tts'), false, 'wallet denial is not a misleading recovered voice reply');
    const balance = await apiRequest(server, '/talk/wallet', { method: 'POST', headers, json: {} });
    assert.equal(balance.json.pageTurnsLeft, 0.1);
    const port = server.port;
    await server.stop();
    await createAdapterWalletPersistence({ persistence }).putBalance({
      ownerId, pageMilliturns: 100000, companionMilliturns: 0,
      grantedPageMilliturns: 100000, grantedCompanionMilliturns: 0,
    });
    server = await startBackend({ ...options, dataDir, port });
    const fundedSession = await apiRequest(server, '/session', { method: 'POST', headers: auth, json: {} });
    assert.equal(fundedSession.status, 201);
    headers['X-Client-Token'] = fundedSession.json.client_token;
    form.set('max_output_tokens', '1'); // tiny client hint must not truncate or under-reserve the real Page.
    const response = await sendAudio(server, headers, form);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-screenplay-target'), 'page', 'actual ASR writing must not inherit pre-ASR silence');
    assert.equal(response.headers.get('x-screenplay-authoritative'), '1');
    assert.equal(response.headers.get('x-clementine-lane'), 'Page');
    assert.equal(response.headers.get('x-clementine-reflex'), null);
    assert.ok(response.headers.get('x-clementine-page-reservation'));
    assert.ok(response.headers.get('x-stt-model'));
    const settledBalance = await apiRequest(server, '/talk/wallet', { method: 'POST', headers, json: {} });
    assert.equal(settledBalance.status, 200);
    assert.equal(settledBalance.json.pageTurnsLeft, 99.8, 'the successful HTTP result must debit the fixture actual80 tokens, not its one-token hint');
    const metadata = await apiRequest(server, `/talk/turn/${response.headers.get('x-turn-id')}`, { headers });
    assert.equal(metadata.status, 200);
    assert.match(JSON.stringify(metadata.json), /HOME VOICE HANDOFF/);
    assert.equal(server.stdout.join('').split('[proof-provider] mocked_stt').length - 1, 1);
    // Home starts without a selected project or Page hint. ASR still owns the
    // writing decision and must publish the same authenticated cancel handle.
    form.delete('screenplay_project_id');
    form.delete('screenplay_target');
    form.delete('screenplay_prompt_source');
    form.delete('clementine_intent');
    const home = await sendAudio(server, { ...headers, 'X-Idempotency-Key': 'home-cancel-proof' }, form);
    assert.equal(home.status, 200);
    assert.equal(home.headers.get('x-screenplay-target'), 'page');
    assert.ok(home.headers.get('x-clementine-page-reservation'), 'Home writing must expose its Page cancellation handle');
    const cancelled = await apiRequest(server, '/talk/page-cancel', { method: 'POST', headers, json: {
      reservation_id: home.headers.get('x-clementine-page-reservation'), reason: 'cancel',
    } });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.json.cancelled, true);
    console.log(JSON.stringify({ fixture: 'authenticated raw HTTP; deterministic providers, no paid calls', underfunded: [402, 402, 402, 402], callerIntentCannotDowngradePage: true, deniedChatAndTts: 0, target: 'page', authoritative: true, fundedAsrCalls: 1, settledPageTurns: 0.2 }));
  } finally { await server.stop(); }
});
