// T-talk-error-rate-tracker — in-memory error counter for /talk +
// /realtime pipeline failures.
//
// Counts how often each error class fires (supplier_unavailable,
// supplier_timeout, mint_failed, recovery_invoked, response_invalid,
// etc.) so an ops surface can report the real error rate instead of
// guessing from logs. Counter is in-memory only (resets on process
// restart, which is fine for a live error-rate signal; persistent
// historical stats are a separate concern).
//
// Public surface:
//
//   incrementErrorCounter(errorClass, { now? })
//     bumps the per-class counter and stamps the most recent
//     occurrence. Unknown classes are accepted and recorded as-is.
//
//   getErrorCounts({ since? }) -> {
//     schemaVersion, total, sinceMs, counts, lastOccurrence,
//     errorRatePerHour
//   }
//     `since` (ms) optionally bounds the window. If `since` is null,
//     reports the lifetime total. `errorRatePerHour` is the rate
//     across the observed window (total / hours since the oldest
//     counter event, capped at the actual observation duration).
//
//   resetErrorCounters() — used by tests and by an explicit ops
//     reset endpoint (future scope).
//
//   mountTalkErrorRoute(app, { now? }) mounts GET /talk/errors.

const SCHEMA_VERSION = 1;

let counts = new Map();             // errorClass → integer
let lastOccurrence = new Map();     // errorClass → ms timestamp
let earliestStampedAt = null;       // ms timestamp of the first event

function incrementErrorCounter(errorClass, { now = Date.now() } = {}) {
  const key = typeof errorClass === "string" && errorClass.trim()
    ? errorClass.trim()
    : "unknown";
  counts.set(key, (counts.get(key) || 0) + 1);
  lastOccurrence.set(key, now);
  if (earliestStampedAt === null || now < earliestStampedAt) {
    earliestStampedAt = now;
  }
}

function getErrorCounts({ since = null, now = Date.now() } = {}) {
  let filteredCounts;
  let filteredLastOccurrence;
  let total = 0;
  if (since !== null && Number.isFinite(since)) {
    filteredCounts = {};
    filteredLastOccurrence = {};
    for (const [key, lastAt] of lastOccurrence.entries()) {
      if (lastAt >= since) {
        filteredCounts[key] = counts.get(key) || 0;
        filteredLastOccurrence[key] = lastAt;
        total += filteredCounts[key];
      }
    }
  } else {
    filteredCounts = Object.fromEntries(counts.entries());
    filteredLastOccurrence = Object.fromEntries(lastOccurrence.entries());
    total = [...counts.values()].reduce((a, b) => a + b, 0);
  }
  const observationStartMs = since !== null && Number.isFinite(since)
    ? since
    : (earliestStampedAt || now);
  const hours = Math.max(1 / 3600, (now - observationStartMs) / (60 * 60 * 1000));
  const errorRatePerHour = total > 0
    ? Math.round((total / hours) * 100) / 100
    : 0;
  return {
    schemaVersion: SCHEMA_VERSION,
    total,
    counts: filteredCounts,
    lastOccurrence: filteredLastOccurrence,
    sinceMs: since !== null && Number.isFinite(since) ? since : (earliestStampedAt || 0),
    observedAtMs: now,
    errorRatePerHour,
  };
}

function resetErrorCounters() {
  counts = new Map();
  lastOccurrence = new Map();
  earliestStampedAt = null;
}

function mountTalkErrorRoute(app) {
  if (!app || typeof app.get !== "function") {
    throw new Error("mountTalkErrorRoute requires an Express app");
  }
  app.get("/talk/errors", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const sinceRaw = req.query?.sinceMs;
    const since = Number.isFinite(Number(sinceRaw)) && Number(sinceRaw) > 0
      ? Number(sinceRaw)
      : null;
    const snapshot = getErrorCounts({ since });
    return res.status(200).json(snapshot);
  });
}

export {
  incrementErrorCounter,
  getErrorCounts,
  resetErrorCounters,
  mountTalkErrorRoute,
  SCHEMA_VERSION as TALK_ERROR_COUNTER_SCHEMA_VERSION,
};
