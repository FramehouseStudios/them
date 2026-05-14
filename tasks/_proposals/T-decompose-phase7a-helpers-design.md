---
id: T-decompose-phase7a-helpers-design
title: Phase 7a sub-design — talk-state guards + shared helpers
owner: claude
status: proposed
target_pr: none yet (sub-design refinement; opens after Phase 6 lands)
pillar: infra (backend architecture)
v1_pillar: talk
v1_effect: refines the Phase 7a guard-extraction plan (#223) with the exact dep list, factory shapes, and per-guard test matrix needed before opening the extraction PR
---

## Scope

Sub-design refinement of Phase 7a (the FIRST sub-phase of the
talk-pipeline decomposition, per the #223 parent design note).
Specifies:

- The exact dep list each guard factory takes.
- The shared-state ownership model (lib module-scope, accessor
  out to `/ops/metrics`).
- The per-guard test matrix.
- The byte-identical invariants the extraction must preserve.

This is a **design refinement**, not an extraction PR. The
extraction code opens AFTER Codex reviews this note and AFTER
Phase 6 (`/memories/*` cluster) lands so the decomp chain stays
serialized per spec.

## Why a sub-design (not just the parent #223 note)

#223 sketches the three-sub-phase staging. Phase 7a is the
highest-risk-by-surface-area-per-LoC of the three (load-bearing
middleware that protects the talk handler). Codex's #245 +
#238 reviews established the precedent: high-risk extractions
ship a sub-design note before code. This note is that gate.

## Guards in scope (4 total)

All defined inline in `backend/index.js` today. Phase 7a moves
all four into `backend/lib/talk_state.js`.

### 1. `talkRateLimitGuard`

**Live behavior**: token-bucket per request key (typically IP).
Reads from a module-scope `Map`. Used as Express middleware on
`POST /talk`.

**Deps the factory needs**:
- `clientIp(req)` — IP resolution helper.
- `cleanupRateBuckets(now)` — preserves the current bucket-pruning
  behavior and lets tests pin the call order.
- `talkRateBuckets` — module-scope `Map` owned by the new lib.
- `talkRateLimitWindowMs` / `talkRateLimitMax` — current
  `TALK_RATE_LIMIT_WINDOW_MS` and `TALK_RATE_LIMIT_MAX` values.
- `now: () => Date.now()` — testable clock.

It does **not** use `incrementErrorCounter`, `createRequestId`, or
`backend/lib/talk_turn_rate_limit.js` today. Do not introduce those
deps in the extraction PR.

**Factory shape**:
```js
const guard = createTalkRateLimitGuard({
  clientIp,
  cleanupRateBuckets,
  talkRateLimitWindowMs: TALK_RATE_LIMIT_WINDOW_MS,
  talkRateLimitMax: TALK_RATE_LIMIT_MAX,
  now: () => Date.now(),
});
// guard is `(req, res, next) => ...`
```

### 2. `talkIdempotencyGuard`

**Live behavior**: dedup by `Idempotency-Key` header. On a cache
hit, return the cached response without re-invoking the handler.
Cache is a module-scope `Map<key, response>`. Cache size is
exposed to `/ops/metrics` via `talkIdempotencyCacheSize()`.

**Deps**:
- Module-internal cache (lives in the lib's module scope).
- `isSpeculativePrepareRequest(req)`
- `talkIdempotencyEnabled`
- `normalizeIdempotencyKey(value)`
- `resolveTalkSessionKey(req)`
- `pruneTalkIdempotencyCache(now)`
- `scaleBackplane`
- `sendCachedTalkIdempotencyResponse(res, record)`
- `recordTalkMetric(metric)`
- `talkIdempotencyTtlMs`
- `now: () => Date.now()` — testable clock.
- `logger` with `log()` for the existing replay log line.

Current duplicate-pending behavior is **409 with Retry-After: 1**.
It does not wait for the first request to finish. Keep that behavior.

**Accessor to ops/metrics**: `talkIdempotencyCacheSize()` —
exported from the lib so the existing `/ops/metrics` route can
import it (replacing the inline reference).

### 3. `talkSessionSerialGuard`

**Live behavior**: per-session-id serialization. Concurrent
POSTs with the same session id either wait or 429 (configurable).
Uses module-scope `Map<sessionId, Promise>` for the wait queue.

**Deps**:
- Module-internal `Map`
- `isSpeculativePrepareRequest(req)`
- `talkSessionSerialEnabled`
- `resolveTalkSessionKey(req)`
- `scaleBackplane`
- `recordTalkMetric(metric)`
- `createRequestId()`
- timeout constants needed to preserve the distributed lock TTL:
  `sttTimeoutMs`, `chatTimeoutMs`, `ttsTimeoutMs`

**Accessor**: `talkInFlightBySessionSize()` — already used by
`/ops/metrics`.

Current same-session behavior is **409 with Retry-After: 1** for
both local and distributed lock contention. There is no wait-vs-429
policy today; do not add one in Phase 7a.

### 4. `talkConcurrencyGuard`

**Live behavior**: global concurrency cap. The N+1th
concurrent POST is rejected (503 or 429 per current code).

**Deps**:
- Module-internal counter
- `isSpeculativePrepareRequest(req)`
- `talkMaxInFlight`
- `recordTalkMetric(metric)`

## Mount pattern (post-extraction)

The `mountTalkPipelineRoutes` factory in
`backend/lib/talk_pipeline.js` already receives the guards through
dependency injection. It must stay route-only. After Phase 7a,
`backend/index.js` imports the guard factories/accessors from
`backend/lib/talk_state.js`, creates the guards with live deps, and
passes them into `mountTalkPipelineRoutes(app, { ... })`.

```js
import {
  createTalkRateLimitGuard,
  createTalkIdempotencyGuard,
  createTalkSessionSerialGuard,
  createTalkConcurrencyGuard,
  talkIdempotencyCacheSize,
  talkInFlightBySessionSize,
} from "./talk_state.js";
```

Each guard is created with its deps at startup (in
`backend/index.js`'s wiring) and passed into
`mountTalkPipelineRoutes(app, { talkRateLimitGuard, ... })`.

## Byte-identical invariants

- **Response envelopes** under all guard-denied paths stay
  identical. The 429 / 503 / 200-cached shapes today don't
  change.
- **Counter increment order** stays identical. If
  `talkRateLimitGuard` increments before responding, the
  extracted guard does too.
- **Log lines** preserve the same prefixes where log lines exist
  today. Do not invent new guard logs in Phase 7a; the idempotency
  replay log stays `talk_idempotency replay=1 ...`.
- **Ops/metrics accessors** (`talkIdempotencyCacheSize`,
  `talkInFlightBySessionSize`) keep their names. The
  `/ops/metrics` route imports from `talk_state.js` after the
  extraction; the response envelope shape doesn't change.

## Test matrix (per guard)

Under `backend/tests/talk_state.test.mjs`:

| Guard | Tests |
| --- | --- |
| `talkRateLimitGuard` | (1) bucket fairness across 5 keys; (2) burst within limit allowed; (3) over-limit -> 429 with `Retry-After`; (4) cleanup runs before bucket read/write; (5) uses supplied `clientIp` and clock |
| `talkIdempotencyGuard` | (1) cache hit returns cached response; (2) cache miss -> next(); (3) cache key from `X-Idempotency-Key` or `Idempotency-Key`; (4) cache size accessor matches; (5) pending duplicate -> 409 with `Retry-After: 1`; (6) finish handler removes unresolved pending record |
| `talkSessionSerialGuard` | (1) same-session local lock -> 409; (2) same-session distributed lock denial -> 409; (3) different sessions don't block each other; (4) `talkInFlightBySessionSize` accessor matches; (5) release runs on `finish` and `close` |
| `talkConcurrencyGuard` | (1) N concurrent allowed; (2) N+1 -> 503 with `Retry-After: 1`; (3) counter decrements on `finish`; (4) counter decrements on `close`; (5) speculative prepare bypasses the counter |

Plus a cross-cutting test:

| Test | Asserts |
| --- | --- |
| `talk_state` + `/ops/metrics` integration | the ops route's `idempotency_entries` + `session_locks` fields match the lib's accessors after a sequence of mocked turns |

## #238 invariant inheritance

The guards close over module-scope state. The lib MUST NOT
expose a setter that mutates the global limiter / cache /
counters from outside. The factory functions accept config + a
clock + a clientIp helper — but the actual mutable state stays
in the lib's module scope.

Same byte-identical-rotation rule that Codex flagged in 5b.1:
no `setTalkRateLimiter`, no `setTalkIdempotencyCache`, etc.
Regression tests pin this rule. Factory deps may include helpers,
config values, metrics/logging hooks, and `scaleBackplane`, but not
external setters for the guard-owned mutable state.

## What Phase 7a does NOT do

- Move `handleTalkRequest` itself. That's Phase 7b.
- Move the STT / chat / TTS supplier glue. That's Phase 7c.
- Change any response envelope, status code, or log prefix.
- Add new ops/metrics fields. (Future PR could; not this one.)

## Rollback plan

A revert of the Phase 7a PR restores the inline guards. Because
the lib's module-scope state is fresh per process startup, no
data-migration concern.

## Done when (this design note)

This note lands as a proposal. Phase 7a extraction does NOT
open until:
1. Phase 6 (`/memories/*` extraction) merges, freeing the
   "max 1 decomp PR in flight" slot.
2. Codex reviews this design note and gives explicit
   go-ahead on the four factory shapes + ops/metrics accessor
   approach.

## After this design note

Phase 7a extraction PR opens with:
- `backend/lib/talk_state.js` (the four guards + accessors)
- `backend/tests/talk_state.test.mjs` (the test matrix above)
- `backend/index.js` updated to wire the guards through
  `talk_state.js` instead of inline definitions
- `backend/lib/ops_metrics_route.js` updated to import the
  accessors from `talk_state.js`
- This task file moved to `tasks/_active/` with `status:
  review` and a reference to the extraction PR
