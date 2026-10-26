import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createJsonPersistence } from '../lib/persistence_json.js';
import { createTalkTurnStore } from '../lib/talk_turn_store.js';

test('writers with the same public turn number retain independent metadata across restart', async () => {
  const persistence = createJsonPersistence({ jsonRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'them-owner-turn-')) });
  const a = { turnId: 'turn-1', userId: 'writer-a', reply: 'A exact words', updatedAt: Date.now() };
  const b = { turnId: 'turn-1', userId: 'writer-b', reply: 'B exact words', updatedAt: Date.now() };
  const first = createTalkTurnStore({ persistence });
  await first.put(a); await first.put(b);
  assert.equal(first.get('turn-1', { userId: 'writer-a' }).reply, a.reply);
  assert.equal(first.get('turn-1', { userId: 'writer-b' }).reply, b.reply);
  const restarted = createTalkTurnStore({ persistence });
  await restarted.hydrate();
  assert.equal(restarted.get('turn-1', { userId: 'writer-a' }).reply, a.reply);
  assert.equal(restarted.get('turn-1', { userId: 'writer-b' }).reply, b.reply);
  const denied = await restarted.read('turn-1', { userId: 'writer-c' });
  assert.ok(denied.userId !== 'writer-c');
  assert.equal(denied.reply, undefined, 'ambiguous non-owner reads carry only identity for denial, never another screenplay');
});

test('an already-running reader sees another worker publication and does not resurrect a deleted canonical row', async () => {
  const persistence = createJsonPersistence({ jsonRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'them-turn-reader-')) });
  const writer = createTalkTurnStore({ persistence });
  const reader = createTalkTurnStore({ persistence });
  await reader.hydrate();
  const entry = { turnId: 'turn-2', userId: 'writer-a', reply: 'Published later', updatedAt: Date.now() };
  await writer.put(entry);
  assert.equal((await reader.read('turn-2', { userId: 'writer-a' })).reply, entry.reply);
  const rows = await persistence.list({ domain: 'talk_turns' });
  await persistence.delete({ domain: 'talk_turns', key: rows[0].key });
  assert.equal(await reader.read('turn-2', { userId: 'writer-a' }), null);
});
