// Clementine wallet durable backends (T-wallet-postgres-persistence).
//
// Three implementations share one async contract used by createWalletStore:
//   - memory   — default for tests / no DATABASE_URL
//   - postgres — dedicated wallet_balances + iap_transactions tables
//   - adapter  — persistence_adapter domains (JSON file or persistence_* JSONB)
//
// creditPack is fail-closed on duplicate transaction_id (unique insert /
// compareAndSwap). Balances are milliturns internally.

const DOMAIN_BALANCES = "wallet_balances";
const DOMAIN_IAP = "iap_transactions";

function normalizeOwnerId(ownerId) {
  return String(ownerId || "").trim();
}

function normalizeTxnId(transactionId) {
  return String(transactionId || "").trim();
}

function emptyBalanceRow(ownerId = "") {
  return {
    ownerId: String(ownerId || ""),
    companionMilliturns: 0,
    pageMilliturns: 0,
    grantedCompanionMilliturns: 0,
    grantedPageMilliturns: 0,
  };
}

function rowFromBalanceValue(ownerId, value) {
  const v = value && typeof value === "object" ? value : {};
  return {
    ownerId: String(ownerId || v.ownerId || ""),
    companionMilliturns: Math.max(0, Math.round(Number(v.companionMilliturns) || 0)),
    pageMilliturns: Math.max(0, Math.round(Number(v.pageMilliturns) || 0)),
    grantedCompanionMilliturns: Math.max(
      0,
      Math.round(Number(v.grantedCompanionMilliturns) || 0)
    ),
    grantedPageMilliturns: Math.max(
      0,
      Math.round(Number(v.grantedPageMilliturns) || 0)
    ),
  };
}

function isUniqueViolation(err) {
  return (
    err?.code === "23505" ||
    /duplicate key|unique constraint/i.test(String(err?.message || err || ""))
  );
}

/**
 * In-memory durable backend (also the shape used when no DATABASE_URL).
 */
function createMemoryWalletPersistence() {
  /** @type {Map<string, ReturnType<typeof emptyBalanceRow>>} */
  const balances = new Map();
  /** @type {Map<string, object>} */
  const iap = new Map();

  return {
    kind: "memory",

    async listBalances() {
      return [...balances.values()].map((r) => ({ ...r }));
    },

    async getBalance(ownerId) {
      const id = normalizeOwnerId(ownerId);
      if (!id) return null;
      const row = balances.get(id);
      return row ? { ...row } : null;
    },

    async putBalance(row) {
      const id = normalizeOwnerId(row?.ownerId);
      if (!id) throw new Error("wallet persistence putBalance requires ownerId");
      const next = rowFromBalanceValue(id, row);
      balances.set(id, next);
      return { ...next };
    },

    async getIapTransaction(transactionId) {
      const tid = normalizeTxnId(transactionId);
      if (!tid) return null;
      const row = iap.get(tid);
      return row ? { ...row } : null;
    },

    /**
     * Insert IAP ledger row. Returns { inserted: true, row } or
     * { inserted: false, row: existing } — never double-inserts.
     */
    async tryInsertIapTransaction(entry) {
      const tid = normalizeTxnId(entry?.transactionId);
      if (!tid) throw new Error("iap transaction requires transactionId");
      if (iap.has(tid)) {
        return { inserted: false, row: { ...iap.get(tid) } };
      }
      const row = {
        transactionId: tid,
        ownerId: normalizeOwnerId(entry.ownerId),
        packId: entry.packId == null ? null : String(entry.packId),
        companionTurnsCredited: Math.max(0, Number(entry.companionTurnsCredited) || 0),
        pageTurnsCredited: Math.max(0, Number(entry.pageTurnsCredited) || 0),
        creditedAt: Number(entry.creditedAt) || Date.now(),
        meta:
          entry.meta && typeof entry.meta === "object" ? { ...entry.meta } : null,
      };
      iap.set(tid, row);
      return { inserted: true, row: { ...row } };
    },

    async listIapTransactions() {
      return [...iap.values()].map((r) => ({ ...r }));
    },

    async clear() {
      balances.clear();
      iap.clear();
    },
  };
}

/**
 * Postgres dedicated-table backend (migration 012).
 * @param {object} opts
 * @param {{ query: Function }} opts.client — pg Pool/Client or persistence adapter with .query
 */
function createPostgresWalletPersistence({ client } = {}) {
  if (!client || typeof client.query !== "function") {
    throw new Error(
      "createPostgresWalletPersistence requires a pg-style client with .query()"
    );
  }

  function mapBalanceRow(row) {
    if (!row) return null;
    return {
      ownerId: String(row.owner_id),
      companionMilliturns: Math.max(0, Number(row.companion_milliturns) || 0),
      pageMilliturns: Math.max(0, Number(row.page_milliturns) || 0),
      grantedCompanionMilliturns: Math.max(
        0,
        Number(row.granted_companion_milliturns) || 0
      ),
      grantedPageMilliturns: Math.max(0, Number(row.granted_page_milliturns) || 0),
    };
  }

  function mapIapRow(row) {
    if (!row) return null;
    const meta =
      row.raw_meta && typeof row.raw_meta === "object" ? row.raw_meta : {};
    return {
      transactionId: String(row.transaction_id),
      ownerId: String(row.owner_id || ""),
      packId: row.pack_id == null ? null : String(row.pack_id),
      companionTurnsCredited: Math.max(0, Number(row.companion_turns_credited) || 0),
      pageTurnsCredited: Math.max(0, Number(row.page_turns_credited) || 0),
      creditedAt: row.credited_at
        ? new Date(row.credited_at).getTime()
        : Date.now(),
      meta: Object.keys(meta).length ? meta : null,
    };
  }

  return {
    kind: "postgres",

    async listBalances() {
      const r = await client.query(
        `SELECT owner_id, companion_milliturns, page_milliturns,
                granted_companion_milliturns, granted_page_milliturns
           FROM wallet_balances`
      );
      return (r?.rows || []).map(mapBalanceRow);
    },

    async getBalance(ownerId) {
      const id = normalizeOwnerId(ownerId);
      if (!id) return null;
      const r = await client.query(
        `SELECT owner_id, companion_milliturns, page_milliturns,
                granted_companion_milliturns, granted_page_milliturns
           FROM wallet_balances WHERE owner_id = $1`,
        [id]
      );
      return mapBalanceRow(r?.rows?.[0]);
    },

    async putBalance(row) {
      const id = normalizeOwnerId(row?.ownerId);
      if (!id) throw new Error("wallet persistence putBalance requires ownerId");
      const next = rowFromBalanceValue(id, row);
      await client.query(
        `INSERT INTO wallet_balances (
           owner_id, companion_milliturns, page_milliturns,
           granted_companion_milliturns, granted_page_milliturns, updated_at
         ) VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (owner_id) DO UPDATE SET
           companion_milliturns = EXCLUDED.companion_milliturns,
           page_milliturns = EXCLUDED.page_milliturns,
           granted_companion_milliturns = EXCLUDED.granted_companion_milliturns,
           granted_page_milliturns = EXCLUDED.granted_page_milliturns,
           updated_at = NOW()`,
        [
          next.ownerId,
          next.companionMilliturns,
          next.pageMilliturns,
          next.grantedCompanionMilliturns,
          next.grantedPageMilliturns,
        ]
      );
      return next;
    },

    async getIapTransaction(transactionId) {
      const tid = normalizeTxnId(transactionId);
      if (!tid) return null;
      const r = await client.query(
        `SELECT transaction_id, owner_id, pack_id,
                companion_turns_credited, page_turns_credited,
                credited_at, raw_meta
           FROM iap_transactions WHERE transaction_id = $1`,
        [tid]
      );
      return mapIapRow(r?.rows?.[0]);
    },

    async tryInsertIapTransaction(entry) {
      const tid = normalizeTxnId(entry?.transactionId);
      if (!tid) throw new Error("iap transaction requires transactionId");
      const ownerId = normalizeOwnerId(entry.ownerId);
      const packId = entry.packId == null ? null : String(entry.packId);
      const cTurns = Math.max(0, Number(entry.companionTurnsCredited) || 0);
      const pTurns = Math.max(0, Number(entry.pageTurnsCredited) || 0);
      const creditedAtMs = Number(entry.creditedAt) || Date.now();
      const meta =
        entry.meta && typeof entry.meta === "object" ? { ...entry.meta } : {};
      try {
        const r = await client.query(
          `INSERT INTO iap_transactions (
             transaction_id, owner_id, pack_id,
             companion_turns_credited, page_turns_credited,
             credited_at, raw_meta
           ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
           ON CONFLICT (transaction_id) DO NOTHING
           RETURNING transaction_id, owner_id, pack_id,
                     companion_turns_credited, page_turns_credited,
                     credited_at, raw_meta`,
          [
            tid,
            ownerId,
            packId,
            cTurns,
            pTurns,
            new Date(creditedAtMs).toISOString(),
            JSON.stringify(meta),
          ]
        );
        if (r?.rows?.[0]) {
          return { inserted: true, row: mapIapRow(r.rows[0]) };
        }
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
      const existing = await this.getIapTransaction(tid);
      if (!existing) {
        const err = new Error("iap transaction conflict without existing row");
        err.code = "iap_ledger_conflict";
        throw err;
      }
      return { inserted: false, row: existing };
    },

    async listIapTransactions() {
      const r = await client.query(
        `SELECT transaction_id, owner_id, pack_id,
                companion_turns_credited, page_turns_credited,
                credited_at, raw_meta
           FROM iap_transactions`
      );
      return (r?.rows || []).map(mapIapRow);
    },

    /**
     * Atomically claim a transactionId and apply milliturn credits.
     * Fail-closed: duplicate transaction_id → { alreadyCredited: true }.
     */
    async creditPackAtomic({
      ownerId,
      transactionId,
      packId = null,
      companionMilliturns = 0,
      pageMilliturns = 0,
      companionTurnsCredited = 0,
      pageTurnsCredited = 0,
      creditedAt = Date.now(),
      meta = null,
    } = {}) {
      const id = normalizeOwnerId(ownerId);
      const tid = normalizeTxnId(transactionId);
      if (!id || !tid) {
        throw new Error("creditPackAtomic requires ownerId and transactionId");
      }
      const cAdd = Math.max(0, Math.round(Number(companionMilliturns) || 0));
      const pAdd = Math.max(0, Math.round(Number(pageMilliturns) || 0));
      const metaJson = JSON.stringify(
        meta && typeof meta === "object" ? meta : {}
      );
      await client.query("BEGIN");
      try {
        const ins = await client.query(
          `INSERT INTO iap_transactions (
             transaction_id, owner_id, pack_id,
             companion_turns_credited, page_turns_credited,
             credited_at, raw_meta
           ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
           ON CONFLICT (transaction_id) DO NOTHING
           RETURNING transaction_id`,
          [
            tid,
            id,
            packId == null ? null : String(packId),
            Math.max(0, Number(companionTurnsCredited) || 0),
            Math.max(0, Number(pageTurnsCredited) || 0),
            new Date(Number(creditedAt) || Date.now()).toISOString(),
            metaJson,
          ]
        );
        if (!ins?.rows?.[0]) {
          await client.query("ROLLBACK");
          const existing = await this.getIapTransaction(tid);
          const balance = await this.getBalance(id);
          return {
            alreadyCredited: true,
            transaction: existing,
            balance,
          };
        }
        await client.query(
          `INSERT INTO wallet_balances (
             owner_id, companion_milliturns, page_milliturns,
             granted_companion_milliturns, granted_page_milliturns, updated_at
           ) VALUES ($1, $2, $3, $2, $3, NOW())
           ON CONFLICT (owner_id) DO UPDATE SET
             companion_milliturns = wallet_balances.companion_milliturns + EXCLUDED.companion_milliturns,
             page_milliturns = wallet_balances.page_milliturns + EXCLUDED.page_milliturns,
             granted_companion_milliturns = wallet_balances.granted_companion_milliturns + EXCLUDED.granted_companion_milliturns,
             granted_page_milliturns = wallet_balances.granted_page_milliturns + EXCLUDED.granted_page_milliturns,
             updated_at = NOW()`,
          [id, cAdd, pAdd]
        );
        await client.query("COMMIT");
        const balance = await this.getBalance(id);
        return {
          alreadyCredited: false,
          transaction: {
            transactionId: tid,
            ownerId: id,
            packId: packId == null ? null : String(packId),
            companionTurnsCredited: Math.max(
              0,
              Number(companionTurnsCredited) || 0
            ),
            pageTurnsCredited: Math.max(0, Number(pageTurnsCredited) || 0),
            creditedAt: Number(creditedAt) || Date.now(),
            meta: meta && typeof meta === "object" ? { ...meta } : null,
          },
          balance,
        };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        if (isUniqueViolation(err)) {
          const existing = await this.getIapTransaction(tid);
          const balance = await this.getBalance(id);
          return {
            alreadyCredited: true,
            transaction: existing,
            balance,
          };
        }
        throw err;
      }
    },

    async clear() {
      await client.query("DELETE FROM iap_transactions");
      await client.query("DELETE FROM wallet_balances");
    },
  };
}

/**
 * persistence_adapter-backed backend (JSON file locally; also usable in tests).
 * Domains: wallet_balances, iap_transactions (must be in KNOWN_DOMAINS).
 */
function createAdapterWalletPersistence({ persistence } = {}) {
  if (!persistence || typeof persistence.get !== "function") {
    throw new Error(
      "createAdapterWalletPersistence requires a persistence adapter"
    );
  }

  return {
    kind: "adapter",

    async listBalances() {
      const rows = await persistence.list({
        domain: DOMAIN_BALANCES,
        limit: 10_000,
      });
      return (rows || []).map((r) => rowFromBalanceValue(r.key, r.value));
    },

    async getBalance(ownerId) {
      const id = normalizeOwnerId(ownerId);
      if (!id) return null;
      const value = await persistence.get({ domain: DOMAIN_BALANCES, key: id });
      if (value == null) return null;
      return rowFromBalanceValue(id, value);
    },

    async putBalance(row) {
      const id = normalizeOwnerId(row?.ownerId);
      if (!id) throw new Error("wallet persistence putBalance requires ownerId");
      const next = rowFromBalanceValue(id, row);
      await persistence.put({
        domain: DOMAIN_BALANCES,
        key: id,
        value: {
          ownerId: next.ownerId,
          companionMilliturns: next.companionMilliturns,
          pageMilliturns: next.pageMilliturns,
          grantedCompanionMilliturns: next.grantedCompanionMilliturns,
          grantedPageMilliturns: next.grantedPageMilliturns,
          updatedAt: Date.now(),
        },
      });
      return next;
    },

    async getIapTransaction(transactionId) {
      const tid = normalizeTxnId(transactionId);
      if (!tid) return null;
      const value = await persistence.get({ domain: DOMAIN_IAP, key: tid });
      if (value == null) return null;
      return {
        transactionId: tid,
        ownerId: String(value.ownerId || ""),
        packId: value.packId == null ? null : String(value.packId),
        companionTurnsCredited: Math.max(
          0,
          Number(value.companionTurnsCredited) || 0
        ),
        pageTurnsCredited: Math.max(0, Number(value.pageTurnsCredited) || 0),
        creditedAt: Number(value.creditedAt) || Date.now(),
        meta: value.meta && typeof value.meta === "object" ? value.meta : null,
      };
    },

    async tryInsertIapTransaction(entry) {
      const tid = normalizeTxnId(entry?.transactionId);
      if (!tid) throw new Error("iap transaction requires transactionId");
      const row = {
        transactionId: tid,
        ownerId: normalizeOwnerId(entry.ownerId),
        packId: entry.packId == null ? null : String(entry.packId),
        companionTurnsCredited: Math.max(
          0,
          Number(entry.companionTurnsCredited) || 0
        ),
        pageTurnsCredited: Math.max(0, Number(entry.pageTurnsCredited) || 0),
        creditedAt: Number(entry.creditedAt) || Date.now(),
        meta:
          entry.meta && typeof entry.meta === "object" ? { ...entry.meta } : null,
      };
      if (typeof persistence.compareAndSwap === "function") {
        const ok = await persistence.compareAndSwap({
          domain: DOMAIN_IAP,
          key: tid,
          expectedValue: null,
          value: row,
        });
        if (ok) return { inserted: true, row: { ...row } };
        const existing = await this.getIapTransaction(tid);
        if (!existing) {
          const err = new Error("iap transaction conflict without existing row");
          err.code = "iap_ledger_conflict";
          throw err;
        }
        return { inserted: false, row: existing };
      }
      const existing = await this.getIapTransaction(tid);
      if (existing) return { inserted: false, row: existing };
      await persistence.put({ domain: DOMAIN_IAP, key: tid, value: row });
      return { inserted: true, row: { ...row } };
    },

    async listIapTransactions() {
      const rows = await persistence.list({ domain: DOMAIN_IAP, limit: 10_000 });
      return (rows || []).map((r) => {
        const value = r.value || {};
        return {
          transactionId: String(r.key),
          ownerId: String(value.ownerId || ""),
          packId: value.packId == null ? null : String(value.packId),
          companionTurnsCredited: Math.max(
            0,
            Number(value.companionTurnsCredited) || 0
          ),
          pageTurnsCredited: Math.max(0, Number(value.pageTurnsCredited) || 0),
          creditedAt: Number(value.creditedAt) || Date.now(),
          meta:
            value.meta && typeof value.meta === "object" ? value.meta : null,
        };
      });
    },

    async clear() {
      if (typeof persistence.clear === "function") {
        await persistence.clear({ domain: DOMAIN_BALANCES });
        await persistence.clear({ domain: DOMAIN_IAP });
      }
    },
  };
}

/**
 * Factory: postgres client → dedicated tables; persistence adapter → domains;
 * otherwise memory.
 */
function createWalletPersistence({
  databaseUrl = process.env.DATABASE_URL || "",
  pgClient = null,
  persistence = null,
} = {}) {
  if (pgClient || (persistence && typeof persistence.query === "function" && persistence.kind === "postgres")) {
    return createPostgresWalletPersistence({
      client: pgClient || persistence,
    });
  }
  if (persistence && typeof persistence.get === "function") {
    return createAdapterWalletPersistence({ persistence });
  }
  if (databaseUrl) {
    // Caller should pass a live client; without one, fall back to memory
    // so boot without a pool still works in tests.
    return createMemoryWalletPersistence();
  }
  return createMemoryWalletPersistence();
}

export {
  DOMAIN_BALANCES,
  DOMAIN_IAP,
  emptyBalanceRow,
  createMemoryWalletPersistence,
  createPostgresWalletPersistence,
  createAdapterWalletPersistence,
  createWalletPersistence,
};
