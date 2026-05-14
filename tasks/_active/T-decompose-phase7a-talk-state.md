---
id: T-decompose-phase7a-talk-state
title: Phase 7a — extract talk-state guards into backend/lib/talk_state.js
owner: claude
status: review
branch: claude/T-decompose-phase7a-talk-state
pillar: infra (backend architecture)
v1_pillar: talk
v1_effect: extracts the talk pipeline's load-bearing guard middleware seam (rate limit, idempotency, per-session serialization, global concurrency) per merged design note #293. The talk path is the V1 voice-to-page route; the guard seam is the prerequisite for Phase 7b (handler extraction).
---

## Scope

First sub-phase of the talk-pipeline decomposition. Moves the four
inline guard functions from `backend/index.js`
(`talkRateLimitGuard`, `talkIdempotencyGuard`, `talkSessionSerialGuard`,
`talkConcurrencyGuard`) plus the idempotency helpers
(`commitTalkIdempotencySuccess`, `clearTalkIdempotencyPending`,
`pruneTalkIdempotencyCache`, `sendCachedTalkIdempotencyResponse`,
`sanitizeTalkHeadersForIdempotency`, `captureTalkResponseHeaders`,
`cleanupRateBuckets`) into `backend/lib/talk_state.js`.

The lib owns the four pieces of guard state at module scope:

  - `talkRateBuckets`         (Map)
  - `talkIdempotencyCache`    (Map)
  - `talkInFlightBySession`   (Map)
  - `_talkInFlight`           (number, mutable)

State is NOT exported. Per the #238 invariant inheritance: no
setter-shaped exports for the Maps or the counter. The `__test`
namespace returns shallow copies for tests; production callers go
through the named guard factories and idempotency helpers.

## Exports (public surface)

```js
import {
  createTalkRateLimitGuard,
  createTalkIdempotencyGuard,
  createTalkSessionSerialGuard,
  createTalkConcurrencyGuard,
  createTalkIdempotencyHelpers,
  talkInFlight,
  talkInFlightBySessionSize,
  talkIdempotencyCacheSize,
} from "./talk_state.js";
```

- Four guard factories — each takes config + helper deps + an
  optional `now()` clock and returns the middleware function.
- One helper factory — `createTalkIdempotencyHelpers` returns
  `{ commitSuccess, clearPending, pruneCache, sendCachedResponse,
  captureResponseHeaders, sanitizeHeaders }`. The talk handler in
  `backend/index.js` uses these until Phase 7b moves it too.
- Three read accessors — `talkInFlight()`,
  `talkInFlightBySessionSize()`, `talkIdempotencyCacheSize()`. Used
  by `/ops/metrics`, `/health`, `deriveBackendRuntimeStatus`,
  `buildOpsAlerts`, and chat load-shed.

## Byte-identical invariants preserved

- Response envelopes under all guard-denied paths (429/409/503)
  unchanged.
- `Retry-After` headers unchanged.
- `recordTalkMetric` call order: ALWAYS before sending the denial
  body, on every denial path. Same `talkStatus` codes
  (`session_busy`, `session_busy_distributed`, `idempotency_pending`,
  `idempotency_replay`, `global_busy`).
- `talk_idempotency replay=1 session=... key=...` log prefix
  unchanged.
- Finish/close release semantics unchanged (idempotent, exactly
  one decrement per guard run).
- Distributed-lock TTL math unchanged
  (`max(10_000, stt+chat+tts+15_000)`).
- `/ops/metrics` field names (`talk_in_flight`, `session_locks`,
  `idempotency_entries`) unchanged. `/health` field names
  (`talk_in_flight`, `talk_sessions_in_flight`) unchanged.

## Required-deps guard

Each factory throws at mount time (not at first request) if a
required dep is missing or malformed. Matches the precedent from
5b.1–5b.4 + Phase 6.

## Tests

`backend/tests/talk_state.test.mjs` — 32 tests:

| Group | Count | Coverage |
| --- | --- | --- |
| Rate limit | 6 | factory deps; bucket fairness; burst within limit; over-limit 429 + Retry-After; pruning at scale; clientIp + clock usage |
| Idempotency | 6 | cache miss → next(); cache hit replay; pending duplicate → 409; missing header → next(); disabled bypass; finish handler eviction |
| Session serial | 6 | first request acquires lock; same-session 409; distributed-lock denial; different sessions; finish+close release; speculative bypass |
| Concurrency | 5 | N allowed + N+1 503; finish decrement; close decrement; speculative bypass; idempotent release |
| Cross-cutting | 1 | accessors match live state through a full turn sequence (the `/ops/metrics integration` row from the design note) |
| Idempotency helpers | 3 | commitSuccess marks pending → completed; clearPending wipes pending; disabled no-ops |
| Required-deps guards | 3 | scaleBackplane methods; positive timeouts; positive talkMaxInFlight |
| #238 invariant | 2 | no setter-shaped exports; `__test.peek*` returns shallow copies, not the live Map |

All 32 pass.

## Verification commands

```bash
node scripts/pre_flight.mjs
node --test backend/tests/talk_state.test.mjs
node --test backend/tests/memories_route.test.mjs \
  backend/tests/ops_metrics_route.test.mjs \
  backend/tests/ops_alerts_route.test.mjs \
  backend/tests/health.test.mjs
node --test backend/tests/talk_*.test.mjs
```

All green. Full `node --test backend/tests/*.test.mjs` run:
1140 pass, 0 fail, 7 skipped (live-backend integration tests
that require `TEST_SPAWN_BACKEND=1`).

## Done when

- Lib lands at `backend/lib/talk_state.js` with 32 tests at
  `backend/tests/talk_state.test.mjs`.
- `backend/index.js` no longer carries the four guard functions or
  the six idempotency helpers inline.
- `/ops/metrics`, `/health`, `deriveBackendRuntimeStatus`,
  `buildOpsAlerts`, chat load-shed all read the accessors at
  request time (no frozen-at-mount captures).
- All pre-flight + backend tests pass.

## What 7a does NOT do

- Move `handleTalkRequest` itself — that's Phase 7b.
- Move the STT / chat / TTS supplier glue — that's Phase 7c.
- Change any response envelope, status code, or log prefix.
- Add new ops/metrics fields.
