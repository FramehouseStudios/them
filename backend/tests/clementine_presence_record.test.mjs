import test from 'node:test';
import assert from 'node:assert/strict';
import { readPresenceRecord, ensurePresenceRecord } from '../lib/clementine/presence_record.js';

test('legacy read is pure; mutation preserves history and rollback key', () => {
  const legacy = { state: 'listening', history: ['idle', 'listening'], updatedAt: 42, lastBargeInAt: 9 };
  const project = { samanthaPresence: structuredClone(legacy) };
  assert.deepEqual(readPresenceRecord(project), legacy);
  assert.equal(Object.hasOwn(project, 'clementinePresence'), false);
  ensurePresenceRecord(project, 100);
  assert.deepEqual(project.clementinePresence, legacy);
  assert.deepEqual(project.samanthaPresence, legacy);
  const restarted = JSON.parse(JSON.stringify(project));
  ensurePresenceRecord(restarted, 200);
  assert.deepEqual(restarted, project, 'retry/restart must not alter timestamps or history');
});

test('canonical record wins without merging conflicting histories', () => {
  const canonical = { state: 'present', history: ['present'], updatedAt: 20 };
  const project = { clementinePresence: canonical, samanthaPresence: { state: 'idle', history: ['idle'], updatedAt: 30 } };
  assert.equal(readPresenceRecord(project), canonical);
  const current = ensurePresenceRecord(project);
  current.history.push('speaking');
  assert.deepEqual(project.samanthaPresence.history, ['present', 'speaking']);
  assert.deepEqual(canonical.history, ['present'], 'do not mutate aliased source objects');
});

test('malformed canonical record falls back to legacy; empty records get defaults', () => {
  for (const bad of [null, [], {}, { state: 'idle', history: 'wrong' }]) {
    const project = { clementinePresence: bad, samanthaPresence: { state: 'present', history: [] } };
    assert.equal(ensurePresenceRecord(project).state, 'present');
  }
  assert.deepEqual(ensurePresenceRecord({}, 42), { state: 'idle', history: [], updatedAt: 42 });
});

test('migration cannot alias presence between separate project records', () => {
  const sharedLegacy = { state: 'idle', history: ['idle'] };
  const first = { samanthaPresence: sharedLegacy };
  const second = { samanthaPresence: sharedLegacy };
  ensurePresenceRecord(first).history.push('present');
  assert.deepEqual(second.samanthaPresence.history, ['idle']);
  assert.equal(Object.hasOwn(second, 'clementinePresence'), false);
});

test('rollback legacy-only writes survive re-upgrade even with equal timestamps', () => {
  const project = { samanthaPresence: { state: 'idle', history: ['idle'], updatedAt: 42 } };
  ensurePresenceRecord(project);
  const oldServer = JSON.parse(JSON.stringify(project));
  oldServer.samanthaPresence.state = 'speaking';
  oldServer.samanthaPresence.history.push('speaking');
  const upgraded = JSON.parse(JSON.stringify(oldServer));
  assert.equal(readPresenceRecord(upgraded).state, 'speaking');
  ensurePresenceRecord(upgraded);
  assert.deepEqual(upgraded.clementinePresence.history, ['idle', 'speaking']);
  assert.deepEqual(upgraded.clementinePresence, upgraded.samanthaPresence);
  const retried = JSON.parse(JSON.stringify(upgraded));
  ensurePresenceRecord(retried);
  assert.deepEqual(retried, upgraded);
});

test('independently changed canonical record still wins over a conflicting legacy write', () => {
  const project = {};
  ensurePresenceRecord(project, 42);
  const restarted = JSON.parse(JSON.stringify(project));
  restarted.clementinePresence.state = 'present';
  restarted.samanthaPresence.state = 'speaking';
  assert.equal(readPresenceRecord(restarted).state, 'present');
});
