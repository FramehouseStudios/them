const DEFAULT_DAILY_LIMIT = 500;
// Global cap: every provider-backed request the backend makes in a UTC day,
// across all identities and route classes. 0 = off. The per-identity cap
// cannot see the organisation's total; on 2026-09-23 the OpenAI org ran out
// of credits under load that no single identity exceeded.
const DEFAULT_GLOBAL_DAILY_LIMIT = 0;
const GLOBAL_LIMIT_ENV = "PROVIDER_GLOBAL_DAILY_BUDGET_LIMIT";
const BYPASS_HEADER = "x-test-bypass-provider-budget";

function parseLimit(value, fallback) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function startOfUtcDayMs(timestampMs) {
  const d = new Date(Number(timestampMs) || Date.now());
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function createProviderBudgetGuard({
  dailyLimit = DEFAULT_DAILY_LIMIT,
  globalDailyLimit = parseLimit(process.env[GLOBAL_LIMIT_ENV], DEFAULT_GLOBAL_DAILY_LIMIT),
  now = () => Date.now(),
  isEnabled = () => true,
  isProduction = () => (process.env.NODE_ENV || "") === "production",
  resolveIdentity,
  logger = console,
} = {}) {
  const limit = Math.max(1, Math.floor(Number(dailyLimit) || DEFAULT_DAILY_LIMIT));
  const globalLimit = parseLimit(globalDailyLimit, DEFAULT_GLOBAL_DAILY_LIMIT);
  const counters = new Map();
  // Per UTC day: total requests and per route class, across every identity.
  const globalCounters = new Map();
  let globalTrippedDay = -1;
  function globalKey(routeClass = "") {
    return `${startOfUtcDayMs(now())}:${routeClass}`;
  }
  function globalUsed(routeClass = "") {
    return Number(globalCounters.get(globalKey(routeClass)) || 0);
  }
  function bumpGlobal(routeClass) {
    for (const rc of ["", routeClass]) {
      const key = globalKey(rc);
      globalCounters.set(key, Number(globalCounters.get(key) || 0) + 1);
    }
  }
  const identityFor = typeof resolveIdentity === "function"
    ? resolveIdentity
    : (req) => String(req?.authUser?.id || req?.userId || req?.ip || "unknown").trim();

  function keyFor(req, routeClass = "provider") {
    const identity = identityFor(req) || "unknown";
    return `${identity}:${routeClass}:${startOfUtcDayMs(now())}`;
  }

  function middleware(routeClass = "provider") {
    return function providerBudgetMiddleware(req, res, next) {
      if (!isEnabled()) return next();
      if (!isProduction()) {
        const bypass = String(req.header?.(BYPASS_HEADER) || "").trim();
        if (bypass === "1") return next();
      }
      if (globalLimit > 0 && globalUsed() >= globalLimit) {
        const day = startOfUtcDayMs(now());
        if (globalTrippedDay !== day) {
          globalTrippedDay = day;
          logger?.warn?.(`[provider_budget] global daily limit reached limit=${globalLimit} route_class=${routeClass}`);
        }
        res.setHeader("Retry-After", "86400");
        return res.status(429).json({
          stage: "provider_budget",
          error: "provider_budget_exceeded",
          scope: "global",
          route_class: routeClass,
          daily_limit: globalLimit,
        });
      }
      const key = keyFor(req, routeClass);
      const used = Number(counters.get(key) || 0);
      if (used >= limit) {
        res.setHeader("Retry-After", "86400");
        return res.status(429).json({
          stage: "provider_budget",
          error: "provider_budget_exceeded",
          scope: "identity",
          route_class: routeClass,
          daily_limit: limit,
        });
      }
      counters.set(key, used + 1);
      bumpGlobal(routeClass);
      return next();
    };
  }

  /** Today's provider-backed request counts, for ops. No identities. */
  function snapshot() {
    const day = startOfUtcDayMs(now());
    const prefix = `${day}:`;
    const byRouteClass = {};
    for (const [key, count] of globalCounters) {
      if (!key.startsWith(prefix)) continue;
      const rc = key.slice(prefix.length);
      if (rc) byRouteClass[rc] = count;
    }
    return {
      utc_day: new Date(day).toISOString().slice(0, 10),
      global_used: globalUsed(),
      global_daily_limit: globalLimit,
      identity_daily_limit: limit,
      by_route_class: byRouteClass,
    };
  }

  return {
    middleware,
    keyFor,
    inspect: (key) => Number(counters.get(key) || 0),
    snapshot,
    reset: () => { counters.clear(); globalCounters.clear(); globalTrippedDay = -1; },
    get dailyLimit() { return limit; },
    get globalDailyLimit() { return globalLimit; },
  };
}

export {
  BYPASS_HEADER,
  DEFAULT_DAILY_LIMIT,
  DEFAULT_GLOBAL_DAILY_LIMIT,
  GLOBAL_LIMIT_ENV,
  createProviderBudgetGuard,
  startOfUtcDayMs,
};
