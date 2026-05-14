---
id: T-decompose-phase5b2-studio-render
title: Decompose backend/index.js — Phase 5b.2 (studio_render + studio_render_stream)
owner: claude
status: review
branch: claude/T-decompose-phase5b2-studio-render
pillar: infra (backend architecture)
v1_pillar: realtime
v1_effect: continues the realtime route decomposition required by docs/v1-definition.md line 68 — extracts the two Studio-render routes into their own testable lib
---

## Scope

Phase 5b.2 of the decomposition (spec:
`docs/specs/T-decompose-backend-index.md`, design note #227).
Phase 5b.1 (#238) extracted the supplier mint route; this PR
extracts the two Studio-render routes:

- `POST /realtime/studio_render` (sync) — returns
  `{ ok, action, reply }`.
- `POST /realtime/studio_render_stream` (SSE) — emits `meta`,
  `trace` (on first delta), `delta`, `done`, and `error` events.

Both move to `backend/lib/realtime_studio_render_routes.js`
with byte-identical behavior. The 503 missing-key guard, the 400
empty-transcript guard, the success envelopes, the SSE event
shapes, the `console.log` lines, and the body limit (512kb) all
match the inline source exactly.

## V1 pillar / effect

- `V1 pillar: realtime`
- `V1 effect: continues the realtime-decomp chain unblocked by
  the Phase 5b.1 merge. After 5b.2, 5b.3 (turn_commit) and 5b.4
  (call) follow — each one shrinks backend/index.js and tightens
  the V1 line 68 prerequisite ("Realtime route decomposition
  lands before talk-pipeline Phase 7").`

## Mount call

```js
mountRealtimeStudioRenderRoutes(app, {
  renderStudioRealtimeText,
  streamStudioRealtimeText,
  createRequestId,
  normalizeSnippet,
  getOpenAIApiKey: () => OPENAI_API_KEY,
});
```

`getOpenAIApiKey` is an accessor so a value of `""` / falsy is
treated as "missing" at request time, matching the original
inline `if (!OPENAI_API_KEY)` guard.

## Verification

- `node --test backend/tests/realtime_studio_render_routes.test.mjs`
  → **17/17 pass**:
  - factory shape + mount guards (3 tests)
  - sync route: happy path, 503 missing key, 400 empty transcript,
    400 with no fields, user_message fallback, renderer error
    with status/stage, renderer error default 502 (7 tests)
  - SSE route: meta+delta+done sequence, trace on first delta,
    503 missing key, 400 empty transcript, error event on
    streamer throw, SSE headers, response read to completion
    (7 tests)
- `node --check backend/index.js` passes.
- `backend/index.js` shrinks by **147 net lines** (159 inline →
  12 mount call).

## Done when

Two inline Studio-render routes no longer in `backend/index.js`;
lib file exists with the SAFE-PUBLIC posture documented; 17/17
tests pass; SSE event shapes preserved byte-identically.

## Next phase

Phase 5b.3: extract `POST /realtime/turn_commit`. Gated on this
PR merging per spec (max 1 decomp PR in flight).
