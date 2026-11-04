import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createJsonPersistence } from '../lib/persistence_json.js';
import { createTalkTurnStore } from '../lib/talk_turn_store.js';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'them-metadata-custody-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const persistence = createJsonPersistence({ jsonRoot: root });
  let clock = 100_000;
  const makeStore = (adapter = persistence) => createTalkTurnStore({ persistence: adapter,
    ttlMs: 60_000, now: () => clock });
  const metadata = { turnId: 'turn-7', userId: 'writer-a', sessionId: 'original-session',
    requestId: 'accepted-request', stateVersion: 'version-7', createdAt: clock, updatedAt: clock,
    screenplayOutput: { target: 'page', text: 'INT. CAFÉ — NIGHT\r\n\r\nÉlodie 👩🏽‍🚀 waits. \t\n' } };
  const record = { userId: 'writer-a', headers: { 'x-turn-id': 'turn-7' }, turnMetadata: metadata };
  return { persistence, makeStore, metadata, record, scope: { userId: 'writer-a' },
    expire() { clock += 60_001; } };
}

test('expired accepted text is restored through the same store and survives another restart', async t => {
  const f = fixture(t);
  await f.makeStore().put(f.metadata);
  f.expire();
  const restored = f.makeStore();
  await restored.hydrate();
  assert.equal(await restored.read('turn-7', f.scope), null);
  await restored.restoreForReplay(f.record, f.scope);
  const reopened = f.makeStore();
  await reopened.hydrate();
  const actual = await reopened.read('turn-7', f.scope);
  assert.deepEqual(Buffer.from(actual.screenplayOutput.text), Buffer.from(f.metadata.screenplayOutput.text));
  assert.equal(actual.createdAt, f.metadata.createdAt);
  assert.ok(actual.updatedAt > f.metadata.updatedAt);
});

test('metadata replay rejects another owner and a mismatched public turn ID', async t => {
  const f = fixture(t), store = f.makeStore();
  await assert.rejects(store.restoreForReplay(f.record, { userId: 'writer-b' }), /identity mismatch/);
  await assert.rejects(store.restoreForReplay({ ...f.record, headers: { 'x-turn-id': 'turn-8' } }, f.scope), /identity mismatch/);
  assert.equal((await f.persistence.list({ domain: 'talk_turns' })).length, 0);
});

test('legacy session-only metadata stays bound to its original session', async t => {
  const f = fixture(t), store = f.makeStore();
  const record = { ...f.record, userId: '', turnMetadata: { ...f.metadata, userId: '' } };
  await assert.rejects(store.restoreForReplay(record, { sessionId: 'another-session' }), /identity mismatch/);
  await store.restoreForReplay(record, { sessionId: f.metadata.sessionId });
  assert.equal((await store.read('turn-7', { sessionId: f.metadata.sessionId })).requestId, f.metadata.requestId);
});

test('another accepted publication cannot be overwritten by an older reply', async t => {
  const f = fixture(t), store = f.makeStore();
  const newer = { ...f.metadata, requestId: 'different-request', screenplayOutput: { text: 'NEWER EXACT WORDS' } };
  await store.put(newer);
  await assert.rejects(store.restoreForReplay(f.record, f.scope), /conflicts/);
  assert.equal((await store.read('turn-7', f.scope)).screenplayOutput.text, newer.screenplayOutput.text);
});

test('restoration write failure publishes no cache entry and remains retryable', async t => {
  const f = fixture(t);
  const failing = f.makeStore({ ...f.persistence, compareAndSwap: async () => { throw new Error('disk unavailable'); } });
  await assert.rejects(failing.restoreForReplay(f.record, f.scope), /disk unavailable/);
  assert.equal(failing.get('turn-7', f.scope), null);
  assert.equal((await f.persistence.list({ domain: 'talk_turns' })).length, 0);
  await f.makeStore().restoreForReplay(f.record, f.scope);
  assert.equal((await f.makeStore().read('turn-7', f.scope)).requestId, 'accepted-request');
});

test('concurrent restoration of the same accepted reply converges without duplicate rows', async t => {
  const f = fixture(t);
  await Promise.all(Array.from({ length: 8 }, () => f.makeStore().restoreForReplay(f.record, f.scope)));
  const rows = await f.persistence.list({ domain: 'talk_turns' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].value.screenplayOutput.text, f.metadata.screenplayOutput.text);
});

test('a conflicting publication between read and restore wins without being clobbered', async t => {
  const f = fixture(t);
  const competitor = { ...f.metadata, requestId: 'concurrent-request', screenplayOutput: { text: 'Keep this publication' }, expiresAt: 160_000 };
  const store = f.makeStore({ ...f.persistence, compareAndSwap: async input => {
    await f.persistence.put({ domain: input.domain, key: input.key, value: competitor });
    return f.persistence.compareAndSwap(input);
  } });
  await assert.rejects(store.restoreForReplay(f.record, f.scope), /changed during restoration/);
  assert.equal((await f.makeStore().read('turn-7', f.scope)).screenplayOutput.text, competitor.screenplayOutput.text);
});

test('an old worker cannot prune metadata freshly restored by another worker', async t => {
  const f = fixture(t), oldWorker = f.makeStore();
  await oldWorker.put(f.metadata);
  f.expire();
  await f.makeStore().restoreForReplay(f.record, f.scope);
  await oldWorker.put({ ...f.metadata, turnId: 'turn-8', requestId: 'another-turn',
    createdAt: 160_001, updatedAt: 160_001 });
  const actual = await f.makeStore().read('turn-7', f.scope);
  assert.ok(actual, 'Stale expiration cleanup deleted another worker’s fresh accepted metadata');
  assert.equal(actual.screenplayOutput.text, f.metadata.screenplayOutput.text);
});
