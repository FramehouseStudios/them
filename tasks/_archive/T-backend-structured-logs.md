---
id: T-backend-structured-logs
title: Structured JSON logger + request-id propagation
owner: support
status: merged
branch: support/backend-structured-logs-phase0
pillar: infra (enables all)
v1_pillar: infra
v1_effect: enables V1 ops triage; today every backend log line is console.log and there is no request_id propagation. Production troubleshooting relies on humans grepping raw stdout.
---

## Scope

Spec: `docs/specs/T-backend-structured-logs.md`. Thin `lib/log.js`
wrapper (no new deps), `request_id` middleware, and wiring into
three high-signal call sites to prove the pattern.

## Progress

- Phase 0 DONE: `backend/lib/log.js` + 10 tests (`tests/log.test.mjs`).
  JSON + pretty formats, level filter, child loggers,
  `createRequestIdMiddleware` honoring incoming x-request-id.
  Existing `middleware/auth.js` requestIdMiddleware also upgraded to
  honor incoming x-request-id (non-breaking).
- Follow-up `T-backend-log-migration`: mechanical sweep of console.log
  in index.js (separate task — keeps this PR reviewable).

## Done when

- `lib/log.js` exists with JSON + pretty formats and level filter. (done)
- `requestIdMiddleware` exists; tests cover the round-trip. (done)
- Three call sites adopt the new logger. (follow-up: T-backend-log-migration)
- `LOG_LEVEL=debug` actually changes behavior in CI. (done in helper)
