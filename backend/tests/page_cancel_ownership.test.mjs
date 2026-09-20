import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createPageReservationStore } from '../lib/clementine/page_cancel.js';
import { mountPageCancelRoute } from '../lib/talk_pipeline.js';
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
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const post = async body => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/talk/page-cancel`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
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
