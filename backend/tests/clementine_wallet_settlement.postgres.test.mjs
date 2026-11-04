import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

import { createPostgresWalletPersistence } from "../lib/clementine/wallet_persistence.js";

function taskOwnedDatabaseUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const parsed = new URL(value);
  const localHosts = new Set(["127.0.0.1", "localhost", "host.docker.internal"]);
  if (!localHosts.has(parsed.hostname) || parsed.pathname !== "/t1122") {
    throw new Error("refusing PostgreSQL proof outside task-owned loopback database /t1122");
  }
  return value;
}

const databaseUrl = taskOwnedDatabaseUrl(process.env.T1122_DATABASE_URL);

test("[wallet-settlement/pg] duplicate concurrency, rollback and credit composition", {
  skip: !databaseUrl && "T1122_DATABASE_URL is not configured",
}, async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 8 });
  const persistence = createPostgresWalletPersistence({ client: pool });
  const suffix = randomUUID().replaceAll("-", "");
  const ownerId = `t1122-owner-${suffix}`;
  const duplicateKey = `t1122-duplicate-${suffix}`;
  const failureKey = `t1122-failure-${suffix}`;
  const composedKey = `t1122-composed-${suffix}`;
  const transactionId = `t1122-credit-${suffix}`;
  const functionName = `t1122_reject_${suffix}`;
  const triggerName = `t1122_reject_trigger_${suffix}`;
  try {
    await pool.query(
      `INSERT INTO wallet_balances (
         owner_id, companion_milliturns, page_milliturns,
         granted_companion_milliturns, granted_page_milliturns
       ) VALUES ($1, 0, 10000, 0, 10000)`,
      [ownerId]
    );

    const duplicate = {
      settlementKey: duplicateKey,
      ownerId,
      lane: "page",
      settledMilliturns: 200,
      actualOutputTokens: 80,
    };
    const results = await Promise.all(
      Array.from({ length: 12 }, () => persistence.applyTalkSettlement(duplicate))
    );
    assert.equal(results.filter((result) => !result.alreadySettled).length, 1);
    assert.equal((await persistence.getBalance(ownerId)).pageMilliturns, 9_800);

    await pool.query(`
      CREATE FUNCTION ${functionName}()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.settlement_key LIKE 't1122-failure-%' THEN
          RAISE EXCEPTION 'injected T-1122 settlement failure';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER ${triggerName}
      BEFORE INSERT ON wallet_talk_settlements
      FOR EACH ROW EXECUTE FUNCTION ${functionName}();
    `);
    await assert.rejects(
      persistence.applyTalkSettlement({
        ...duplicate,
        settlementKey: failureKey,
      }),
      /injected T-1122 settlement failure/
    );
    assert.equal((await persistence.getBalance(ownerId)).pageMilliturns, 9_800);
    assert.equal(await persistence.getTalkSettlement(failureKey), null);
    await pool.query(`DROP TRIGGER ${triggerName} ON wallet_talk_settlements`);
    await pool.query(`DROP FUNCTION ${functionName}()`);

    await Promise.all([
      persistence.applyTalkSettlement({
        ...duplicate,
        settlementKey: composedKey,
      }),
      persistence.creditPackAtomic({
        ownerId,
        transactionId,
        pageMilliturns: 5_000,
        pageTurnsCredited: 5,
      }),
    ]);
    assert.equal((await persistence.getBalance(ownerId)).pageMilliturns, 14_600);
    assert.ok(await persistence.getTalkSettlement(composedKey));
    assert.ok(await persistence.getIapTransaction(transactionId));
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON wallet_talk_settlements`).catch(() => {});
    await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`).catch(() => {});
    await pool.query("DELETE FROM wallet_talk_settlements WHERE owner_id = $1", [ownerId]).catch(() => {});
    await pool.query("DELETE FROM iap_transactions WHERE owner_id = $1", [ownerId]).catch(() => {});
    await pool.query("DELETE FROM wallet_balances WHERE owner_id = $1", [ownerId]).catch(() => {});
    await pool.end();
  }
});
