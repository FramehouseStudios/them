// T-talk-turn-rate-limit-helper — pure token-bucket rate limiter.
//
// The talk-turn read endpoint (`GET /talk/turn/:turnId`) is pinned
// as a contract (PR #125) but uses a permissive read path: any
// caller can enumerate turn IDs at maximum HTTP throughput. For a
// later production deployment we want a cheap per-key burst guard.
//
// This module ships the pure limiter (no Express coupling) so it
// can be unit-tested deterministically and plugged into the route
// in a follow-up PR.
//
// Algorithm:
//
//   - Token bucket per key, refill rate R tokens/sec, capacity C.
//   - Each request consumes 1 token. If 0 tokens remain → denied.
//   - State stored in a Map keyed by `key` (typically IP + userId).
//   - LRU eviction at capCacheEntries (default 10_000) — oldest
//     entry by lastSeen drops when the cap is hit.
//
// No I/O. Deterministic with an injected `nowFn`.

const TALK_TURN_RATE_LIMIT_SCHEMA_VERSION = 1;

function createTalkTurnRateLimiter({
  // Allow 30 req/min sustained, 10 burst.
  refillPerSec = 0.5,
  capacity = 10,
  capCacheEntries = 10_000,
  nowFn = () => Date.now(),
} = {}) {
  if (!Number.isFinite(refillPerSec) || refillPerSec <= 0) {
    throw new Error("refillPerSec must be a positive finite number");
  }
  if (!Number.isFinite(capacity) || capacity <= 0) {
    throw new Error("capacity must be a positive finite number");
  }

  const buckets = new Map(); // key -> { tokens, lastRefillMs, lastSeenMs }

  function refill(bucket, nowMs) {
    const elapsedMs = Math.max(0, nowMs - bucket.lastRefillMs);
    const refillTokens = (elapsedMs / 1000) * refillPerSec;
    bucket.tokens = Math.min(capacity, bucket.tokens + refillTokens);
    bucket.lastRefillMs = nowMs;
  }

  function evictIfNeeded() {
    if (buckets.size <= capCacheEntries) return;
    // Drop the single oldest-by-lastSeen entry. Cheap O(n) sweep; we
    // amortize this against the steady-state size cap.
    let oldestKey = null;
    let oldestAt = Infinity;
    for (const [k, v] of buckets) {
      if (v.lastSeenMs < oldestAt) {
        oldestAt = v.lastSeenMs;
        oldestKey = k;
      }
    }
    if (oldestKey !== null) buckets.delete(oldestKey);
  }

  function attempt(key) {
    if (typeof key !== "string" || key.length === 0) {
      // Reject empty keys explicitly so we don't pool unauthenticated
      // requests behind a single bucket.
      return { allowed: false, reason: "missing_key" };
    }
    const nowMs = nowFn();
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { tokens: capacity, lastRefillMs: nowMs, lastSeenMs: nowMs };
      buckets.set(key, bucket);
      evictIfNeeded();
    }
    refill(bucket, nowMs);
    bucket.lastSeenMs = nowMs;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        capacity,
        refillPerSec,
      };
    }
    const msUntilToken = ((1 - bucket.tokens) / refillPerSec) * 1000;
    return {
      allowed: false,
      reason: "rate_limited",
      retryAfterMs: Math.max(0, Math.ceil(msUntilToken)),
      capacity,
      refillPerSec,
    };
  }

  function inspect(key) {
    const bucket = buckets.get(key);
    if (!bucket) return null;
    return {
      tokens: bucket.tokens,
      lastRefillMs: bucket.lastRefillMs,
      lastSeenMs: bucket.lastSeenMs,
    };
  }

  function size() {
    return buckets.size;
  }

  function reset() {
    buckets.clear();
  }

  return { attempt, inspect, size, reset, schemaVersion: TALK_TURN_RATE_LIMIT_SCHEMA_VERSION };
}

export {
  createTalkTurnRateLimiter,
  TALK_TURN_RATE_LIMIT_SCHEMA_VERSION,
};
