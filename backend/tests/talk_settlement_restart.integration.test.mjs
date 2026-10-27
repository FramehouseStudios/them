import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { startBackend, apiRequest } from './helpers/backend_test_server.mjs';
import { createJsonPersistence } from '../lib/persistence_json.js';
import { createAdapterWalletPersistence } from '../lib/clementine/wallet_persistence.js';

for (const { boundary, expireMetadata } of ['prepared', 'debited', 'completed'].flatMap(boundary => [
  { boundary, expireMetadata: false }, { boundary, expireMetadata: true },
])) {
  test(`actual authenticated Page retry settles once after SIGKILL at ${boundary}${expireMetadata ? ' with expired metadata' : ''}`, { timeout: 90_000 }, async () => {
    const options = { unsetEnv: ['DATABASE_URL', 'REDIS_URL'], env: {
      APP_TOKEN: 'settlement-loopback-test', REQUIRE_USER_AUTH: '1',
      CLEMENTINE_PROVIDER: 'openai', CLEMENTINE_MUSE_ENABLED: '0', MUSE_ENABLED: '0', LLM_PROVIDER: 'openai',
      TALK_TEST_DEBUG_TRANSCRIPT_ENABLED: '0', TALK_TEST_DEBUG_OFFLINE_ENABLED: '0',
      TALK_STREAM_AUDIO_ENABLED: '0', CHAT_STREAM_ENABLED: '0', KNOWLEDGE_RAG_EMBEDDINGS_ENABLED: '0',
      THEM_HOME_VOICE_PROVIDER_FIXTURE: '1', THEM_SETTLEMENT_CRASH_MODE: '',
      NODE_OPTIONS: `--import=${new URL('./helpers/settlement_crash_fixture.mjs', import.meta.url).href}`,
    } };
    let server = await startBackend(options);
    try {
      const signup = await apiRequest(server, '/auth/signup', { method: 'POST', json: {
        email: `settlement-${randomUUID()}@example.test`, password: 'Synthetic-settlement-aA1!',
      } });
      assert.equal(signup.status, 201);
      const owner = signup.json.user.user_id;
      const auth = { Authorization: `Bearer ${signup.json.access_token || signup.json.token}` };
      const dataDir = server.dataDir;
      await server.stop();
      const persistence = createJsonPersistence({ jsonRoot: path.join(dataDir, 'persistence') });
      const wallet = createAdapterWalletPersistence({ persistence });
      await wallet.putBalance({ ownerId: owner, pageMilliturns: 100_000, companionMilliturns: 0,
        grantedPageMilliturns: 100_000, grantedCompanionMilliturns: 0 });
      server = await startBackend({ ...options, dataDir, env: { ...options.env, THEM_SETTLEMENT_CRASH_MODE: boundary } });
      const session = await apiRequest(server, '/session', { method: 'POST', headers: auth, json: {} });
      assert.equal(session.status, 201);
      const headers = { ...auth, 'X-Client-Token': session.json.client_token, 'X-APP-TOKEN': options.env.APP_TOKEN };
      const project = await apiRequest(server, '/screenplay/projects', { method: 'POST', headers,
        json: { title: 'Settlement crash recovery' } });
      assert.equal(project.status, 201);
      const projectID = project.json.project_id || project.json.project?.id;
      assert.ok(projectID);
      const key = `crash-${randomUUID()}`;
      const form = () => {
        const body = new FormData();
        body.set('screenplay_project_id', projectID);
        body.set('screenplay_target', 'page');
        body.set('speech_ms', '3000'); body.set('tail_silence_ms', '900');
        body.set('file', new Blob([fs.readFileSync(new URL('../test.wav', import.meta.url))],
          { type: 'audio/wav' }), 'microphone.wav');
        return body;
      };
      const exited = once(server.child, 'exit');
      await assert.rejects(async () => {
        const response = await fetch(server.baseUrl + '/talk', { method: 'POST',
          headers: { ...headers, 'X-Idempotency-Key': key }, body: form(), signal: AbortSignal.timeout(25_000) });
        await response.arrayBuffer();
      }, 'No success may be acknowledged before this injected crash boundary');
      const [, signal] = await exited;
      assert.equal(signal, 'SIGKILL');
      assert.ok(server.stdout.join('').includes(`own-process SIGKILL after ${boundary}`));
      const stored = await persistence.get({ domain: 'talk_idempotency', key: `user:${owner}|${key}` });
      assert.equal(stored.status, boundary === 'completed' ? 'completed' : 'prepared');
      if (boundary !== 'completed') assert.equal(stored.expiresAt, 0);
      assert.equal(stored.settlement.settledMilliturns, 200);
      const expectedBytes = Buffer.from(stored.body.data, 'base64');
      const expectedTurn = stored.headers['x-turn-id'];
      assert.ok(expectedBytes.length && expectedTurn);
      assert.equal((await wallet.getBalance(owner)).pageMilliturns, boundary === 'prepared' ? 100_000 : 99_800);

      if (expireMetadata) {
        const rows = await persistence.list({ domain: 'talk_turns' });
        assert.equal(rows.length, 1);
        // Only this isolated fixture's public metadata is aged. Replay and
        // settlement evidence remain untouched; restart must run the real
        // expiration/pruning code, not a stubbed HTTP response or sleep.
        for (const row of rows) await persistence.put({ domain: 'talk_turns', key: row.key,
          value: { ...row.value, expiresAt: 1 } });
      }

      server = await startBackend({ ...options, dataDir });
      if (expireMetadata) {
        const expired = await apiRequest(server, `/talk/turn/${expectedTurn}`, { headers: auth });
        assert.equal(expired.status, 404, 'Fixture must actually expire public metadata before replay');
      }
      const freshSession = await apiRequest(server, '/session', { method: 'POST', headers: auth, json: {} });
      assert.equal(freshSession.status, 201);
      headers['X-Client-Token'] = freshSession.json.client_token;
      for (let retry = 0; retry < 2; retry++) {
        const replay = await fetch(server.baseUrl + '/talk', { method: 'POST',
          headers: { ...headers, 'X-Idempotency-Key': key }, body: form(), signal: AbortSignal.timeout(15_000) });
        assert.equal(replay.status, 200);
        assert.equal(replay.headers.get('x-idempotency-replay'), '1');
        assert.equal(replay.headers.get('x-turn-id'), expectedTurn);
        assert.deepEqual(Buffer.from(await replay.arrayBuffer()), expectedBytes);
      }
      const balance = await apiRequest(server, '/talk/wallet', { method: 'POST', headers: auth, json: {} });
      assert.equal(balance.json.pageTurnsLeft, 99.8);
      const meta = await apiRequest(server, `/talk/turn/${expectedTurn}`, { headers: auth });
      assert.equal(meta.status, 200, 'Replayed billed audio must retain its full screenplay after public metadata expiry');
      assert.match(meta.json.screenplay_output.text, /HOME VOICE HANDOFF/);
      const receipts = await persistence.list({ domain: 'wallet_talk_settlements' });
      assert.equal(receipts.length, 1);
      assert.equal(receipts[0].value.status, 'completed');
      assert.equal((await persistence.get({ domain: 'talk_idempotency', key: `user:${owner}|${key}` })).status, 'completed');
      const log = server.stdout.join('');
      const providers = Object.fromEntries(['stt', 'chat', 'tts'].map(name => [name, log.split(`mocked_${name}`).length - 1]));
      assert.deepEqual(providers, { stt: 0, chat: 0, tts: 0 });
      console.log(JSON.stringify({ boundary, ownProcessKilled: true, exactReplyReplayedTwice: true,
        durablePageTurns: 99.8, receiptCount: 1, providerCallsAfterRestart: providers, providerMode: 'intercepted' }));
    } finally { await server.stop(); }
  });
}
