// Day 2: Rate Limits And Spend Guard.
//
// Wires the existing token-bucket limiter (lib/talk_turn_rate_limit.js)
// onto the abuse- and cost-attached route groups, and adds a per-user
// daily provider budget cap. Express-decoupled core so it is unit
// testable deterministically with an injected clock.
//
// Identity keying (load-bearing): the request key is the authenticated
// user id when present, else the trusted client IP. It NEVER consults
// the client-supplied `X-User-Id` header. That header is a spoofable
// trust vector (the Day 1 exposure-lock removes the remaining readers);
// keying a rate/budget guard off it would let an attacker rotate fake
// ids to evade their own limit, or impersonate a victim's id to burn
// the victim's budget. Keeping this guard header-independent makes it
// correct regardless of Day-1 merge order.
//
// `req.ip` is only trustworthy once `app.set("trust proxy", 1)` is
// configured (done in app.js) so a single known proxy hop (Render) is
// honored and X-Forwarded-For past that hop is not attacker-spoofable.
//
// V1 scope: state is in-memory / per-instance, matching the already
// merged in-memory limiter. Distributed (Redis) rate/budget state is
// explicitly Parked-Past-V1 (see the audit schedule). The budget guard
// is a per-user daily *request-count* cap on provider-cost paths — the
// schedule's sanctioned "explicit launch cap" — not per-token cost
// accounting, which is also Parked-Past-V1.

import { createTalkTurnRateLimiter } from "./talk_turn_rate_limit.js";

// Provider-cost route classification. /realtime/health and
// /realtime/bridge are intentionally excluded — they are public health
// probes (kept unguarded for the same reason Day 1 keeps them public:
// rate-limiting a monitoring probe would manufacture false outages).
const REALTIME_COST_RE =
  /^\/realtime\/(?:call|client_secret|turn_commit|studio_render|studio_render_stream)(?:\/|$)/;
const AUTH_RE = /^\/auth(?:\/|$)/;
const TALK_RE = /^\/talk(?:\/|$)/;
const VISUAL_CONTEXT_RE = /^\/visual\/context(?:\/|$)/;

// Classify a request path into a limiter group, or null if the path is
// outside the guarded surface (the middleware then no-ops).
function classifyGroup(pathname) {
  const p = String(pathname || "");
  if (AUTH_RE.test(p)) return "auth";
  if (REALTIME_COST_RE.test(p)) return "realtime";
  if (TALK_RE.test(p)) return "talk";
  if (VISUAL_CONTEXT_RE.test(p)) return "visual";
  return null;
}

// True for provider-cost requests that should also draw down the daily
// budget. Auth is never budgeted (no provider spend). Only mutating
// POSTs spend (GET /talk/turn/:id reads are limiter-guarded but free).
function isProviderCostRequest(method, group) {
  if (group !== "realtime" && group !== "talk" && group !== "visual") {
    return false;
  }
  return String(method || "").toUpperCase() === "POST";
}

function normalizeIp(value) {
  let ip = String(value || "").trim().toLowerCase();
  if (!ip) return "unknown";
  const bracketed = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed && bracketed[1]) ip = bracketed[1];
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.replace(/:\d+$/, "");
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip === "::1" || ip === "127.0.0.1" || ip === "localhost") return "loopback";
  return ip;
}

// Authoritative request key: authenticated user id, else trusted IP.
// Never the client X-User-Id header (see file header).
function exposureRequestKey(req) {
  const userId = String(req?.authUser?.id || req?.userId || "").trim();
  if (userId) return "u:" + userId;
  const ip = req?.ip || req?.socket?.remoteAddress || "";
  return "ip:" + normalizeIp(ip);
}

const DAILY_BUDGET_SCHEMA_VERSION = 1;

// Pure per-user UTC-day request counter. Rolls over at 00:00 UTC. The
// day key is derived from the injected clock so tests are deterministic
// and network-free. Memory is bounded by an LRU-ish sweep mirroring the
// token-bucket limiter's cap strategy.
function createDailyBudgetCounter({
  nowFn = () => Date.now(),
  capEntries = 50_000,
} = {}) {
  const counts = new Map(); // userId -> { day, used, lastSeenMs }

  function dayKey(nowMs) {
    return new Date(nowMs).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  }

  function nextResetMs(nowMs) {
    const d = new Date(nowMs);
    return Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() + 1,
      0, 0, 0, 0,
    );
  }

  function evictIfNeeded() {
    if (counts.size <= capEntries) return;
    let oldestKey = null;
    let oldestAt = Infinity;
    for (const [k, v] of counts) {
      if (v.lastSeenMs < oldestAt) {
        oldestAt = v.lastSeenMs;
        oldestKey = k;
      }
    }
    if (oldestKey !== null) counts.delete(oldestKey);
  }

  // Atomically increment and report. `used` is the count INCLUDING this
  // request; the caller denies when `used > limit`.
  function consume(userId) {
    const id = String(userId || "").trim();
    const nowMs = nowFn();
    const day = dayKey(nowMs);
    if (!id) {
      return { used: 0, day, resetAtMs: nextResetMs(nowMs), tracked: false };
    }
    let rec = counts.get(id);
    if (!rec || rec.day !== day) {
      rec = { day, used: 0, lastSeenMs: nowMs };
      counts.set(id, rec);
      evictIfNeeded();
    }
    rec.used += 1;
    rec.lastSeenMs = nowMs;
    return { used: rec.used, day, resetAtMs: nextResetMs(nowMs), tracked: true };
  }

  function peek(userId) {
    const id = String(userId || "").trim();
    const rec = counts.get(id);
    if (!rec) return 0;
    if (rec.day !== dayKey(nowFn())) return 0;
    return rec.used;
  }

  function size() {
    return counts.size;
  }

  function reset() {
    counts.clear();
  }

  return {
    consume,
    peek,
    size,
    reset,
    schemaVersion: DAILY_BUDGET_SCHEMA_VERSION,
  };
}

// Build the Express guards. Each route group gets its own token bucket
// (independent buckets so a flood on one group cannot starve another).
// All knobs are injected (sourced from env in index.js) so production
// is strict while tests can dial limits up or down per spawn.
function createExposureGuards({
  nowFn = () => Date.now(),
  auth = { capacity: 10, refillPerSec: 10 / 60 },
  realtime = { capacity: 30, refillPerSec: 30 / 60 },
  talk = { capacity: 30, refillPerSec: 30 / 60 },
  visual = { capacity: 15, refillPerSec: 15 / 60 },
  dailyProviderBudget = 500,
  budgetCapEntries = 50_000,
} = {}) {
  const limiters = {
    auth: createTalkTurnRateLimiter({ ...auth, nowFn }),
    realtime: createTalkTurnRateLimiter({ ...realtime, nowFn }),
    talk: createTalkTurnRateLimiter({ ...talk, nowFn }),
    visual: createTalkTurnRateLimiter({ ...visual, nowFn }),
  };
  const budget = createDailyBudgetCounter({ nowFn, capEntries: budgetCapEntries });
  const dailyLimit = Math.max(1, Number(dailyProviderBudget) || 0);

  function rateLimitMiddleware(req, res, next) {
    const group = classifyGroup(req.path);
    if (!group) return next();
    const key = group + "|" + exposureRequestKey(req);
    const verdict = limiters[group].attempt(key);
    if (verdict.allowed) return next();
    const retryAfterMs = Math.max(0, Number(verdict.retryAfterMs || 0));
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    res.setHeader("Retry-After", String(retryAfterSeconds));
    return res.status(429).json({
      stage: group + "_rate_limit",
      error: "Too many requests. Please retry shortly.",
      code: "rate_limited",
      retry_after_ms: retryAfterMs,
    });
  }

  function budgetMiddleware(req, res, next) {
    const group = classifyGroup(req.path);
    if (!group || !isProviderCostRequest(req.method, group)) return next();
    const userId = String(req?.authUser?.id || req?.userId || "").trim();
    // Unauthenticated provider-cost requests cannot be attributed to a
    // per-user daily budget. They are still rate-limited above and (post
    // Day 1) auth-gated; the budget is a per-user cap by definition.
    if (!userId) return next();
    const result = budget.consume(userId);
    if (result.used > dailyLimit) {
      const resetAtSeconds = Math.max(1, Math.ceil((result.resetAtMs - nowFn()) / 1000));
      res.setHeader("Retry-After", String(resetAtSeconds));
      return res.status(402).json({
        stage: group + "_daily_budget",
        error:
          "Daily usage limit reached for this account. " +
          "It resets at 00:00 UTC. Contact support if you need a higher limit.",
        code: "daily_provider_budget_exhausted",
        daily_limit: dailyLimit,
        used: result.used,
        reset_at: new Date(result.resetAtMs).toISOString(),
      });
    }
    return next();
  }

  return {
    rateLimitMiddleware,
    budgetMiddleware,
    _limiters: limiters,
    _budget: budget,
    _dailyLimit: dailyLimit,
  };
}

export {
  classifyGroup,
  isProviderCostRequest,
  normalizeIp,
  exposureRequestKey,
  createDailyBudgetCounter,
  createExposureGuards,
  DAILY_BUDGET_SCHEMA_VERSION,
};
