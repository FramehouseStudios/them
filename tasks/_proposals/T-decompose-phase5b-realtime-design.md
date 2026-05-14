---
id: T-decompose-phase5b-realtime-design
title: Phase 5b design note — 5 heavy /realtime/* write/streaming/call routes
owner: claude
status: proposed
target_pr: none yet (gating note; sub-phases open only after Codex accepts)
pillar: infra (backend architecture)
v1_pillar: realtime
v1_effect: closes prerequisite for "Realtime route decomposition lands before talk-pipeline Phase 7" (docs/v1-definition.md line 68)
---

## Scope

Phase 5a (#215) extracted the 2 read-only `/realtime/*` routes
(`/realtime/health` + `/realtime/bridge`). Phase 5b extracts the
5 heavy write/streaming/call routes. They are sized too large to
ship as one PR, so this note proposes 4 sub-phases.

This is a **design note**. No Phase 5b code opens until Codex signs
off on the phasing + invariants here.

## V1 pillar / effect

- `V1 pillar: realtime`
- `V1 effect: closes prerequisite for "Realtime route decomposition
  lands before talk-pipeline Phase 7" (docs/v1-definition.md line 68).
  Talk-pipeline Phase 7 cannot open until /realtime/* routes are
  extracted, because the talk handler crosses into supplier-mint
  code that lives on the realtime side today.`

## Routes in scope

| # | Route | Lines | Deps approx. | Risk |
| --- | --- | --- | --- | --- |
| 1 | `POST /realtime/client_secret` | ~150 | 14 (supplier loader + mint failover + error counter + assistant self name + 5 OPENAI consts) | medium |
| 2 | `POST /realtime/studio_render` | ~45 | 4 (renderStudioRealtimeText + OPENAI_API_KEY + normalizeSnippet + createRequestId) | low |
| 3 | `POST /realtime/studio_render_stream` | ~110 | 5 (streamStudioRealtimeText + same as #2) | medium (SSE streaming, abort handling) |
| 4 | `POST /realtime/turn_commit` | ~120 | ~25 (memory write path) | medium-high |
| 5 | `POST /realtime/call` | ~60 | 6 (buildRealtimeSessionConfig + fetchWithTimeout + isAbortError + 3 OPENAI consts) | low (mechanical WebRTC SDP proxy) |

Total ~485 lines of inline body to extract.

## Sub-phasing — 4 sub-PRs, sequential

Per spec: max 1 decomp PR in flight. Sub-phases ship serially.

### Phase 5b.1 — `POST /realtime/client_secret`

Target: `backend/lib/realtime_client_secret_route.js`.

**Why first**: highest-traffic route on the realtime surface; the
mint + failover state machine is load-bearing for every iOS
session. Extracting it first hardens the test surface that the
later sub-phases build on.

**Deps to pass**:
- `realtimeSupplier` (live accessor — supplier can rotate via
  failover during process lifetime)
- `createRealtimeSupplier`, `mintWithFailover`
- `createStubRealtimeSupplier` (lazy-loaded inside the lib)
- `incrementErrorCounter`
- `getAssistantSelfNameForIp` (live accessor over per-IP state)
- `clientIp`, `normalizeSnippet`, `createRequestId`
- `OPENAI_API_KEY`, `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_VOICE`,
  `OPENAI_REALTIME_INPUT_TRANSCRIPTION_MODEL`,
  `OPENAI_REALTIME_CLIENT_SECRET_TTL_SECONDS`
- `REALTIME_PROVIDER` env value (read at request time)

**Invariants preserved**:
- The 201 response envelope shape (see
  `docs/schemas/realtime-client-secret.md` once it lands).
- Fallback behavior: `fallback: true`, `fallback_reason`, and
  `primary_supplier` keys appear only when the primary supplier
  failed and the unpinned-request path falls back to the stub.
  Pinned-provider requests never fall back.
- Error counter classes: `realtime_supplier_unavailable`,
  `realtime_supplier_request_failed`,
  `realtime_supplier_response_invalid`, plus
  `supplier_fallback_failed` cause-wrap.
- Session config shape: produced by `supplier.buildSessionConfig`
  when the mint didn't return one; the `session.type` defaults to
  `"realtime"`, `output_modalities` defaults to `["audio"]`.

**Risk**: medium. The mint+failover state machine handles partial
failures; tests must cover all 4 paths (primary-ok, primary-fail-
fallback-ok, primary-fail-fallback-fail, pinned-provider-fail).

### Phase 5b.2 — `POST /realtime/studio_render` + `POST /realtime/studio_render_stream`

Target: `backend/lib/realtime_studio_render_routes.js` (both
routes share `OPENAI_API_KEY` + `renderStudioRealtimeText` /
`streamStudioRealtimeText` helpers, so one lib).

**Why grouped**: the streaming version is a 1:1 SSE wrapper around
the non-streaming version's logic. Extracting them together
preserves the parallel structure.

**Deps to pass**:
- `OPENAI_API_KEY`
- `renderStudioRealtimeText`, `streamStudioRealtimeText`
- `normalizeSnippet`, `createRequestId`

**Invariants preserved**:
- Non-streaming envelope: `{ ok, action: "studio_render", reply }`
  on 200; `{ stage, error }` on error.
- Streaming SSE events (in order): `meta`, `trace` (on first delta),
  `delta` (per chunk), `done` (on success), `error` (on failure).
- First-delta latency is logged + emitted in the `trace` event.
- Response headers on streaming: `Cache-Control: no-store`,
  `Content-Type: text/event-stream`, `Connection: keep-alive`,
  `X-Studio-Render-Request-Id: <rid>`.
- Abort handling: `req.on("aborted")` + `res.on("close")` flip a
  `closed` flag; `pushEvent` is a no-op after close.

**Risk**: low for non-streaming; medium for streaming (the abort
race is the only subtle path).

### Phase 5b.3 — `POST /realtime/turn_commit`

Target: `backend/lib/realtime_turn_commit_route.js`.

**Why third (not first)**: this handler touches the memory write
path (`resolveWritableMemoryContext`,
`sanitizePersistedSessionMemory`, `updateSessionEmotionMemory`,
`updateSessionAfterReply`, `persistWritableMemoryContext`,
`storeTalkTurnMeta`, etc.). The memory write surface is being
audited as part of Phase 6; sequencing turn_commit after
client_secret + studio_render gives Phase 6 design more runway.

**Deps to pass**: ~25 from the memory write path; full list lives
in `tasks/_proposals/T-decompose-phase5b3-turn-commit-design.md`
when that sub-phase opens.

**Invariants preserved**:
- The 201 envelope: `{ ok, action: "realtime_turn_commit", status,
  source, turn_id, request_id, session_id, state_version,
  last_turn_id, last_updated_at, history_updated_at,
  memory_updated_at, schema_version, backend_build,
  backend_boot_id }`.
- `storeTalkTurnMeta` is called exactly once per successful
  commit, with the canonical render contract.
- Read-state headers: `x-turn-id`, `x-turn-meta-available`,
  `x-state-version`, etc.
- Per-IP metrics are recorded (`recordUserTalkMetrics`).
- Active-theme refresh is fire-and-forget (does not block the
  201 response).

**Risk**: medium-high. The memory write path is heavily
interconnected. Tests must verify that memory mutation visible
in subsequent reads matches the inline behavior byte-for-byte.

### Phase 5b.4 — `POST /realtime/call`

Target: `backend/lib/realtime_call_route.js`.

**Why last**: simplest extraction (60 lines, mechanical). Saving
it for last lets it ride the merge train after the heavier
sub-phases.

**Deps to pass**:
- `OPENAI_API_KEY`
- `buildRealtimeSessionConfig`
- `fetchWithTimeout`, `isAbortError`
- `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_VOICE`

**Invariants preserved**:
- Request body shape: raw SDP via `express.text({ type:
  ["application/sdp", "text/plain"], limit: "512kb" })`. Not JSON.
- Response: passes through OpenAI's `answer SDP` text response
  with the same status code OpenAI returned (or 502/504 on
  network failure).
- Timeout: 15s. Beyond that → 504.
- Multipart body: `sdp` + `session=<JSON.stringify(sessionConfig)>`.

**Risk**: low. Mechanical proxy.

## Cross-cutting invariants every sub-phase must preserve

1. **Live supplier accessor**: `realtimeSupplier` can rotate (via
   primary-fail → stub fallback). Every extraction reads through
   an accessor function, not a frozen reference.
2. **Error counter contracts**: the 4 canonical error classes
   (`realtime_supplier_unavailable`,
   `realtime_supplier_request_failed`,
   `realtime_supplier_response_invalid`, plus the wrapped
   `supplier_fallback_failed`) are the codes `/talk/errors` reports.
   Renaming any of them is a breaking change for ops dashboards.
3. **Response envelope keys**: every key in each route's 200/201
   response is documented in the corresponding `docs/schemas/`
   doc (or will be when those docs are added). iOS decoders key
   off these field sets.
4. **Body parser limits**: 512kb for client_secret + studio_render
   + studio_render_stream + /realtime/call; 256kb for turn_commit.
   Match inline exactly.

## What Phase 5b does NOT do

- No behavior changes.
- No supplier swap. The supplier factories (`createRealtimeSupplier`
  in `lib/realtime_supplier.js`, `createStubRealtimeSupplier` in
  `lib/realtime_supplier_stub.js`, `mintWithFailover` in
  `lib/realtime_supplier_failover.js`) are unchanged.
- No new endpoints, no new env vars, no new auth gates.
- No talk-pipeline coupling. Talk pipeline does not import from
  these realtime lib files; the relationship is the other way
  (the realtime turn_commit writes turn meta that the talk pipeline
  also writes).

## Tests

Per sub-phase:
- 5b.1: required-deps guard for 14 deps; 4 mint paths (primary-ok,
  primary-fail-fallback-ok, primary-fail-fallback-fail,
  pinned-fail); error-counter assertions for each failure path;
  no-leakage check.
- 5b.2: SSE event order + abort race + non-streaming happy + error
  paths.
- 5b.3: 201 envelope shape; turn-meta storage; memory write
  round-trip; metrics emission.
- 5b.4: SDP body parsing; timeout path; OpenAI status passthrough.

## What we need from Codex before opening any sub-phase

1. **Sign-off on the 4-sub-phase split** (5b.1 → 5b.2 → 5b.3 →
   5b.4). If Codex prefers a different ordering or a different
   split, this note amends.
2. **Sign-off on the invariants list**. Especially for 5b.3
   (turn_commit) — that handler crosses into the memory write
   path. If any memory invariant is missing, the note amends
   before any code lands.
3. **Confirmation that Phase 5b.3's turn_commit extraction does
   not conflict with Phase 6 memory work**. Both touch the memory
   write path; they need to not race.

## Rollback plan

Each sub-phase is independently revertable. Reverting a sub-phase
merge restores its inline route block. No state migration needed.

## After this design note

If Codex accepts, sub-phases open one at a time after each merges.
Phase 5b.1 opens first; 5b.2 only after 5b.1 merges; etc. Each
sub-phase carries its own narrower design note when it opens.
