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
- `getTalkRateLimiter()` — accessor to the live limiter (already
  decomposed in `backend/lib/talk_turn_rate_limit.js`; the lib
  already exports `createTalkTurnRateLimiter`)
- `clientIp(req)` — IP resolution helper
- `incrementErrorCounter(code)` — for the `rate_limited` count
- `createRequestId()` — for log lines on denied requests

**Factory shape**:
```js
const guard = createTalkRateLimitGuard({
  getTalkRateLimiter, clientIp, incrementErrorCounter, createRequestId,
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
- `incrementErrorCounter(code)` — for the dedup count.
- `now: () => Date.now()` — testable clock.

**Accessor to ops/metrics**: `talkIdempotencyCacheSize()` —
exported from the lib so the existing `/ops/metrics` route can
import it (replacing the inline reference).

### 3. `talkSessionSerialGuard`

**Live behavior**: per-session-id serialization. Concurrent
POSTs with the same session id either wait or 429 (configurable).
Uses module-scope `Map<sessionId, Promise>` for the wait queue.

**Deps**:
- `getTalkSessionSerialPolicy()` — config accessor (wait vs 429)
- `incrementErrorCounter(code)`
- Module-internal `Map`

**Accessor**: `talkInFlightBySessionSize()` — already used by
`/ops/metrics`.

### 4. `talkConcurrencyGuard`

**Live behavior**: global concurrency cap. The N+1th
concurrent POST is rejected (503 or 429 per current code).

**Deps**:
- `getTalkConcurrencyLimit()` — config accessor
- Module-internal counter
- `incrementErrorCounter(code)`

## Mount pattern (post-extraction)

The `mountTalkPipelineRoutes` factory in
`backend/lib/talk_pipeline.js` today directly imports the four
guards from `backend/index.js`. After Phase 7a, it imports them
from `backend/lib/talk_state.js`:

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
- **Log lines** preserve the same prefixes (`[talk_rate_limit]`,
  `[talk_idempotency]`, etc.) so ops dashboards keying on those
  prefixes keep working.
- **Ops/metrics accessors** (`talkIdempotencyCacheSize`,
  `talkInFlightBySessionSize`) keep their names. The
  `/ops/metrics` route imports from `talk_state.js` after the
  extraction; the response envelope shape doesn't change.

## Test matrix (per guard)

Under `backend/tests/talk_state.test.mjs`:

| Guard | Tests |
| --- | --- |
| `talkRateLimitGuard` | (1) bucket fairness across 5 keys; (2) burst within limit allowed; (3) over-limit → 429; (4) `incrementErrorCounter` called on deny; (5) limiter accessor called per request (no stale binding) |
| `talkIdempotencyGuard` | (1) cache hit returns cached response; (2) cache miss → next(); (3) cache key from `Idempotency-Key` header; (4) cache size accessor matches; (5) concurrent same-key → one execution, others wait |
| `talkSessionSerialGuard` | (1) two concurrent same-session → second waits OR 429s per config; (2) different sessions don't block each other; (3) `talkInFlightBySessionSize` accessor matches |
| `talkConcurrencyGuard` | (1) N concurrent allowed; (2) N+1 → 503/429; (3) counter decrements on response end; (4) decrement even on error |

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
Regression tests pin this rule.

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
