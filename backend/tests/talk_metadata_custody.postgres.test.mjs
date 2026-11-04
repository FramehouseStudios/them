import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPostgresPersistence } from '../lib/persistence_postgres.js';
import { createTalkTurnStore } from '../lib/talk_turn_store.js';

const databaseUrl = process.env.THEM_METADATA_DATABASE_URL || '';
test('real PostgreSQL restores once and rejects stale metadata cleanup', {
  skip: databaseUrl ? false : 'Task-owned THEM_METADATA_DATABASE_URL is not configured',
}, async () => {
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.pathname, '/t1177', 'Only the explicit isolated T1177 proof database is permitted');
  const persistence = createPostgresPersistence({ databaseUrl });
  let clock = 100_000;
  const owner = `custody-${randomUUID()}`;
  const metadata = { turnId: `${owner}-turn`, userId: owner, requestId: 'accepted',
    createdAt: clock, updatedAt: clock, screenplayOutput: { target: 'page', text: 'INT. CAFÉ - NIGHT\n\nKeep Élodie’s last words. 👩🏽‍🚀\n' } };
  const record = { userId: owner, headers: { 'x-turn-id': metadata.turnId }, turnMetadata: metadata };
  const scope = { userId: owner };
  const makeStore = () => createTalkTurnStore({ persistence, ttlMs: 60_000, now: () => clock });
  try {
    const staleWorker = makeStore();
    await staleWorker.put(metadata);
    const original = (await persistence.list({ domain: 'talk_turns' })).find(row => row.value.turnId === metadata.turnId);
    assert.ok(original);
    clock += 60_001;
    await makeStore().restoreForReplay(record, scope);
    assert.equal(await persistence.compareAndDelete({ domain: 'talk_turns', key: original.key, expectedValue: original.value }), false);
    await staleWorker.put({ ...metadata, turnId: `${owner}-other`, requestId: 'other', createdAt: clock, updatedAt: clock });
    assert.equal((await makeStore().read(metadata.turnId, scope)).screenplayOutput.text, metadata.screenplayOutput.text);
    await persistence.delete({ domain: 'talk_turns', key: original.key });
    await Promise.all(Array.from({ length: 8 }, () => makeStore().restoreForReplay(record, scope)));
    const restored = await persistence.get({ domain: 'talk_turns', key: original.key });
    assert.equal(restored.screenplayOutput.text, metadata.screenplayOutput.text);
    await assert.rejects(makeStore().restoreForReplay(record, { userId: 'another-owner' }), /identity mismatch/);
    assert.equal(await persistence.compareAndDelete({ domain: 'talk_turns', key: original.key, expectedValue: restored }), true);
    assert.equal(await persistence.get({ domain: 'talk_turns', key: original.key }), null);
  } finally {
    const rows = await persistence.list({ domain: 'talk_turns' });
    for (const row of rows) if (row.value.userId === owner) await persistence.delete({ domain: 'talk_turns', key: row.key });
    await persistence.close();
  }
});
