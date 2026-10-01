import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import express from 'express';
import { createPersistence } from '../lib/persistence_adapter.js';
import { createPageRequestLedger } from '../lib/clementine/page_request_ledger.js';
import { createPageReservationStore } from '../lib/clementine/page_cancel.js';
import { createPageLaneTalkAdapter } from '../lib/clementine/page_lane_adapter.js';
import { mountPageCancelRoute } from '../lib/talk_pipeline.js';
import { listenEphemeral } from './helpers/ephemeral_server.mjs';

async function fixture(persistence, owner = 'writer', handler = null) {
  const store = createPageReservationStore({ persistence });
  const app = express();
  let calls = 0;
  app.use((req, _res, next) => { req.authUser = { id: owner }; next(); });
  mountPageCancelRoute(app, { pageReservationStore: store });
  app.post('/talk', express.json(), createPageLaneTalkAdapter({
    pageReservationStore: store, logger: { log() {}, warn() {} },
    handleTalkRequest: async (req, res) => {
      calls++;
      if (handler) return handler(req, res);
      return res.json({ gate: req.clementine.proceed() });
    },
  }));
  const server = listenEphemeral(app);
  await once(server, 'listening');
  return {
    store, calls: () => calls,
    async post(endpoint, body, headers = {}) {
      const result = await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`, {
        method: 'POST', headers: { 'content-type': 'application/json', connection: 'close', ...headers },
        body: JSON.stringify(body), signal: AbortSignal.timeout(3000),
      });
      return { status: result.status, body: await result.json() };
    },
    stop(requestId = 'delayed') {
      return this.post('/talk/page-cancel/request', { session_id: 'session', request_id: requestId });
    },
    write(requestId = 'delayed') {
      return this.post('/talk', { session_id: 'session', screenplay_target: 'page', text: 'Write a scene.' },
        { 'x-clementine-page-request': requestId });
    },
    async close() { await new Promise(resolve => server.close(resolve)); },
  };
}

async function withPersistence(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'them-page-admission-'));
  const persistence = () => createPersistence({ jsonRoot: root, databaseUrl: '' });
  try { await run(persistence); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('acknowledged early stop blocks generation after real persistence reconstruction', async () => {
  await withPersistence(async persistence => {
    const first = await fixture(persistence());
    assert.equal((await first.stop()).status, 200);
    await first.close();
    const reconstructed = await fixture(persistence());
    try {
      assert.equal((await reconstructed.write()).status, 409);
      assert.equal(reconstructed.calls(), 0, 'no provider handler for stopped request');
      assert.equal((await reconstructed.write('newer')).status, 200);
      assert.equal(reconstructed.calls(), 1);
    } finally { await reconstructed.close(); }
  });
});

test('a second store reads the shared stop, not an in-memory hydration snapshot', async () => {
  await withPersistence(async persistence => {
    const a = await fixture(persistence()), b = await fixture(persistence());
    try {
      assert.equal((await a.stop()).status, 200);
      assert.equal((await b.write()).status, 409);
      assert.equal(b.calls(), 0);
    } finally { await a.close(); await b.close(); }
  });
});

test('a stop through a second store aborts an already-running handler', async () => {
  await withPersistence(async persistence => {
    let markEntered;
    const entered = new Promise(resolve => { markEntered = resolve; });
    const running = await fixture(persistence(), 'writer', async (req, res) => {
      const signal = req.clementine.abortSignal;
      markEntered();
      if (!signal.aborted) await once(signal, 'abort', { signal: AbortSignal.timeout(1500) });
      return res.status(409).json({ code: 'page_generation_cancelled' });
    });
    const cancelling = await fixture(persistence());
    try {
      const result = running.write();
      await entered;
      assert.equal((await cancelling.stop()).status, 200);
      assert.equal((await result).status, 409);
      assert.equal(running.calls(), 1);
    } finally { await running.close(); await cancelling.close(); }
  });
});

test('duplicate admitted request cannot generate a second page', async () => {
  await withPersistence(async persistence => {
    const server = await fixture(persistence());
    try {
      assert.equal((await server.write()).status, 200);
      assert.equal((await server.write()).status, 409);
      assert.equal(server.calls(), 1);
    } finally { await server.close(); }
  });
});

test('durable stops remain owner/session isolated', async () => {
  await withPersistence(async persistence => {
    const writer = await fixture(persistence()), other = await fixture(persistence(), 'other');
    try {
      assert.equal((await writer.stop()).status, 200);
      assert.equal((await other.write()).status, 200);
      const elsewhere = await writer.post('/talk', { session_id: 'elsewhere', screenplay_target: 'page', text: 'Write a scene.' },
        { 'x-clementine-page-request': 'delayed' });
      assert.equal(elsewhere.status, 200);
    } finally { await writer.close(); await other.close(); }
  });
});

test('unavailable durable storage neither acknowledges stop nor generates optimistically', async () => {
  const persistence = { kind: 'postgres', async get() { throw new Error('synthetic storage outage'); },
    async compareAndSwap() { throw new Error('synthetic storage outage'); } };
  const server = await fixture(persistence);
  try {
    assert.equal((await server.stop()).status, 503);
    assert.equal((await server.write()).status, 503);
    assert.equal(server.calls(), 0);
  } finally { await server.close(); }
});

test('durable reads reject corrupt or foreign records rather than permit completion', async () => {
  const target = { userId: 'writer', sessionId: 'session', requestId: 'request' };
  let record = null;
  const ledger = createPageRequestLedger({ persistence: {
    async get() { return record; },
    async compareAndSwap({ value }) { record = value; return true; },
  } });
  await ledger.admit(target);
  const valid = { ...record };
  for (const change of [{ ownerId: 'other' }, { sessionHash: 'foreign' },
    { requestHash: 'foreign' }, { schemaVersion: 99 }, { state: 'unknown' }]) {
    record = { ...valid, ...change };
    await assert.rejects(ledger.read(target), /Invalid durable writing turn record/);
  }
  record = valid;
  assert.equal((await ledger.read(target)).state, 'admitted');
});
