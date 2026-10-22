import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { startBackend, apiRequest } from './helpers/backend_test_server.mjs';
import { createJsonPersistence } from '../lib/persistence_json.js';
import { createAdapterWalletPersistence } from '../lib/clementine/wallet_persistence.js';

// The existing audio contract includes URI-encoded page/timeline headers which
// exceed Node fetch's default header budget. Bound this one transport explicitly;
// do not change production headers or globally relax the suite's HTTP clients.
async function sendAudio(server, headers, form) {
  const encoded = new Response(form);
  const body = Buffer.from(await encoded.arrayBuffer());
  return new Promise((resolve, reject) => {
    const req = http.request(server.baseUrl + '/talk', { method: 'POST', maxHeaderSize: 131072,
      headers: { ...headers, 'X-APP-TOKEN': server.env.APP_TOKEN,
        'Content-Type': encoded.headers.get('content-type'), 'Content-Length': String(body.length) },
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: new Headers(res.headers), body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end(body);
  });
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
      ownerId, pageMilliturns: 100000, companionMilliturns: 0,
      grantedPageMilliturns: 100000, grantedCompanionMilliturns: 0,
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
    const response = await sendAudio(server, headers, form);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-screenplay-target'), 'page', 'actual ASR writing must not inherit pre-ASR silence');
    assert.equal(response.headers.get('x-screenplay-authoritative'), '1');
    assert.equal(response.headers.get('x-clementine-lane'), 'Page');
    assert.equal(response.headers.get('x-clementine-reflex'), null);
    assert.ok(response.headers.get('x-clementine-page-reservation'));
    assert.ok(response.headers.get('x-stt-model'));
    const metadata = await apiRequest(server, `/talk/turn/${response.headers.get('x-turn-id')}`, { headers });
    assert.equal(metadata.status, 200);
    assert.match(JSON.stringify(metadata.json), /HOME VOICE HANDOFF/);
    assert.equal(server.stdout.join('').split('[proof-provider] mocked_stt').length - 1, 1);
    console.log(JSON.stringify({ fixture: 'authenticated raw HTTP; deterministic providers, no paid calls', target: 'page', authoritative: true, asrCalls: 1 }));
  } finally { await server.stop(); }
});
