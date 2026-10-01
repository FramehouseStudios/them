import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import express from 'express';
import { createPersistence } from '../lib/persistence_adapter.js';
import { createWalletStore } from '../lib/clementine/wallet.js';
import { createPageReservationStore } from '../lib/clementine/page_cancel.js';
import { createPageLaneTalkAdapter } from '../lib/clementine/page_lane_adapter.js';
import { mountPageCancelRoute } from '../lib/talk_pipeline.js';
import { listenEphemeral } from './helpers/ephemeral_server.mjs';

function latch() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function serve(persistence, wallet, handler) {
  const store = createPageReservationStore({ persistence, walletStore: wallet });
  const app = express();
  app.use((req, _res, next) => { req.authUser = { id: 'writer' }; next(); });
  mountPageCancelRoute(app, { pageReservationStore: store });
  const wrapped = createPageLaneTalkAdapter({ pageReservationStore: store, walletStore: wallet,
    logger: { log() {}, warn() {} }, handleTalkRequest: handler });
  app.post('/talk', express.json(), (req, res, next) => wrapped(req, res).catch(next));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ code: error.code }));
  const server = listenEphemeral(app);
  await once(server, 'listening');
  return {
    async post(endpoint, body, headers = {}) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`, {
        method: 'POST', headers: { 'content-type': 'application/json', connection: 'close', ...headers },
        body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
      });
      return { status: response.status, body: await response.json() };
    },
    write() { return this.post('/talk', { session_id: 'session', screenplay_target: 'page',
      text: 'Write the opening scene.', max_output_tokens: 400 }, { 'x-clementine-page-request': 'turn' }); },
    stop() { return this.post('/talk/page-cancel/request', { session_id: 'session', request_id: 'turn' }); },
    async close() { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); },
  };
}

async function withStores(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'them-page-settlement-'));
  try {
    await run(() => createPersistence({ jsonRoot: root, databaseUrl: '' }),
      createWalletStore({ initialBalances: { writer: { page: 10 } } }));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('an acknowledged stop wins before completion: no page publication or charge', async () => {
  await withStores(async (persistence, wallet) => {
    const ready = latch(), resume = latch();
    let published = 0, reservationId;
    const writer = await serve(persistence(), wallet, async (req, res) => {
      reservationId = req.clementine.walletReservationId;
      req.clementine.commitWallet(123);
      ready.resolve();
      await resume.promise;
      await req.clementine.claimCompletion?.();
      published++;
      return res.json({ draft: 'INT. ROOM - DAY\nA door opens.' });
    });
    const cancelling = await serve(persistence(), null, async (_req, res) => res.json({}));
    const result = writer.write();
    try {
      await ready.promise;
      assert.equal((await cancelling.stop()).status, 200);
      resume.resolve();
      assert.equal((await result).status, 409);
      assert.equal(published, 0);
      assert.equal(wallet.getReservation(reservationId).status, 'released');
      assert.equal(wallet.getBalance('writer').pageTurnsLeft, 10);
    } finally {
      resume.resolve();
      await result.catch(() => {});
      await writer.close(); await cancelling.close();
    }
  });
});

test('completion wins first: late stop is explicitly rejected, not falsely acknowledged', async () => {
  await withStores(async (persistence, wallet) => {
    const ready = latch(), resume = latch();
    let reservationId, pageReservationId;
    const writer = await serve(persistence(), wallet, async (req, res) => {
      reservationId = req.clementine.walletReservationId;
      pageReservationId = req.clementine.reservationId;
      req.clementine.commitWallet(123);
      await req.clementine.claimCompletion?.();
      ready.resolve();
      await resume.promise;
      return res.json({ draft: 'INT. ROOM - DAY\nA door opens.' });
    });
    const cancelling = await serve(persistence(), null, async (_req, res) => res.json({}));
    const result = writer.write();
    try {
      await ready.promise;
      const stop = await cancelling.stop();
      assert.equal(stop.status, 409);
      assert.equal(stop.body.code, 'page_request_finalizing');
      assert.notEqual(stop.body.ok, true);
      const byReservation = await writer.post('/talk/page-cancel', { reservation_id: pageReservationId });
      assert.equal(byReservation.status, 409, 'Reservation endpoint must not bypass the CAS fence');
      const bySession = await writer.post('/talk/page-cancel', { session_id: 'session' });
      assert.equal(bySession.status, 200);
      assert.equal(bySession.body.cancelled, false);
      assert.deepEqual(bySession.body.dropped, [], 'Bulk stop must not claim it stopped finalizing work');
      resume.resolve();
      assert.equal((await result).status, 200);
      assert.equal(wallet.getReservation(reservationId).status, 'committed');
      const repeated = await cancelling.stop();
      assert.equal(repeated.status, 409);
    } finally {
      resume.resolve();
      await result.catch(() => {});
      await writer.close(); await cancelling.close();
    }
  });
});

test('missing completion hook cannot silently charge a durable request', async () => {
  await withStores(async (persistence, wallet) => {
    let reservationId;
    const writer = await serve(persistence(), wallet, async (req, res) => {
      reservationId = req.clementine.walletReservationId;
      req.clementine.commitWallet(123);
      return res.json({ recovery: true });
    });
    try {
      assert.equal((await writer.write()).status, 200);
      assert.equal(wallet.getReservation(reservationId).status, 'released');
      assert.equal(wallet.getBalance('writer').pageTurnsLeft, 10);
    } finally { await writer.close(); }
  });
});

test('completion storage outage preserves the wallet and publishes no page', async () => {
  await withStores(async (persistence, wallet) => {
    const store = persistence();
    const wrapped = { ...store, async compareAndSwap(args) {
      if (args.value.state === 'finishing') throw new Error('synthetic database outage');
      return store.compareAndSwap(args);
    } };
    let published = 0, reservationId;
    const writer = await serve(wrapped, wallet, async (req, res) => {
      reservationId = req.clementine.walletReservationId;
      req.clementine.commitWallet(123);
      await req.clementine.claimCompletion();
      published++;
      return res.json({ draft: 'Never publish this.' });
    });
    try {
      assert.equal((await writer.write()).status, 503);
      assert.equal(published, 0);
      assert.equal(wallet.getReservation(reservationId).status, 'released');
      assert.equal(wallet.getBalance('writer').pageTurnsLeft, 10);
    } finally { await writer.close(); }
  });
});
