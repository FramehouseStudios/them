import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { bootstrapClementineWallet } from "../lib/clementine/wallet_bootstrap.js";
import { createJsonPersistence } from "../lib/persistence_json.js";

const logger = { log() {}, error() {} };

test("wallet boot hydrates canonical JSON balances rather than an empty fallback", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "them-wallet-boot-"));
  try {
    const persistence = createJsonPersistence({ jsonRoot: root });
    await persistence.put({ domain: "wallet_balances", key: "writer", value: {
      ownerId: "writer", pageMilliturns: 9800, companionMilliturns: 0,
      grantedPageMilliturns: 10000, grantedCompanionMilliturns: 0,
    } });
    const wallet = await bootstrapClementineWallet({ persistence, logger });
    assert.equal(wallet.getBalance("writer").pageTurnsLeft, 9.8);
  } finally { fs.rmSync(root, { recursive: true }); }
});

test("wallet boot selects dedicated Postgres tables and hydrates before returning", async () => {
  const statements = [];
  const persistence = { kind: "postgres", async query(sql) {
    statements.push(sql);
    return { rows: sql.includes("FROM wallet_balances") ? [{ owner_id: "writer", page_milliturns: 9800 }] : [] };
  } };
  const wallet = await bootstrapClementineWallet({ persistence, logger });
  assert.equal(wallet.getBalance("writer").pageTurnsLeft, 9.8);
  assert.ok(statements.some(sql => sql.includes("FROM iap_transactions")));
  assert.ok(statements.every(sql => !sql.includes("persistence_wallet_balances")));
});

test("wallet boot fails closed on storage error instead of reporting zero funds", async () => {
  const cause = new Error("injected storage failure");
  await assert.rejects(bootstrapClementineWallet({ persistence: { kind: "postgres", async query() { throw cause; } }, logger }),
    error => error.code === "WALLET_STORE_UNAVAILABLE" && error.message === "wallet_store_unavailable" && error.cause === cause);
});
