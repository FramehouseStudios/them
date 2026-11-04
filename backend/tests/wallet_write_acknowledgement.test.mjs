import test from 'node:test';
import assert from 'node:assert/strict';
import { createWalletStore } from '../lib/clementine/wallet.js';

test('wallet flush reports a failed acknowledged legacy debit', async () => {
  const wallet = createWalletStore({
    initialBalances: { writer: { page: 10 } },
    persistence: { async putBalance() { throw new Error('injected durable write failure'); } },
  });
  const hold = wallet.reserve({ ownerId: 'writer', lane: 'page', maxOutputTokens: 400 });
  assert.equal(wallet.commit(hold.reservationId, 80).ok, true);
  await assert.rejects(wallet.flush(), /injected durable write failure/);
});

test('wallet persistence queues immutable snapshots rather than later mutable balances', async () => {
  const rows = [];
  const wallet = createWalletStore({
    initialBalances: { writer: { page: 10 } },
    persistence: { async putBalance(row) { rows.push(structuredClone(row)); } },
  });
  wallet.credit({ ownerId: 'writer', lane: 'page', turns: 1 });
  wallet.credit({ ownerId: 'writer', lane: 'page', turns: 2 });
  await wallet.flush();
  assert.deepEqual(rows.map(row => row.pageMilliturns), [11000, 13000]);
});
