// T-decompose-phase7a-talk-state — extract the four talk-pipeline
// guards (rate limit, idempotency, per-session serialization,
// global concurrency) from backend/index.js into a single lib that
// owns their mutable state.
//
// Phase 7a of the decomposition (spec:
// docs/specs/T-decompose-backend-index.md, design note #293 —
// tasks/_proposals/T-decompose-phase7a-helpers-design.md).
//
// V1 pillar: talk
// V1 effect: extracts the talk pipeline's load-bearing guard
// middleware seam. The talk path is the V1 voice-to-page route;
// keeping its guards in a small, testable, state-owning module
// is the prerequisite for Phase 7b (handler extraction).
//
// State owned by this module (module-scope, NOT exported):
//   - talkRateBuckets         Map<ipKey, { count, resetAt }>
//   - talkIdempotencyCache    Map<cacheKey, record>
//   - talkInFlightBySession   Map<sessionKey, marker>
//   - _talkInFlight           number (global concurrency counter)
//
// Behavior is byte-identical with the previous inline guards:
//   - same response envelopes under denied paths (429/409/503)
//   - same `Retry-After` headers
//   - same counter increment order (recordTalkMetric BEFORE
//     sending the denial body, on every denial path)
//   - same `talk_idempotency replay=1 ...` log line on cache hit
//   - same finish/close release semantics for session + concurrency
//   - same distributed-lock TTL math
//     (max(10_000, stt+chat+tts+15_000)) for session serial
//
// Per the #238 invariant inheritance: the lib does NOT expose a
// setter for the underlying limiter / cache / counter (no
// setTalkRateLimiter, setTalkIdempotencyCache, etc.). Per-entry
// access is named through commitSuccess / clearPending only.

const talkRateBuckets = new Map();
const talkIdempotencyCache = new Map();
const talkInFlightBySession = new Map();
let _talkInFlight = 0;

function isPositiveFinite(value) {
  return Number.isFinite(value) && value > 0;
}

function isNonNegativeFinite(value) {
  return Number.isFinite(value) && value >= 0;
}

function cleanupRateBuckets(now) {
  if (talkRateBuckets.size < 512) return;
  for (const [key, bucket] of talkRateBuckets) {
    if (bucket.resetAt <= now) {
      talkRateBuckets.delete(key);
    }
  }
}

function sanitizeTalkHeadersForIdempotency(headers) {
  const source = headers && typeof headers === "object" ? headers : {};
  const out = {};
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = String(rawKey || "").trim().toLowerCase();
    if (!key) continue;
    if (key !== "content-type" && key !== "cache-control" && !key.startsWith("x-")) continue;
    if (Array.isArray(rawValue)) {
      out[key] = rawValue.map((value) => String(value)).join(", ");
    } else if (rawValue != null) {
      out[key] = String(rawValue);
    }
  }
  return out;
}

function captureTalkResponseHeaders(res) {
  if (!res || typeof res.getHeaders !== "function") return {};
  return sanitizeTalkHeadersForIdempotency(res.getHeaders());
}

function pruneTalkIdempotencyCacheInternal(ttlMs, maxEntries, now) {
  const current = Math.max(0, Number(now || Date.now()));
  for (const [key, record] of talkIdempotencyCache.entries()) {
    const expiresAt = Math.max(0, Number(record?.expiresAt || 0));
    const status = String(record?.status || "");
    const isPendingStale =
      status === "pending" &&
      (current - Math.max(0, Number(record?.createdAt || 0))) > ttlMs;
    if ((expiresAt > 0 && expiresAt <= current) || isPendingStale) {
      talkIdempotencyCache.delete(key);
    }
  }
  if (talkIdempotencyCache.size <= maxEntries) return;
  const entries = [...talkIdempotencyCache.entries()]
    .map(([key, record]) => ({
      key,
      createdAt: Math.max(0, Number(record?.createdAt || 0)),
      priority: String(record?.status || "") === "completed" ? 1 : 0,
    }))
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.createdAt - b.createdAt;
    });
  const removeCount = Math.max(0, entries.length - maxEntries);
  for (let i = 0; i < removeCount; i += 1) {
    talkIdempotencyCache.delete(entries[i].key);
  }
}

function sendCachedTalkIdempotencyResponse(res, record) {
  const statusCode = Math.max(200, Math.min(299, Number(record?.statusCode || 200)));
  const headers = sanitizeTalkHeadersForIdempotency(record?.headers || {});
  for (const [name, value] of Object.entries(headers)) {
    if (!name) continue;
    res.setHeader(name, value);
  }
  res.setHeader("x-idempotency-replay", "1");
  const body = Buffer.isBuffer(record?.body) ? record.body : Buffer.alloc(0);
  if (body.length && !res.getHeader("Content-Length")) {
    res.setHeader("Content-Length", String(body.length));
  }
  return res.status(statusCode).send(body);
}

export function createTalkRateLimitGuard({
  clientIp,
  talkRateLimitWindowMs,
  talkRateLimitMax,
  now = () => Date.now(),
} = {}) {
  if (typeof clientIp !== "function") {
    throw new Error("createTalkRateLimitGuard requires clientIp(req) function");
  }
  if (!isPositiveFinite(talkRateLimitWindowMs)) {
    throw new Error("createTalkRateLimitGuard requires positive talkRateLimitWindowMs");
  }
  if (!isPositiveFinite(talkRateLimitMax)) {
    throw new Error("createTalkRateLimitGuard requires positive talkRateLimitMax");
  }
  if (typeof now !== "function") {
    throw new Error("createTalkRateLimitGuard requires now() function");
  }
  return function talkRateLimitGuard(req, res, next) {
    const t = now();
    cleanupRateBuckets(t);

    const userId = String(req?.authUser?.id || req?.userId || req?.user?.id || "").trim();
    const key = userId ? `user:${userId}` : `ip:${clientIp(req)}`;
    const bucket = talkRateBuckets.get(key);

    if (!bucket || bucket.resetAt <= t) {
      talkRateBuckets.set(key, { count: 1, resetAt: t + talkRateLimitWindowMs });
      return next();
    }

    if (bucket.count >= talkRateLimitMax) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - t) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        stage: "rate_limit",
        error: "Too many requests. Please retry shortly.",
      });
    }

    bucket.count += 1;
    return next();
  };
}

export function createTalkIdempotencyGuard({
  isSpeculativePrepareRequest,
  talkIdempotencyEnabled,
  normalizeIdempotencyKey,
  resolveTalkSessionKey,
  scaleBackplane,
  recordTalkMetric,
  talkIdempotencyTtlMs,
  talkIdempotencyMaxEntries,
  now = () => Date.now(),
  logger = console,
} = {}) {
  const requiredFns = {
    isSpeculativePrepareRequest,
    normalizeIdempotencyKey,
    resolveTalkSessionKey,
    recordTalkMetric,
  };
  for (const [name, value] of Object.entries(requiredFns)) {
    if (typeof value !== "function") {
      throw new Error(`createTalkIdempotencyGuard requires ${name} function`);
    }
  }
  if (
    !scaleBackplane ||
    typeof scaleBackplane.getIdempotency !== "function" ||
    typeof scaleBackplane.setIdempotency !== "function" ||
    typeof scaleBackplane.deleteIdempotency !== "function"
  ) {
    throw new Error(
      "createTalkIdempotencyGuard requires scaleBackplane with get/set/delete idempotency methods"
    );
  }
  if (!isPositiveFinite(talkIdempotencyTtlMs)) {
    throw new Error("createTalkIdempotencyGuard requires positive talkIdempotencyTtlMs");
  }
  if (!isPositiveFinite(talkIdempotencyMaxEntries)) {
    throw new Error("createTalkIdempotencyGuard requires positive talkIdempotencyMaxEntries");
  }
  if (typeof now !== "function") {
    throw new Error("createTalkIdempotencyGuard requires now() function");
  }

  return async function talkIdempotencyGuard(req, res, next) {
    if (isSpeculativePrepareRequest(req)) return next();
    if (!talkIdempotencyEnabled) return next();
    try {
      const headerKey = normalizeIdempotencyKey(
        req.get("X-Idempotency-Key") ||
          req.get("Idempotency-Key")
      );
      if (!headerKey) return next();
      const sessionKey = resolveTalkSessionKey(req);
      const cacheKey = `${sessionKey}|${headerKey}`;
      const t = now();
      pruneTalkIdempotencyCacheInternal(talkIdempotencyTtlMs, talkIdempotencyMaxEntries, t);
      let existing = talkIdempotencyCache.get(cacheKey);
      if (!existing) {
        const distributed = await scaleBackplane.getIdempotency(cacheKey);
        if (distributed && typeof distributed === "object") {
          existing = {
            ...distributed,
            body: Buffer.isBuffer(distributed.body)
              ? distributed.body
              : (distributed.body ? Buffer.from(distributed.body?.data || []) : Buffer.alloc(0)),
          };
          talkIdempotencyCache.set(cacheKey, existing);
        }
      }
      if (existing) {
        const status = String(existing.status || "");
        if (status === "completed" && Buffer.isBuffer(existing.body)) {
          recordTalkMetric({
            statusCode: 208,
            totalMs: 0,
            sttMs: 0,
            chatMs: 0,
            ttsMs: 0,
            streamAudio: false,
            chatStreamUsed: false,
            talkStatus: "idempotency_replay",
            lane: "guard",
            model: "none",
          });
          logger.log(
            `[${req.requestId || "unknown"}] talk_idempotency replay=1 session=${sessionKey} key=${headerKey}`
          );
          return sendCachedTalkIdempotencyResponse(res, existing);
        }
        if (status === "pending") {
          recordTalkMetric({
            statusCode: 409,
            totalMs: 0,
            sttMs: 0,
            chatMs: 0,
            ttsMs: 0,
            streamAudio: false,
            chatStreamUsed: false,
            talkStatus: "idempotency_pending",
            lane: "guard",
            model: "none",
          });
          res.setHeader("Retry-After", "1");
          return res.status(409).json({
            stage: "idempotency",
            error: "Duplicate turn in progress for this key.",
            key: headerKey,
          });
        }
      }

      const pendingRecord = {
        key: headerKey,
        sessionKey,
        status: "pending",
        createdAt: t,
        expiresAt: t + talkIdempotencyTtlMs,
      };
      talkIdempotencyCache.set(cacheKey, pendingRecord);
      void scaleBackplane.setIdempotency(cacheKey, pendingRecord, talkIdempotencyTtlMs);
      req.talkIdempotency = {
        cacheKey,
        key: headerKey,
        sessionKey,
      };
      res.on("finish", () => {
        const record = talkIdempotencyCache.get(cacheKey);
        if (!record || String(record.status || "") !== "pending") return;
        talkIdempotencyCache.delete(cacheKey);
        void scaleBackplane.deleteIdempotency(cacheKey);
      });
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function createTalkSessionSerialGuard({
  isSpeculativePrepareRequest,
  talkSessionSerialEnabled,
  resolveTalkSessionKey,
  scaleBackplane,
  recordTalkMetric,
  createRequestId,
  sttTimeoutMs,
  chatTimeoutMs,
  ttsTimeoutMs,
} = {}) {
  const requiredFns = {
    isSpeculativePrepareRequest,
    resolveTalkSessionKey,
    recordTalkMetric,
    createRequestId,
  };
  for (const [name, value] of Object.entries(requiredFns)) {
    if (typeof value !== "function") {
      throw new Error(`createTalkSessionSerialGuard requires ${name} function`);
    }
  }
  if (
    !scaleBackplane ||
    typeof scaleBackplane.acquireSessionLock !== "function" ||
    typeof scaleBackplane.releaseSessionLock !== "function"
  ) {
    throw new Error(
      "createTalkSessionSerialGuard requires scaleBackplane with acquireSessionLock/releaseSessionLock"
    );
  }
  for (const [name, value] of Object.entries({ sttTimeoutMs, chatTimeoutMs, ttsTimeoutMs })) {
    if (!isNonNegativeFinite(value)) {
      throw new Error(`createTalkSessionSerialGuard requires non-negative ${name}`);
    }
  }

  return async function talkSessionSerialGuard(req, res, next) {
    if (isSpeculativePrepareRequest(req)) return next();
    if (!talkSessionSerialEnabled) return next();
    try {
      const sessionKey = resolveTalkSessionKey(req);
      const existing = talkInFlightBySession.get(sessionKey);
      if (existing) {
        recordTalkMetric({
          statusCode: 409,
          totalMs: 0,
          sttMs: 0,
          chatMs: 0,
          ttsMs: 0,
          streamAudio: false,
          chatStreamUsed: false,
          talkStatus: "session_busy",
          lane: "guard",
          model: "none",
        });
        res.setHeader("Retry-After", "1");
        return res.status(409).json({
          stage: "busy_session",
          error: "Previous turn is still processing for this session.",
        });
      }
      const marker = {
        startedAt: Date.now(),
        requestId: req.requestId || createRequestId(),
      };
      const distributed = await scaleBackplane.acquireSessionLock(
        sessionKey,
        marker.requestId,
        Math.max(10_000, sttTimeoutMs + chatTimeoutMs + ttsTimeoutMs + 15_000)
      );
      if (!distributed?.ok) {
        recordTalkMetric({
          statusCode: 409,
          totalMs: 0,
          sttMs: 0,
          chatMs: 0,
          ttsMs: 0,
          streamAudio: false,
          chatStreamUsed: false,
          talkStatus: "session_busy_distributed",
          lane: "guard",
          model: "none",
        });
        res.setHeader("Retry-After", "1");
        return res.status(409).json({
          stage: "busy_session",
          error: "Previous turn is still processing for this session.",
        });
      }
      talkInFlightBySession.set(sessionKey, marker);
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        const active = talkInFlightBySession.get(sessionKey);
        if (active === marker) {
          talkInFlightBySession.delete(sessionKey);
        }
        void scaleBackplane.releaseSessionLock(sessionKey, marker.requestId);
      };
      res.on("finish", release);
      res.on("close", release);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function createTalkConcurrencyGuard({
  isSpeculativePrepareRequest,
  talkMaxInFlight,
  recordTalkMetric,
} = {}) {
  if (typeof isSpeculativePrepareRequest !== "function") {
    throw new Error("createTalkConcurrencyGuard requires isSpeculativePrepareRequest function");
  }
  if (typeof recordTalkMetric !== "function") {
    throw new Error("createTalkConcurrencyGuard requires recordTalkMetric function");
  }
  if (!isPositiveFinite(talkMaxInFlight)) {
    throw new Error("createTalkConcurrencyGuard requires positive talkMaxInFlight");
  }

  return function talkConcurrencyGuard(req, res, next) {
    if (isSpeculativePrepareRequest(req)) return next();
    if (_talkInFlight >= talkMaxInFlight) {
      recordTalkMetric({
        statusCode: 503,
        totalMs: 0,
        sttMs: 0,
        chatMs: 0,
        ttsMs: 0,
        streamAudio: false,
        chatStreamUsed: false,
        talkStatus: "global_busy",
        lane: "guard",
        model: "none",
      });
      res.setHeader("Retry-After", "1");
      return res.status(503).json({
        stage: "busy",
        error: "Server busy. Please retry shortly.",
      });
    }

    _talkInFlight += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      _talkInFlight = Math.max(0, _talkInFlight - 1);
    };

    res.on("finish", release);
    res.on("close", release);
    next();
  };
}

// Read-only accessors used by /ops/metrics, deriveBackendRuntimeStatus,
// buildOpsAlerts, and chat load-shed. They read the live module-scope
// state at call time — no frozen-at-mount captures.
export function talkInFlight() {
  return _talkInFlight;
}

export function talkInFlightBySessionSize() {
  return talkInFlightBySession.size;
}

export function talkIdempotencyCacheSize() {
  return talkIdempotencyCache.size;
}

// Idempotency helpers used by the talk handler (still in
// backend/index.js until Phase 7b). The cache lives in this lib's
// module scope; named per-entry helpers below are the only sanctioned
// mutation surface for callers outside the guard middleware.
export function createTalkIdempotencyHelpers({
  scaleBackplane,
  talkIdempotencyEnabled,
  talkIdempotencyTtlMs,
  talkIdempotencyMaxEntries,
} = {}) {
  if (
    !scaleBackplane ||
    typeof scaleBackplane.setIdempotency !== "function" ||
    typeof scaleBackplane.deleteIdempotency !== "function"
  ) {
    throw new Error(
      "createTalkIdempotencyHelpers requires scaleBackplane with set/delete idempotency methods"
    );
  }
  if (!isPositiveFinite(talkIdempotencyTtlMs)) {
    throw new Error("createTalkIdempotencyHelpers requires positive talkIdempotencyTtlMs");
  }
  if (!isPositiveFinite(talkIdempotencyMaxEntries)) {
    throw new Error("createTalkIdempotencyHelpers requires positive talkIdempotencyMaxEntries");
  }
  return {
    sanitizeHeaders: sanitizeTalkHeadersForIdempotency,
    captureResponseHeaders: captureTalkResponseHeaders,
    sendCachedResponse: sendCachedTalkIdempotencyResponse,
    pruneCache(now) {
      pruneTalkIdempotencyCacheInternal(
        talkIdempotencyTtlMs,
        talkIdempotencyMaxEntries,
        now
      );
    },
    commitSuccess(req, { statusCode = 200, headers = {}, body = Buffer.alloc(0) } = {}) {
      if (!talkIdempotencyEnabled) return;
      const ctx = req?.talkIdempotency;
      if (!ctx?.cacheKey) return;
      const existing = talkIdempotencyCache.get(ctx.cacheKey);
      if (!existing) return;
      const now = Date.now();
      const payloadBuffer = Buffer.isBuffer(body) ? Buffer.from(body) : Buffer.alloc(0);
      const normalizedHeaders = sanitizeTalkHeadersForIdempotency(headers);
      if (payloadBuffer.length && !normalizedHeaders["content-length"]) {
        normalizedHeaders["content-length"] = String(payloadBuffer.length);
      }
      const updated = {
        ...existing,
        status: "completed",
        statusCode: Math.max(200, Math.min(299, Number(statusCode || 200))),
        headers: normalizedHeaders,
        body: payloadBuffer,
        completedAt: now,
        expiresAt: now + talkIdempotencyTtlMs,
      };
      talkIdempotencyCache.set(ctx.cacheKey, updated);
      void scaleBackplane.setIdempotency(ctx.cacheKey, updated, talkIdempotencyTtlMs);
      pruneTalkIdempotencyCacheInternal(
        talkIdempotencyTtlMs,
        talkIdempotencyMaxEntries,
        now
      );
    },
    clearPending(req, { keepCompleted = true } = {}) {
      const ctx = req?.talkIdempotency;
      if (!ctx?.cacheKey) return;
      const existing = talkIdempotencyCache.get(ctx.cacheKey);
      if (!existing) return;
      if (keepCompleted && String(existing.status || "") === "completed") return;
      talkIdempotencyCache.delete(ctx.cacheKey);
      void scaleBackplane.deleteIdempotency(ctx.cacheKey);
    },
  };
}

// Test-only handle. Tests read these to assert against module-scope
// state without going through middleware. `reset()` is a test-only
// affordance — the public surface above never replaces the underlying
// Map/counter ("no setter for state rotation" per #238).
export const __test = {
  reset() {
    talkRateBuckets.clear();
    talkIdempotencyCache.clear();
    talkInFlightBySession.clear();
    _talkInFlight = 0;
  },
  peekRateBuckets() {
    return new Map(talkRateBuckets);
  },
  peekIdempotencyCache() {
    return new Map(talkIdempotencyCache);
  },
  peekInFlightBySession() {
    return new Map(talkInFlightBySession);
  },
  setInFlight(value) {
    _talkInFlight = Math.max(0, Number(value) || 0);
  },
};
