// T07a: outbox snapshotter.
//
// Periodically reads the current outbox state from scaleBackplane
// (the canonical queue layer) and writes a JSON snapshot into the
// T07 persistence adapter under the `outbox` domain. The snapshot
// is for diagnostics and cold-start recovery diagnostics — the
// queue itself stays on scaleBackplane (Redis + Postgres-backed).
//
// Why a snapshot instead of full migration:
//   - The outbox is a queue with worker semantics (claim, retry,
//     status). Forcing it onto the KV adapter would erase those
//     semantics or duplicate them poorly.
//   - scaleBackplane already has Postgres mode behind
//     SCALE_POSTGRES_URL. Putting a SECOND copy of the queue
//     state under the persistence_adapter just for "completeness"
//     creates two sources of truth.
//   - Operators benefit from a periodic snapshot they can query in
//     the same place as other persisted domain data — without
//     touching the hot path.
//
// Behavior:
//   - On start, the snapshotter takes one immediate snapshot.
//   - It then writes a snapshot every `intervalMs` (default 60s).
//   - Each snapshot is keyed by ISO timestamp; old snapshots are
//     pruned to keep at most `keepLast` entries.
//   - Errors are logged via `logger.log` (or console.error) and
//     never thrown into the caller — the snapshotter is best-effort.
//   - `stop()` cancels the timer and awaits any in-flight write.

const SNAPSHOT_DOMAIN = "outbox";
const SNAPSHOT_KEY_PREFIX = "snapshot:";

function defaultLogger() {
  return {
    log: (msg) => console.log(`[outbox_snapshotter] ${msg}`),
    error: (msg) => console.error(`[outbox_snapshotter] ${msg}`),
  };
}

function isFunction(v) {
  return typeof v === "function";
}

function buildSnapshotPayload(items, takenAtMs) {
  const list = Array.isArray(items) ? items : [];
  const counts = { pending: 0, completed: 0, failed: 0, other: 0, total: list.length };
  const sample = [];
  for (const item of list) {
    const status = String(item?.status || "").toLowerCase();
    if (status === "pending" || status === "completed" || status === "failed") {
      counts[status] += 1;
    } else {
      counts.other += 1;
    }
    if (sample.length < 25) {
      sample.push({
        id: item?.id || null,
        status: item?.status || null,
        type: item?.type || null,
        attempts: Number(item?.attempts || 0),
        retryAt: Number(item?.retryAt || 0) || null,
        updatedAt: Number(item?.updatedAt || 0) || null,
      });
    }
  }
  return {
    schemaVersion: 1,
    takenAtMs,
    takenAt: new Date(takenAtMs).toISOString(),
    counts,
    sample,
  };
}

function snapshotKey(takenAtMs) {
  return `${SNAPSHOT_KEY_PREFIX}${new Date(takenAtMs).toISOString()}`;
}

function createOutboxSnapshotter({
  scaleBackplane,
  persistence,
  intervalMs = 60_000,
  keepLast = 10,
  logger = defaultLogger(),
  listLimit = 2_000,
} = {}) {
  if (!scaleBackplane || !isFunction(scaleBackplane.listOutbox)) {
    throw new Error("createOutboxSnapshotter requires a scaleBackplane with listOutbox");
  }
  if (!persistence || !isFunction(persistence.put)) {
    throw new Error("createOutboxSnapshotter requires a persistence handle with put/list/delete");
  }

  let timer = null;
  let inflight = null;
  let stopped = false;

  async function takeSnapshotOnce(now = Date.now()) {
    if (stopped) return null;
    let items;
    try {
      items = await scaleBackplane.listOutbox({ status: "all", limit: listLimit });
    } catch (err) {
      logger.error?.(`listOutbox failed: ${err?.message || err}`);
      return null;
    }
    const payload = buildSnapshotPayload(items, now);
    const key = snapshotKey(now);
    try {
      await persistence.put({ domain: SNAPSHOT_DOMAIN, key, value: payload });
    } catch (err) {
      logger.error?.(`adapter put failed: ${err?.message || err}`);
      return payload;
    }
    await pruneOldSnapshots().catch((err) => {
      logger.error?.(`prune failed: ${err?.message || err}`);
    });
    logger.log?.(`snapshot ${key} written counts=${JSON.stringify(payload.counts)}`);
    return payload;
  }

  async function pruneOldSnapshots() {
    if (!isFunction(persistence.list) || !isFunction(persistence.delete)) return;
    const all = await persistence.list({
      domain: SNAPSHOT_DOMAIN,
      prefix: SNAPSHOT_KEY_PREFIX,
      limit: 1_000,
    });
    if (!Array.isArray(all) || all.length <= keepLast) return;
    // Keys are sorted ascending by ISO timestamp; oldest first.
    const drop = all.length - keepLast;
    for (let i = 0; i < drop; i += 1) {
      try {
        await persistence.delete({ domain: SNAPSHOT_DOMAIN, key: all[i].key });
      } catch (err) {
        logger.error?.(`prune delete failed for ${all[i].key}: ${err?.message || err}`);
      }
    }
  }

  function start() {
    if (timer) return;
    inflight = takeSnapshotOnce(Date.now());
    timer = setInterval(() => {
      // Don't await — fire-and-forget.
      inflight = takeSnapshotOnce(Date.now()).catch((err) => {
        logger.error?.(`tick failed: ${err?.message || err}`);
      });
    }, intervalMs);
    if (timer.unref) timer.unref();
  }

  async function stop() {
    stopped = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (inflight) {
      try { await inflight; } catch (_e) { /* ignore */ }
      inflight = null;
    }
  }

  return {
    start,
    stop,
    takeSnapshotOnce,
    SNAPSHOT_DOMAIN,
    SNAPSHOT_KEY_PREFIX,
  };
}

export {
  createOutboxSnapshotter,
  buildSnapshotPayload,
  snapshotKey,
  SNAPSHOT_DOMAIN as OUTBOX_SNAPSHOT_DOMAIN,
  SNAPSHOT_KEY_PREFIX as OUTBOX_SNAPSHOT_KEY_PREFIX,
};
