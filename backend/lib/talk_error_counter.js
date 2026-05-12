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
// Access-control posture: SAFE-PUBLIC.
//   GET /talk/errors is mounted without authentication, matching the
//   ops dashboard pattern used by /ops/metrics, /ops/alerts, and
//   /ops/health-summary. The response contains ONLY error-class names
//   (e.g. "supplier_unavailable") and counts. It contains NO per-user
//   content, NO request bodies, NO user IDs, NO prompts, NO model
//   output, NO IPs, and NO timestamps tied to a specific user. If a
//   future change adds anything user-derived to a counter key,
//   re-evaluate this posture before merging.
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
//     `since` (ms) optionally bounds the window. When `since` is set,
//     `counts` and `total` reflect ONLY events whose timestamp is
//     >= since (not the class's lifetime count). When `since` is
//     null, reports the lifetime total. `errorRatePerHour` is the
//     rate across the observed window.
//
//   resetErrorCounters() — used by tests and by an explicit ops
//     reset endpoint (future scope).
//
//   mountTalkErrorRoute(app, { now? }) mounts GET /talk/errors.
//
// Storage shape:
//   counts:         Map<class, lifetimeCount>
//   lastOccurrence: Map<class, mostRecentMs>
//   occurrences:    Map<class, number[]>   // sorted timestamps,
//                                          // ring-buffered to cap mem
// The occurrences ring is what makes the `since` window honest. Cap
// is per-class so a hot class doesn't crowd out a rare one.

const SCHEMA_VERSION = 1;
const OCCURRENCE_RING_CAP_PER_CLASS = 2048;

let counts = new Map();             // errorClass → integer (lifetime)
let lastOccurrence = new Map();     // errorClass → ms timestamp
let occurrences = new Map();        // errorClass → sorted ms timestamps
let earliestStampedAt = null;       // ms timestamp of the first event

function incrementErrorCounter(errorClass, { now = Date.now() } = {}) {
  const key = typeof errorClass === "string" && errorClass.trim()
    ? errorClass.trim()
    : "unknown";
  counts.set(key, (counts.get(key) || 0) + 1);
  lastOccurrence.set(key, now);
  let ring = occurrences.get(key);
  if (!ring) {
    ring = [];
    occurrences.set(key, ring);
  }
  ring.push(now);
  // Bound memory: keep the most recent N timestamps per class. The
  // ring is append-mostly-monotonic in practice (now flows forward),
  // but tests may pass arbitrary `now` values, so trim by length.
  if (ring.length > OCCURRENCE_RING_CAP_PER_CLASS) {
    ring.splice(0, ring.length - OCCURRENCE_RING_CAP_PER_CLASS);
  }
  if (earliestStampedAt === null || now < earliestStampedAt) {
    earliestStampedAt = now;
  }
}

function countSince(ring, since) {
  // ring is push-ordered; if `now` arrived monotonically, ring is
  // sorted ascending and we could binary-search. To stay correct
  // under out-of-order test timestamps, do a linear scan.
  let n = 0;
  for (let i = 0; i < ring.length; i += 1) {
    if (ring[i] >= since) n += 1;
  }
  return n;
}

function getErrorCounts({ since = null, now = Date.now() } = {}) {
  let filteredCounts;
  let filteredLastOccurrence;
  let total = 0;
  if (since !== null && Number.isFinite(since)) {
    filteredCounts = {};
    filteredLastOccurrence = {};
    for (const [key, ring] of occurrences.entries()) {
      const windowCount = countSince(ring, since);
      if (windowCount > 0) {
        filteredCounts[key] = windowCount;
        filteredLastOccurrence[key] = lastOccurrence.get(key);
        total += windowCount;
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
  occurrences = new Map();
  earliestStampedAt = null;
}

function mountTalkErrorRoute(app) {
  if (!app || typeof app.get !== "function") {
    throw new Error("mountTalkErrorRoute requires an Express app");
  }
  // Safe-public: see module header. Counts + class names only; no
  // user-derived data ever lands in the response.
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
  OCCURRENCE_RING_CAP_PER_CLASS,
};
