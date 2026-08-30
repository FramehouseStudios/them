# Spec: T-backend-structured-logs

**Status**: ready (support agent can implement).
**Owner**: support (backend scope).
**V1 pillar**: infra (enables all)
**V1 effect**: enables V1 ops triage. Today every backend log line is
`console.log(...)`; an incident requires `grep`-by-eyeball through
unstructured text. With one tail of structured JSON, oncall can
filter by request_id, user_id, route, or error.

## Problem

Search shows `console.log` in `backend/index.js` at hundreds of
sites, plus `console.error`, `console.warn`. There is no request_id
propagation, no level filter, no machine-readable format. The
existing `ops_alerts_route.js` and `ops_health_summary_route.js`
read from in-memory state, not from logs. Production troubleshooting
relies on the human reading raw stdout.

## Scope

In:
- `lib/log.js` exporting a thin structured-logger interface:
  `log.info(msg, fields)`, `log.warn(msg, fields)`, `log.error(msg, err, fields)`.
- JSON-line output by default in production (`{ level, ts, msg, ...fields }`).
- Pretty single-line output by default in development.
- `LOG_LEVEL` env (`debug | info | warn | error`); default `info`.
- A `request_id` middleware that generates a UUID per request,
  attaches it to `req.requestId` and a `x-request-id` response header.
- Wire the new logger into 3 high-signal places to prove the pattern:
  - `mountHealthRoutes` startup
  - `/realtime/call` mint path
  - The `/talk` error path

Out:
- Replacing every `console.log` in `index.js`. That's a follow-up
  refactor — `T-backend-log-migration` — that mechanically walks the
  monolith and replaces sites. Spec it separately to keep this PR
  reviewable.
- Shipping logs to a remote sink (Datadog, Logtail, etc). The JSON
  format makes any sink wireable, but actual integration is out.

## Approach

Thin wrapper around Node's standard mechanisms. No new deps. ~80
lines of code.

```js
// lib/log.js
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
function createLogger({ level = "info", format = "json", out = process.stdout } = {}) {
  const min = LEVELS[level] ?? LEVELS.info;
  function emit(rec) {
    if (LEVELS[rec.level] < min) return;
    const line = format === "json"
      ? JSON.stringify({ ts: new Date().toISOString(), ...rec })
      : `[${rec.level}] ${rec.msg} ${JSON.stringify(rec.fields || {})}`;
    out.write(line + "\n");
  }
  return {
    info: (msg, fields) => emit({ level: "info", msg, fields }),
    warn: (msg, fields) => emit({ level: "warn", msg, fields }),
    error: (msg, err, fields) => emit({
      level: "error", msg, fields: { ...fields, err: serializeError(err) },
    }),
  };
}
```

`request_id` middleware:

```js
import { randomUUID } from "node:crypto";
function requestIdMiddleware(req, res, next) {
  const incoming = String(req.header("x-request-id") || "").trim();
  req.requestId = incoming || randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
}
```

## Acceptance

- `lib/log.js` exists with `createLogger`, JSON + pretty formats, level filter.
- Unit tests for level filtering and JSON shape.
- `requestIdMiddleware` exists; tests cover the round-trip (incoming
  header honored, otherwise new UUID minted).
- Three call sites adopt the new logger and emit request_id-tagged
  lines.
- No regression in `npm test`.
- `LOG_LEVEL=debug` actually changes behavior in CI when set.

## Risks

- Existing tests grep stdout for specific strings. Mitigation: keep
  the new logger's `msg` field identical to the previous text, and
  put structured fields after.
- Performance: JSON.stringify in every log call. Mitigation: skip
  serialization when level filter rejects.

## Out-of-scope follow-ups

- `T-backend-log-migration` — mechanical sweep of `console.log` in
  index.js.
- `T-backend-log-sink-integration` — wire to Datadog/Logtail/etc.
- `T-backend-trace-context` — request-id propagation to OpenAI calls
  (so a trace spans backend + supplier).
