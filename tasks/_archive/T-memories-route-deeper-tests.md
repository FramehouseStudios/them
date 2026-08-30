---
id: T-memories-route-deeper-tests
title: Deeper test coverage for backend/lib/memories_route.js
owner: support
status: merged
branch: support/T-memories-route-deeper-tests
pillar: memory
v1_pillar: memory
v1_effect: pins boundary + edge-case behavior of the /memories/* cluster (body-limit enforcement, method guards, persistence call order, 304-vs-200 routing, backfill side-effect conditionality, export filename pattern). The base suite covered happy-path response shapes; this suite locks in the supporting invariants iOS depends on.
---

## Scope

Adds `backend/tests/memories_route_deeper.test.mjs` — 21 tests
covering the boundary + edge cases the base suite intentionally
left out. No code changes to `backend/lib/memories_route.js`.

## What's covered

- Body-limit enforcement (256kb → 413) on update + forget.
- Cache-Control: no-store header on every read response.
- If-None-Match miss returns 200 (not 304).
- sinceVersion mismatch returns 200 with delta_no_change=false.
- Backfill side-effect only fires when applied=true.
- Method guards: GET on POST route → 404; POST on GET-only → 404.
- Mutation persistence: persistWritableMemoryContext called.
- Export filename pattern includes date stamp.
- Export embedded JSON parses and has memory + history + tasks.
- logger.log fires with `[req_test]` prefix on mutation routes.
- Mutation rejection routing (ok=false → 400).
- sanitizePersistedSessionMemory called on the read path.
- Malformed JSON body returns 400 (not 500).

## Verification

```bash
node scripts/pre_flight.mjs                       # OK
node --test backend/tests/memories_route.test.mjs  # 18/18 (base)
node --test backend/tests/memories_route_deeper.test.mjs  # 21/21 (new)
```

Combined memories route coverage: 39 tests, all green.

## Done when

- New test file lands at
  `backend/tests/memories_route_deeper.test.mjs`.
- All 21 tests pass.
- Pre-flight clean.
