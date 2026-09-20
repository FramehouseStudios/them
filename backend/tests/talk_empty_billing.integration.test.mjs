import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startBackend, apiRequest } from './helpers/backend_test_server.mjs';
import { createJsonPersistence } from '../lib/persistence_json.js';
import { createAdapterWalletPersistence } from '../lib/clementine/wallet_persistence.js';
import { EventEmitter } from 'node:events';
import { createServer, request } from 'node:http';
import { createWalletStore } from '../lib/clementine/wallet.js';
import { createPageReservationStore } from '../lib/clementine/page_cancel.js';
import { createPageLaneTalkAdapter } from '../lib/clementine/page_lane_adapter.js';

for (const reply of ['empty', 'prose']) {
test(`real /talk rejected ${reply} preserves history and wallet balance`, { timeout: 60000 }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'them-billing-handler-'));
  const persistence = createJsonPersistence({ jsonRoot: path.join(dataDir, 'persistence') });
  const stub = fileURLToPath(new URL('./helpers/billing_provider_stub.mjs', import.meta.url));
  const options = { dataDir, env: {
    NODE_OPTIONS: `--import=${stub}`, REQUIRE_USER_AUTH: '0',
    TALK_TEST_DEBUG_TRANSCRIPT_ENABLED: '1', TALK_TEST_DEBUG_OFFLINE_ENABLED: '0',
    CHAT_STREAM_ENABLED: '0', TALK_STREAM_AUDIO_ENABLED: '0',
    CLEMENTINE_SHORT_FILM_BETA: '1', CLEMENTINE_MUSE_ENABLED: '0',
    CLEMENTINE_PROVIDER: 'openai',
    BILLING_TEST_REPLY: reply,
  } };
  let server = await startBackend(options);
  try {
    const signup = await apiRequest(server, '/auth/signup', {
      method: 'POST', json: { email: 'billing-fixture@example.com', password: 'billing-fixture-password-123' },
    });
    assert.equal(signup.status, 201);
    const ownerId = signup.json.user.user_id;
    const auth = { Authorization: `Bearer ${signup.json.token || signup.json.access_token}` };
    await server.stop();
    await createAdapterWalletPersistence({ persistence }).putBalance({
      ownerId, pageMilliturns: 100000, companionMilliturns: 0,
      grantedPageMilliturns: 100000, grantedCompanionMilliturns: 0,
    });
    server = await startBackend(options);
    const session = await apiRequest(server, '/session', { method: 'POST', headers: auth });
    assert.equal(session.status, 201);
    const headers = { ...auth, 'X-Client-Token': session.json.client_token };
    const balance = async () => (await apiRequest(server, '/talk/wallet', {
      method: 'POST', headers: auth, json: { owner_id: ownerId },
    })).json;
    const beforeBalance = await balance();
    const before = await apiRequest(server, '/state', { headers });
    assert.equal(before.status, 200);
    const created = await apiRequest(server, '/screenplay/projects', {
      method: 'POST', headers, json: { title: 'Billing preservation fixture' },
    });
    assert.equal(created.status, 201);
    const projectId = created.json.project_id || created.json.project?.id;
    assert.ok(projectId);
    const saved = await apiRequest(server, `/screenplay/projects/${projectId}/version`, {
      method: 'POST', headers, json: { draft: 'INT. CABIN - NIGHT\n\nMARA\nKeep this line exactly as written.' },
    });
    assert.ok([200, 201].includes(saved.status));
    const projectBefore = await apiRequest(server, `/screenplay/projects/${projectId}?include_drafts=1`, { headers });
    assert.equal(projectBefore.status, 200);
    assert.ok(JSON.stringify(projectBefore.json.project).includes('Keep this line exactly as written.'), 'Baseline must contain saved draft text');
    const form = new FormData();
    form.append('debug_transcript', 'A 15 pages horror short film, one location bedroom, three characters John Sally Sam. Write first five pages.');
    form.append('screenplay_target', 'page');
    form.append('screenplay_project_id', projectId);
    form.append('max_output_tokens', '400');
    form.append('file', new Blob([fs.readFileSync(new URL('../test.wav', import.meta.url))], { type: 'audio/wav' }), 'test.wav');
    const result = await apiRequest(server, '/talk', { method: 'POST', headers, body: form });
    assert.notEqual(result.status, 402, 'Seeded wallet must reach generation');
    assert.equal(result.headers.get('x-turn-status'), 'error_recovered');
    assert.ok(server.stdout.join('').includes('[billing-test] provider generation requested'), 'Must reach real provider transport');
    assert.notEqual(result.headers.get('x-screenplay-authoritative'), '1');
    const after = await apiRequest(server, '/state', { headers });
    assert.equal(after.status, 200);
    assert.deepEqual(after.json.history_delta, before.json.history_delta);
    const projectAfter = await apiRequest(server, `/screenplay/projects/${projectId}?include_drafts=1`, { headers });
    assert.equal(projectAfter.status, 200);
    assert.deepEqual(projectAfter.json.project, projectBefore.json.project, 'Rejected generation must preserve saved project');
    assert.deepEqual(await balance(), beforeBalance, 'Failed generation must restore the wallet hold');
    await server.stop();
    server = await startBackend(options);
    const restored = await apiRequest(server, `/screenplay/projects/${projectId}?include_drafts=1`, { headers: auth });
    assert.equal(restored.status, 200);
    assert.deepEqual(restored.json.project, projectBefore.json.project, 'Saved draft must survive backend restart');
    assert.deepEqual(await balance(), beforeBalance, 'Released balance must survive backend restart');
  } finally {
    await server.stop();
  }
});
}

for (const status of ['asked_repeat', 'continue_listening']) {
  test(`HTTP 200 ${status} releases proposed generation charge`, async () => {
    const wallet = createWalletStore({ initialBalances: { writer: { page: 10 } } });
    let reservationId;
    const handler = createPageLaneTalkAdapter({
      walletStore: wallet, pageReservationStore: createPageReservationStore({ walletStore: wallet }),
      handleTalkRequest: async (req, res) => {
        reservationId = req.clementine.walletReservationId;
        req.clementine.commitWallet(123);
        assert.equal(wallet.getReservation(reservationId).status, 'reserved');
        res.setHeader('x-turn-status', status);
        res.end('recovery');
      },
    });
    const server = createServer((req, res) => {
      req.body = { text: 'Write the opening screenplay page.', page_mode: true, user_id: 'writer', max_output_tokens: 400 };
      handler(req, res).catch(error => res.destroy(error));
    });
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const response = await new Promise((resolve, reject) => {
        const req = request(`http://127.0.0.1:${server.address().port}/talk`, {
          method: 'POST', agent: false, signal: AbortSignal.timeout(5000),
        }, resolve);
        req.once('error', reject);
        req.end();
      });
      for await (const _chunk of response) { /* consume complete recovery response */ }
      assert.equal(response.statusCode, 200);
      assert.equal(response.headers['x-turn-status'], status);
      assert.equal(wallet.getReservation(reservationId).status, 'released');
      assert.equal(wallet.getBalance('writer').pageTurnsLeft, 10);
    } finally {
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    }
  });
}

for (const outcome of ['success', 'recovery', 'asked_repeat', 'continue_listening', 'disconnect', 'throw']) {
  test(`adapter settles wallet once on ${outcome}`, async () => {
    const wallet = createWalletStore({ initialBalances: { writer: { page: 10 } } });
    const res = Object.assign(new EventEmitter(), {
      statusCode: 200, setHeader() {},
      getHeader: () => outcome === 'recovery' ? 'error_recovered' : outcome,
    });
    let reservationId;
    const handler = createPageLaneTalkAdapter({
      walletStore: wallet, pageReservationStore: createPageReservationStore({ walletStore: wallet }),
      handleTalkRequest: async req => {
        reservationId = req.clementine.walletReservationId;
        req.clementine.commitWallet(123);
        assert.equal(wallet.getReservation(reservationId).status, 'reserved');
        if (outcome === 'throw') throw new Error('handler failure');
        res.emit(outcome === 'disconnect' ? 'close' : 'finish');
        res.emit('close');
        res.emit('finish');
      },
    });
    const invoke = () => handler({ body: { text: 'Write the opening screenplay page.', page_mode: true, user_id: 'writer', max_output_tokens: 400 } }, res);
    if (outcome === 'throw') await assert.rejects(invoke, /handler failure/);
    else await invoke();
    assert.equal(wallet.getReservation(reservationId).status, outcome === 'success' ? 'committed' : 'released');
    if (outcome !== 'success') assert.equal(wallet.getBalance('writer').pageTurnsLeft, 10);
    else assert.equal(wallet.getReservation(reservationId).actualOutputTokens, 123);
  });
}
