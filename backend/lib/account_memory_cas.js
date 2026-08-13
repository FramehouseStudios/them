const DOMAIN = "user_memory";

function accountMemoryKey(userId) {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) throw new Error("account memory userId is required");
  return `byUserId:${cleanUserId}`;
}

function createAccountMemoryCAS({
  persistence,
  sanitizeMemory,
  cacheMemory = null,
  logger = console,
} = {}) {
  if (!persistence || typeof persistence.get !== "function") {
    throw new Error("createAccountMemoryCAS requires persistence.get");
  }
  if (typeof persistence.compareAndSwap !== "function") {
    throw new Error("createAccountMemoryCAS requires persistence.compareAndSwap");
  }
  if (typeof sanitizeMemory !== "function") {
    throw new Error("createAccountMemoryCAS requires sanitizeMemory");
  }

  async function read({ userId, fallbackMemory = null } = {}) {
    const key = accountMemoryKey(userId);
    const record = await persistence.get({ domain: DOMAIN, key });
    const memory = sanitizeMemory(record?.memory ?? fallbackMemory ?? {});
    return {
      key,
      record: record && typeof record === "object" ? record : null,
      memory,
    };
  }

  async function commit({
    userId,
    expectedRecord = null,
    memory,
    now = Date.now(),
    clientTokenAliases = [],
  } = {}) {
    const cleanUserId = String(userId || "").trim();
    const key = accountMemoryKey(cleanUserId);
    const previousUpdatedAt = Math.max(
      0,
      Number(expectedRecord?.updatedAt || 0),
      Number(expectedRecord?.memory?.lastUpdatedAt || 0),
    );
    const safeNow = Math.max(previousUpdatedAt + 1, Number(now) || Date.now());
    const nextMemory = sanitizeMemory(memory || {});
    nextMemory.lastUpdatedAt = safeNow;
    const nextRecord = {
      userId: cleanUserId,
      updatedAt: safeNow,
      memory: nextMemory,
    };
    const swapped = await persistence.compareAndSwap({
      domain: DOMAIN,
      key,
      expectedValue: expectedRecord,
      value: nextRecord,
    });
    if (!swapped) {
      const current = await read({ userId: cleanUserId });
      return {
        ok: false,
        status: "stale_memory_state_version",
        ...current,
      };
    }
    let cacheSynchronized = true;
    if (typeof cacheMemory === "function") {
      try {
        await cacheMemory({
          userId: cleanUserId,
          memory: nextMemory,
          now: safeNow,
          clientTokenAliases,
        });
      } catch (error) {
        cacheSynchronized = false;
        logger?.error?.(`[account_memory_cas] local cache sync failed: ${error?.message || error}`);
      }
    }
    return {
      ok: true,
      status: "committed",
      key,
      record: nextRecord,
      memory: nextMemory,
      cacheSynchronized,
    };
  }

  return { read, commit };
}

export {
  DOMAIN as ACCOUNT_MEMORY_DOMAIN,
  accountMemoryKey,
  createAccountMemoryCAS,
};
