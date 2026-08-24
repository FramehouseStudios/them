const DEFAULT_PERSISTENCE_PAGE_LIMIT = 10_000;

function normalizePersistencePageLimit(value) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_PERSISTENCE_PAGE_LIMIT;
  return Math.min(DEFAULT_PERSISTENCE_PAGE_LIMIT, parsed);
}

async function listPersistenceRowsPaginated({
  persistence,
  domain,
  pageLimit = DEFAULT_PERSISTENCE_PAGE_LIMIT,
  includeRow,
} = {}) {
  if (!persistence || typeof persistence.list !== "function") {
    throw new Error("listPersistenceRowsPaginated requires list persistence");
  }
  const normalizedDomain = String(domain || "").trim();
  if (!normalizedDomain) {
    throw new Error("listPersistenceRowsPaginated requires domain");
  }
  if (includeRow !== undefined && typeof includeRow !== "function") {
    throw new Error("listPersistenceRowsPaginated includeRow must be a function");
  }

  const safePageLimit = normalizePersistencePageLimit(pageLimit);
  const matchingRows = [];
  const observedCursors = new Set();
  const observedKeys = new Set();
  let afterKey = "";

  while (true) {
    const rows = await persistence.list({
      domain: normalizedDomain,
      afterKey,
      limit: safePageLimit,
    });
    if (!Array.isArray(rows)) {
      throw new Error(`persistence list for domain "${normalizedDomain}" must return an array`);
    }
    if (rows.length > safePageLimit) {
      throw new Error(`persistence list for domain "${normalizedDomain}" exceeded its page limit`);
    }
    if (rows.length === 0) break;

    for (const row of rows) {
      const key = String(row?.key || "");
      if (!key) {
        throw new Error(`persistence list for domain "${normalizedDomain}" returned a row without a key`);
      }
      if (observedKeys.has(key)) {
        throw new Error(
          `persistence pagination for domain "${normalizedDomain}" repeated key "${key}"`
        );
      }
      observedKeys.add(key);
      if (!includeRow || includeRow(row)) matchingRows.push(row);
    }

    if (rows.length < safePageLimit) break;
    const nextAfterKey = String(rows[rows.length - 1]?.key || "");
    if (!nextAfterKey || nextAfterKey === afterKey || observedCursors.has(nextAfterKey)) {
      throw new Error(
        `persistence pagination cursor did not advance for domain "${normalizedDomain}"`
      );
    }
    observedCursors.add(nextAfterKey);
    afterKey = nextAfterKey;
  }

  return matchingRows;
}

async function purgePersistenceRowsForUser({
  persistence,
  userId,
  domains,
  rowBelongsToUser,
  pageLimit = DEFAULT_PERSISTENCE_PAGE_LIMIT,
  maxPasses = 8,
} = {}) {
  if (!persistence || typeof persistence.list !== "function" || typeof persistence.delete !== "function") {
    throw new Error("purgePersistenceRowsForUser requires list/delete persistence");
  }
  if (typeof rowBelongsToUser !== "function") {
    throw new Error("purgePersistenceRowsForUser requires rowBelongsToUser");
  }
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) throw new Error("purgePersistenceRowsForUser requires userId");
  const safeMaxPasses = Math.max(2, Math.min(32, Math.floor(Number(maxPasses) || 8)));
  let deletedRows = 0;
  const deletedByDomain = {};
  for (const domain of Array.isArray(domains) ? domains : []) {
    let domainDeleted = 0;
    let stabilized = false;
    for (let pass = 0; pass < safeMaxPasses; pass += 1) {
      const rows = await listPersistenceRowsPaginated({
        persistence,
        domain,
        pageLimit,
        includeRow: (row) => rowBelongsToUser(row, cleanUserId),
      });
      if (rows.length === 0) {
        stabilized = true;
        break;
      }
      if (pass === safeMaxPasses - 1) break;
      for (const row of rows) {
        await persistence.delete({ domain, key: row.key });
        deletedRows += 1;
        domainDeleted += 1;
      }
    }
    if (!stabilized) {
      throw new Error(
        `account purge for domain "${String(domain || "")}" did not reach a stable empty pass`
      );
    }
    deletedByDomain[domain] = domainDeleted;
  }
  return { deletedRows, deletedByDomain };
}

function createAccountPurgeWorker({
  lifecycleStore,
  purgeUserData,
  logger = console,
  batchSize = 50,
} = {}) {
  if (!lifecycleStore || typeof lifecycleStore.listDueForHardDelete !== "function") {
    throw new Error("createAccountPurgeWorker requires lifecycleStore.listDueForHardDelete");
  }
  if (typeof lifecycleStore.finalizeHardDelete !== "function") {
    throw new Error("createAccountPurgeWorker requires lifecycleStore.finalizeHardDelete");
  }
  if (typeof purgeUserData !== "function") {
    throw new Error("createAccountPurgeWorker requires purgeUserData");
  }
  const safeBatchSize = Math.max(1, Math.min(500, Number(batchSize) || 50));
  let activeRun = null;

  async function execute() {
    const dueUserIds = await lifecycleStore.listDueForHardDelete(safeBatchSize);
    const summary = {
      due: dueUserIds.length,
      purged: 0,
      failed: 0,
      userIds: [],
    };
    for (const rawUserId of dueUserIds) {
      const userId = String(rawUserId || "").trim();
      if (!userId) continue;
      try {
        await purgeUserData(userId);
        await lifecycleStore.finalizeHardDelete(userId);
        summary.purged += 1;
        summary.userIds.push(userId);
      } catch (error) {
        summary.failed += 1;
        logger.error?.(`[account_purge] user=${userId} error=${error?.message || error}`);
      }
    }
    return summary;
  }

  async function runOnce() {
    if (activeRun) return activeRun;
    activeRun = execute().finally(() => {
      activeRun = null;
    });
    return activeRun;
  }

  return { runOnce };
}

export {
  createAccountPurgeWorker,
  listPersistenceRowsPaginated,
  purgePersistenceRowsForUser,
};
