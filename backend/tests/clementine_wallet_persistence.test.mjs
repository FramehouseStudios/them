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
  const talkSettlements = new Map();
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
    talkSettlements,
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
      if (q.startsWith("SELECT settlement_key, owner_id") && q.includes("WHERE settlement_key")) {
        const row = talkSettlements.get(params[0]);
        return { rows: row ? [row] : [] };
      }
      if (q.startsWith("WITH inserted AS") && q.includes("INSERT INTO iap_transactions")) {
        const tid = params[0];
        if (iap.has(tid)) return { rows: [] };
        const transaction = {
          transaction_id: tid,
          owner_id: params[1],
          pack_id: params[2],
          companion_turns_credited: params[3],
          page_turns_credited: params[4],
          credited_at: params[5],
          raw_meta: JSON.parse(params[6] || "{}"),
        };
        iap.set(tid, transaction);
        const balance = balances.get(params[1]) || {
          owner_id: params[1], companion_milliturns: 0, page_milliturns: 0,
          granted_companion_milliturns: 0, granted_page_milliturns: 0,
        };
        balance.companion_milliturns += Number(params[7]);
        balance.page_milliturns += Number(params[8]);
        balance.granted_companion_milliturns += Number(params[7]);
        balance.granted_page_milliturns += Number(params[8]);
        balances.set(params[1], balance);
        return { rows: [{ ...transaction, ...balance }] };
      }
      if (q.startsWith("WITH eligible AS") && q.includes("INSERT INTO wallet_talk_settlements")) {
        const [settlementKey, ownerId, lane, settledMilliturns, actualOutputTokens, createdAt, rawMeta] = params;
        if (talkSettlements.has(settlementKey)) return { rows: [] };
        const balance = balances.get(ownerId);
        const laneColumn = lane === "page" ? "page_milliturns" : "companion_milliturns";
        if (!balance || Number(balance[laneColumn]) < Number(settledMilliturns)) return { rows: [] };
        const receipt = {
          settlement_key: settlementKey,
          owner_id: ownerId,
          lane,
          settled_milliturns: Number(settledMilliturns),
          actual_output_tokens: Number(actualOutputTokens),
          created_at: createdAt,
          raw_meta: JSON.parse(rawMeta || "{}"),
        };
        talkSettlements.set(settlementKey, receipt);
        balance[laneColumn] -= Number(settledMilliturns);
        return { rows: [{ ...receipt, ...balance }] };
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
      if (q === "DELETE FROM wallet_talk_settlements") {
        talkSettlements.clear();
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

test("[wallet-settlement] memory receipt debits exactly once and rejects key reuse", async () => {
  const persistence = createMemoryWalletPersistence();
  await persistence.putBalance({
    ownerId: "memory-writer", companionMilliturns: 0, pageMilliturns: 10_000,
    grantedCompanionMilliturns: 0, grantedPageMilliturns: 10_000,
  });
  const settlement = {
    settlementKey: "memory-key", ownerId: "memory-writer", lane: "page",
    settledMilliturns: 200, actualOutputTokens: 200,
  };
  const first = await persistence.applyTalkSettlement(settlement);
  const duplicate = await persistence.applyTalkSettlement(settlement);
  assert.equal(first.alreadySettled, false);
  assert.equal(duplicate.alreadySettled, true);
  assert.equal((await persistence.getBalance("memory-writer")).pageMilliturns, 9_800);
  await assert.rejects(
    persistence.applyTalkSettlement({ ...settlement, settledMilliturns: 201 }),
    (error) => error?.code === "wallet_settlement_conflict"
  );
});

test("[wallet-settlement] postgres atomic CTE makes concurrent duplicate a single debit", async () => {
  const client = makeFakePgClient();
  client.balances.set("pg-writer", {
    owner_id: "pg-writer", companion_milliturns: 0, page_milliturns: 10_000,
    granted_companion_milliturns: 0, granted_page_milliturns: 10_000,
  });
  const persistence = createPostgresWalletPersistence({ client });
  const settlement = {
    settlementKey: "pg-key", ownerId: "pg-writer", lane: "page",
    settledMilliturns: 200, actualOutputTokens: 200,
  };
  const results = await Promise.all([
    persistence.applyTalkSettlement(settlement),
    persistence.applyTalkSettlement(settlement),
  ]);
  assert.deepEqual(results.map((result) => result.alreadySettled).sort(), [false, true]);
  assert.equal(client.balances.get("pg-writer").page_milliturns, 9_800);
  assert.equal(client.talkSettlements.size, 1);
});

test("[wallet-settlement] postgres statement failure leaves no receipt or debit", async () => {
  const client = makeFakePgClient();
  client.balances.set("pg-fail", {
    owner_id: "pg-fail", companion_milliturns: 0, page_milliturns: 10_000,
    granted_companion_milliturns: 0, granted_page_milliturns: 10_000,
  });
  const query = client.query.bind(client);
  let fail = true;
  client.query = async (sql, params) => {
    if (fail && String(sql).replace(/\s+/g, " ").includes("WITH eligible AS")) {
      fail = false;
      throw new Error("injected atomic statement failure");
    }
    return query(sql, params);
  };
  const persistence = createPostgresWalletPersistence({ client });
  const settlement = {
    settlementKey: "pg-fail-key", ownerId: "pg-fail", lane: "page",
    settledMilliturns: 200, actualOutputTokens: 200,
  };
  await assert.rejects(persistence.applyTalkSettlement(settlement), /injected atomic/);
  assert.equal(client.balances.get("pg-fail").page_milliturns, 10_000);
  assert.equal(client.talkSettlements.size, 0);
  await persistence.applyTalkSettlement(settlement);
  assert.equal(client.balances.get("pg-fail").page_milliturns, 9_800);
});

test("[wallet-settlement] postgres credit and debit compose without last-write-wins", async () => {
  const client = makeFakePgClient();
  client.balances.set("pg-compose", {
    owner_id: "pg-compose", companion_milliturns: 0, page_milliturns: 10_000,
    granted_companion_milliturns: 0, granted_page_milliturns: 10_000,
  });
  const persistence = createPostgresWalletPersistence({ client });
  await Promise.all([
    persistence.applyTalkSettlement({ settlementKey: "pg-compose-settle", ownerId: "pg-compose",
      lane: "page", settledMilliturns: 200, actualOutputTokens: 80 }),
    persistence.creditPackAtomic({ ownerId: "pg-compose", transactionId: "pg-compose-credit",
      pageMilliturns: 5_000, pageTurnsCredited: 5 }),
  ]);
  assert.equal(client.balances.get("pg-compose").page_milliturns, 14_800);
  assert.equal(client.talkSettlements.size, 1);
  assert.equal(client.iap.size, 1);
});

test("[wallet-settlement] JSON crash after balance CAS reconciles without a second debit", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-wallet-settlement-"));
  const adapter = createJsonPersistence({ jsonRoot: root });
  const firstPersistence = createAdapterWalletPersistence({ persistence: adapter });
  await firstPersistence.putBalance({
    ownerId: "json-writer", companionMilliturns: 0, pageMilliturns: 10_000,
    grantedCompanionMilliturns: 0, grantedPageMilliturns: 10_000,
  });
  const originalCas = adapter.compareAndSwap.bind(adapter);
  let crashAfterDebit = true;
  adapter.compareAndSwap = async (args) => {
    const changed = await originalCas(args);
    if (changed && crashAfterDebit && args.domain === "wallet_balances") {
      crashAfterDebit = false;
      throw new Error("injected crash after balance CAS");
    }
    return changed;
  };
  const settlement = {
    settlementKey: "json-key", ownerId: "json-writer", lane: "page",
    settledMilliturns: 200, actualOutputTokens: 200,
  };
  await assert.rejects(firstPersistence.applyTalkSettlement(settlement), /injected crash/);
  assert.equal((await firstPersistence.getBalance("json-writer")).pageMilliturns, 9_800);
  adapter.compareAndSwap = originalCas;
  const restarted = createAdapterWalletPersistence({ persistence: adapter });
  const reconciled = await restarted.applyTalkSettlement(settlement);
  assert.equal(reconciled.alreadySettled, true);
  assert.equal((await restarted.getBalance("json-writer")).pageMilliturns, 9_800);
  assert.equal((await restarted.getTalkSettlement("json-key")).status, "completed");
});

test("[wallet-settlement] JSON owner lock serializes distinct concurrent receipts", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-wallet-concurrent-"));
  const adapter = createJsonPersistence({ jsonRoot: root });
  const persistence = createAdapterWalletPersistence({ persistence: adapter });
  await persistence.putBalance({
    ownerId: "json-concurrent", companionMilliturns: 0, pageMilliturns: 10_000,
    grantedCompanionMilliturns: 0, grantedPageMilliturns: 10_000,
  });
  await Promise.all([
    persistence.applyTalkSettlement({ settlementKey: "json-a", ownerId: "json-concurrent",
      lane: "page", settledMilliturns: 200, actualOutputTokens: 80 }),
    persistence.applyTalkSettlement({ settlementKey: "json-b", ownerId: "json-concurrent",
      lane: "page", settledMilliturns: 200, actualOutputTokens: 80 }),
  ]);
  assert.equal((await persistence.getBalance("json-concurrent")).pageMilliturns, 9_600);
  assert.equal((await persistence.getTalkSettlement("json-a")).status, "completed");
  assert.equal((await persistence.getTalkSettlement("json-b")).status, "completed");
});

test("[wallet-settlement] legacy write failure is observable and durable commit remains retryable", async () => {
  const durable = createMemoryWalletPersistence();
  await durable.putBalance({
    ownerId: "retry-writer", companionMilliturns: 0, pageMilliturns: 10_000,
    grantedCompanionMilliturns: 0, grantedPageMilliturns: 10_000,
  });
  let legacyWrites = 0;
  let settlementFails = true;
  const persistence = {
    kind: "injected",
    ...durable,
    async putBalance() {
      legacyWrites += 1;
      throw new Error("injected putBalance failure");
    },
    async applyTalkSettlement(settlement) {
      if (settlementFails) throw new Error("injected settlement failure");
      return durable.applyTalkSettlement(settlement);
    },
  };
  const legacy = createWalletStore({ persistence, initialBalances: { "legacy-writer": { page: 10 } } });
  const legacyReservation = legacy.reserve({ ownerId: "legacy-writer", lane: "page", maxOutputTokens: 1_000 });
  legacy.commit(legacyReservation.reservationId, 200);
  await assert.rejects(legacy.flush(), /injected putBalance failure/);
  assert.equal(legacyWrites, 1);

  const wallet = createWalletStore({ persistence });
  await wallet.hydrate();
  const reservation = wallet.reserve({ ownerId: "retry-writer", lane: "page", maxOutputTokens: 1_000 });
  await assert.rejects(
    wallet.commitDurably(reservation.reservationId, 80, "retry-key"),
    /injected settlement failure/
  );
  assert.equal(wallet.getReservation(reservation.reservationId).status, "reserved");
  assert.equal((await durable.getBalance("retry-writer")).pageMilliturns, 10_000);
  settlementFails = false;
  const committed = await wallet.commitDurably(reservation.reservationId, 80, "retry-key");
  assert.equal(committed.code, "committed");
  assert.equal(wallet.getBalance("retry-writer").pageTurnsLeft, 9.8);
  assert.equal((await durable.getBalance("retry-writer")).pageMilliturns, 9_800);
});

test("[wallet-settlement] committing one receipt preserves other process-local holds", async () => {
  const persistence = createMemoryWalletPersistence();
  await persistence.putBalance({
    ownerId: "parallel-writer", companionMilliturns: 0, pageMilliturns: 10_000,
    grantedCompanionMilliturns: 0, grantedPageMilliturns: 10_000,
  });
  const wallet = createWalletStore({ persistence });
  await wallet.hydrate();
  const first = wallet.reserve({ ownerId: "parallel-writer", lane: "page", maxOutputTokens: 400 });
  const second = wallet.reserve({ ownerId: "parallel-writer", lane: "page", maxOutputTokens: 400 });
  assert.equal(wallet.getBalance("parallel-writer").pageTurnsLeft, 8);
  await wallet.commitDurably(first.reservationId, 80, "parallel-a");
  assert.equal(wallet.getBalance("parallel-writer").pageTurnsLeft, 8.8);
  await wallet.commitDurably(second.reservationId, 80, "parallel-b");
  assert.equal(wallet.getBalance("parallel-writer").pageTurnsLeft, 9.6);
  assert.equal((await persistence.getBalance("parallel-writer")).pageMilliturns, 9_600);
});
