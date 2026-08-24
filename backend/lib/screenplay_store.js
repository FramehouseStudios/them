import {
  normalizeOutlineRevision,
  stableCanonicalJson,
} from "./screenplay_outline_protocol.js";

const screenplayStoreByOwner = new Map();
const screenplayOwnerWriteChains = new Map();
const screenplayPersistedOwnerByKey = new Map();
const screenplayAdapterObservedOwnerKeys = new Set();
const SCREENPLAY_ADAPTER_PAGE_LIMIT = 10_000;
const SCREENPLAY_OWNER_TOMBSTONE_VERSION = 1;

let configuredDeps = null;

function configureScreenplayStore(deps = {}) {
  configuredDeps = deps;
  screenplayOwnerWriteChains.clear();
  screenplayPersistedOwnerByKey.clear();
  screenplayAdapterObservedOwnerKeys.clear();
}

function screenplayStoreDeps() {
  if (!configuredDeps) {
    throw new Error("screenplay_store not configured");
  }
  return configuredDeps;
}

function runScreenplayPersistenceOperation(operation, work) {
  const configuredTimeout = Number(screenplayStoreDeps().screenplayPersistenceTimeoutMs);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? Math.max(25, Math.min(30_000, Math.floor(configuredTimeout)))
    : 5_000;
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`screenplay persistence ${operation} timed out after ${timeoutMs}ms`);
      error.code = "SCREENPLAY_PERSISTENCE_TIMEOUT";
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([
    Promise.resolve().then(work),
    timeout,
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function toScreenplayOwnerPersistencePayload(owner, now, normalizeStoredScreenplayCompanionState) {
  return {
    ownerKey: owner.ownerKey,
    activeProjectId: owner.activeProjectId,
    updatedAt: Math.max(0, Number(owner.updatedAt || now)),
    companionState: normalizeStoredScreenplayCompanionState(owner.companionState),
    projects: Array.isArray(owner.projects) ? owner.projects : [],
  };
}

function cloneJson(value) {
  if (value == null) return value;
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function isScreenplayOwnerTombstone(value) {
  return Boolean(
    value
    && typeof value === "object"
    && value.screenplayOwnerTombstone === true
  );
}

function createScreenplayOwnerTombstone(now = Date.now()) {
  return {
    screenplayOwnerTombstone: true,
    version: SCREENPLAY_OWNER_TOMBSTONE_VERSION,
    deletedAt: Math.max(0, Number(now || Date.now())),
  };
}

function withScreenplayOwnerWriteLock(ownerKey, work) {
  const key = String(ownerKey || "").trim();
  const previous = screenplayOwnerWriteChains.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(work);
  const settled = next.catch(() => {});
  screenplayOwnerWriteChains.set(key, settled);
  return next.finally(() => {
    if (screenplayOwnerWriteChains.get(key) === settled) {
      screenplayOwnerWriteChains.delete(key);
    }
  });
}

function buildScreenplayStorePayload(now = Date.now(), { preferPersistedOwners = false } = {}) {
  const {
    normalizeStoredScreenplayCompanionState,
    normalizeStoredScreenplayOwner,
  } = screenplayStoreDeps();
  return {
    version: 2,
    updatedAt: now,
    adapterBackedOwnerKeys: [...screenplayAdapterObservedOwnerKeys].sort(),
    owners: [...screenplayStoreByOwner.entries()]
      .filter(([ownerKey]) => !isScreenplayOwnerTombstone(screenplayPersistedOwnerByKey.get(ownerKey)))
      .map(([ownerKey, owner]) => {
        const persistedOwner = preferPersistedOwners && screenplayPersistedOwnerByKey.has(ownerKey)
          ? normalizeStoredScreenplayOwner(screenplayPersistedOwnerByKey.get(ownerKey))
          : null;
        return toScreenplayOwnerPersistencePayload(
          persistedOwner || owner,
          now,
          normalizeStoredScreenplayCompanionState
        );
      }),
  };
}

function writeScreenplayStoreMirror(now = Date.now(), { preferPersistedOwners = false } = {}) {
  const {
    SCREENPLAY_STORE_PATH,
    writeJsonFileAtomic,
  } = screenplayStoreDeps();
  try {
    return Boolean(writeJsonFileAtomic(
      SCREENPLAY_STORE_PATH,
      buildScreenplayStorePayload(now, { preferPersistedOwners }),
      "screenplay_store"
    ));
  } catch (error) {
    console.error("[screenplay_store] legacy mirror write failed:", error?.message || error);
    return false;
  }
}

function loadScreenplayStore(target = screenplayStoreByOwner) {
  const {
    SCREENPLAY_STORE_PATH,
    fs,
    normalizeStoredScreenplayOwner,
  } = screenplayStoreDeps();
  target.clear();
  screenplayPersistedOwnerByKey.clear();
  try {
    if (!fs.existsSync(SCREENPLAY_STORE_PATH)) return;
    const raw = fs.readFileSync(SCREENPLAY_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const adapterBackedOwnerKeys = Array.isArray(parsed?.adapterBackedOwnerKeys)
      ? parsed.adapterBackedOwnerKeys
      : (Array.isArray(parsed?.adapter_backed_owner_keys) ? parsed.adapter_backed_owner_keys : []);
    for (const ownerKey of adapterBackedOwnerKeys) {
      const normalizedKey = String(ownerKey || "").trim();
      if (normalizedKey) screenplayAdapterObservedOwnerKeys.add(normalizedKey);
    }
    const owners = Array.isArray(parsed?.owners) ? parsed.owners : [];
    for (const ownerEntry of owners) {
      const owner = normalizeStoredScreenplayOwner(ownerEntry);
      if (!owner) continue;
      target.set(owner.ownerKey, owner);
      screenplayPersistedOwnerByKey.set(owner.ownerKey, cloneJson(owner));
    }
  } catch (err) {
    console.error(`[screenplay_store] Failed to load store ${SCREENPLAY_STORE_PATH}:`, err);
  }
}

function saveScreenplayStore(now = Date.now(), {
  adapterOwnerKeys = null,
  persistAdapter = true,
  preferPersistedOwners = false,
} = {}) {
  const deps = screenplayStoreDeps();
  const {
    normalizeStoredScreenplayCompanionState,
    persistence,
  } = deps;
  const owners = [...screenplayStoreByOwner.values()]
    .filter((owner) => !isScreenplayOwnerTombstone(screenplayPersistedOwnerByKey.get(owner.ownerKey)))
    .map((owner) => (
      toScreenplayOwnerPersistencePayload(owner, now, normalizeStoredScreenplayCompanionState)
    ));
  if (!Array.isArray(adapterOwnerKeys)) {
    for (const ownerKey of screenplayPersistedOwnerByKey.keys()) {
      if (
        !screenplayStoreByOwner.has(ownerKey)
        && !isScreenplayOwnerTombstone(screenplayPersistedOwnerByKey.get(ownerKey))
      ) {
        screenplayPersistedOwnerByKey.delete(ownerKey);
      }
    }
  }
  // Legacy bulk saves still write the migration mirror first, then dual-write
  // adapter rows. Owner-scoped mutations use CAS below and require the mirror
  // to contain the same durable winner before acknowledging success.
  const fileOk = writeScreenplayStoreMirror(now, { preferPersistedOwners });
  const result = {
    ok: Boolean(fileOk),
    fileOk: Boolean(fileOk),
    persistenceKind: persistence?.kind || "",
    persistenceStatus: persistAdapter ? "not_configured" : "skipped",
    persistenceOwnerCount: 0,
    persistenceFailureCount: 0,
    persistencePromise: null,
  };
  if (!fileOk) return result;
  if (!preferPersistedOwners) {
    for (const owner of owners) {
      screenplayPersistedOwnerByKey.set(owner.ownerKey, cloneJson(owner));
    }
  }
  if (persistAdapter && persistence && typeof persistence.put === "function") {
    const adapterKeySet = Array.isArray(adapterOwnerKeys)
      ? new Set(adapterOwnerKeys.map((key) => String(key || "").trim()).filter(Boolean))
      : null;
    const adapterOwners = adapterKeySet
      ? owners.filter((owner) => adapterKeySet.has(owner.ownerKey))
      : owners;
    result.persistenceStatus = "pending";
    result.persistenceOwnerCount = adapterOwners.length;
    result.persistencePromise = Promise.allSettled(adapterOwners.map((owner) => (
      runScreenplayPersistenceOperation("put", () => persistence.put({
        domain: "screenplay",
        key: owner.ownerKey,
        value: owner,
      }))
    ))).then((settled) => {
      const failures = settled.filter((item) => item.status === "rejected");
      settled.forEach((item, index) => {
        if (item.status === "fulfilled") {
          const owner = adapterOwners[index];
          screenplayPersistedOwnerByKey.set(owner.ownerKey, cloneJson(owner));
          screenplayAdapterObservedOwnerKeys.add(owner.ownerKey);
        }
      });
      for (const item of failures) {
        console.error("[screenplay_store] adapter put failed:", item.reason?.message || item.reason);
      }
      return {
        ok: failures.length === 0,
        persistenceKind: result.persistenceKind,
        persistenceStatus: failures.length === 0 ? "ok" : "failed",
        persistenceOwnerCount: adapterOwners.length,
        persistenceFailureCount: failures.length,
      };
    });
    void result.persistencePromise;
  }
  return result;
}

// T07b: load owners from the persistence adapter (when configured).
// Async; callers must await. If no records exist in the adapter, the
// in-memory map is left untouched so the existing JSON-file load can
// be the fallback.
async function loadScreenplayStoreFromAdapter(target = screenplayStoreByOwner) {
  const deps = screenplayStoreDeps();
  const { persistence, normalizeStoredScreenplayOwner } = deps;
  if (!persistence || typeof persistence.list !== "function") return false;
  const recordsByKey = new Map();
  const seenPageCursors = new Set();
  let afterKey = "";
  let scanComplete = false;
  while (true) {
    let page;
    try {
      page = await runScreenplayPersistenceOperation(
        "list",
        () => persistence.list({
          domain: "screenplay",
          afterKey,
          limit: SCREENPLAY_ADAPTER_PAGE_LIMIT,
        })
      );
    } catch (err) {
      console.error("[screenplay_store] adapter list failed:", err?.message || err);
      if (recordsByKey.size === 0) return false;
      break;
    }
    if (!Array.isArray(page)) {
      if (recordsByKey.size === 0) return false;
      break;
    }
    for (const record of page) {
      const recordKey = String(record?.key || "").trim();
      if (recordKey) recordsByKey.set(recordKey, record);
    }
    if (page.length < SCREENPLAY_ADAPTER_PAGE_LIMIT) {
      scanComplete = true;
      break;
    }
    const nextAfterKey = String(page.at(-1)?.key || "").trim();
    if (!nextAfterKey || seenPageCursors.has(nextAfterKey)) {
      console.warn("[screenplay_store] adapter list cursor did not advance; deletion reconciliation skipped");
      break;
    }
    seenPageCursors.add(nextAfterKey);
    afterKey = nextAfterKey;
  }
  const records = [...recordsByKey.values()];
  const adapterKeys = new Set(
    records.map((record) => String(record?.key || "").trim()).filter(Boolean)
  );
  let removedDeletedOwner = false;
  if (scanComplete) {
    for (const ownerKey of screenplayAdapterObservedOwnerKeys) {
      if (adapterKeys.has(ownerKey)) continue;
      screenplayPersistedOwnerByKey.delete(ownerKey);
      if (target.delete(ownerKey)) removedDeletedOwner = true;
    }
  }
  for (const { key, value } of records) {
    const recordKey = String(key || "").trim();
    if (recordKey && isScreenplayOwnerTombstone(value)) {
      screenplayPersistedOwnerByKey.set(recordKey, cloneJson(value));
      screenplayAdapterObservedOwnerKeys.add(recordKey);
      if (target.delete(recordKey)) removedDeletedOwner = true;
      continue;
    }
    const owner = normalizeStoredScreenplayOwner(value);
    if (!owner) continue;
    target.set(owner.ownerKey, owner);
    screenplayPersistedOwnerByKey.set(recordKey || owner.ownerKey, cloneJson(value));
    screenplayAdapterObservedOwnerKeys.add(recordKey || owner.ownerKey);
  }
  if (removedDeletedOwner) {
    writeScreenplayStoreMirror(Date.now(), { preferPersistedOwners: true });
  }
  return records.length > 0 || removedDeletedOwner;
}

async function refreshScreenplayOwnerRecord(ownerKey) {
  const key = String(ownerKey || "").trim();
  if (!key) throw new Error("refreshScreenplayOwnerRecord requires ownerKey");
  const deps = screenplayStoreDeps();
  const { normalizeStoredScreenplayOwner, persistence } = deps;
  if (!persistence || typeof persistence.get !== "function") {
    return {
      ok: true,
      owner: screenplayStoreByOwner.get(key) || null,
      authoritative: false,
      persistenceKind: persistence?.kind || "",
    };
  }
  return withScreenplayOwnerWriteLock(key, async () => {
    let value;
    try {
      value = await runScreenplayPersistenceOperation(
        "get",
        () => persistence.get({ domain: "screenplay", key })
      );
    } catch (error) {
      return {
        ok: false,
        owner: null,
        authoritative: false,
        error,
        persistenceKind: persistence.kind || "unknown",
      };
    }
    if (value == null) {
      if (screenplayAdapterObservedOwnerKeys.has(key)) {
        screenplayPersistedOwnerByKey.delete(key);
        screenplayStoreByOwner.delete(key);
        writeScreenplayStoreMirror(Date.now(), { preferPersistedOwners: true });
        return {
          ok: true,
          owner: null,
          authoritative: true,
          deleted: true,
          persistenceKind: persistence.kind || "unknown",
        };
      }
      return {
        ok: true,
        owner: screenplayStoreByOwner.get(key) || null,
        authoritative: false,
        persistenceKind: persistence.kind || "unknown",
      };
    }
    if (isScreenplayOwnerTombstone(value)) {
      screenplayPersistedOwnerByKey.set(key, cloneJson(value));
      screenplayAdapterObservedOwnerKeys.add(key);
      screenplayStoreByOwner.delete(key);
      writeScreenplayStoreMirror(Date.now(), { preferPersistedOwners: true });
      return {
        ok: true,
        owner: null,
        authoritative: true,
        deleted: true,
        tombstoned: true,
        persistenceKind: persistence.kind || "unknown",
      };
    }
    const owner = normalizeStoredScreenplayOwner(value);
    if (!owner) {
      return {
        ok: false,
        owner: null,
        authoritative: true,
        error: new Error("screenplay_owner_invalid"),
        persistenceKind: persistence.kind || "unknown",
      };
    }
    const priorValue = screenplayPersistedOwnerByKey.get(key);
    const wasObserved = screenplayAdapterObservedOwnerKeys.has(key);
    const changed = !priorValue
      || stableCanonicalJson(priorValue) !== stableCanonicalJson(value);
    screenplayPersistedOwnerByKey.set(key, cloneJson(value));
    screenplayAdapterObservedOwnerKeys.add(key);
    screenplayStoreByOwner.set(key, owner);
    if (changed || !wasObserved) {
      writeScreenplayStoreMirror(Date.now(), { preferPersistedOwners: true });
    }
    return {
      ok: true,
      owner,
      authoritative: true,
      persistenceKind: persistence.kind || "unknown",
    };
  });
}

async function tombstoneScreenplayOwnerRecord(ownerKey, now = Date.now()) {
  const key = String(ownerKey || "").trim();
  if (!key) throw new Error("tombstoneScreenplayOwnerRecord requires ownerKey");
  return withScreenplayOwnerWriteLock(key, async () => {
    const { persistence } = screenplayStoreDeps();
    const tombstone = createScreenplayOwnerTombstone(now);
    let previousValue = screenplayPersistedOwnerByKey.get(key);
    let canonicalReadSucceeded = false;
    if (persistence && typeof persistence.put === "function") {
      if (typeof persistence.get === "function") {
        try {
          previousValue = await runScreenplayPersistenceOperation(
            "get",
            () => persistence.get({ domain: "screenplay", key })
          );
          canonicalReadSucceeded = true;
        } catch (_error) {
          // The unconditional tombstone write is the privacy boundary. A
          // failed best-effort read must not prevent erasure from proceeding.
        }
      }
      if (!canonicalReadSucceeded || !isScreenplayOwnerTombstone(previousValue)) {
        try {
          await runScreenplayPersistenceOperation(
            "put",
            () => persistence.put({ domain: "screenplay", key, value: tombstone })
          );
        } catch (error) {
          return {
            ok: false,
            tombstoned: false,
            deleted: false,
            error,
            persistenceKind: persistence.kind || "unknown",
          };
        }
      } else {
        Object.assign(tombstone, previousValue);
      }
    }

    screenplayPersistedOwnerByKey.set(key, cloneJson(tombstone));
    screenplayAdapterObservedOwnerKeys.add(key);
    screenplayStoreByOwner.delete(key);
    const fileOk = writeScreenplayStoreMirror(now, { preferPersistedOwners: true });
    return {
      ok: fileOk,
      tombstoned: Boolean(persistence && typeof persistence.put === "function"),
      deleted: previousValue != null && !isScreenplayOwnerTombstone(previousValue),
      fileOk,
      persistenceKind: persistence?.kind || "",
    };
  });
}

async function commitScreenplayOwnerMutation({
  ownerKey,
  now = Date.now(),
  mutate,
  maxAttempts = 3,
  retryAmbiguousCommit = false,
} = {}) {
  const key = String(ownerKey || "").trim();
  if (!key) throw new Error("commitScreenplayOwnerMutation requires ownerKey");
  if (typeof mutate !== "function") throw new Error("commitScreenplayOwnerMutation requires mutate");

  // Snapshot before the queued work yields. Legacy routes still mutate their
  // cached owner before entering this lock; consulting that live object after
  // an adapter read would otherwise absorb an uncommitted concurrent change.
  const invocationOwnerSnapshot = cloneJson(screenplayStoreByOwner.get(key));

  return withScreenplayOwnerWriteLock(key, async () => {
    const deps = screenplayStoreDeps();
    const {
      createEmptyScreenplayOwner,
      normalizeStoredScreenplayOwner,
      normalizeStoredScreenplayCompanionState,
      persistence,
    } = deps;
    const supportsCAS = Boolean(
      persistence
      && typeof persistence.get === "function"
      && typeof persistence.compareAndSwap === "function"
    );
    const attempts = Math.max(1, Math.min(5, Math.floor(Number(maxAttempts) || 3)));

    if (isScreenplayOwnerTombstone(screenplayPersistedOwnerByKey.get(key))) {
      screenplayStoreByOwner.delete(key);
      const error = new Error("screenplay_owner_deleted");
      error.code = "SCREENPLAY_OWNER_DELETED";
      return {
        ok: false,
        committed: false,
        conflict: true,
        error,
        persistenceKind: persistence?.kind || "unknown",
        persistenceFailureCount: 1,
      };
    }

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let expectedValue = null;
      try {
        expectedValue = supportsCAS
          ? await runScreenplayPersistenceOperation(
              "get",
              () => persistence.get({ domain: "screenplay", key })
            )
          : null;
      } catch (error) {
        return {
          ok: false,
          committed: false,
          error,
          persistenceKind: persistence?.kind || "unknown",
          persistenceFailureCount: 1,
        };
      }

      if (isScreenplayOwnerTombstone(expectedValue)) {
        screenplayPersistedOwnerByKey.set(key, cloneJson(expectedValue));
        screenplayAdapterObservedOwnerKeys.add(key);
        screenplayStoreByOwner.delete(key);
        writeScreenplayStoreMirror(Date.now(), { preferPersistedOwners: true });
        const error = new Error("screenplay_owner_deleted");
        error.code = "SCREENPLAY_OWNER_DELETED";
        return {
          ok: false,
          committed: false,
          conflict: true,
          error,
          persistenceKind: persistence?.kind || "unknown",
          persistenceFailureCount: 1,
        };
      }
      if (expectedValue == null && screenplayAdapterObservedOwnerKeys.has(key)) {
        screenplayPersistedOwnerByKey.delete(key);
        screenplayStoreByOwner.delete(key);
        writeScreenplayStoreMirror(Date.now(), { preferPersistedOwners: true });
        const error = new Error("screenplay_owner_deleted");
        error.code = "SCREENPLAY_OWNER_DELETED";
        return {
          ok: false,
          committed: false,
          conflict: true,
          error,
          persistenceKind: persistence?.kind || "unknown",
          persistenceFailureCount: 1,
        };
      }
      if (expectedValue != null) screenplayAdapterObservedOwnerKeys.add(key);

      const cachedOwner = screenplayStoreByOwner.get(key) || createEmptyScreenplayOwner(key);
      const stableFallbackOwner = supportsCAS
        ? screenplayPersistedOwnerByKey.get(key) || invocationOwnerSnapshot || createEmptyScreenplayOwner(key)
        : cachedOwner;
      const currentOwner = normalizeStoredScreenplayOwner(expectedValue)
        || normalizeStoredScreenplayOwner(stableFallbackOwner)
        || cloneJson(stableFallbackOwner);
      if (!currentOwner) {
        return { ok: false, committed: false, error: new Error("screenplay_owner_invalid") };
      }
      const nextOwner = cloneJson(currentOwner);
      const mutation = await mutate(nextOwner, { attempt, currentOwner: cloneJson(currentOwner) });
      if (mutation?.commit === false) {
        if (supportsCAS && expectedValue == null && mutation.kind === "replayed") {
          const replayValue = toScreenplayOwnerPersistencePayload(
            currentOwner,
            now,
            normalizeStoredScreenplayCompanionState
          );
          try {
            const healed = await runScreenplayPersistenceOperation(
              "compareAndSwap",
              () => persistence.compareAndSwap({
                domain: "screenplay",
                key,
                expectedValue: null,
                value: replayValue,
              })
            );
            if (!healed) {
              screenplayAdapterObservedOwnerKeys.add(key);
              continue;
            }
          } catch (error) {
            if (retryAmbiguousCommit && attempt < attempts) continue;
            return {
              ok: false,
              committed: false,
              error,
              persistenceKind: persistence.kind || "unknown",
              persistenceFailureCount: 1,
            };
          }
          let latestReplayValue = replayValue;
          let replayReconciliationFailed = false;
          try {
            latestReplayValue = await runScreenplayPersistenceOperation(
              "get",
              () => persistence.get({ domain: "screenplay", key })
            );
          } catch (_error) {
            replayReconciliationFailed = true;
          }
          if (replayReconciliationFailed) {
            screenplayPersistedOwnerByKey.delete(key);
            screenplayAdapterObservedOwnerKeys.add(key);
            screenplayStoreByOwner.delete(key);
            const fileOk = writeScreenplayStoreMirror(now, { preferPersistedOwners: true });
            return {
              ok: true,
              committed: true,
              owner: currentOwner,
              result: mutation,
              fileOk,
              persistenceKind: persistence.kind || "unknown",
              persistenceStatus: "cache_reconciliation_pending",
              persistenceFailureCount: 0,
              mirrorFailureCount: fileOk ? 0 : 1,
              attempt,
            };
          }
          if (latestReplayValue == null || isScreenplayOwnerTombstone(latestReplayValue)) {
            if (isScreenplayOwnerTombstone(latestReplayValue)) {
              screenplayPersistedOwnerByKey.set(key, cloneJson(latestReplayValue));
            } else {
              screenplayPersistedOwnerByKey.delete(key);
            }
            screenplayAdapterObservedOwnerKeys.add(key);
            screenplayStoreByOwner.delete(key);
            writeScreenplayStoreMirror(Date.now(), { preferPersistedOwners: true });
            const error = new Error("screenplay_owner_deleted");
            error.code = "SCREENPLAY_OWNER_DELETED";
            return {
              ok: false,
              committed: false,
              conflict: true,
              error,
              persistenceKind: persistence.kind || "unknown",
              persistenceFailureCount: 1,
            };
          }
          const latestReplayOwner = normalizeStoredScreenplayOwner(latestReplayValue) || currentOwner;
          screenplayPersistedOwnerByKey.set(key, cloneJson(latestReplayValue));
          screenplayAdapterObservedOwnerKeys.add(key);
          screenplayStoreByOwner.set(key, latestReplayOwner);
          const fileOk = writeScreenplayStoreMirror(now, { preferPersistedOwners: true });
          if (!fileOk) {
            console.error(`[screenplay_store] legacy mirror write failed after replay repair for owner ${key}`);
          }
          return {
            ok: true,
            committed: true,
            owner: currentOwner,
            result: mutation,
            fileOk,
            persistenceKind: persistence.kind || "unknown",
            persistenceFailureCount: 0,
            mirrorFailureCount: fileOk ? 0 : 1,
            attempt,
          };
        }
        screenplayStoreByOwner.set(key, currentOwner);
        if (expectedValue != null) {
          screenplayPersistedOwnerByKey.set(key, cloneJson(expectedValue));
        }
        let fileOk = true;
        let replayPersistence = null;
        if (!supportsCAS && mutation.kind === "replayed") {
          const saved = saveScreenplayStore(now, { adapterOwnerKeys: [key] });
          fileOk = saved !== false && saved?.fileOk !== false;
          replayPersistence = saved?.persistencePromise
            ? await saved.persistencePromise
            : null;
        } else {
          fileOk = writeScreenplayStoreMirror(now, { preferPersistedOwners: supportsCAS });
        }
        if (supportsCAS && !fileOk) {
          console.error(`[screenplay_store] legacy mirror write failed after replay for owner ${key}`);
        }
        const replayRecoveryFailed = mutation.kind === "replayed"
          && !supportsCAS
          && (!fileOk || replayPersistence?.ok === false);
        return {
          ok: !replayRecoveryFailed,
          committed: mutation.kind === "replayed",
          owner: currentOwner,
          result: mutation,
          fileOk,
          persistenceKind: persistence?.kind || "",
          persistenceFailureCount: replayRecoveryFailed ? 1 : 0,
          mirrorFailureCount: supportsCAS && !fileOk ? 1 : 0,
          attempt,
        };
      }

      nextOwner.updatedAt = Math.max(
        0,
        Number(nextOwner.updatedAt || 0),
        Number(now || Date.now())
      );
      if (Array.isArray(nextOwner.projects)) {
        nextOwner.projects = nextOwner.projects
          .map((project) => recalculateScreenplayProject(project))
          .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
      }
      if (nextOwner.activeProjectId && !nextOwner.projects.some((project) => project.id === nextOwner.activeProjectId)) {
        nextOwner.activeProjectId = nextOwner.projects[0]?.id || "";
      }
      const value = toScreenplayOwnerPersistencePayload(
        nextOwner,
        now,
        normalizeStoredScreenplayCompanionState
      );

      if (!supportsCAS) {
        screenplayStoreByOwner.set(key, nextOwner);
        const saved = saveScreenplayStore(now, { adapterOwnerKeys: [key] });
        if (saved === false || saved?.ok === false) {
          screenplayStoreByOwner.set(key, currentOwner);
          return {
            ok: false,
            committed: false,
            owner: currentOwner,
            result: mutation,
            fileOk: false,
            persistenceKind: persistence?.kind || "",
            persistenceFailureCount: 1,
            attempt,
          };
        }
        if (saved?.persistencePromise) {
          const persisted = await saved.persistencePromise;
          if (persisted?.ok === false) {
            return { ...persisted, committed: true, owner: nextOwner, result: mutation, fileOk: true };
          }
        }
        return {
          ok: true,
          committed: true,
          owner: nextOwner,
          result: mutation,
          fileOk: saved?.fileOk !== false,
          attempt,
        };
      }

      try {
        const swapped = await runScreenplayPersistenceOperation(
          "compareAndSwap",
          () => persistence.compareAndSwap({
            domain: "screenplay",
            key,
            expectedValue,
            value,
          })
        );
        if (!swapped) {
          // A failed insert/update proves another adapter state won, even if a
          // subsequent account purge removes it before the repair read.
          screenplayAdapterObservedOwnerKeys.add(key);
          continue;
        }
      } catch (error) {
        // A thrown CAS can be ambiguous: the adapter may have committed before
        // the transport failed. Only receipt-protected mutations may safely
        // re-run their callback to discover that durable replay.
        if (retryAmbiguousCommit && attempt < attempts) continue;
        return {
          ok: false,
          committed: false,
          error,
          persistenceKind: persistence.kind || "unknown",
          persistenceFailureCount: 1,
        };
      }

      const committedOwner = normalizeStoredScreenplayOwner(value) || nextOwner;
      let latestValue = value;
      let reconciliationFailed = false;
      try {
        latestValue = await runScreenplayPersistenceOperation(
          "get",
          () => persistence.get({ domain: "screenplay", key })
        );
      } catch (_error) {
        reconciliationFailed = true;
      }
      if (reconciliationFailed) {
        // The CAS is durable, but the canonical state may already have moved
        // to a deletion tombstone. Acknowledge the committed snapshot without
        // retaining private content in the local cache or legacy mirror.
        screenplayPersistedOwnerByKey.delete(key);
        screenplayAdapterObservedOwnerKeys.add(key);
        screenplayStoreByOwner.delete(key);
        const fileOk = writeScreenplayStoreMirror(now, { preferPersistedOwners: true });
        return {
          ok: true,
          committed: true,
          owner: committedOwner,
          result: mutation,
          fileOk,
          persistenceKind: persistence.kind || "unknown",
          persistenceStatus: "cache_reconciliation_pending",
          persistenceFailureCount: 0,
          mirrorFailureCount: fileOk ? 0 : 1,
          attempt,
        };
      }
      if (latestValue == null || isScreenplayOwnerTombstone(latestValue)) {
        if (isScreenplayOwnerTombstone(latestValue)) {
          screenplayPersistedOwnerByKey.set(key, cloneJson(latestValue));
        } else {
          screenplayPersistedOwnerByKey.delete(key);
        }
        screenplayAdapterObservedOwnerKeys.add(key);
        screenplayStoreByOwner.delete(key);
        writeScreenplayStoreMirror(Date.now(), { preferPersistedOwners: true });
        const error = new Error("screenplay_owner_deleted");
        error.code = "SCREENPLAY_OWNER_DELETED";
        return {
          ok: false,
          committed: false,
          conflict: true,
          error,
          persistenceKind: persistence.kind || "unknown",
          persistenceFailureCount: 1,
        };
      }
      const latestOwner = normalizeStoredScreenplayOwner(latestValue) || committedOwner;
      screenplayPersistedOwnerByKey.set(key, cloneJson(latestValue));
      screenplayAdapterObservedOwnerKeys.add(key);
      screenplayStoreByOwner.set(key, latestOwner);
      const fileOk = writeScreenplayStoreMirror(now, { preferPersistedOwners: true });
      if (!fileOk) {
        console.error(`[screenplay_store] legacy mirror write failed after CAS for owner ${key}`);
      }
      return {
        ok: true,
        committed: true,
        owner: committedOwner,
        result: mutation,
        fileOk,
        persistenceKind: persistence.kind || "unknown",
        persistenceFailureCount: 0,
        mirrorFailureCount: fileOk ? 0 : 1,
        attempt,
      };
    }

    try {
      const latestValue = await runScreenplayPersistenceOperation(
        "get",
        () => screenplayStoreDeps().persistence?.get?.({
          domain: "screenplay",
          key,
        })
      );
      if (isScreenplayOwnerTombstone(latestValue)) {
        screenplayPersistedOwnerByKey.set(key, cloneJson(latestValue));
        screenplayAdapterObservedOwnerKeys.add(key);
        screenplayStoreByOwner.delete(key);
        writeScreenplayStoreMirror(Date.now(), { preferPersistedOwners: true });
      } else {
        const latestOwner = screenplayStoreDeps().normalizeStoredScreenplayOwner(latestValue);
        if (latestOwner) {
          screenplayPersistedOwnerByKey.set(key, cloneJson(latestValue));
          screenplayAdapterObservedOwnerKeys.add(key);
          screenplayStoreByOwner.set(key, latestOwner);
          writeScreenplayStoreMirror(Date.now(), { preferPersistedOwners: true });
        } else if (latestValue == null && screenplayAdapterObservedOwnerKeys.has(key)) {
          screenplayPersistedOwnerByKey.delete(key);
          screenplayStoreByOwner.delete(key);
          writeScreenplayStoreMirror(Date.now(), { preferPersistedOwners: true });
        }
      }
    } catch (_error) {
      // The failed CAS remains authoritative; cache repair is best effort.
    }
    return {
      ok: false,
      committed: false,
      conflict: true,
      error: new Error("screenplay_owner_cas_conflict"),
      persistenceKind: screenplayStoreDeps().persistence?.kind || "unknown",
      persistenceFailureCount: 1,
    };
  });
}

function getOrCreateScreenplayOwnerRecord(req, { create = true } = {}) {
  const {
    createEmptyScreenplayOwner,
    resolveScreenplayOwnerKey,
  } = screenplayStoreDeps();
  const ownerKey = resolveScreenplayOwnerKey(req);
  let owner = screenplayStoreByOwner.get(ownerKey);
  if (!owner && create) {
    owner = createEmptyScreenplayOwner(ownerKey);
    if (isScreenplayOwnerTombstone(screenplayPersistedOwnerByKey.get(ownerKey))) {
      return owner;
    }
    screenplayStoreByOwner.set(ownerKey, owner);
    if (!screenplayPersistedOwnerByKey.has(ownerKey)) {
      screenplayPersistedOwnerByKey.set(ownerKey, cloneJson(owner));
    }
  }
  return owner || null;
}

function getScreenplayProjectRecord(ownerRecord, projectId) {
  if (!ownerRecord || !Array.isArray(ownerRecord.projects)) return null;
  return ownerRecord.projects.find((project) => project.id === projectId) || null;
}

function getLatestScreenplayVersion(project) {
  if (!project || !Array.isArray(project.versions) || project.versions.length === 0) return null;
  return [...project.versions].sort((a, b) => {
    const aTs = Math.max(0, Number(a.updatedAt || a.createdAt || 0));
    const bTs = Math.max(0, Number(b.updatedAt || b.createdAt || 0));
    return bTs - aTs;
  })[0] || null;
}

function ensureScreenplayOutline(project) {
  const { createEmptyScreenplayOutline } = screenplayStoreDeps();
  if (!project.outline || typeof project.outline !== "object") {
    project.outline = createEmptyScreenplayOutline();
  }
  if (!Array.isArray(project.outline.acts)) project.outline.acts = [];
  if (!Array.isArray(project.outline.scenes)) project.outline.scenes = [];
  if (!Array.isArray(project.outline.beats)) project.outline.beats = [];
  const revision = normalizeOutlineRevision(project.outlineRevision ?? project.outline.revision);
  project.outline.revision = revision;
  project.outlineRevision = revision;
  return project.outline;
}

function recalculateScreenplayProject(project) {
  const {
    buildDraftExcerpt,
    normalizeSnippet,
  } = screenplayStoreDeps();
  const outline = ensureScreenplayOutline(project);
  const latestVersion = getLatestScreenplayVersion(project);
  const approvedEmails = (Array.isArray(project.collaborators) ? project.collaborators : [])
    .filter((item) => String(item.status || "").toLowerCase() === "approved")
    .map((item) => item.email)
    .filter(Boolean);
  const latestCommentAt = Math.max(
    0,
    ...((Array.isArray(project.comments) ? project.comments : []).map((item) => Number(item.updatedAt || item.createdAt || 0)))
  );
  project.updatedAt = Math.max(
    Number(project.updatedAt || 0),
    Number(outline.updatedAt || 0),
    Number(latestVersion?.updatedAt || latestVersion?.createdAt || 0),
    latestCommentAt
  );
  project.versionCount = Array.isArray(project.versions) ? project.versions.length : 0;
  project.lastVersionId = latestVersion?.id || "";
  project.lastVersionAt = Math.max(0, Number(latestVersion?.updatedAt || latestVersion?.createdAt || 0));
  const activeVersionId = normalizeSnippet(project.activeVersionId, 64);
  project.activeVersionId = Array.isArray(project.versions) && project.versions.some((version) => version.id === activeVersionId)
    ? activeVersionId
    : project.lastVersionId;
  project.lastPhase = normalizeSnippet(project.lastPhase, 48) || normalizeSnippet(latestVersion?.phase, 48) || "scene_draft";
  project.formatScore = Number(latestVersion?.formatScore || 0);
  project.storyScore = Number(latestVersion?.storyScore || 0);
  project.confidenceClass = normalizeSnippet(latestVersion?.confidenceClass, 24) || "medium";
  project.latestExcerpt = buildDraftExcerpt(latestVersion?.draftExcerpt || latestVersion?.draft || "", 220);
  project.actCount = outline.acts.length;
  project.sceneCount = outline.scenes.length;
  project.beatCount = outline.beats.length;
  project.outlineUpdatedAt = Math.max(0, Number(outline.updatedAt || 0));
  project.collaboratorCount = approvedEmails.length;
  project.approvedEmails = approvedEmails;
  project.commentCount = Array.isArray(project.comments) ? project.comments.length : 0;
  project.lastCommentAt = latestCommentAt;
  return project;
}

function markScreenplayOwnerDirty(ownerRecord, now = Date.now()) {
  if (!ownerRecord) return;
  const deps = screenplayStoreDeps();
  if (isScreenplayOwnerTombstone(screenplayPersistedOwnerByKey.get(ownerRecord.ownerKey))) {
    screenplayStoreByOwner.delete(ownerRecord.ownerKey);
    return {
      ok: false,
      persistenceKind: deps.persistence?.kind || "unknown",
      persistenceStatus: "deleted",
      persistenceOwnerCount: 1,
      persistenceFailureCount: 1,
      persistencePromise: null,
    };
  }
  ownerRecord.updatedAt = Math.max(0, Number(now || Date.now()));
  if (Array.isArray(ownerRecord.projects)) {
    ownerRecord.projects = ownerRecord.projects
      .map((project) => recalculateScreenplayProject(project))
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  }
  if (ownerRecord.activeProjectId && !ownerRecord.projects.some((project) => project.id === ownerRecord.activeProjectId)) {
    ownerRecord.activeProjectId = ownerRecord.projects[0]?.id || "";
  }
  screenplayStoreByOwner.set(ownerRecord.ownerKey, ownerRecord);
  const { normalizeStoredScreenplayCompanionState, normalizeStoredScreenplayOwner, persistence } = deps;
  const supportsCAS = Boolean(
    persistence
    && typeof persistence.get === "function"
    && typeof persistence.compareAndSwap === "function"
  );
  if (!supportsCAS) {
    const saved = saveScreenplayStore(now, { adapterOwnerKeys: [ownerRecord.ownerKey] });
    if (!saved || typeof saved !== "object") return saved;
    return {
      ...saved,
      owner: normalizeStoredScreenplayOwner(ownerRecord) || cloneJson(ownerRecord),
    };
  }

  const ownerKey = ownerRecord.ownerKey;
  const value = cloneJson(toScreenplayOwnerPersistencePayload(
    ownerRecord,
    now,
    normalizeStoredScreenplayCompanionState
  ));
  const adapterBaseline = screenplayPersistedOwnerByKey.has(ownerKey)
    ? cloneJson(screenplayPersistedOwnerByKey.get(ownerKey))
    : undefined;
  const rollbackBaseline = normalizeStoredScreenplayOwner(adapterBaseline);
  const persistenceKind = persistence.kind || "unknown";
  const persistencePromise = withScreenplayOwnerWriteLock(ownerKey, async () => {
    if (screenplayStoreByOwner.get(ownerKey) !== ownerRecord) {
      writeScreenplayStoreMirror(Date.now(), { preferPersistedOwners: true });
      return {
        ok: false,
        persistenceKind,
        persistenceStatus: "stale_owner",
        persistenceOwnerCount: 1,
        persistenceFailureCount: 1,
      };
    }
    let expectedValue;
    try {
      expectedValue = await runScreenplayPersistenceOperation(
        "get",
        () => persistence.get({ domain: "screenplay", key: ownerKey })
      );
      if (isScreenplayOwnerTombstone(expectedValue)) {
        screenplayPersistedOwnerByKey.set(ownerKey, cloneJson(expectedValue));
        screenplayAdapterObservedOwnerKeys.add(ownerKey);
        screenplayStoreByOwner.delete(ownerKey);
        writeScreenplayStoreMirror(Date.now(), { preferPersistedOwners: true });
        return {
          ok: false,
          persistenceKind,
          persistenceStatus: "deleted",
          persistenceOwnerCount: 1,
          persistenceFailureCount: 1,
        };
      }
      if (expectedValue == null && screenplayAdapterObservedOwnerKeys.has(ownerKey)) {
        screenplayPersistedOwnerByKey.delete(ownerKey);
        screenplayStoreByOwner.delete(ownerKey);
        writeScreenplayStoreMirror(Date.now(), { preferPersistedOwners: true });
        return {
          ok: false,
          persistenceKind,
          persistenceStatus: "deleted",
          persistenceOwnerCount: 1,
          persistenceFailureCount: 1,
        };
      }
      if (expectedValue != null) screenplayAdapterObservedOwnerKeys.add(ownerKey);
      if (
        expectedValue != null
        && (
          adapterBaseline === undefined
          || stableCanonicalJson(expectedValue) !== stableCanonicalJson(adapterBaseline)
        )
      ) {
        const latestOwner = normalizeStoredScreenplayOwner(expectedValue);
        if (latestOwner) {
          screenplayPersistedOwnerByKey.set(ownerKey, cloneJson(expectedValue));
          screenplayStoreByOwner.set(ownerKey, latestOwner);
        }
        writeScreenplayStoreMirror(Date.now(), { preferPersistedOwners: true });
        return {
          ok: false,
          persistenceKind,
          persistenceStatus: "conflict",
          persistenceOwnerCount: 1,
          persistenceFailureCount: 1,
        };
      }
      const swapped = await runScreenplayPersistenceOperation(
        "compareAndSwap",
        () => persistence.compareAndSwap({
          domain: "screenplay",
          key: ownerKey,
          expectedValue,
          value,
        })
      );
      if (!swapped) {
        const latestValue = await runScreenplayPersistenceOperation(
          "get",
          () => persistence.get({ domain: "screenplay", key: ownerKey })
        );
        if (isScreenplayOwnerTombstone(latestValue)) {
          screenplayPersistedOwnerByKey.set(ownerKey, cloneJson(latestValue));
          screenplayAdapterObservedOwnerKeys.add(ownerKey);
          screenplayStoreByOwner.delete(ownerKey);
          writeScreenplayStoreMirror(Date.now(), { preferPersistedOwners: true });
          return {
            ok: false,
            persistenceKind,
            persistenceStatus: "deleted",
            persistenceOwnerCount: 1,
            persistenceFailureCount: 1,
          };
        }
        const latestOwner = normalizeStoredScreenplayOwner(latestValue);
        if (latestOwner) {
          screenplayPersistedOwnerByKey.set(ownerKey, cloneJson(latestValue));
          screenplayAdapterObservedOwnerKeys.add(ownerKey);
          screenplayStoreByOwner.set(ownerKey, latestOwner);
        } else {
          screenplayPersistedOwnerByKey.delete(ownerKey);
          screenplayStoreByOwner.delete(ownerKey);
        }
        writeScreenplayStoreMirror(Date.now(), { preferPersistedOwners: true });
        return {
          ok: false,
          persistenceKind,
          persistenceStatus: "conflict",
          persistenceOwnerCount: 1,
          persistenceFailureCount: 1,
        };
      }
      let latestValue = value;
      let reconciliationFailed = false;
      try {
        latestValue = await runScreenplayPersistenceOperation(
          "get",
          () => persistence.get({ domain: "screenplay", key: ownerKey })
        );
      } catch (_error) {
        reconciliationFailed = true;
      }
      const committedOwner = normalizeStoredScreenplayOwner(value) || cloneJson(value);
      if (reconciliationFailed) {
        screenplayPersistedOwnerByKey.delete(ownerKey);
        screenplayAdapterObservedOwnerKeys.add(ownerKey);
        screenplayStoreByOwner.delete(ownerKey);
        for (const property of Object.keys(ownerRecord)) delete ownerRecord[property];
        Object.assign(ownerRecord, committedOwner);
        const fileOk = writeScreenplayStoreMirror(now, { preferPersistedOwners: true });
        return {
          ok: true,
          owner: cloneJson(committedOwner),
          persistenceKind,
          persistenceStatus: "cache_reconciliation_pending",
          persistenceOwnerCount: 1,
          persistenceFailureCount: 0,
          mirrorFailureCount: fileOk ? 0 : 1,
        };
      }
      if (latestValue == null || isScreenplayOwnerTombstone(latestValue)) {
        if (isScreenplayOwnerTombstone(latestValue)) {
          screenplayPersistedOwnerByKey.set(ownerKey, cloneJson(latestValue));
        } else {
          screenplayPersistedOwnerByKey.delete(ownerKey);
        }
        screenplayAdapterObservedOwnerKeys.add(ownerKey);
        screenplayStoreByOwner.delete(ownerKey);
        writeScreenplayStoreMirror(Date.now(), { preferPersistedOwners: true });
        return {
          ok: false,
          persistenceKind,
          persistenceStatus: "deleted",
          persistenceOwnerCount: 1,
          persistenceFailureCount: 1,
        };
      }
      screenplayPersistedOwnerByKey.set(ownerKey, cloneJson(latestValue));
      screenplayAdapterObservedOwnerKeys.add(ownerKey);
      const latestOwner = normalizeStoredScreenplayOwner(latestValue) || committedOwner;
      for (const property of Object.keys(ownerRecord)) delete ownerRecord[property];
      Object.assign(ownerRecord, committedOwner);
      screenplayStoreByOwner.set(ownerKey, latestOwner);
      const fileOk = writeScreenplayStoreMirror(now, { preferPersistedOwners: true });
      if (!fileOk) {
        console.error(`[screenplay_store] legacy mirror write failed after CAS for owner ${ownerKey}`);
      }
      return {
        ok: true,
        owner: cloneJson(committedOwner),
        persistenceKind,
        persistenceStatus: fileOk ? "ok" : "mirror_failed",
        persistenceOwnerCount: 1,
        persistenceFailureCount: 0,
        mirrorFailureCount: fileOk ? 0 : 1,
      };
    } catch (error) {
      console.error("[screenplay_store] adapter CAS failed:", error?.message || error);
      const rollbackOwner = normalizeStoredScreenplayOwner(expectedValue) || rollbackBaseline;
      if (rollbackOwner) {
        screenplayStoreByOwner.set(ownerKey, rollbackOwner);
      } else if (screenplayStoreByOwner.get(ownerKey) === ownerRecord) {
        screenplayStoreByOwner.delete(ownerKey);
      }
      writeScreenplayStoreMirror(Date.now(), { preferPersistedOwners: true });
      return {
        ok: false,
        persistenceKind,
        persistenceStatus: "failed",
        persistenceOwnerCount: 1,
        persistenceFailureCount: 1,
      };
    }
  });
  void persistencePromise;
  return {
    ok: true,
    fileOk: null,
    persistenceKind,
    persistenceStatus: "pending",
    persistenceOwnerCount: 1,
    persistenceFailureCount: 0,
    persistencePromise,
  };
}

export {
  commitScreenplayOwnerMutation,
  configureScreenplayStore,
  ensureScreenplayOutline,
  getLatestScreenplayVersion,
  getOrCreateScreenplayOwnerRecord,
  getScreenplayProjectRecord,
  loadScreenplayStore,
  markScreenplayOwnerDirty,
  recalculateScreenplayProject,
  saveScreenplayStore,
  loadScreenplayStoreFromAdapter,
  refreshScreenplayOwnerRecord,
  screenplayStoreByOwner,
  tombstoneScreenplayOwnerRecord,
};
