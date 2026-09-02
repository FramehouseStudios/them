// Clementine wallet in turns (D008 build order #5; D011 IAP creditPack;
// T-wallet-postgres-persistence durable balances + IAP ledger).
//
// DI-ready store. Balances are per owner + lane so Page never shares a bill
// with Companion chit-chat. Users see days/weeks framing — never TPM /
// tokens-per-minute in API responses.
//
// Persistence: process memory by default. Inject `persistence` from
// wallet_persistence.js (postgres dedicated tables, adapter domains, or
// memory) so balances + IAP transactionId ledger survive restarts.
// creditPack is async and fail-closed on duplicate transactionId.
// Reservations remain process-local (not durable).
//
// Units: milliturns internally (1000 = 1 turn). Public summaries expose
// whole/fractional turns only.
//
// Formula (published): 1 turn ≈ TOKENS_PER_TURN output tokens.
//   milliturns = ceil(max(0, tokens) / TOKENS_PER_TURN * 1000)
// Reserve holds that cost; commit settles to actual output; release refunds.

import { randomUUID } from "node:crypto";

/** Output tokens billed as one Companion/Page turn (published constant). */
const TOKENS_PER_TURN = 400;

/** Milliturns per full turn. */
const MILLITURNS_PER_TURN = 1000;

/** Rough Companion turns per calm "conversation" for approxConversationsLeft. */
const TURNS_PER_APPROX_CONVERSATION = 20;

/** Warn threshold for product UX (docs / optional flag). */
const LOW_BALANCE_RATIO = 0.1;

const WALLET_LANE = Object.freeze({
  COMPANION: "companion",
  PAGE: "page",
});

const WALLET_LANE_VALUES = Object.freeze([
  WALLET_LANE.COMPANION,
  WALLET_LANE.PAGE,
]);

const WALLET_EMPTY_CODE = "wallet_empty";

function normalizeLane(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s === "page" || s === "p") return WALLET_LANE.PAGE;
  if (s === "companion" || s === "c" || s === "chat") return WALLET_LANE.COMPANION;
  return "";
}

function tokensToMilliturns(tokens, tokensPerTurn = TOKENS_PER_TURN) {
  const t = Math.max(0, Number(tokens) || 0);
  const per = Math.max(1, Number(tokensPerTurn) || TOKENS_PER_TURN);
  if (t <= 0) return 0;
  return Math.ceil((t / per) * MILLITURNS_PER_TURN);
}

function turnsToMilliturns(turns) {
  const n = Math.max(0, Number(turns) || 0);
  return Math.ceil(n * MILLITURNS_PER_TURN);
}

function milliturnsToTurns(milliturns) {
  const m = Math.max(0, Number(milliturns) || 0);
  // Three decimal places of a turn (1 milliturn = 0.001 turn).
  return Math.round(m) / MILLITURNS_PER_TURN;
}

function createWalletEmptyError({
  ownerId = "",
  lane = "",
  neededMilliturns = 0,
  availableMilliturns = 0,
} = {}) {
  const err = new Error("Wallet empty — not enough turns left");
  err.code = WALLET_EMPTY_CODE;
  err.ownerId = String(ownerId || "");
  err.lane = String(lane || "");
  err.neededTurns = milliturnsToTurns(neededMilliturns);
  err.availableTurns = milliturnsToTurns(availableMilliturns);
  return err;
}

/**
 * Compute reservation cost in milliturns from max_output_tokens and/or
 * an explicit estimatedTurns override (turns win when provided).
 */
function estimateReservationMilliturns({
  maxOutputTokens = 0,
  estimatedTurns = null,
  tokensPerTurn = TOKENS_PER_TURN,
} = {}) {
  if (estimatedTurns !== null && estimatedTurns !== undefined && estimatedTurns !== "") {
    const turns = Number(estimatedTurns);
    if (Number.isFinite(turns) && turns > 0) {
      return Math.max(1, turnsToMilliturns(turns));
    }
  }
  const fromTokens = tokensToMilliturns(maxOutputTokens, tokensPerTurn);
  // Always reserve at least a thin slice when a billed call is requested
  // with a positive token cap; zero-token reserve is free (Reflex path).
  if (fromTokens > 0) return fromTokens;
  const caps = Math.max(0, Math.round(Number(maxOutputTokens) || 0));
  return caps > 0 ? 1 : 0;
}

function emptyOwnerBalances() {
  return {
    [WALLET_LANE.COMPANION]: 0,
    [WALLET_LANE.PAGE]: 0,
    grantedCompanion: 0,
    grantedPage: 0,
  };
}

/**
 * Wallet store. Inject a durable `persistence` backend (see
 * wallet_persistence.js) without changing reserve / commit / release /
 * getBalance shapes. creditPack is async when persistence is used and
 * always safe to `await`.
 *
 * @param {object} [opts]
 * @param {() => number} [opts.now]
 * @param {number} [opts.tokensPerTurn] override published constant (tests)
 * @param {Map|object} [opts.initialBalances] ownerId → { companion?, page? } turns
 * @param {object|null} [opts.persistence] durable balances + IAP ledger backend
 */
function createWalletStore({
  now = () => Date.now(),
  tokensPerTurn = TOKENS_PER_TURN,
  initialBalances = null,
  persistence = null,
} = {}) {
  /** @type {Map<string, ReturnType<typeof emptyOwnerBalances>>} */
  const balances = new Map();
  /** @type {Map<string, object>} */
  const reservations = new Map();
  /**
   * Process-local mirror of the IAP ledger. When `persistence` is set this
   * is hydrated from durable storage and updated after successful credits.
   * @type {Set<string>}
   */
  const creditedTransactionIds = new Set();
  /** @type {Map<string, object>} transactionId → last creditPack result snapshot */
  const creditedTransactionMeta = new Map();
  /** @type {Promise<void>} */
  let writeChain = Promise.resolve();

  function enqueuePersist(ownerId) {
    if (!persistence || typeof persistence.putBalance !== "function") {
      return Promise.resolve();
    }
    const id = String(ownerId || "").trim();
    if (!id || !balances.has(id)) return Promise.resolve();
    const row = balances.get(id);
    const job = writeChain.then(() =>
      persistence.putBalance({
        ownerId: id,
        companionMilliturns: row[WALLET_LANE.COMPANION],
        pageMilliturns: row[WALLET_LANE.PAGE],
        grantedCompanionMilliturns: row.grantedCompanion,
        grantedPageMilliturns: row.grantedPage,
      })
    );
    writeChain = job.catch(() => {});
    return job;
  }

  function ensureOwner(ownerId) {
    const id = String(ownerId || "").trim();
    if (!id) {
      const err = new Error("wallet requires ownerId");
      err.code = "wallet_owner_required";
      throw err;
    }
    if (!balances.has(id)) {
      balances.set(id, emptyOwnerBalances());
    }
    return id;
  }

  function getRaw(ownerId) {
    const id = ensureOwner(ownerId);
    return balances.get(id);
  }

  // Seed optional starting packs (turns, not milliturns).
  if (initialBalances && typeof initialBalances === "object") {
    const entries =
      initialBalances instanceof Map
        ? initialBalances.entries()
        : Object.entries(initialBalances);
    for (const [ownerId, pack] of entries) {
      if (!pack || typeof pack !== "object") continue;
      const id = ensureOwner(ownerId);
      const row = balances.get(id);
      const c = turnsToMilliturns(pack.companion ?? pack.companionTurns ?? 0);
      const p = turnsToMilliturns(pack.page ?? pack.pageTurns ?? 0);
      row[WALLET_LANE.COMPANION] += c;
      row[WALLET_LANE.PAGE] += p;
      row.grantedCompanion += c;
      row.grantedPage += p;
    }
  }

  /**
   * Credit turns onto a lane (grants / tests). Prefer creditPack for IAP
   * so a single App Store transactionId covers both meters idempotently.
   */
  function credit({ ownerId, lane, turns = 0 } = {}) {
    const id = ensureOwner(ownerId);
    const laneKey = normalizeLane(lane);
    if (!laneKey) {
      const err = new Error("wallet credit requires lane companion|page");
      err.code = "wallet_lane_invalid";
      throw err;
    }
    const add = turnsToMilliturns(turns);
    const row = balances.get(id);
    row[laneKey] += add;
    if (laneKey === WALLET_LANE.COMPANION) row.grantedCompanion += add;
    else row.grantedPage += add;
    void enqueuePersist(id);
    return getBalance(id);
  }

  function hasCreditedTransaction(transactionId) {
    const tid = String(transactionId || "").trim();
    return Boolean(tid) && creditedTransactionIds.has(tid);
  }

  /**
   * Credit a StoreKit / grant pack onto Companion + Page meters.
   * Idempotent by transactionId — second call returns the same calm
   * balance with alreadyCredited: true and does not add turns again.
   * Fail-closed when durable persistence rejects a duplicate txn id.
   * Always safe to `await` (returns a Promise).
   *
   * @param {object} opts
   * @param {string} opts.ownerId
   * @param {number} [opts.companionTurns]
   * @param {number} [opts.pageTurns]
   * @param {string} opts.transactionId — required (App Store transaction id)
   * @param {object} [opts.meta]
   */
  async function creditPack({
    ownerId,
    companionTurns = 0,
    pageTurns = 0,
    transactionId = "",
    meta = null,
  } = {}) {
    const id = ensureOwner(ownerId);
    const tid = String(transactionId || "").trim();
    if (!tid) {
      const err = new Error("wallet creditPack requires transactionId");
      err.code = "wallet_transaction_required";
      throw err;
    }
    const cTurns = Math.max(0, Number(companionTurns) || 0);
    const pTurns = Math.max(0, Number(pageTurns) || 0);
    const packId =
      meta && typeof meta === "object"
        ? meta.packId || meta.productId || null
        : null;
    const snapshotBase = {
      ownerId: id,
      transactionId: tid,
      companionTurnsCredited: cTurns,
      pageTurnsCredited: pTurns,
      creditedAt: now(),
      meta: meta && typeof meta === "object" ? { ...meta } : null,
      packId,
    };

    if (persistence && typeof persistence.creditPackAtomic === "function") {
      const cMilli = turnsToMilliturns(cTurns);
      const pMilli = turnsToMilliturns(pTurns);
      const atomic = await persistence.creditPackAtomic({
        ownerId: id,
        transactionId: tid,
        packId,
        companionMilliturns: cMilli,
        pageMilliturns: pMilli,
        companionTurnsCredited: cTurns,
        pageTurnsCredited: pTurns,
        creditedAt: snapshotBase.creditedAt,
        meta: snapshotBase.meta,
      });
      const prev = atomic.transaction || creditedTransactionMeta.get(tid);
      creditedTransactionIds.add(tid);
      creditedTransactionMeta.set(tid, {
        ownerId: prev?.ownerId || id,
        transactionId: tid,
        companionTurnsCredited: prev?.companionTurnsCredited ?? cTurns,
        pageTurnsCredited: prev?.pageTurnsCredited ?? pTurns,
        creditedAt: prev?.creditedAt || snapshotBase.creditedAt,
        meta: prev?.meta ?? snapshotBase.meta,
        packId: prev?.packId ?? packId,
      });
      if (atomic.balance) {
        balances.set(id, {
          [WALLET_LANE.COMPANION]: Math.max(
            0,
            Math.round(Number(atomic.balance.companionMilliturns) || 0)
          ),
          [WALLET_LANE.PAGE]: Math.max(
            0,
            Math.round(Number(atomic.balance.pageMilliturns) || 0)
          ),
          grantedCompanion: Math.max(
            0,
            Math.round(Number(atomic.balance.grantedCompanionMilliturns) || 0)
          ),
          grantedPage: Math.max(
            0,
            Math.round(Number(atomic.balance.grantedPageMilliturns) || 0)
          ),
        });
      } else if (!atomic.alreadyCredited) {
        if (cTurns > 0) {
          credit({ ownerId: id, lane: WALLET_LANE.COMPANION, turns: cTurns });
        }
        if (pTurns > 0) {
          credit({ ownerId: id, lane: WALLET_LANE.PAGE, turns: pTurns });
        }
      }
      const balance = getBalance(id);
      return {
        ...balance,
        alreadyCredited: atomic.alreadyCredited === true,
        transactionId: tid,
        companionTurnsCredited: prev?.companionTurnsCredited ?? cTurns,
        pageTurnsCredited: prev?.pageTurnsCredited ?? pTurns,
      };
    }

    if (persistence && typeof persistence.tryInsertIapTransaction === "function") {
      const insert = await persistence.tryInsertIapTransaction({
        transactionId: tid,
        ownerId: id,
        packId,
        companionTurnsCredited: cTurns,
        pageTurnsCredited: pTurns,
        creditedAt: snapshotBase.creditedAt,
        meta: snapshotBase.meta,
      });
      if (!insert.inserted) {
        const prev = insert.row || creditedTransactionMeta.get(tid);
        creditedTransactionIds.add(tid);
        if (prev) {
          creditedTransactionMeta.set(tid, {
            ownerId: prev.ownerId || id,
            transactionId: tid,
            companionTurnsCredited: prev.companionTurnsCredited ?? 0,
            pageTurnsCredited: prev.pageTurnsCredited ?? 0,
            creditedAt: prev.creditedAt || snapshotBase.creditedAt,
            meta: prev.meta ?? null,
            packId: prev.packId ?? packId,
          });
        }
        const balance = getBalance(id);
        return {
          ...balance,
          alreadyCredited: true,
          transactionId: tid,
          companionTurnsCredited: prev?.companionTurnsCredited ?? 0,
          pageTurnsCredited: prev?.pageTurnsCredited ?? 0,
        };
      }
      if (cTurns > 0) {
        credit({ ownerId: id, lane: WALLET_LANE.COMPANION, turns: cTurns });
      }
      if (pTurns > 0) {
        credit({ ownerId: id, lane: WALLET_LANE.PAGE, turns: pTurns });
      }
      creditedTransactionIds.add(tid);
      creditedTransactionMeta.set(tid, snapshotBase);
      await enqueuePersist(id);
      const balance = getBalance(id);
      return {
        ...balance,
        alreadyCredited: false,
        transactionId: tid,
        companionTurnsCredited: cTurns,
        pageTurnsCredited: pTurns,
      };
    }

    if (creditedTransactionIds.has(tid)) {
      const prev = creditedTransactionMeta.get(tid);
      const balance = getBalance(id);
      return {
        ...balance,
        alreadyCredited: true,
        transactionId: tid,
        companionTurnsCredited: prev?.companionTurnsCredited ?? 0,
        pageTurnsCredited: prev?.pageTurnsCredited ?? 0,
      };
    }
    if (cTurns > 0) {
      credit({ ownerId: id, lane: WALLET_LANE.COMPANION, turns: cTurns });
    }
    if (pTurns > 0) {
      credit({ ownerId: id, lane: WALLET_LANE.PAGE, turns: pTurns });
    }
    creditedTransactionIds.add(tid);
    creditedTransactionMeta.set(tid, snapshotBase);
    const balance = getBalance(id);
    return {
      ...balance,
      alreadyCredited: false,
      transactionId: tid,
      companionTurnsCredited: cTurns,
      pageTurnsCredited: pTurns,
    };
  }

  function reserve({
    ownerId,
    lane,
    maxOutputTokens = 0,
    estimatedTurns = null,
    meta = null,
  } = {}) {
    const id = ensureOwner(ownerId);
    const laneKey = normalizeLane(lane);
    if (!laneKey) {
      const err = new Error("wallet reserve requires lane companion|page");
      err.code = "wallet_lane_invalid";
      throw err;
    }
    const cost = estimateReservationMilliturns({
      maxOutputTokens,
      estimatedTurns,
      tokensPerTurn,
    });
    const row = balances.get(id);
    const available = row[laneKey];
    if (cost > available) {
      throw createWalletEmptyError({
        ownerId: id,
        lane: laneKey,
        neededMilliturns: cost,
        availableMilliturns: available,
      });
    }
    row[laneKey] = available - cost;
    const reservationId = randomUUID();
    const entry = {
      reservationId,
      ownerId: id,
      lane: laneKey,
      reservedMilliturns: cost,
      maxOutputTokens: Math.max(0, Math.round(Number(maxOutputTokens) || 0)),
      status: "reserved",
      createdAt: now(),
      committedAt: null,
      releasedAt: null,
      actualOutputTokens: null,
      settledMilliturns: null,
      pageReservationId: null,
      meta: meta && typeof meta === "object" ? { ...meta } : null,
    };
    reservations.set(reservationId, entry);
    void enqueuePersist(id);
    return {
      reservationId,
      ownerId: id,
      lane: laneKey,
      reservedTurns: milliturnsToTurns(cost),
      maxOutputTokens: entry.maxOutputTokens,
      status: entry.status,
    };
  }

  function getReservation(reservationId) {
    const entry = reservations.get(String(reservationId || ""));
    if (!entry) return null;
    return {
      reservationId: entry.reservationId,
      ownerId: entry.ownerId,
      lane: entry.lane,
      reservedTurns: milliturnsToTurns(entry.reservedMilliturns),
      maxOutputTokens: entry.maxOutputTokens,
      status: entry.status,
      actualOutputTokens: entry.actualOutputTokens,
      settledTurns:
        entry.settledMilliturns == null
          ? null
          : milliturnsToTurns(entry.settledMilliturns),
      pageReservationId: entry.pageReservationId,
    };
  }

  /**
   * Link a page-cancel reservation id so cancel can release funds.
   */
  function linkPageReservation(walletReservationId, pageReservationId) {
    const entry = reservations.get(String(walletReservationId || ""));
    if (!entry) return false;
    entry.pageReservationId = String(pageReservationId || "") || null;
    return true;
  }

  /**
   * Settle a reservation against actual output tokens.
   * Refunds unused milliturns when actual < reserved; never charges more
   * than reserved without a second reserve (hard cap at reserved).
   */
  function commit(reservationId, actualOutputTokens = 0) {
    const entry = reservations.get(String(reservationId || ""));
    if (!entry) {
      return { ok: false, code: "wallet_reservation_missing" };
    }
    if (entry.status === "committed") {
      return {
        ok: true,
        code: "already_committed",
        reservation: getReservation(entry.reservationId),
      };
    }
    if (entry.status === "released") {
      return {
        ok: false,
        code: "wallet_reservation_released",
        reservation: getReservation(entry.reservationId),
      };
    }
    const actual = Math.max(0, Math.round(Number(actualOutputTokens) || 0));
    let settled = tokensToMilliturns(actual, tokensPerTurn);
    if (actual > 0 && settled === 0) settled = 1;
    // Cap at reserved — overage would need a fresh reserve.
    if (settled > entry.reservedMilliturns) {
      settled = entry.reservedMilliturns;
    }
    const refund = entry.reservedMilliturns - settled;
    if (refund > 0) {
      const row = balances.get(entry.ownerId) || getRaw(entry.ownerId);
      row[entry.lane] += refund;
      void enqueuePersist(entry.ownerId);
    } else {
      void enqueuePersist(entry.ownerId);
    }
    entry.status = "committed";
    entry.committedAt = now();
    entry.actualOutputTokens = actual;
    entry.settledMilliturns = settled;
    return {
      ok: true,
      code: "committed",
      refundedTurns: milliturnsToTurns(refund),
      settledTurns: milliturnsToTurns(settled),
      reservation: getReservation(entry.reservationId),
    };
  }

  /**
   * Cancel path: return reserved milliturns to the lane balance.
   * Idempotent for already-released; no-op success for committed.
   */
  function release(reservationId) {
    const id = String(reservationId || "");
    const entry = reservations.get(id);
    if (!entry) {
      return { ok: false, code: "wallet_reservation_missing", released: false };
    }
    if (entry.status === "released") {
      return {
        ok: true,
        code: "already_released",
        released: false,
        reservation: getReservation(id),
      };
    }
    if (entry.status === "committed") {
      // Funds already settled — cancel after success does not refund.
      return {
        ok: true,
        code: "already_committed",
        released: false,
        reservation: getReservation(id),
      };
    }
    const row = balances.get(entry.ownerId) || getRaw(entry.ownerId);
    row[entry.lane] += entry.reservedMilliturns;
    entry.status = "released";
    entry.releasedAt = now();
    void enqueuePersist(entry.ownerId);
    return {
      ok: true,
      code: "released",
      released: true,
      refundedTurns: milliturnsToTurns(entry.reservedMilliturns),
      reservation: getReservation(id),
    };
  }

  /**
   * Calm user-facing summary. No TPM / token-rate fields.
   */
  function getBalance(ownerId) {
    const id = ensureOwner(ownerId);
    const row = balances.get(id);
    const companionTurnsLeft = milliturnsToTurns(row[WALLET_LANE.COMPANION]);
    const pageTurnsLeft = milliturnsToTurns(row[WALLET_LANE.PAGE]);
    const approxConversationsLeft = Math.floor(
      companionTurnsLeft / TURNS_PER_APPROX_CONVERSATION
    );
    const grantedC = milliturnsToTurns(row.grantedCompanion);
    const grantedP = milliturnsToTurns(row.grantedPage);
    const lowCompanion =
      grantedC > 0 && companionTurnsLeft / grantedC <= LOW_BALANCE_RATIO;
    const lowPage = grantedP > 0 && pageTurnsLeft / grantedP <= LOW_BALANCE_RATIO;
    return {
      ownerId: id,
      companionTurnsLeft,
      pageTurnsLeft,
      approxConversationsLeft,
      /** Product may surface a soft “running low” at ≤10% of granted pack. */
      lowBalance: lowCompanion || lowPage,
    };
  }

  function clear() {
    balances.clear();
    reservations.clear();
    creditedTransactionIds.clear();
    creditedTransactionMeta.clear();
    if (persistence && typeof persistence.clear === "function") {
      void persistence.clear();
    }
  }

  function size() {
    return reservations.size;
  }

  /**
   * Load durable balances + IAP ledger into process memory.
   * Call once at boot when persistence is configured.
   */
  async function hydrate() {
    if (!persistence) return { balances: 0, transactions: 0 };
    let balanceCount = 0;
    let txnCount = 0;
    if (typeof persistence.listBalances === "function") {
      const rows = await persistence.listBalances();
      for (const row of rows || []) {
        const id = String(row.ownerId || "").trim();
        if (!id) continue;
        balances.set(id, {
          [WALLET_LANE.COMPANION]: Math.max(
            0,
            Math.round(Number(row.companionMilliturns) || 0)
          ),
          [WALLET_LANE.PAGE]: Math.max(
            0,
            Math.round(Number(row.pageMilliturns) || 0)
          ),
          grantedCompanion: Math.max(
            0,
            Math.round(Number(row.grantedCompanionMilliturns) || 0)
          ),
          grantedPage: Math.max(
            0,
            Math.round(Number(row.grantedPageMilliturns) || 0)
          ),
        });
        balanceCount += 1;
      }
    }
    if (typeof persistence.listIapTransactions === "function") {
      const txns = await persistence.listIapTransactions();
      for (const t of txns || []) {
        const tid = String(t.transactionId || "").trim();
        if (!tid) continue;
        creditedTransactionIds.add(tid);
        creditedTransactionMeta.set(tid, {
          ownerId: String(t.ownerId || ""),
          transactionId: tid,
          companionTurnsCredited: t.companionTurnsCredited ?? 0,
          pageTurnsCredited: t.pageTurnsCredited ?? 0,
          creditedAt: t.creditedAt || now(),
          meta: t.meta ?? null,
          packId: t.packId ?? null,
        });
        txnCount += 1;
      }
    }
    return { balances: balanceCount, transactions: txnCount };
  }

  async function flush() {
    await writeChain;
  }

  return {
    reserve,
    commit,
    release,
    getBalance,
    getReservation,
    linkPageReservation,
    credit,
    creditPack,
    hasCreditedTransaction,
    hydrate,
    flush,
    clear,
    size,
    tokensPerTurn,
    persistenceKind: persistence?.kind || "memory",
    /** @deprecated diagnostic — process-local ledger size (not durable). */
    creditedTransactionCount: () => creditedTransactionIds.size,
  };
}

export {
  TOKENS_PER_TURN,
  MILLITURNS_PER_TURN,
  TURNS_PER_APPROX_CONVERSATION,
  LOW_BALANCE_RATIO,
  WALLET_LANE,
  WALLET_LANE_VALUES,
  WALLET_EMPTY_CODE,
  tokensToMilliturns,
  turnsToMilliturns,
  milliturnsToTurns,
  estimateReservationMilliturns,
  createWalletEmptyError,
  createWalletStore,
};
