const DEFAULT_DAILY_LIMIT = 500;
const BYPASS_HEADER = "x-test-bypass-provider-budget";

function startOfUtcDayMs(timestampMs) {
  const d = new Date(Number(timestampMs) || Date.now());
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function createProviderBudgetGuard({
  dailyLimit = DEFAULT_DAILY_LIMIT,
  now = () => Date.now(),
  isEnabled = () => true,
  isProduction = () => (process.env.NODE_ENV || "") === "production",
  resolveIdentity,
} = {}) {
  const limit = Math.max(1, Math.floor(Number(dailyLimit) || DEFAULT_DAILY_LIMIT));
  const counters = new Map();
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
      const key = keyFor(req, routeClass);
      const used = Number(counters.get(key) || 0);
      if (used >= limit) {
        res.setHeader("Retry-After", "86400");
        return res.status(429).json({
          stage: "provider_budget",
          error: "provider_budget_exceeded",
          route_class: routeClass,
          daily_limit: limit,
        });
      }
      counters.set(key, used + 1);
      return next();
    };
  }

  return {
    middleware,
    keyFor,
    inspect: (key) => Number(counters.get(key) || 0),
    reset: () => counters.clear(),
    get dailyLimit() { return limit; },
  };
}

export {
  BYPASS_HEADER,
  DEFAULT_DAILY_LIMIT,
  createProviderBudgetGuard,
  startOfUtcDayMs,
};
