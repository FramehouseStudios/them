import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startBackend, apiRequest } from './helpers/backend_test_server.mjs';
import { createJsonPersistence } from '../lib/persistence_json.js';
import { createAdapterWalletPersistence } from '../lib/clementine/wallet_persistence.js';

test('authenticated /talk honors current and post-ASR refusal, preserves saved draft and refunds Page hold', { timeout: 60000 }, async () => {
  const fixture = fileURLToPath(new URL('./helpers/screenplay_refusal_provider.mjs', import.meta.url));
  const options = { unsetEnv: ['DATABASE_URL', 'REDIS_URL'], env: {
    NODE_OPTIONS: `--import=${fixture}`, REQUIRE_USER_AUTH: '1', THEM_REFUSAL_FIXTURE: '1',
    TALK_TEST_DEBUG_TRANSCRIPT_ENABLED: '0', TALK_TEST_DEBUG_OFFLINE_ENABLED: '0',
    CHAT_STREAM_ENABLED: '0', TALK_STREAM_AUDIO_ENABLED: '0', KNOWLEDGE_RAG_EMBEDDINGS_ENABLED: '0',
    CLEMENTINE_MUSE_ENABLED: '0', CLEMENTINE_PROVIDER: 'openai', CLEMENTINE_SHORT_FILM_BETA: '1',
  } };
  let server = await startBackend(options);
  try {
    const signup = await apiRequest(server, '/auth/signup', {
      method: 'POST', json: { email: 'refusal-fixture@example.com', password: 'refusal-fixture-password-123' },
    });
    assert.equal(signup.status, 201);
    const ownerId = signup.json.user.user_id;
    const auth = { Authorization: `Bearer ${signup.json.token || signup.json.access_token}` };
    const dataDir = server.dataDir;
    await server.stop();
    const persistence = createJsonPersistence({ jsonRoot: path.join(dataDir, 'persistence') });
    await createAdapterWalletPersistence({ persistence }).putBalance({
      ownerId, pageMilliturns: 100000, companionMilliturns: 0,
      grantedPageMilliturns: 100000, grantedCompanionMilliturns: 0,
    });
    server = await startBackend({ ...options, dataDir });
    const session = await apiRequest(server, '/session', { method: 'POST', headers: auth });
    assert.equal(session.status, 201);
    const headers = { ...auth, 'X-Client-Token': session.json.client_token };
    const created = await apiRequest(server, '/screenplay/projects', { method: 'POST', headers, json: { title: 'Refused edit fixture' } });
    assert.equal(created.status, 201);
    const id = created.json.project_id || created.json.project?.id;
    assert.ok(id);
    const draft = 'INT. OBSERVATORY - NIGHT\n\nMARA\nKeep every word in this saved draft.';
    const saved = await apiRequest(server, `/screenplay/projects/${id}/version`, { method: 'POST', headers, json: { draft } });
    assert.ok([200, 201].includes(saved.status));
    const project = () => apiRequest(server, `/screenplay/projects/${id}?include_drafts=1`, { headers });
    const balance = () => apiRequest(server, '/talk/wallet', { method: 'POST', headers: auth, json: { owner_id: ownerId } });
    const before = await project();
    assert.equal(before.status, 200);
    assert.ok(JSON.stringify(before.json).includes('Keep every word in this saved draft.'));
    const beforeBalance = await balance();
    assert.equal(beforeBalance.status, 200);
    for (const mode of ['client', 'raw_stale_page', 'raw_unhinted']) {
      const form = new FormData();
      if (mode === 'client') form.append('client_transcript', 'Do not rewrite this scene. Just discuss the ending.');
      if (mode !== 'raw_unhinted') {
        form.append('screenplay_generation_transcript', 'Rewrite the last scene.');
        form.append('screenplay_target', 'page');
      }
      form.append('screenplay_project_id', id);
      form.append('screenplay_mode', 'true');
      form.append('max_output_tokens', '400');
      form.append('file', new Blob([fs.readFileSync(new URL('../test.wav', import.meta.url))], { type: 'audio/wav' }), 'test.wav');
      const response = await apiRequest(server, '/talk', { method: 'POST', headers, body: form });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('x-clementine-lane'), 'Companion');
      assert.equal(response.headers.get('x-clementine-page-reservation'), null);
      assert.equal(response.headers.get('x-clementine-reflex'), null, 'ASR discussion must not retain the pre-ASR silence classification');
      assert.equal(response.headers.get('x-clementine-reflex-template'), null);
      assert.notEqual(response.headers.get('x-screenplay-authoritative'), '1');
      assert.notEqual(response.headers.get('x-turn-status'), 'error_recovered');
      assert.deepEqual((await project()).json.project, before.json.project, 'discussion must not mutate/version the screenplay');
      assert.deepEqual((await balance()).json, beforeBalance.json, 'no Page charge after current or authoritative ASR refusal');
    }
    const log = server.stdout.join('');
    assert.equal(log.split('[refusal-fixture] actual generation permission verified').length - 1, 3);
    assert.equal(log.split('[refusal-fixture] ASR supplied current words').length - 1, 2);
  } finally { await server.stop(); }
});
