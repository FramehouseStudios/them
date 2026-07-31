// Structured, PII-safe request logging (T-backend-structured-logs).
//
// Replaces the ad-hoc access log that printed `req.url` (query string included,
// so params like ?actor_email=... leaked user PII into logs) twice per request
// with no level control and no health-check filtering.
//
// This logger emits ONE line per request, on response finish, containing only
// non-PII request metadata: method, PATH ONLY (never the query string), status,
// latency, byte count, content-type, and the request id. It never reads the
// request body, query, or headers, so tokens, emails, transcripts, screenplay
// text, and Authorization headers cannot appear in logs by construction.
//
//   - JSON output (LOG_FORMAT=json) for log aggregators, or a human-readable
//     line for local dev (LOG_FORMAT=text);
//   - severity by status (5xx=error, 4xx=warn, else info), gated by LOG_LEVEL;
//   - skips successful health-check probes (they run ~every 30s) while still
//     surfacing health failures.

const LEVEL_SEVERITY = Object.freeze({ error: 0, warn: 1, info: 2, debug: 3 });
const DEFAULT_SKIP_PATHS = Object.freeze(["/healthz", "/health"]);

function normalizeLevel(level, fallback = "info") {
  const l = String(level || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(LEVEL_SEVERITY, l) ? l : fallback;
}

function severityForStatus(status) {
  const s = Number(status) || 0;
  if (s >= 500) return "error";
  if (s >= 400) return "warn";
  return "info";
}

// Pathname only — strips any query string so PII in query params never lands
// in logs. Express sets req.path; fall back to splitting req.url defensively.
function pathOnly(req) {
  if (req && typeof req.path === "string" && req.path) return req.path;
  const url = String(req?.url || req?.originalUrl || "");
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

function buildRequestLogRecord(req, res, { startedAt = 0, now = Date.now() } = {}) {
  const status = Number(res?.statusCode) || 0;
  const getHeader = typeof res?.getHeader === "function" ? (n) => res.getHeader(n) : () => undefined;
  return {
    ts: new Date(now).toISOString(),
    level: severityForStatus(status),
    request_id: String(req?.requestId || "") || undefined,
    method: String(req?.method || ""),
    path: pathOnly(req),
    status,
    latency_ms: startedAt ? Math.max(0, now - startedAt) : 0,
    bytes: getHeader("Content-Length") != null ? String(getHeader("Content-Length")) : undefined,
    type: getHeader("Content-Type") != null ? String(getHeader("Content-Type")) : undefined,
  };
}

// Skip successful health probes; always log health failures. Then apply the
// configured level threshold.
function shouldLogRequest(record, { level = "info", skipPaths = DEFAULT_SKIP_PATHS } = {}) {
  if (skipPaths.includes(record.path) && record.status < 400) return false;
  return LEVEL_SEVERITY[record.level] <= LEVEL_SEVERITY[normalizeLevel(level)];
}

function formatRequestLog(record, format = "json") {
  if (String(format).toLowerCase() === "text") {
    const rid = record.request_id ? `[${record.request_id}] ` : "";
    return (
      `[${record.ts}] ${rid}${record.method} ${record.path} -> ${record.status} ` +
      `type=${record.type || "-"} bytes=${record.bytes || "-"} latency=${record.latency_ms}ms`
    );
  }
  const clean = {};
  for (const [k, v] of Object.entries(record)) {
    if (v !== undefined) clean[k] = v;
  }
  return JSON.stringify(clean);
}

function createRequestLoggerMiddleware({
  format = "json",
  level = "info",
  skipPaths = DEFAULT_SKIP_PATHS,
  now = () => Date.now(),
  sink = console,
} = {}) {
  const resolvedLevel = normalizeLevel(level);
  return function requestLoggerMiddleware(req, res, next) {
    const startedAt = now();
    res.on("finish", () => {
      const record = buildRequestLogRecord(req, res, { startedAt, now: now() });
      if (!shouldLogRequest(record, { level: resolvedLevel, skipPaths })) return;
      const line = formatRequestLog(record, format);
      if (record.level === "error" && typeof sink.error === "function") sink.error(line);
      else if (record.level === "warn" && typeof sink.warn === "function") sink.warn(line);
      else sink.log(line);
    });
    next();
  };
}

export {
  LEVEL_SEVERITY,
  DEFAULT_SKIP_PATHS,
  severityForStatus,
  pathOnly,
  buildRequestLogRecord,
  shouldLogRequest,
  formatRequestLog,
  createRequestLoggerMiddleware,
};
