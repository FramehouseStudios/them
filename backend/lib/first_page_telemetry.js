// T-first-page-telemetry-sink — server-side sink for the
// `first_page_written` event (T05 / T11 magic-moment SLA).
//
// The iOS client fires when the user ships their first
// screenplay-formatted page. This module persists each event so the
// magic-moment SLA can be measured server-side, not just at the
// client. One event per user — re-submissions are idempotent and
// preserve the original `occurredAt`.
//
// Public surface (pure persistence; no LLM, no compute):
//
//   recordFirstPageWritten({ persistence, userId, projectId, versionId?,
//     source?, secondsToFirstPage?, occurredAtMs? }) -> { ok, action, entry }
//
//   getFirstPageEventForUser({ persistence, userId }) -> entry | null
//
//   listFirstPageEvents({ persistence, limit? }) -> entry[]
//     chronologically ascending; capped.
//
//   summarizeFirstPageEvents(entries) -> { total, medianSeconds,
//     percentile90Seconds, percentile50Seconds }
//     pure aggregator the stats route uses.

const SCHEMA_VERSION = 1;
const DOMAIN = "telemetry_first_page_written";
const KEY_PREFIX = "user:";
const MAX_LIST = 5000;

function trimToString(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

function storageKey(userId) {
  const u = trimToString(userId);
  if (!u) return null;
  return `${KEY_PREFIX}${u}`;
}

async function recordFirstPageWritten({
  persistence,
  userId,
  projectId = null,
  versionId = null,
  source = null,
  secondsToFirstPage = null,
  occurredAtMs = Date.now(),
} = {}) {
  if (!persistence || typeof persistence.put !== "function") {
    const e = new Error("recordFirstPageWritten requires a persistence handle");
    e.code = "first_page_invalid_input";
    throw e;
  }
  const u = trimToString(userId);
  if (!u) {
    return { ok: false, action: "skipped", reason: "missing_userId" };
  }
  const key = storageKey(u);
  // Idempotent on userId: preserve the original occurredAt if present.
  let existing = null;
  try {
    existing = await persistence.get({ domain: DOMAIN, key });
  } catch (_e) { /* missing is fine */ }
  const ts = Number(occurredAtMs) || Date.now();
  const secs = Number.isFinite(secondsToFirstPage) && secondsToFirstPage >= 0
    ? Math.round(secondsToFirstPage * 100) / 100
    : null;
  const entry = {
    schemaVersion: SCHEMA_VERSION,
    userId: u,
    projectId: trimToString(projectId) || null,
    versionId: trimToString(versionId) || null,
    source: trimToString(source) || null,
    secondsToFirstPage: existing && Number.isFinite(existing.secondsToFirstPage)
      ? existing.secondsToFirstPage
      : secs,
    occurredAt: existing && existing.occurredAt
      ? existing.occurredAt
      : new Date(ts).toISOString(),
    occurredAtMs: existing && Number.isFinite(existing.occurredAtMs)
      ? existing.occurredAtMs
      : ts,
    lastSeenAt: new Date(ts).toISOString(),
    lastSeenAtMs: ts,
  };
  await persistence.put({ domain: DOMAIN, key, value: entry });
  return { ok: true, action: existing ? "updated" : "recorded", entry };
}

async function getFirstPageEventForUser({ persistence, userId } = {}) {
  if (!persistence || typeof persistence.get !== "function") {
    throw new Error("getFirstPageEventForUser requires a persistence handle");
  }
  const key = storageKey(userId);
  if (!key) return null;
  return persistence.get({ domain: DOMAIN, key });
}

async function listFirstPageEvents({ persistence, limit = MAX_LIST } = {}) {
  if (!persistence || typeof persistence.list !== "function") {
    throw new Error("listFirstPageEvents requires a persistence handle");
  }
  const cap = Math.max(1, Math.min(MAX_LIST, Math.floor(Number(limit) || MAX_LIST)));
  const records = await persistence.list({
    domain: DOMAIN,
    prefix: KEY_PREFIX,
    limit: cap,
  });
  return (records || [])
    .map((r) => r.value)
    .filter((v) => v && v.userId)
    .sort((a, b) => (Number(a.occurredAtMs) || 0) - (Number(b.occurredAtMs) || 0));
}

function percentile(sortedNumbers, p) {
  if (!Array.isArray(sortedNumbers) || sortedNumbers.length === 0) return null;
  if (sortedNumbers.length === 1) return sortedNumbers[0];
  const rank = (p / 100) * (sortedNumbers.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedNumbers[lo];
  const w = rank - lo;
  return sortedNumbers[lo] * (1 - w) + sortedNumbers[hi] * w;
}

function summarizeFirstPageEvents(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { total: 0, medianSeconds: null, percentile90Seconds: null, percentile50Seconds: null };
  }
  const total = entries.length;
  const seconds = entries
    .map((e) => Number(e.secondsToFirstPage))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);
  if (seconds.length === 0) {
    return { total, medianSeconds: null, percentile90Seconds: null, percentile50Seconds: null };
  }
  return {
    total,
    medianSeconds: percentile(seconds, 50),
    percentile50Seconds: percentile(seconds, 50),
    percentile90Seconds: percentile(seconds, 90),
  };
}

// Test seam.
async function _clearTelemetry(persistence) {
  if (!persistence || typeof persistence.clear !== "function") return;
  await persistence.clear({ domain: DOMAIN });
}

// ---------- module-level configuration (for routes) ----------

let configuredDeps = { persistence: null };

function configureFirstPageTelemetry({ persistence = null } = {}) {
  configuredDeps = { persistence };
}

function firstPageTelemetryDeps() {
  return configuredDeps;
}

export {
  recordFirstPageWritten,
  getFirstPageEventForUser,
  listFirstPageEvents,
  summarizeFirstPageEvents,
  storageKey,
  SCHEMA_VERSION as FIRST_PAGE_TELEMETRY_SCHEMA_VERSION,
  DOMAIN as FIRST_PAGE_TELEMETRY_DOMAIN,
  configureFirstPageTelemetry,
  firstPageTelemetryDeps,
  _clearTelemetry,
};
