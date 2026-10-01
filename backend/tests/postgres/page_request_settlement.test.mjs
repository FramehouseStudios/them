// Explicit PostgreSQL proof, separate from the default no-database suite.
// Only an ephemeral localhost database with this synthetic name is permitted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createPersistence } from '../../lib/persistence_adapter.js';
import { createPageRequestLedger } from '../../lib/clementine/page_request_ledger.js';

const url = new URL(process.env.PAGE_REQUEST_TEST_DATABASE_URL || 'postgres://invalid/');
assert.equal(url.hostname, '127.0.0.1', 'Never run this proof against production');
assert.equal(url.pathname, '/them_page_settlement');
assert.equal(url.password, '', 'This isolated trust-auth test must not use credentials');

async function worker() {
  const child = fork(fileURLToPath(new URL('../helpers/page_request_postgres_worker.mjs', import.meta.url)), {
    env: { PAGE_REQUEST_TEST_DATABASE_URL: url.href }, silent: true,
  });
  const ready = once(child, 'message', { signal: AbortSignal.timeout(5000) });
  const pending = new Map();
  child.on('message', message => {
    const callback = pending.get(message.id);
    if (!callback) return;
    pending.delete(message.id);
    clearTimeout(callback.timer);
    if (message.error) callback.reject(new Error(message.error));
    else callback.resolve(message.value);
  });
  assert.equal((await ready)[0].ready, true);
  return {
    run(operation, target, admissionId) {
      return new Promise((resolve, reject) => {
        const id = randomUUID();
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('Worker operation timed out')); }, 5000);
        pending.set(id, { resolve, reject, timer });
        child.send({ id, operation, target, admissionId });
      });
    },
    async close() {
      const exited = once(child, 'exit', { signal: AbortSignal.timeout(5000) });
      child.send({ operation: 'close' });
      try { await exited; }
      finally { if (child.exitCode === null) child.kill(); }
    },
  };
}

test('PostgreSQL: independent processes cannot both stop and finalize the same admission', { timeout: 30000 }, async () => {
  const persistence = createPersistence({ databaseUrl: url.href });
  const ledger = createPageRequestLedger({ persistence });
  const migration = await fs.readFile(new URL('../../migrations/013_page_request_admission.sql', import.meta.url), 'utf8');
  await persistence.query(migration);
  const stopping = await worker(), completing = await worker();
  try {
    for (let iteration = 0; iteration < 40; iteration++) {
      const target = { userId: 'synthetic-writer', sessionId: 'synthetic-session', requestId: randomUUID() };
      const admission = await ledger.admit(target);
      assert.equal(admission.ok, true);
      const operations = iteration % 2
        ? [completing.run('claimCompletion', target, admission.admissionId), stopping.run('stop', target)]
        : [stopping.run('stop', target), completing.run('claimCompletion', target, admission.admissionId)];
      const results = await Promise.all(operations);
      const [stop, completion] = iteration % 2 ? results.toReversed() : results;
      assert.notEqual(stop.ok, completion.ok, 'Exactly one CAS transition must win');
      const record = await ledger.read(target);
      assert.equal(record.state, stop.ok ? 'cancelled' : 'finishing');
      assert.equal(stop.ok ? completion.code : stop.code,
        stop.ok ? 'page_generation_cancelled' : 'page_request_finalizing');
    }
  } finally { await stopping.close(); await completing.close(); await persistence.close(); }
});

test('PostgreSQL: worker reconstruction cannot regenerate an acknowledged stopped request', { timeout: 15000 }, async () => {
  const target = { userId: 'synthetic-writer', sessionId: 'synthetic-session', requestId: randomUUID() };
  const first = await worker();
  try { assert.equal((await first.run('stop', target)).ok, true); }
  finally { await first.close(); }
  const restarted = await worker();
  try {
    assert.deepEqual(await restarted.run('admit', target), { ok: false, code: 'page_generation_cancelled' });
  } finally { await restarted.close(); }
});
