import { APP_TOKEN, CORS_ALLOW_ORIGIN, REQUIRE_APP_TOKEN } from "../config.js";
import { createRequestId } from "../lib/utils.js";

function requestIdMiddleware(req, res, next) {
  // Honor an incoming X-Request-Id when present (typically set by a
  // load balancer for distributed tracing). Otherwise mint a fresh
  // one. The header echoes back either way so clients can correlate.
  const incoming = String(
    (typeof req.header === "function" ? req.header("x-request-id") : "") || ""
  ).trim();
  req.requestId = incoming || createRequestId();
  res.setHeader("X-Request-Id", req.requestId);
  next();
}

function corsMiddleware(req, res, next) {
  const origin = String(req.headers.origin || "").trim();
  const hasOrigin = origin.length > 0;

  if (CORS_ALLOW_ORIGIN && hasOrigin && origin !== CORS_ALLOW_ORIGIN) {
    return res.status(403).json({ stage: "cors", error: "Origin not allowed." });
  }

  if (CORS_ALLOW_ORIGIN && hasOrigin && origin === CORS_ALLOW_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-APP-TOKEN, X-Client-Token, X-Talk-Stream, X-Idempotency-Key, Idempotency-Key"
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }

  if (req.method === "OPTIONS") {
    if (!CORS_ALLOW_ORIGIN || !hasOrigin || origin !== CORS_ALLOW_ORIGIN) {
      return res.status(403).json({ stage: "cors", error: "Origin not allowed." });
    }
    return res.status(204).end();
  }

  next();
}

function requestLoggerMiddleware(req, res, next) {
  const rid = req.requestId;
  const startedAt = Date.now();
  console.log(`[${new Date().toISOString()}] [${rid}] ${req.method} ${req.url}`);

  res.on("finish", () => {
    const latencyMs = Date.now() - startedAt;
    const contentType = res.getHeader("Content-Type") || "-";
    const contentLength = res.getHeader("Content-Length") || "-";
    console.log(
      `[${new Date().toISOString()}] [${rid}] ${req.method} ${req.url} -> ${res.statusCode} ` +
        `type=${String(contentType)} bytes=${String(contentLength)} latency=${latencyMs}ms`
    );
  });

  next();
}

function appTokenMiddleware(req, res, next) {
  if (req.path === "/health" || req.path === "/bridge") return next();
  if (!REQUIRE_APP_TOKEN || !APP_TOKEN) return next();

  const token = req.header("X-APP-TOKEN");
  if (!token || token !== APP_TOKEN) {
    return res.status(401).json({ stage: "auth", error: "Unauthorized" });
  }
  next();
}

function applyAppMiddleware(app) {
  app.use(requestIdMiddleware);
  app.use(corsMiddleware);
  app.use(requestLoggerMiddleware);
  app.use(appTokenMiddleware);
  return app;
}

export {
  appTokenMiddleware,
  applyAppMiddleware,
  corsMiddleware,
  requestIdMiddleware,
  requestLoggerMiddleware,
};
