async function purgePersistenceRowsForUser({
  persistence,
  userId,
  domains,
  rowBelongsToUser,
} = {}) {
  if (!persistence || typeof persistence.list !== "function" || typeof persistence.delete !== "function") {
    throw new Error("purgePersistenceRowsForUser requires list/delete persistence");
  }
  if (typeof rowBelongsToUser !== "function") {
    throw new Error("purgePersistenceRowsForUser requires rowBelongsToUser");
  }
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) throw new Error("purgePersistenceRowsForUser requires userId");
  let deletedRows = 0;
  const deletedByDomain = {};
  for (const domain of Array.isArray(domains) ? domains : []) {
    const rows = await persistence.list({ domain, limit: 10_000 });
    let domainDeleted = 0;
    for (const row of rows || []) {
      if (!rowBelongsToUser(row, cleanUserId)) continue;
      await persistence.delete({ domain, key: row.key });
      deletedRows += 1;
      domainDeleted += 1;
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

export { createAccountPurgeWorker, purgePersistenceRowsForUser };
