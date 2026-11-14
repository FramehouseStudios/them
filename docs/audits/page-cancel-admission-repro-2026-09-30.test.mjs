import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createPageReservationStore as currentStore } from '/Users/halfmutantfilms/io.them-worktrees/codex-fast-uri-stack/backend/lib/clementine/page_cancel.js';

const repository = '/Users/halfmutantfilms/io.them-worktrees/codex-fast-uri-stack';
const source = execFileSync('git', ['show', 'a7350a91ea4fa141e9a2c7ab407354a6a1e4f9ce:backend/lib/clementine/page_cancel.js'], { cwd: repository, encoding: 'utf8' });
const { createPageReservationStore: proposedStore } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const owner = { sessionId: 'synthetic-session', userId: 'synthetic-owner' };
const reserve = (store, requestId) => store.reserve({ ...owner, meta: { requestId } });

test('current session-wide delayed stop must not cancel newer request', () => {
  const store = currentStore();
  reserve(store, 'older-request');
  const newer = reserve(store, 'newer-request');
  store.cancelByOwner({ ...owner, strictOwner: true });
  assert.equal(store.proceed(newer.id).ok, true, 'a delayed older stop cancelled newer work');
});

test('#635 exact older stop preserves newer request', () => {
  const store = proposedStore();
  const older = reserve(store, 'older-request');
  const newer = reserve(store, 'newer-request');
  assert.equal(store.cancelRequest({ ...owner, requestId: 'older-request' }).ok, true);
  assert.equal(store.proceed(older.id).ok, false);
  assert.equal(store.proceed(newer.id).ok, true);
});

test('#635 early acknowledged stop survives store reconstruction', () => {
  const beforeRestart = proposedStore();
  assert.equal(beforeRestart.cancelRequest({ ...owner, requestId: 'delayed-request' }).ok, true);
  const afterRestart = proposedStore();
  const delayed = reserve(afterRestart, 'delayed-request');
  assert.equal(afterRestart.proceed(delayed.id).ok, false, 'acknowledged stop was forgotten on restart');
});

test('#635 another worker observes acknowledged stop', () => {
  const workerA = proposedStore();
  const workerB = proposedStore();
  assert.equal(workerA.cancelRequest({ ...owner, requestId: 'delayed-request' }).ok, true);
  const delayed = reserve(workerB, 'delayed-request');
  assert.equal(workerB.proceed(delayed.id).ok, false, 'another worker started stopped work');
});

test('#635 owner stop capacity is finite and fail-closed', () => {
  const store = proposedStore({ maxCancelledRequestsPerOwner: 2 });
  for (const requestId of ['one', 'two']) assert.equal(store.cancelRequest({ ...owner, requestId }).ok, true);
  assert.deepEqual(store.cancelRequest({ ...owner, requestId: 'three' }), { ok: false, error: 'page_cancel_owner_capacity' });
  assert.equal(store.proceed(reserve(store, 'one').id).ok, false);
});
