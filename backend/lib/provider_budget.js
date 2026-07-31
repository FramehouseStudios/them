// Provider budget guard.
//
// Two layers in ONE module (no parallel budget system):
//   1. A per-identity, per-route-class daily REQUEST counter (in-memory; a
//      coarse abuse throttle). Unchanged legacy behavior.
//   2. A durable per-user daily estimated-DOLLAR ledger backed by the
//      persistence adapter (domain "provider_spend"), enforcing a hard cap that
//      survives restarts and spans instances. This replaces the old
//      "count requests in a Map" approach to actually bounding provider spend.
//
// Fail posture for the dollar cap:
//   - cap exhaustion              -> 429 provider_spend_exceeded
//   - meter READ failure in prod  -> 503 provider_spend_unavailable (FAIL CLOSED)
//   - dev/test                    -> may fail open, but ONLY when the explicit
//                                    failOpen setting is enabled; otherwise 503.
//
// Charging is idempotent per turn id, so a retried/replayed commit cannot
// double-count spend (belt-and-suspenders with the HTTP idempotency guards).

const DEFAULT_DAILY_LIMIT = 500;
const BYPASS_HEADER = "x-test-bypass-provider-budget";
const SPEND_DOMAIN = "provider_spend";
const CHARGED_TURN_ID_CAP = 5000;

// Rough default USD prices; override via `prices`. Cost is ESTIMATED from text
// sizes + audio duration (token usage is not threaded back from every provider
// call site). Accuracy affects WHEN the cap trips, not WHETHER it protects.
const DEFAULT_PRICES = Object.freeze({
  chatInputPer1kTokens: 0.005,
  chatOutputPer1kTokens: 0.015,
  ttsPer1kChars: 0.015,
  sttPerMinute: 0.006,
  promptOverheadTokens: 1200,
  charsPerToken: 4,
});

function startOfUtcDayMs(timestampMs) {
  const d = new Date(Number(timestampMs) || Date.now());
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function resolvePrices(prices = {}) {
  const merged = { ...DEFAULT_PRICES };
  for (const [k, v] of Object.entries(prices || {})) {
    if (v == null) continue;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) merged[k] = n;
  }
  if (!(merged.charsPerToken > 0)) merged.charsPerToken = DEFAULT_PRICES.charsPerToken;
  return merged;
}

// Pure. Estimates the USD cost of a single turn from its text/audio sizes.
function estimateTurnCostUsd(turn = {}, prices = DEFAULT_PRICES) {
  const p = resolvePrices(prices);
  const transcriptChars = Math.max(0, Number(turn.transcriptChars) || 0);
  const replyChars = Math.max(0, Number(turn.replyChars) || 0);
  const audioDurationMs = Math.max(0, Number(turn.audioDurationMs) || 0);
  const inputTokens = p.promptOverheadTokens + Math.ceil(transcriptChars / p.charsPerToken);
  const outputTokens = Math.ceil(replyChars / p.charsPerToken);
  const chatUsd =
    (inputTokens / 1000) * p.chatInputPer1kTokens +
    (outputTokens / 1000) * p.chatOutputPer1kTokens;
  const ttsUsd = (replyChars / 1000) * p.ttsPer1kChars;
  const sttUsd = (audioDurationMs / 60000) * p.sttPerMinute;
  const total = chatUsd + ttsUsd + sttUsd;
  return Number.isFinite(total) && total > 0 ? total : 0;
}

function createProviderBudgetGuard({
  dailyLimit = DEFAULT_DAILY_LIMIT,
  now = () => Date.now(),
  isEnabled = () => true,
  isProduction = () => (process.env.NODE_ENV || "") === "production",
  resolveIdentity,
  // Durable dollar accounting (all optional; inert unless a cap + persistence
  // are supplied).
  persistence = null,
  dailyUsdCap = 0,
  prices = {},
  failOpen = false,
  logger = console,
} = {}) {
  const limit = Math.max(1, Math.floor(Number(dailyLimit) || DEFAULT_DAILY_LIMIT));
  const counters = new Map();
  const identityFor = typeof resolveIdentity === "function"
    ? resolveIdentity
    : (req) => String(req?.authUser?.id || req?.userId || req?.ip || "unknown").trim();

  const capUsd = Math.max(0, Number(dailyUsdCap) || 0);
  const priceTable = resolvePrices(prices);
  const spendChains = new Map();
  const chargedTurnIds = new Set();
  const spendEnabled = () => capUsd > 0 && Boolean(persistence);

  function keyFor(req, routeClass = "provider") {
    const identity = identityFor(req) || "unknown";
    return `${identity}:${routeClass}:${startOfUtcDayMs(now())}`;
  }

  function shouldBypass(req) {
    if (isProduction()) return false;
    return String(req?.header?.(BYPASS_HEADER) || "").trim() === "1";
  }

  // ---- layer 1: request counter (legacy) ----
  function middleware(routeClass = "provider") {
    return function providerBudgetMiddleware(req, res, next) {
      if (!isEnabled()) return next();
      if (shouldBypass(req)) return next();
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

  // ---- layer 2: durable dollar ledger ----
  function spendKey(identity, ts = now()) {
    return `${String(identity || "unknown")}:${startOfUtcDayMs(ts)}`;
  }

  // Throws on persistence failure so gates can fail closed.
  async function readSpendUsd(identity) {
    if (!persistence) return 0;
    const row = await persistence.get({ domain: SPEND_DOMAIN, key: spendKey(identity) });
    return row && Number.isFinite(Number(row.usd)) ? Number(row.usd) : 0;
  }

  async function isOverCap(identity) {
    if (capUsd <= 0) return { over: false, totalUsd: 0, capUsd };
    const totalUsd = await readSpendUsd(identity);
    return { over: totalUsd >= capUsd, totalUsd, capUsd };
  }

  // Accumulate a turn's estimated cost. Serialized per key; idempotent per
  // turnId. Returns the new running total, or -1 if the turnId was already
  // charged. Fire-and-forget friendly (never throws).
  function recordSpend(identity, turn = {}, { turnId = "" } = {}) {
    if (!spendEnabled()) return Promise.resolve(0);
    const tid = String(turnId || "").trim();
    if (tid) {
      if (chargedTurnIds.has(tid)) return Promise.resolve(-1);
      chargedTurnIds.add(tid);
      if (chargedTurnIds.size > CHARGED_TURN_ID_CAP) {
        const keep = [...chargedTurnIds].slice(-Math.floor(CHARGED_TURN_ID_CAP / 2));
        chargedTurnIds.clear();
        for (const k of keep) chargedTurnIds.add(k);
      }
    }
    const cost = estimateTurnCostUsd(turn, priceTable);
    const key = spendKey(identity);
    const prev = spendChains.get(key) || Promise.resolve();
    const next = prev
      .then(async () => {
        const row = await persistence.get({ domain: SPEND_DOMAIN, key });
        const prevUsd = row && Number.isFinite(Number(row.usd)) ? Number(row.usd) : 0;
        const prevTurns = row && Number.isFinite(Number(row.turns)) ? Number(row.turns) : 0;
        const usd = prevUsd + cost;
        await persistence.put({ domain: SPEND_DOMAIN, key, value: { usd, turns: prevTurns + 1, updatedAt: now() } });
        return usd;
      })
      .catch((err) => {
        // Un-charge the turn id so a later legitimate retry can re-attempt.
        if (tid) chargedTurnIds.delete(tid);
        logger?.error?.("[provider_budget] spend accumulate failed:", err);
        return 0;
      });
    spendChains.set(key, next.catch(() => {}));
    return next;
  }

  // Enforcement gate: 429 over cap, 503 on meter failure (fail closed in prod).
  function spendMiddleware() {
    return async function providerSpendMiddleware(req, res, next) {
      if (!spendEnabled()) return next();
      if (shouldBypass(req)) return next();
      const identity = identityFor(req) || "unknown";
      let status;
      try {
        status = await isOverCap(identity);
      } catch (err) {
        const mayFailOpen = !isProduction() && failOpen === true;
        if (mayFailOpen) {
          logger?.error?.("[provider_budget] meter read failed; failing OPEN (dev, explicit):", err);
          return next();
        }
        logger?.error?.("[provider_budget] meter read failed; failing CLOSED:", err);
        res.setHeader("Retry-After", "30");
        return res.status(503).json({ stage: "provider_budget", error: "provider_spend_unavailable" });
      }
      if (status.over) {
        res.setHeader("Retry-After", "86400");
        return res.status(429).json({
          stage: "provider_budget",
          error: "provider_spend_exceeded",
          daily_cap_usd: Number(status.capUsd.toFixed(4)),
          spent_usd: Number(status.totalUsd.toFixed(4)),
        });
      }
      return next();
    };
  }

  // Read-only eligibility check for realtime mint (checks WITHOUT charging).
  // Throws on meter failure so the caller decides fail-open vs fail-closed.
  async function checkEligibility(req) {
    if (!spendEnabled()) return { allowed: true, reason: "disabled" };
    if (shouldBypass(req)) return { allowed: true, reason: "bypass" };
    const identity = identityFor(req) || "unknown";
    const { over, totalUsd, capUsd: cap } = await isOverCap(identity);
    return { allowed: !over, over, totalUsd, capUsd: cap };
  }

  return {
    middleware,
    keyFor,
    inspect: (key) => Number(counters.get(key) || 0),
    reset: () => {
      counters.clear();
      spendChains.clear();
      chargedTurnIds.clear();
    },
    get dailyLimit() { return limit; },
    // dollar-ledger surface
    estimate: (turn) => estimateTurnCostUsd(turn, priceTable),
    readSpendUsd,
    isOverCap,
    recordSpend,
    spendMiddleware,
    checkEligibility,
    get dailyUsdCap() { return capUsd; },
    get spendEnabled() { return spendEnabled(); },
  };
}

export {
  BYPASS_HEADER,
  DEFAULT_DAILY_LIMIT,
  DEFAULT_PRICES,
  SPEND_DOMAIN,
  estimateTurnCostUsd,
  createProviderBudgetGuard,
  startOfUtcDayMs,
};
