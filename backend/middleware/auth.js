import { APP_TOKEN, CORS_ALLOW_ORIGIN, LOG_FORMAT, LOG_LEVEL, REQUIRE_APP_TOKEN } from "../config.js";
import { securityHeadersMiddleware } from "../lib/security_headers.js";
import { createRequestId } from "../lib/utils.js";
import { createRequestLoggerMiddleware } from "../lib/request_logger.js";

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

// Structured, PII-safe request logger (logs req.path only — never the query
// string, body, or headers — as JSON in prod or text in dev, one line per
// request, level-gated, health-probe-filtered). See lib/request_logger.js.
const requestLoggerMiddleware = createRequestLoggerMiddleware({
  format: LOG_FORMAT,
  level: LOG_LEVEL,
});

const appTokenBypassPaths = new Set([
  "/health",
  "/healthz",
  "/bridge",
]);

function isAppTokenBypassPath(pathname) {
  return appTokenBypassPaths.has(String(pathname || "").trim());
}

function appTokenMiddleware(req, res, next) {
  if (isAppTokenBypassPath(req.path)) return next();
  if (!REQUIRE_APP_TOKEN || !APP_TOKEN) return next();

  const token = req.header("X-APP-TOKEN");
  if (!token || token !== APP_TOKEN) {
    return res.status(401).json({ stage: "auth", error: "Unauthorized" });
  }
  next();
}

function applyAppMiddleware(app) {
  app.use(requestIdMiddleware);
  app.use(securityHeadersMiddleware);
  app.use(corsMiddleware);
  app.use(requestLoggerMiddleware);
  app.use(appTokenMiddleware);
  return app;
}

export {
  appTokenMiddleware,
  applyAppMiddleware,
  corsMiddleware,
  isAppTokenBypassPath,
  requestIdMiddleware,
  requestLoggerMiddleware,
  securityHeadersMiddleware,
};
