---
id: T-decompose-phase5b4-realtime-call
title: Decompose backend/index.js — Phase 5b.4 (/realtime/call)
owner: claude
status: review
branch: claude/T-decompose-phase5b4-realtime-call
pillar: infra (backend architecture)
v1_pillar: realtime
v1_effect: closes the realtime route decomposition required by docs/v1-definition.md line 68 — extracts the last route in the 5b chain (WebRTC SDP proxy) so Phase 7 (talk-pipeline decomposition) is unblocked per the spec
---

## Scope

**Last sub-phase of the 5b chain.** Phase 5b.1 (#238) extracted
`/realtime/client_secret`; Phase 5b.2 (#264) extracted
`/realtime/studio_render` + `/studio_render_stream`; Phase
5b.3 (#273) extracted `/realtime/turn_commit`. This PR extracts
`POST /realtime/call` — the WebRTC SDP proxy that negotiates a
realtime session with OpenAI's `/v1/realtime/calls` endpoint.

The route moves to `backend/lib/realtime_call_route.js` with
the same response contract. The only intentional non-response
change is that the diagnostic line uses `console.warn` in the
lib, matching the earlier realtime route extraction precedent
and the pre-flight console-log rule.

## Dependencies (4 functions + 3 constants)

### Helpers
- `createRequestId` — request id generator
- `buildRealtimeSessionConfig` — model+voice → session config object
- `fetchWithTimeout` — fetch wrapper with abortable timeout
- `isAbortError` — abort-detection helper

### Constants
- `OPENAI_API_KEY` — when empty, route returns 503
- `OPENAI_REALTIME_MODEL` — default model
- `OPENAI_REALTIME_VOICE` — default voice

## Response-contract invariants

- **503 envelope** when `OPENAI_API_KEY` is empty:
  `{ stage: "realtime_call", error: "OpenAI API key is missing
  for Realtime call setup." }`.
- **400 envelope** when SDP body is empty/whitespace-only:
  `{ stage: "realtime_call", error: "Missing SDP offer body." }`.
- **504 envelope** on `isAbortError(err)` (fetch timeout):
  `{ stage: "realtime_call", error: "Realtime SDP negotiation
  timed out." }`.
- **502 envelope** on any other fetch failure with the err
  message forwarded.
- **Upstream status passthrough** on OpenAI non-2xx: server
  returns `openaiResp.status` with `{ stage, error }` body
  carrying the upstream text verbatim (or a fallback message
  when upstream body is empty).
- **200 SDP response** on success: SDP text body, NOT JSON.
- **Response headers** preserved:
  - `Cache-Control: no-store`
  - `Content-Type: application/sdp`
  - `x-realtime-model: <resolved model>`
  - `x-realtime-voice: <resolved voice>`
- **Diagnostic line** preserved in content but emitted through
  `console.warn` (lib precedent established in 5b.1 / 5b.2 /
  5b.3) instead of the prior inline `console.log`.
- **Body limit** unchanged at `512kb` on both
  `application/sdp` and `text/plain` content types.
- **Fetch timeout** unchanged at 15 seconds.
- **Form encoding** preserved: multipart form with `sdp` +
  `session` (JSON-stringified) fields.
- **Query param overrides** preserved: `?model=<m>` overrides
  default; `?voice=<v>` is lowercased then overrides default.
- **No module-level state mutation.** No setter dep accepted;
  regression test pins the #238 invariant.

## V1 pillar / effect

- `V1 pillar: realtime`
- `V1 effect: closes the realtime route decomposition required
  by docs/v1-definition.md line 68 ("Realtime route
  decomposition lands before talk-pipeline Phase 7"). After
  this PR merges, the realtime sub-chain is complete (4/4 sub-
  phases) and Phase 7 (talk-pipeline decomposition) is
  unblocked per the spec.`

## Verification

```
node --test backend/tests/realtime_call_route.test.mjs
```

→ **18/18 pass**:

- Factory + mount guards (5 tests): body-limit + timeout
  constants, mount rejects null app, mount rejects each of the
  4 missing-fn deps, mount rejects bad-type constants.
- 503 missing key (1).
- 400 missing/whitespace body (2).
- 504 on isAbortError (1).
- 502 generic fetch failure (1).
- Upstream non-2xx passthrough (2): status code forwarded,
  fallback message when upstream body empty.
- 200 SDP happy path (2): body is SDP text, response headers
  canonical (Content-Type starts with `application/sdp`).
- buildRealtimeSessionConfig flow (2): defaults + query-param
  overrides (voice lowercased).
- Form encoding to OpenAI (1): URL, method, Authorization,
  OpenAI-Beta header, timeoutMs, FormData fields.
- #238 invariant inheritance (1): no setter-shaped dep.

Plus:
- `node --check backend/index.js` passes.
- `node --test scripts/pre_flight.test.mjs` passes 44/44,
  including the new `express.text()` parser regression.
- `backend/index.js` shrinks by **51 net lines** (66 inline →
  15 mount call).
- Pre-flight clean (after a small additive update to the
  `route-needs-own-parser` rule — see below).

## Pre-flight rule update (additive, in this PR)

The `route-needs-own-parser` rule was flagging
`realtime_call_route.js` because it uses `express.text()` (not
`express.json()`). The rule's original regex only recognized
`express.json` / `express.urlencoded` / `req.on('data')`. Per
Codex's original #90 review, the intent of the rule is "any
route-local body parser" — `express.text()` and `express.raw()`
are equally legitimate.

Updated the rule to also accept `express.text\s*\(` and
`express.raw\s*\(`. This is an additive, scope-only change:
the rule does NOT become stricter; it stops flagging a class
of routes it shouldn't have flagged.

## Done when

Inline `POST /realtime/call` no longer in `index.js`; lib file
exists with the SAFE-PUBLIC posture documented; 18/18 tests
pass; pre-flight clean; 5b chain complete.

## Next phase

**Phase 5b is done.** Per the #228 design note, Phase 6
(`/memories/*` cluster extraction) is the next decomp arc.
Phase 7 (talk-pipeline) is unblocked but its #223 design note
already calls out the staged approach (7a + 7b + 7c).
