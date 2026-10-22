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
const DOMAIN_TALK_SETTLEMENTS = "wallet_talk_settlements";

function normalizeOwnerId(ownerId) {
  return String(ownerId || "").trim();
}

function normalizeTxnId(transactionId) {
  return String(transactionId || "").trim();
}

function normalizeSettlementKey(settlementKey) {
  return String(settlementKey || "").trim();
}

function normalizeTalkSettlement(input = {}) {
  const settlementKey = normalizeSettlementKey(input.settlementKey);
  const ownerId = normalizeOwnerId(input.ownerId);
  const lane = String(input.lane || "").trim().toLowerCase();
  const settledMilliturns = Math.max(0, Math.round(Number(input.settledMilliturns) || 0));
  const actualOutputTokens = Math.max(0, Math.round(Number(input.actualOutputTokens) || 0));
  if (!settlementKey || !ownerId || !["companion", "page"].includes(lane)) {
    throw new Error("talk settlement requires settlementKey, ownerId and lane");
  }
  return {
    settlementKey,
    ownerId,
    lane,
    settledMilliturns,
    actualOutputTokens,
    createdAt: Math.max(0, Number(input.createdAt || Date.now())),
    meta: input.meta && typeof input.meta === "object" ? { ...input.meta } : null,
  };
}

function assertSameTalkSettlement(existing, expected) {
  if (
    existing.ownerId !== expected.ownerId ||
    existing.lane !== expected.lane ||
    Number(existing.settledMilliturns) !== Number(expected.settledMilliturns) ||
    Number(existing.actualOutputTokens) !== Number(expected.actualOutputTokens)
  ) {
    const error = new Error("talk settlement key was reused with different charge details");
    error.code = "wallet_settlement_conflict";
    throw error;
  }
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
  const talkSettlements = new Map();

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

    async getTalkSettlement(settlementKey) {
      const key = normalizeSettlementKey(settlementKey);
      const row = talkSettlements.get(key);
      return row ? { ...row } : null;
    },

    async applyTalkSettlement(input = {}) {
      const next = normalizeTalkSettlement(input);
      const existing = talkSettlements.get(next.settlementKey);
      if (existing) {
        assertSameTalkSettlement(existing, next);
        return {
          alreadySettled: true,
          settlement: { ...existing },
          balance: await this.getBalance(next.ownerId),
        };
      }
      const balance = balances.get(next.ownerId);
      if (!balance || Number(balance[`${next.lane}Milliturns`] || 0) < next.settledMilliturns) {
        const error = new Error("Wallet empty — not enough turns left");
        error.code = "wallet_empty";
        throw error;
      }
      balance[`${next.lane}Milliturns`] -= next.settledMilliturns;
      talkSettlements.set(next.settlementKey, next);
      return {
        alreadySettled: false,
        settlement: { ...next },
        balance: await this.getBalance(next.ownerId),
      };
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
      talkSettlements.clear();
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

  function mapTalkSettlementRow(row) {
    if (!row) return null;
    return {
      settlementKey: String(row.settlement_key || ""),
      ownerId: String(row.owner_id || ""),
      lane: String(row.lane || ""),
      settledMilliturns: Math.max(0, Number(row.settled_milliturns) || 0),
      actualOutputTokens: Math.max(0, Number(row.actual_output_tokens) || 0),
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      meta: row.raw_meta && typeof row.raw_meta === "object" ? row.raw_meta : null,
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

    async getTalkSettlement(settlementKey) {
      const key = normalizeSettlementKey(settlementKey);
      if (!key) return null;
      const r = await client.query(
        `SELECT settlement_key, owner_id, lane, settled_milliturns,
                actual_output_tokens, created_at, raw_meta
           FROM wallet_talk_settlements WHERE settlement_key = $1`,
        [key]
      );
      return mapTalkSettlementRow(r?.rows?.[0]);
    },

    async applyTalkSettlement(input = {}) {
      const next = normalizeTalkSettlement(input);
      const laneColumn = next.lane === "page"
        ? "page_milliturns"
        : "companion_milliturns";
      const r = await client.query(
        `WITH eligible AS (
           SELECT owner_id
             FROM wallet_balances
            WHERE owner_id = $2 AND ${laneColumn} >= $4
            FOR UPDATE
         ), inserted AS (
           INSERT INTO wallet_talk_settlements (
             settlement_key, owner_id, lane, settled_milliturns,
             actual_output_tokens, created_at, raw_meta
           )
           SELECT $1, $2, $3, $4, $5, $6, $7::jsonb FROM eligible
           ON CONFLICT (settlement_key) DO NOTHING
           RETURNING settlement_key, owner_id, lane, settled_milliturns,
                     actual_output_tokens, created_at, raw_meta
         ), debited AS (
           UPDATE wallet_balances AS balance
              SET ${laneColumn} = balance.${laneColumn} - inserted.settled_milliturns,
                  updated_at = NOW()
             FROM inserted
            WHERE balance.owner_id = inserted.owner_id
           RETURNING balance.owner_id, balance.companion_milliturns,
                     balance.page_milliturns,
                     balance.granted_companion_milliturns,
                     balance.granted_page_milliturns
         )
         SELECT inserted.*, debited.companion_milliturns,
                debited.page_milliturns,
                debited.granted_companion_milliturns,
                debited.granted_page_milliturns
           FROM inserted JOIN debited ON debited.owner_id = inserted.owner_id`,
        [
          next.settlementKey,
          next.ownerId,
          next.lane,
          next.settledMilliturns,
          next.actualOutputTokens,
          new Date(next.createdAt).toISOString(),
          JSON.stringify(next.meta || {}),
        ]
      );
      const inserted = r?.rows?.[0];
      if (inserted) {
        return {
          alreadySettled: false,
          settlement: mapTalkSettlementRow(inserted),
          balance: mapBalanceRow(inserted),
        };
      }
      const existing = await this.getTalkSettlement(next.settlementKey);
      if (existing) {
        assertSameTalkSettlement(existing, next);
        return {
          alreadySettled: true,
          settlement: existing,
          balance: await this.getBalance(next.ownerId),
        };
      }
      const error = new Error("Wallet empty — not enough turns left");
      error.code = "wallet_empty";
      throw error;
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
      const r = await client.query(
        `WITH inserted AS (
           INSERT INTO iap_transactions (
             transaction_id, owner_id, pack_id,
             companion_turns_credited, page_turns_credited,
             credited_at, raw_meta
           ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
           ON CONFLICT (transaction_id) DO NOTHING
           RETURNING transaction_id, owner_id, pack_id,
                     companion_turns_credited, page_turns_credited,
                     credited_at, raw_meta
         ), credited AS (
           INSERT INTO wallet_balances (
             owner_id, companion_milliturns, page_milliturns,
             granted_companion_milliturns, granted_page_milliturns, updated_at
           )
           SELECT owner_id, $8, $9, $8, $9, NOW() FROM inserted
           ON CONFLICT (owner_id) DO UPDATE SET
             companion_milliturns = wallet_balances.companion_milliturns + EXCLUDED.companion_milliturns,
             page_milliturns = wallet_balances.page_milliturns + EXCLUDED.page_milliturns,
             granted_companion_milliturns = wallet_balances.granted_companion_milliturns + EXCLUDED.granted_companion_milliturns,
             granted_page_milliturns = wallet_balances.granted_page_milliturns + EXCLUDED.granted_page_milliturns,
             updated_at = NOW()
           RETURNING owner_id, companion_milliturns, page_milliturns,
                     granted_companion_milliturns, granted_page_milliturns
         )
         SELECT inserted.*, credited.companion_milliturns,
                credited.page_milliturns,
                credited.granted_companion_milliturns,
                credited.granted_page_milliturns
           FROM inserted JOIN credited ON credited.owner_id = inserted.owner_id`,
        [
          tid,
          id,
          packId == null ? null : String(packId),
          Math.max(0, Number(companionTurnsCredited) || 0),
          Math.max(0, Number(pageTurnsCredited) || 0),
          new Date(Number(creditedAt) || Date.now()).toISOString(),
          metaJson,
          cAdd,
          pAdd,
        ]
      );
      const inserted = r?.rows?.[0];
      if (inserted) {
        return {
          alreadyCredited: false,
          transaction: mapIapRow(inserted),
          balance: mapBalanceRow(inserted),
        };
      }
      const existing = await this.getIapTransaction(tid);
      if (!existing) {
        const error = new Error("iap transaction conflict without existing row");
        error.code = "iap_ledger_conflict";
        throw error;
      }
      return {
        alreadyCredited: true,
        transaction: existing,
        balance: await this.getBalance(id),
      };
    },

    async clear() {
      await client.query("DELETE FROM wallet_talk_settlements");
      await client.query("DELETE FROM iap_transactions");
      await client.query("DELETE FROM wallet_balances");
    },
  };
}

/**
 * persistence_adapter-backed backend (JSON file locally; also usable in tests).
 * Domains: wallet_balances, iap_transactions, wallet_talk_settlements.
 * JSON mode is single-process by contract; the owner lock prevents concurrent
 * receipts in that process from mistaking another settlement's balance CAS
 * for their own. Clustered production uses the dedicated Postgres backend.
 */
function createAdapterWalletPersistence({ persistence } = {}) {
  if (!persistence || typeof persistence.get !== "function") {
    throw new Error(
      "createAdapterWalletPersistence requires a persistence adapter"
    );
  }

  function balanceValue(row) {
    return {
      ownerId: row.ownerId,
      companionMilliturns: row.companionMilliturns,
      pageMilliturns: row.pageMilliturns,
      grantedCompanionMilliturns: row.grantedCompanionMilliturns,
      grantedPageMilliturns: row.grantedPageMilliturns,
      updatedAt: Date.now(),
    };
  }

  async function readSettlement(key) {
    const value = await persistence.get({ domain: DOMAIN_TALK_SETTLEMENTS, key });
    return value && typeof value === "object" ? { ...value } : null;
  }

  const settlementLocks = new Map();
  function withSettlementLock(ownerId, fn) {
    const previous = settlementLocks.get(ownerId) || Promise.resolve();
    const next = previous.then(fn);
    const tracked = next.catch(() => {});
    settlementLocks.set(ownerId, tracked);
    return next.finally(() => {
      if (settlementLocks.get(ownerId) === tracked) settlementLocks.delete(ownerId);
    });
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

    async getTalkSettlement(settlementKey) {
      const key = normalizeSettlementKey(settlementKey);
      if (!key) return null;
      const value = await readSettlement(key);
      if (!value) return null;
      const normalized = normalizeTalkSettlement(value);
      return { ...normalized, status: String(value.status || "prepared") };
    },

    async applyTalkSettlement(input = {}) {
      if (typeof persistence.compareAndSwap !== "function") {
        throw new Error("adapter talk settlement requires compareAndSwap");
      }
      const next = normalizeTalkSettlement(input);
      return withSettlementLock(next.ownerId, async () => {
        let receipt = await readSettlement(next.settlementKey);
        if (!receipt) {
          const prepared = { ...next, status: "prepared" };
          const created = await persistence.compareAndSwap({
            domain: DOMAIN_TALK_SETTLEMENTS,
            key: next.settlementKey,
            expectedValue: null,
            value: prepared,
          });
          receipt = created ? prepared : await readSettlement(next.settlementKey);
        }
        assertSameTalkSettlement(receipt, next);
        let appliedByThisCall = false;

        for (let attempt = 0; attempt < 8; attempt += 1) {
          if (receipt.status === "completed") {
            return {
              alreadySettled: !appliedByThisCall,
              settlement: normalizeTalkSettlement(receipt),
              balance: await this.getBalance(next.ownerId),
            };
          }
          if (receipt.status === "applying") {
            const currentBalance = await persistence.get({
              domain: DOMAIN_BALANCES,
              key: next.ownerId,
            });
            if (JSON.stringify(currentBalance) === JSON.stringify(receipt.balanceAfter)) {
              const completed = { ...receipt, status: "completed", completedAt: Date.now() };
              const marked = await persistence.compareAndSwap({
                domain: DOMAIN_TALK_SETTLEMENTS,
                key: next.settlementKey,
                expectedValue: receipt,
                value: completed,
              });
              receipt = marked ? completed : await readSettlement(next.settlementKey);
              continue;
            }
            if (JSON.stringify(currentBalance) !== JSON.stringify(receipt.balanceBefore)) {
              const error = new Error("talk settlement balance changed during recovery");
              error.code = "wallet_settlement_conflict";
              throw error;
            }
            const applied = await persistence.compareAndSwap({
              domain: DOMAIN_BALANCES,
              key: next.ownerId,
              expectedValue: receipt.balanceBefore,
              value: receipt.balanceAfter,
            });
            if (!applied) {
              receipt = await readSettlement(next.settlementKey);
              continue;
            }
            appliedByThisCall = true;
            continue;
          }

          const rawBalance = await persistence.get({
            domain: DOMAIN_BALANCES,
            key: next.ownerId,
          });
          const current = rowFromBalanceValue(next.ownerId, rawBalance);
          const laneField = `${next.lane}Milliturns`;
          if (!rawBalance || current[laneField] < next.settledMilliturns) {
            const error = new Error("Wallet empty — not enough turns left");
            error.code = "wallet_empty";
            throw error;
          }
          current[laneField] -= next.settledMilliturns;
          const applying = {
            ...receipt,
            status: "applying",
            balanceBefore: rawBalance,
            balanceAfter: balanceValue(current),
          };
          const claimed = await persistence.compareAndSwap({
            domain: DOMAIN_TALK_SETTLEMENTS,
            key: next.settlementKey,
            expectedValue: receipt,
            value: applying,
          });
          receipt = claimed ? applying : await readSettlement(next.settlementKey);
        }
        const error = new Error("talk settlement retry budget exhausted");
        error.code = "wallet_settlement_conflict";
        throw error;
      });
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
        await persistence.clear({ domain: DOMAIN_TALK_SETTLEMENTS });
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
  DOMAIN_TALK_SETTLEMENTS,
  emptyBalanceRow,
  createMemoryWalletPersistence,
  createPostgresWalletPersistence,
  createAdapterWalletPersistence,
  createWalletPersistence,
};
