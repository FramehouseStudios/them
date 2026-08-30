// Structured logger — Phase 0 of T-backend-structured-logs.
//
// Thin wrapper, no new deps. JSON-line output in production for easy
// shipping to any sink; pretty single-line output in development.
// Level filter via LOG_LEVEL env (debug|info|warn|error; default info).
//
// See docs/specs/T-backend-structured-logs.md for the contract. The
// follow-on `T-backend-log-migration` task mechanically replaces
// console.log sites in index.js; this PR only ships the helper and
// wires three high-signal call sites to prove the pattern.

import { randomUUID } from "node:crypto";

const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

function serializeError(err) {
  if (!err) return null;
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }
  return { value: String(err) };
}

function defaultLogLevel() {
  const raw = String(process.env.LOG_LEVEL || "").trim().toLowerCase();
  if (raw && raw in LEVELS) return raw;
  return "info";
}

function defaultLogFormat() {
  if (String(process.env.LOG_FORMAT || "").trim().toLowerCase() === "pretty") return "pretty";
  if (String(process.env.LOG_FORMAT || "").trim().toLowerCase() === "json") return "json";
  return (process.env.NODE_ENV === "production") ? "json" : "pretty";
}

function createLogger({
  level = defaultLogLevel(),
  format = defaultLogFormat(),
  out = process.stdout,
  now = () => new Date().toISOString(),
} = {}) {
  const min = LEVELS[level] ?? LEVELS.info;

  function emit(rec) {
    if ((LEVELS[rec.level] ?? 0) < min) return;
    const line = (format === "pretty")
      ? `[${rec.level}] ${rec.msg} ${rec.fields ? JSON.stringify(rec.fields) : ""}`.trimEnd()
      : JSON.stringify({ ts: now(), level: rec.level, msg: rec.msg, ...(rec.fields || {}) });
    out.write(line + "\n");
  }

  return {
    level,
    format,
    debug: (msg, fields) => emit({ level: "debug", msg, fields }),
    info:  (msg, fields) => emit({ level: "info",  msg, fields }),
    warn:  (msg, fields) => emit({ level: "warn",  msg, fields }),
    error: (msg, err, fields) => emit({
      level: "error",
      msg,
      fields: { ...(fields || {}), err: serializeError(err) },
    }),
    // Returns a child logger that pre-binds fields onto every record.
    // Used by the request-id middleware to attach req_id to every line
    // emitted within a request scope.
    child(extraFields = {}) {
      const parent = this;
      const merge = (fields) => ({ ...extraFields, ...(fields || {}) });
      return {
        level: parent.level,
        format: parent.format,
        debug: (msg, fields) => parent.debug(msg, merge(fields)),
        info:  (msg, fields) => parent.info(msg, merge(fields)),
        warn:  (msg, fields) => parent.warn(msg, merge(fields)),
        error: (msg, err, fields) => parent.error(msg, err, merge(fields)),
        child: (more) => parent.child({ ...extraFields, ...more }),
      };
    },
  };
}

// Express middleware: mints a UUIDv4 per request unless the client
// already supplied one via x-request-id (e.g. from a load balancer).
// Sets `req.requestId`, attaches `req.log` (child logger with req_id
// bound), and echoes the id back in the x-request-id response header.
function createRequestIdMiddleware({ logger = createLogger() } = {}) {
  return function requestIdMiddleware(req, res, next) {
    const incoming = String(req.header?.("x-request-id") || "").trim();
    const id = incoming || randomUUID();
    req.requestId = id;
    req.log = logger.child({ req_id: id });
    res.setHeader("x-request-id", id);
    next();
  };
}

export {
  createLogger,
  createRequestIdMiddleware,
  serializeError,
  LEVELS,
};
