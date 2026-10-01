import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { watch } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startBackend, apiRequest } from './helpers/backend_test_server.mjs';
import { createPersistence } from '../lib/persistence_adapter.js';
import { createAdapterWalletPersistence } from '../lib/clementine/wallet_persistence.js';
import { createPageRequestLedger } from '../lib/clementine/page_request_ledger.js';

async function entered(directory) {
  await new Promise((resolve, reject) => {
    const watcher = watch(directory, check);
    const timer = setTimeout(() => { watcher.close(); reject(new Error('Real handler never reached the injected provider stage')); }, 10000);
    async function check() {
      try { await fs.access(path.join(directory, 'entered')); clearTimeout(timer); watcher.close(); resolve(); }
      catch { /* wait for the subprocess's actual stage */ }
    }
    void check();
  });
}

for (const stage of ['generation', 'tts']) {
  test(`real authenticated /talk honors persisted ${stage === 'generation' ? 'stop' : 'completion'} winner`, { timeout: 60000 }, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'them-page-handler-'));
    const persistence = createPersistence({ jsonRoot: path.join(directory, 'persistence'), databaseUrl: '' });
    const stub = fileURLToPath(new URL('./helpers/page_settlement_provider_stub.mjs', import.meta.url));
    const options = { dataDir: directory, env: {
      NODE_OPTIONS: `--import=${stub}`, REQUIRE_USER_AUTH: '1',
      PAGE_SETTLEMENT_TEST_BARRIER: directory, PAGE_SETTLEMENT_TEST_STAGE: stage,
      TALK_TEST_DEBUG_TRANSCRIPT_ENABLED: '1', TALK_TEST_DEBUG_OFFLINE_ENABLED: '0',
      CHAT_STREAM_ENABLED: '0', TALK_STREAM_AUDIO_ENABLED: '0',
      CLEMENTINE_SHORT_FILM_BETA: '0', CLEMENTINE_MUSE_ENABLED: '0', CLEMENTINE_PROVIDER: 'openai',
    } };
    let server = await startBackend(options), writing;
    try {
      const signup = await apiRequest(server, '/auth/signup', { method: 'POST',
        json: { email: 'settlement-fixture@example.com', password: 'synthetic-fixture-password-123' } });
      assert.equal(signup.status, 201);
      const ownerId = signup.json.user.user_id;
      const auth = { Authorization: `Bearer ${signup.json.token || signup.json.access_token}` };
      await server.stop();
      await createAdapterWalletPersistence({ persistence }).putBalance({ ownerId,
        pageMilliturns: 100000, companionMilliturns: 0,
        grantedPageMilliturns: 100000, grantedCompanionMilliturns: 0 });
      server = await startBackend(options);
      const session = await apiRequest(server, '/session', { method: 'POST', headers: auth });
      assert.equal(session.status, 201);
      const sessionId = session.json.client_token;
      const headers = { ...auth, 'X-Client-Token': sessionId, 'x-clementine-page-request': 'controlled-turn' };
      const balance = async () => (await apiRequest(server, '/talk/wallet', {
        method: 'POST', headers: auth, json: { owner_id: ownerId } })).json;
      const beforeBalance = await balance();
      const beforeState = await apiRequest(server, '/state', { headers });
      const form = new FormData();
      form.append('debug_transcript', 'Write the opening scene in a motel: June confronts Marcus about a receipt.');
      form.append('screenplay_target', 'page');
      form.append('max_output_tokens', '400');
      form.append('file', new Blob([await fs.readFile(new URL('../test.wav', import.meta.url))], { type: 'audio/wav' }), 'test.wav');
      const unsigned = await apiRequest(server, '/talk', { method: 'POST', body: form });
      assert.equal(unsigned.status, 401, 'Auth must be enforced before admission and provider work');
      await assert.rejects(fs.access(path.join(directory, 'entered')));
      writing = apiRequest(server, '/talk', { method: 'POST', headers, body: form });
      await entered(directory);
      const stopped = await apiRequest(server, '/talk/page-cancel/request', { method: 'POST', headers: auth,
        json: { session_id: sessionId, request_id: 'controlled-turn' } });
      assert.equal(stopped.status, stage === 'generation' ? 200 : 409);
      const ledger = createPageRequestLedger({ persistence });
      const record = await ledger.read({ userId: ownerId, sessionId, requestId: 'controlled-turn' });
      assert.equal(record.state, stage === 'generation' ? 'cancelled' : 'finishing');
      await fs.writeFile(path.join(directory, 'resume'), 'continue synthetic transport');
      const response = await writing;
      if (stage === 'generation') {
        assert.equal(response.status, 409);
        assert.equal(response.json.error, 'page_generation_cancelled');
        assert.notEqual(response.headers.get('x-screenplay-authoritative'), '1');
        assert.deepEqual(await balance(), beforeBalance);
        const after = await apiRequest(server, '/state', { headers });
        assert.deepEqual(after.json.history_delta, beforeState.json.history_delta);
      } else {
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('x-screenplay-authoritative'), '1', JSON.stringify({
          turn: response.headers.get('x-turn-status'), error: response.headers.get('x-error-class'),
          quality: response.headers.get('x-screenplay-quality-reason'),
          source: response.headers.get('x-screenplay-target'),
          diagnostic: server.stdout.join('').split('\n').filter(line => line.includes('screenplay_page_quality_exhausted')),
        }));
        assert.notDeepEqual(await balance(), beforeBalance, 'Accepted, delivered output settles its wallet once');
      }
    } finally {
      await fs.writeFile(path.join(directory, 'resume'), 'cleanup');
      await writing?.catch(() => {});
      await server.stop();
      await persistence.close();
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
}
