import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createWalletStore } from "../lib/clementine/wallet.js";
import {
  createMemoryWalletPersistence,
  createPostgresWalletPersistence,
  createAdapterWalletPersistence,
} from "../lib/clementine/wallet_persistence.js";
import { createJsonPersistence } from "../lib/persistence_json.js";

function makeFakePgClient() {
  /** @type {Map<string, object>} */
  const balances = new Map();
  /** @type {Map<string, object>} */
  const iap = new Map();
  let inTx = false;
  let txBalances = null;
  let txIap = null;

  function store(which) {
    if (which === "balances") return inTx ? txBalances : balances;
    return inTx ? txIap : iap;
  }

  return {
    balances,
    iap,
    async query(sql, params = []) {
      const q = sql.replace(/\s+/g, " ").trim();
      if (q === "BEGIN") {
        inTx = true;
        txBalances = new Map(
          [...balances.entries()].map(([k, v]) => [k, { ...v }])
        );
        txIap = new Map([...iap.entries()].map(([k, v]) => [k, { ...v }]));
        return { rowCount: 0, rows: [] };
      }
      if (q === "COMMIT") {
        balances.clear();
        for (const [k, v] of txBalances) balances.set(k, v);
        iap.clear();
        for (const [k, v] of txIap) iap.set(k, v);
        inTx = false;
        txBalances = null;
        txIap = null;
        return { rowCount: 0, rows: [] };
      }
      if (q === "ROLLBACK") {
        inTx = false;
        txBalances = null;
        txIap = null;
        return { rowCount: 0, rows: [] };
      }
      if (q.startsWith("SELECT owner_id, companion_milliturns") && q.includes("WHERE owner_id")) {
        const row = store("balances").get(params[0]);
        return { rows: row ? [row] : [] };
      }
      if (q.startsWith("SELECT owner_id, companion_milliturns") && q.includes("FROM wallet_balances")) {
        return { rows: [...store("balances").values()] };
      }
      if (q.startsWith("SELECT transaction_id, owner_id") && q.includes("WHERE transaction_id")) {
        const row = store("iap").get(params[0]);
        return { rows: row ? [row] : [] };
      }
      if (q.startsWith("SELECT transaction_id, owner_id") && q.includes("FROM iap_transactions")) {
        return { rows: [...store("iap").values()] };
      }
      if (q.startsWith("INSERT INTO iap_transactions") && q.includes("ON CONFLICT")) {
        const tid = params[0];
        if (store("iap").has(tid)) {
          return { rowCount: 0, rows: [] };
        }
        const row = {
          transaction_id: tid,
          owner_id: params[1],
          pack_id: params[2],
          companion_turns_credited: params[3],
          page_turns_credited: params[4],
          credited_at: params[5],
          raw_meta: JSON.parse(params[6] || "{}"),
        };
        store("iap").set(tid, row);
        if (q.includes("RETURNING transaction_id, owner_id")) {
          return { rowCount: 1, rows: [row] };
        }
        return { rowCount: 1, rows: [{ transaction_id: tid }] };
      }
      if (q.startsWith("INSERT INTO wallet_balances")) {
        const id = params[0];
        const existing = store("balances").get(id);
        if (q.includes("wallet_balances.companion_milliturns +")) {
          // atomic add path
          const base = existing || {
            owner_id: id,
            companion_milliturns: 0,
            page_milliturns: 0,
            granted_companion_milliturns: 0,
            granted_page_milliturns: 0,
          };
          const next = {
            owner_id: id,
            companion_milliturns: Number(base.companion_milliturns) + Number(params[1]),
            page_milliturns: Number(base.page_milliturns) + Number(params[2]),
            granted_companion_milliturns:
              Number(base.granted_companion_milliturns) + Number(params[1]),
            granted_page_milliturns:
              Number(base.granted_page_milliturns) + Number(params[2]),
          };
          store("balances").set(id, next);
          return { rowCount: 1, rows: [] };
        }
        const next = {
          owner_id: id,
          companion_milliturns: Number(params[1]),
          page_milliturns: Number(params[2]),
          granted_companion_milliturns: Number(params[3]),
          granted_page_milliturns: Number(params[4]),
        };
        store("balances").set(id, next);
        return { rowCount: 1, rows: [] };
      }
      if (q === "DELETE FROM iap_transactions") {
        store("iap").clear();
        return { rowCount: 1, rows: [] };
      }
      if (q === "DELETE FROM wallet_balances") {
        store("balances").clear();
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`unexpected query in fake pg: ${q}`);
    },
  };
}

test("[wallet-persist] memory backend creditPack is idempotent", async () => {
  const persistence = createMemoryWalletPersistence();
  const wallet = createWalletStore({ persistence });
  const first = await wallet.creditPack({
    ownerId: "alice",
    companionTurns: 10,
    pageTurns: 2,
    transactionId: "txn-m-1",
    meta: { packId: "starter_evening" },
  });
  assert.equal(first.alreadyCredited, false);
  assert.equal(first.companionTurnsLeft, 10);
  const second = await wallet.creditPack({
    ownerId: "alice",
    companionTurns: 10,
    pageTurns: 2,
    transactionId: "txn-m-1",
  });
  assert.equal(second.alreadyCredited, true);
  assert.equal(second.companionTurnsLeft, 10);
  const ledger = await persistence.getIapTransaction("txn-m-1");
  assert.equal(ledger.packId, "starter_evening");
});

test("[wallet-persist] postgres fake client fail-closed double credit + hydrate", async () => {
  const client = makeFakePgClient();
  const persistence = createPostgresWalletPersistence({ client });
  const wallet = createWalletStore({ persistence });
  const first = await wallet.creditPack({
    ownerId: "bob",
    companionTurns: 140,
    pageTurns: 25,
    transactionId: "txn-pg-1",
    meta: { packId: "starter_evening", productId: "io.them.clementine.pack.starter_evening" },
  });
  assert.equal(first.alreadyCredited, false);
  assert.equal(first.companionTurnsLeft, 140);
  assert.equal(first.pageTurnsLeft, 25);
  assert.equal(client.iap.has("txn-pg-1"), true);

  const dup = await wallet.creditPack({
    ownerId: "bob",
    companionTurns: 140,
    pageTurns: 25,
    transactionId: "txn-pg-1",
  });
  assert.equal(dup.alreadyCredited, true);
  assert.equal(dup.companionTurnsLeft, 140);

  // New process-memory store hydrates from durable tables.
  const wallet2 = createWalletStore({
    persistence: createPostgresWalletPersistence({ client }),
  });
  const hydrated = await wallet2.hydrate();
  assert.equal(hydrated.balances, 1);
  assert.equal(hydrated.transactions, 1);
  assert.equal(wallet2.getBalance("bob").companionTurnsLeft, 140);
  assert.equal(wallet2.hasCreditedTransaction("txn-pg-1"), true);
  const again = await wallet2.creditPack({
    ownerId: "bob",
    companionTurns: 140,
    pageTurns: 25,
    transactionId: "txn-pg-1",
  });
  assert.equal(again.alreadyCredited, true);
  assert.equal(again.companionTurnsLeft, 140);
});

test("[wallet-persist] json adapter domains survive re-hydrate", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-wallet-"));
  const adapter = createJsonPersistence({ jsonRoot: root });
  const persistence = createAdapterWalletPersistence({ persistence: adapter });
  const wallet = createWalletStore({ persistence });
  await wallet.creditPack({
    ownerId: "cara",
    companionTurns: 5,
    pageTurns: 1,
    transactionId: "txn-json-1",
    meta: { packId: "page_boost" },
  });
  await wallet.flush();

  const wallet2 = createWalletStore({
    persistence: createAdapterWalletPersistence({ persistence: adapter }),
  });
  await wallet2.hydrate();
  assert.equal(wallet2.getBalance("cara").companionTurnsLeft, 5);
  assert.equal(wallet2.getBalance("cara").pageTurnsLeft, 1);
  const dup = await wallet2.creditPack({
    ownerId: "cara",
    companionTurns: 5,
    pageTurns: 1,
    transactionId: "txn-json-1",
  });
  assert.equal(dup.alreadyCredited, true);
  assert.equal(dup.companionTurnsLeft, 5);
});

test("[wallet-persist] createPostgresWalletPersistence requires client", () => {
  assert.throws(
    () => createPostgresWalletPersistence({}),
    /requires a pg-style client/
  );
});
