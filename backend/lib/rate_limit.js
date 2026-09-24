// Token-bucket rate limiter — Phase 0 of T-backend-rate-limit.
//
// See docs/specs/T-backend-rate-limit.md for the contract. This
// module ships the helper + tests. The V1 auth, realtime, and visual
// paid-provider routes are wired in backend/index.js; future broad-route
// adoption can keep using the same classed middleware.
//
// In-memory only — single-instance V1 deployment. If the backend
// scales out, this becomes T-rate-limit-redis-followup.

const DEFAULT_BUCKETS = Object.freeze({
  // 5 reqs / minute / IP — anti-brute-force on signup/login/reset.
  auth: { capacity: 5, windowMs: 60_000 },
  // 20 reqs / minute / user — bounds OpenAI realtime mint cost.
  realtime_mint: { capacity: 20, windowMs: 60_000 },
  // 120 reqs / minute / user — generous default for everything else.
  default: { capacity: 120, windowMs: 60_000 },
});

const DEFAULT_MAX_KEYS = 50_000;
const BYPASS_HEADER = "x-test-bypass-rate-limit";

function createRateLimiter({
  buckets = DEFAULT_BUCKETS,
  maxKeys = DEFAULT_MAX_KEYS,
  now = () => Date.now(),
  isProduction = () => (process.env.NODE_ENV || "") === "production",
} = {}) {
  // Map<compositeKey, { tokens: number, lastRefillMs: number }>
  // Insertion-ordered → simple LRU eviction at the head.
  const state = new Map();

  function bucketSpec(routeClass) {
    return buckets[routeClass] || buckets.default;
  }

  function refill(entry, spec, t) {
    const elapsed = t - entry.lastRefillMs;
    if (elapsed <= 0) return;
    const refillRate = spec.capacity / spec.windowMs; // tokens per ms
    entry.tokens = Math.min(spec.capacity, entry.tokens + elapsed * refillRate);
    entry.lastRefillMs = t;
  }

  function consume(compositeKey, routeClass) {
    const spec = bucketSpec(routeClass);
    const t = now();
    // Storage key always namespaces by route class so the same caller
    // key under different classes does not share token state.
    const SEP = String.fromCharCode(31);
    const storageKey = `${compositeKey}${SEP}${routeClass}`;
    let entry = state.get(storageKey);
    if (!entry) {
      entry = { tokens: spec.capacity, lastRefillMs: t };
      state.set(storageKey, entry);
      while (state.size > maxKeys) {
        const first = state.keys().next().value;
        if (first == null) break;
        state.delete(first);
      }
    } else {
      // Re-insert for LRU ordering.
      state.delete(storageKey);
      state.set(storageKey, entry);
      refill(entry, spec, t);
    }
    if (entry.tokens < 1) {
      const tokensShort = 1 - entry.tokens;
      const retryAfterMs = Math.ceil(tokensShort * spec.windowMs / spec.capacity);
      return { allowed: false, retryAfterMs };
    }
    entry.tokens -= 1;
    return { allowed: true, retryAfterMs: 0 };
  }

  function keyFor(req, routeClass) {
    const userId = String(req?.authUser?.id || req?.userId || req?.user?.id || "").trim();
    if (userId) return `u:${userId}|${routeClass}`;
    // backend/index.js sets Express trust proxy before this middleware runs,
    // so req.ip is the canonical trusted client IP. Do not parse inbound
    // X-Forwarded-For here; raw forwarding headers are client-spoofable.
    const ip = String(req?.ip || req?.socket?.remoteAddress || "unknown").trim() || "unknown";
    return `ip:${ip}|${routeClass}`;
  }

  function middleware(routeClass) {
    return function rateLimitMiddleware(req, res, next) {
      if (!isProduction()) {
        const bypass = String(req.header?.(BYPASS_HEADER) || "").trim();
        if (bypass === "1") return next();
      }
      const key = keyFor(req, routeClass);
      const result = consume(key, routeClass);
      if (result.allowed) return next();
      const retryAfterSec = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        error: "rate_limited",
        route_class: routeClass,
        retry_after_seconds: retryAfterSec,
        // Same field the talk-turn and provider-budget envelopes carry; the
        // client schedules its retry from it.
        retry_after_ms: Math.max(1_000, Math.ceil(result.retryAfterMs)),
      });
    };
  }

  return {
    get size() { return state.size; },
    middleware,
    consume,    // exposed for tests
    keyFor,     // exposed for tests
    reset: () => state.clear(),
  };
}

export {
  createRateLimiter,
  DEFAULT_BUCKETS,
  DEFAULT_MAX_KEYS,
  BYPASS_HEADER,
};
