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
import { createWalletStore } from '../lib/clementine/wallet.js';
import { createPageReservationStore } from '../lib/clementine/page_cancel.js';
import { createPageLaneTalkAdapter } from '../lib/clementine/page_lane_adapter.js';

for (const reply of ['empty', 'prose']) {
test(`real /talk rejected ${reply} preserves history and wallet balance`, { timeout: 60000 }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'them-billing-handler-'));
  const persistence = createJsonPersistence({ jsonRoot: path.join(dataDir, 'persistence') });
  await createAdapterWalletPersistence({ persistence }).putBalance({
    ownerId: 'billing-writer', pageMilliturns: 100000, companionMilliturns: 0,
    grantedPageMilliturns: 100000, grantedCompanionMilliturns: 0,
  });
  const stub = fileURLToPath(new URL('./helpers/billing_provider_stub.mjs', import.meta.url));
  const server = await startBackend({ dataDir, env: {
    NODE_OPTIONS: `--import=${stub}`, REQUIRE_USER_AUTH: '0',
    TALK_TEST_DEBUG_TRANSCRIPT_ENABLED: '1', TALK_TEST_DEBUG_OFFLINE_ENABLED: '0',
    CHAT_STREAM_ENABLED: '0', TALK_STREAM_AUDIO_ENABLED: '0',
    CLEMENTINE_SHORT_FILM_BETA: '1', CLEMENTINE_MUSE_ENABLED: '0',
    CLEMENTINE_PROVIDER: 'openai',
    BILLING_TEST_REPLY: reply,
  } });
  try {
    const session = await apiRequest(server, '/session', { method: 'POST' });
    assert.equal(session.status, 201);
    const headers = { 'X-Client-Token': session.json.client_token };
    const balance = async () => (await apiRequest(server, '/talk/wallet', {
      method: 'POST', json: { owner_id: 'billing-writer' },
    })).json;
    const beforeBalance = await balance();
    const before = await apiRequest(server, '/state', { headers });
    assert.equal(before.status, 200);
    const form = new FormData();
    form.append('debug_transcript', 'A 15 pages horror short film, one location bedroom, three characters John Sally Sam. Write first five pages.');
    form.append('screenplay_target', 'page');
    form.append('user_id', 'billing-writer');
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
    assert.deepEqual(await balance(), beforeBalance, 'Failed generation must restore the wallet hold');
  } finally {
    await server.stop();
  }
});
}

for (const outcome of ['success', 'recovery', 'disconnect', 'throw']) {
  test(`adapter settles wallet once on ${outcome}`, async () => {
    const wallet = createWalletStore({ initialBalances: { writer: { page: 10 } } });
    const res = Object.assign(new EventEmitter(), {
      statusCode: 200, setHeader() {},
      getHeader: () => outcome === 'recovery' ? 'error_recovered' : '',
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
