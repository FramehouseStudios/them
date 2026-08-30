// Cross-route idempotency-key envelope.
//
// Generalizes the pattern in lib/talk_state.js so routes other than
// /talk can adopt idempotency without re-implementing the cache,
// TTL, body-hash check, and replay headers. See
// docs/specs/T-idempotency-key-contract.md for the contract.
//
// This module exposes a route-agnostic helper. Wiring into actual
// routes is intentionally deferred to the implementation PR so each
// adoption can be reviewed in isolation.

import { createHash } from "node:crypto";

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 4096;
const HEADER_NAME = "x-idempotency-key";
const REPLAY_HEADER = "X-Idempotency-Replayed";
const MAX_KEY_LEN = 128;

function hashBody(bodyBytes) {
  return createHash("sha256")
    .update(bodyBytes || Buffer.alloc(0))
    .digest("hex");
}

function createIdempotencyCache({
  ttlMs = DEFAULT_TTL_MS,
  maxEntries = DEFAULT_MAX_ENTRIES,
  now = () => Date.now(),
} = {}) {
  // Insertion-ordered Map gives us LRU-by-eviction-order. We
  // re-insert on hit to mark "recently used".
  const map = new Map();

  function prune() {
    const cutoff = now() - ttlMs;
    for (const [key, entry] of map) {
      if (entry.storedAt < cutoff) {
        map.delete(key);
      } else {
        break; // Map iteration is insertion order; oldest first.
      }
    }
    while (map.size > maxEntries) {
      const first = map.keys().next().value;
      if (first == null) break;
      map.delete(first);
    }
  }

  return {
    get size() { return map.size; },

    lookup(compositeKey) {
      const entry = map.get(compositeKey);
      if (!entry) return null;
      if (now() - entry.storedAt > ttlMs) {
        map.delete(compositeKey);
        return null;
      }
      // Mark recently-used.
      map.delete(compositeKey);
      map.set(compositeKey, entry);
      return entry;
    },

    store(compositeKey, entry) {
      map.set(compositeKey, { ...entry, storedAt: now() });
      prune();
    },

    clear() { map.clear(); },
  };
}

function compositeKey({ userId, routePath, idempotencyKey }) {
  return [userId || "anon", routePath, idempotencyKey].join("");
}

// Higher-order wrapper that turns any Express handler into an
// idempotency-aware handler. The caller passes `resolveUserId` so
// the envelope is auth-implementation-agnostic.
function withIdempotency(handler, deps = {}) {
  if (typeof handler !== "function") {
    throw new Error("withIdempotency requires a handler function");
  }
  const cache = deps.cache || createIdempotencyCache(deps);
  const resolveUserId = typeof deps.resolveUserId === "function"
    ? deps.resolveUserId
    : (req) => req?.userId || req?.user?.id || null;

  return async function idempotencyAware(req, res, next) {
    const headerValue = String(req.header?.(HEADER_NAME) || "").trim();
    if (!headerValue || headerValue.length > MAX_KEY_LEN) {
      return handler(req, res, next);
    }

    const userId = resolveUserId(req);
    const routePath = req.route?.path || req.path || req.originalUrl || "";
    const composite = compositeKey({ userId, routePath, idempotencyKey: headerValue });

    const bodyBytes = Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : Buffer.from(JSON.stringify(req.body || {}));
    const bodyHash = hashBody(bodyBytes);

    const cached = cache.lookup(composite);
    if (cached) {
      if (cached.bodyHash !== bodyHash) {
        res.status(409).json({
          error: "idempotency_key_reused_with_different_body",
        });
        return;
      }
      res.setHeader(REPLAY_HEADER, "1");
      if (cached.contentType) res.setHeader("Content-Type", cached.contentType);
      if (cached.cacheControl) res.setHeader("Cache-Control", cached.cacheControl);
      res.status(cached.status).send(cached.body);
      return;
    }

    // Intercept the response so we can cache it on the way out.
    const origJson = res.json.bind(res);
    const origSend = res.send.bind(res);
    let captured = null;
    res.json = (body) => {
      captured = {
        body: JSON.stringify(body),
        status: res.statusCode,
        contentType: "application/json",
        cacheControl: res.getHeader("Cache-Control") || null,
      };
      return origJson(body);
    };
    res.send = (body) => {
      if (!captured) {
        captured = {
          body: typeof body === "string" ? body : Buffer.from(body || "").toString("utf8"),
          status: res.statusCode,
          contentType: res.getHeader("Content-Type") || "text/plain",
          cacheControl: res.getHeader("Cache-Control") || null,
        };
      }
      return origSend(body);
    };

    try {
      await handler(req, res, next);
    } finally {
      // Cache 2xx and 4xx (excluding 409 from this envelope itself).
      // 5xx is never cached — clients should retry.
      const status = res.statusCode;
      const cacheable = captured && status >= 200 && status < 500 && status !== 409;
      if (cacheable) {
        cache.store(composite, {
          bodyHash,
          status: captured.status,
          body: captured.body,
          contentType: captured.contentType,
          cacheControl: captured.cacheControl,
        });
      }
    }
  };
}

export {
  withIdempotency,
  createIdempotencyCache,
  compositeKey,
  hashBody,
  HEADER_NAME,
  REPLAY_HEADER,
  MAX_KEY_LEN,
  DEFAULT_TTL_MS,
  DEFAULT_MAX_ENTRIES,
};
