---
id: T-decompose-phase0-health-route
title: Phase 0 PoC — extract /health + /bridge to lib/health_route.js
owner: claude
status: merged
branch: claude/T-decompose-phase0-health-route
pillar: infra (velocity-at-scale)
---

## Scope

Phase 0 proof-of-concept for the `T-decompose-backend-index` spec.
First concrete extraction from the 33k-line `backend/index.js`.

Moves the (byte-identical) inline `GET /health` and `GET /bridge`
handlers into `backend/lib/health_route.js` behind a single
`mountHealthRoutes(app, deps)` function. Both routes share one
handler now; previously the same 30 lines of inline code lived
twice in index.js.

**Net effect**:
- `backend/index.js`: 33,071 → 33,032 lines (–39)
- New: `backend/lib/health_route.js` (109 lines, isolated, dep-injected)
- New: `backend/tests/health_route.test.mjs` (9 integration tests)
- **Behavior change: zero.** Same response, same headers, same status.

## Decisions captured here for the rest of the decomposition

1. **Live state read via accessor functions.** `talkInFlight` and
   `talkInFlightBySession` are mutable module-scoped state in
   index.js. Passing them as values would freeze the snapshot at
   mount time; passing them as accessor functions
   (`() => talkInFlight`) lets the handler read the current value
   at request time. This is the pattern future phases will use
   for any mutable module-scoped dep.

2. **Required-deps guard.** `mountHealthRoutes` throws on missing
   deps. Future phases follow.

3. **Pure helper + thin mount.** `buildHealthPayload` is exported
   for direct unit-testing; `mountHealthRoutes` is the Express
   glue. Future phases follow this two-function pattern.

## Done when

- `node --test tests/health_route.test.mjs` — 9/9 pass
- `npm test` — green (no regressions)
- index.js line count drops
- Behavior diff = zero (same response shape, same headers)
