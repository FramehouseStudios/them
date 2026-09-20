import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createPageReservationStore } from '../lib/clementine/page_cancel.js';
import { mountPageCancelRoute } from '../lib/talk_pipeline.js';
import { createPageLaneTalkAdapter } from '../lib/clementine/page_lane_adapter.js';
import { startBackend, apiRequest } from './helpers/backend_test_server.mjs';

// Exercise the production route/store. Identity is supplied by trusted test
// middleware, not a caller-controlled HTTP header or a duplicate fake handler.
async function withOwner(principal, run) {
  const released = [];
  const store = createPageReservationStore({ walletStore: { release: id => released.push(id) } });
  const victim = store.reserve({ sessionId: 'shared', userId: 'victim', meta: { walletReservationId: 'victim-wallet' } });
  const own = store.reserve({ sessionId: 'shared', userId: 'writer', meta: { walletReservationId: 'writer-wallet' } });
  const legacy = store.reserve({ sessionId: 'shared' });
  const app = express();
  app.use((req, _res, next) => { if (principal) req.authUser = { id: principal }; next(); });
  mountPageCancelRoute(app, { pageReservationStore: store });
  app.post('/talk', express.json(), createPageLaneTalkAdapter({
    pageReservationStore: store, logger: { log() {}, warn() {} },
    handleTalkRequest: (req, res) => res.json({
      gate: req.clementine.proceed(), aborted: req.clementine.abortSignal?.aborted,
    }),
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const post = async (body, path = '/talk/page-cancel', headers = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body), signal: AbortSignal.timeout(2000),
    });
    return { status: response.status, body: await response.json() };
  };
  try { await run({ store, victim, own, legacy, released, post }); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('foreign reservation ID cannot abort or release another writer wallet', async () => {
  await withOwner('writer', async ({ store, victim, released, post }) => {
    const result = await post({ reservation_id: victim.id, user_id: 'victim' });
    assert.equal(result.status, 404);
    assert.equal(store.get(victim.id).aborted, false);
    assert.equal(store.get(victim.id).status, 'reserved');
    assert.deepEqual(released, []);
  });
});

test('session cancellation uses authenticated owner, not forged body identity', async () => {
  await withOwner('writer', async ({ store, victim, own, legacy, released, post }) => {
    const result = await post({ session_id: 'shared', user_id: 'victim', userId: 'victim' });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.dropped, [own.id]);
    assert.equal(store.get(victim.id).aborted, false);
    assert.equal(store.get(legacy.id).aborted, false);
    assert.deepEqual(released, ['writer-wallet']);
  });
});

test('anonymous cancellation fails closed without releasing funds', async () => {
  await withOwner(null, async ({ store, own, released, post }) => {
    const result = await post({ reservation_id: own.id, user_id: 'writer' });
    assert.equal(result.status, 401);
    assert.equal(store.get(own.id).aborted, false);
    assert.deepEqual(released, []);
  });
});

test('owner cancellation remains idempotent and releases only once', async () => {
  await withOwner('writer', async ({ own, released, post }) => {
    const first = await post({ reservation_id: own.id });
    const second = await post({ reservation_id: own.id });
    assert.equal(first.status, 200);
    assert.equal(first.body.cancelled, true);
    assert.equal(second.status, 200);
    assert.equal(second.body.cancelled, false);
    assert.deepEqual(released, ['writer-wallet']);
  });
});

test('delayed cancellation targets its request, not a newer turn in the same session', async () => {
  await withOwner('writer', async ({ store, released, post }) => {
    const old = store.reserve({ sessionId: 'shared', userId: 'writer',
      meta: { requestId: 'old-turn', walletReservationId: 'old-wallet' } });
    const next = store.reserve({ sessionId: 'shared', userId: 'writer',
      meta: { requestId: 'next-turn', walletReservationId: 'next-wallet' } });
    const result = await post({ session_id: 'shared', request_id: 'old-turn' }, '/talk/page-cancel/request');
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.dropped, [old.id]);
    assert.equal(store.get(next.id).aborted, false);
    assert.deepEqual(released, ['old-wallet']);
  });
});

test('cancellation arriving before reservation prevents only that request from proceeding', async () => {
  await withOwner('writer', async ({ store, released, post }) => {
    const result = await post({ session_id: 'shared', request_id: 'queued-turn' }, '/talk/page-cancel/request');
    assert.equal(result.status, 200);
    const stopped = store.reserve({ sessionId: 'shared', userId: 'writer',
      meta: { requestId: 'queued-turn', walletReservationId: 'queued-wallet' } });
    const next = store.reserve({ sessionId: 'shared', userId: 'writer',
      meta: { requestId: 'next-turn' } });
    assert.equal(store.proceed(stopped.id).ok, false);
    assert.equal(store.proceed(next.id).ok, true);
    assert.deepEqual(released, ['queued-wallet']);
  });
});

test('request endpoint never falls back to broad cancellation for a missing ID', async () => {
  await withOwner('writer', async ({ store, own, released, post }) => {
    const result = await post({ session_id: 'shared' }, '/talk/page-cancel/request');
    assert.equal(result.status, 400);
    assert.equal(store.get(own.id).aborted, false);
    assert.deepEqual(released, []);
  });
});

test('early stop reaches the production talk adapter through the request header', async () => {
  await withOwner('writer', async ({ post }) => {
    await post({ session_id: 'shared', request_id: 'wire-turn' }, '/talk/page-cancel/request');
    const stopped = await post({ session_id: 'shared', screenplay_target: 'page',
      text: 'Write the opening scene.' }, '/talk', { 'x-clementine-page-request': 'wire-turn' });
    assert.equal(stopped.status, 200);
    assert.equal(stopped.body.gate.ok, false);
    assert.equal(stopped.body.aborted, true);
  });
});

test('request stop is owner/session isolated and retry releases once', async () => {
  await withOwner('writer', async ({ store, released, post }) => {
    const victim = store.reserve({ sessionId: 'shared', userId: 'victim', meta: { requestId: 'same' } });
    const elsewhere = store.reserve({ sessionId: 'elsewhere', userId: 'writer', meta: { requestId: 'same' } });
    const own = store.reserve({ sessionId: 'shared', userId: 'writer',
      meta: { requestId: 'same', walletReservationId: 'only-own' } });
    const body = { session_id: 'shared', request_id: 'same', user_id: 'victim' };
    const first = await post(body, '/talk/page-cancel/request');
    const repeat = await post(body, '/talk/page-cancel/request');
    assert.deepEqual(first.body.dropped, [own.id]);
    assert.deepEqual(repeat.body.dropped, []);
    assert.equal(store.get(victim.id).aborted, false);
    assert.equal(store.get(elsewhere.id).aborted, false);
    assert.deepEqual(released, ['only-own']);
  });
});

test('malformed request IDs never trigger a session-wide stop', async () => {
  await withOwner('writer', async ({ store, own, released, post }) => {
    for (const request_id of ['', ' ', {}, 1, 'x'.repeat(129)]) {
      const result = await post({ session_id: 'shared', request_id }, '/talk/page-cancel/request');
      assert.equal(result.status, 400);
    }
    assert.equal(store.get(own.id).aborted, false);
    assert.deepEqual(released, []);
  });
});

test('early-stop capacity fails explicitly without forgetting an earlier stop', () => {
  const store = createPageReservationStore();
  for (let i = 0; i < 10000; i++) {
    assert.equal(store.cancelRequest({ sessionId: 's', userId: 'u', requestId: String(i) }).ok, true);
  }
  assert.equal(store.cancelRequest({ sessionId: 's', userId: 'u', requestId: 'overflow' }).ok, false);
  assert.equal(store.cancelRequest({ sessionId: 's', userId: 'u', requestId: '0' }).ok, true);
  const stopped = store.reserve({ sessionId: 's', userId: 'u', meta: { requestId: '0' } });
  assert.equal(store.proceed(stopped.id).ok, false);
});

test('real backend accepts account bearer auth and rejects anonymous cancellation', async () => {
  const server = await startBackend();
  try {
    const signup = await apiRequest(server, '/auth/signup', {
      method: 'POST', json: { email: 'page-owner@example.com', password: 'local-page-owner-test-password' },
    });
    assert.equal(signup.status, 201);
    const headers = { Authorization: `Bearer ${signup.json.token || signup.json.access_token}` };
    const missing = await apiRequest(server, '/talk/page-cancel', {
      method: 'POST', headers, json: { reservation_id: 'not-a-real-reservation', user_id: 'forged-owner' },
    });
    assert.equal(missing.status, 404);
    assert.equal(missing.json.error, 'reservation_not_found');
    const anonymous = await apiRequest(server, '/talk/page-cancel', {
      method: 'POST', json: { reservation_id: 'not-a-real-reservation', user_id: 'forged-owner' },
    });
    assert.equal(anonymous.status, 401);
  } finally { await server.stop(); }
});
