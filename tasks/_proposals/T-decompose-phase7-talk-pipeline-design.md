---
id: T-decompose-phase7-talk-pipeline-design
title: Phase 7 design note — talk pipeline decomposition
owner: support
status: proposed
target_pr: none yet (gating note; sub-phases open only after Codex accepts)
pillar: infra (backend architecture)
v1_pillar: talk
v1_effect: closes "Talk pipeline route decomposition has a design note before Phase 7 code"
---

## Scope

Talk pipeline is the highest-risk decomp phase. It owns the V1
voice-to-page magic moment. Any byte-diff regression is user-visible:
audio recordings, replies, screenplay cues, dialogue timelines, and
turn metadata that iOS depends on for offline replay.

This is a **design note**. Phase 7 code does not open until Codex
has signed off on this note.

## V1 pillar / effect

- `V1 pillar: talk`
- `V1 effect: closes "Talk pipeline route decomposition has a design
  note before Phase 7 code" (line 18 of docs/v1-definition.md).`

## What's already in `backend/lib/talk_pipeline.js`

The 95-line existing lib mounts two routes:

1. **`GET /talk/turn/:turnId`** — turn-meta read with optional
   token-bucket rate limiting. Already lib-resident; not in scope
   for Phase 7.
2. **`POST /talk`** — the talk pipeline, mounted with the guard
   chain: `talkRateLimitGuard → requireClientTokenForTalk →
   talkIdempotencyGuard → talkSessionSerialGuard →
   talkConcurrencyGuard → talkUpload → handleTalkRequest`.

The mount call itself is already in lib. **What's NOT in lib**:
the guards, the handler, the in-memory state they share, and the
helpers each one calls.

## Surface area to extract

### 1. `handleTalkRequest` (the handler)

Defined at `backend/index.js:28760` and ends near line 32555.
**Roughly 3,800 lines.** This is the largest single function in
the codebase. It owns:

- Multipart audio upload parsing (`talkUpload` is multer-based;
  pre-handler).
- STT (speech-to-text) call with supplier selection + fallback.
- Memory read (resolveWritableMemoryContext, sanitize, etc.).
- Prompt assembly (calls into lib/prompt_assembly.js — already
  extracted).
- LLM call with supplier selection, streaming option, idempotency
  hash.
- TTS (text-to-speech) call with supplier selection + fallback.
- Memory write (updateSessionEmotionMemory, updateSessionAfterReply,
  persist + adapter dual-write).
- Turn metadata storage (storeTalkTurnMeta).
- Metrics emission (recordTalkMetricsSample, recordUserTalkMetrics).
- Screenplay cue + dialogue timeline emission.
- Render contract on response (reply_role, sync_ready, etc.).
- Error recovery / retry / TTS-recovery / inline-recovery.
- ~80 distinct deps from index.js scope.

### 2. The four guards

| Guard | index.js line | What it does | Live state it touches |
| --- | --- | --- | --- |
| `talkRateLimitGuard` | 14223 | Per-user/IP token bucket; rejects with 429. | None (uses utils). |
| `requireClientTokenForTalk` | 14273 | Validates `X-Client-Token` header for audio uploads. | None. |
| `talkIdempotencyGuard` | inline (~14310) | Idempotency-Key dedup. Caches in-flight + completed result. | `talkIdempotencyCache` (Map). |
| `talkSessionSerialGuard` | 14401 | Per-session serial gate; one turn per session at a time. | `talkInFlightBySession` (Map). |
| `talkConcurrencyGuard` | 14473 | Global concurrency cap on in-flight turns. | `talkInFlight` (let). |

### 3. The shared live state

```js
// backend/index.js current declarations
let talkInFlight = 0;                          // line 3091
const talkInFlightBySession = new Map();       // line 2815
const talkIdempotencyCache = new Map();        // line 2816
const talkMetricsSamples = [];                 // line 2818
```

These four mutable module-scoped values are read by handlers,
written by guards, and consumed by `/ops/metrics` /
`/ops/health-summary` / `/ops/alerts`. Any extraction must
preserve the **accessor-function-at-request-time** pattern that
Phases 0–3 established.

## Phasing — three sub-PRs, sequential

Per the spec's max-1-decomp-PR-in-flight rule (sub-phases ship
serially; no parallelism). Each sub-phase has its own task file
and design refinement as it opens.

### Phase 7a — extract the guards + state into `lib/talk_state.js`

**Scope**: the four guards plus the shared state. Each guard
becomes a factory that accepts deps + returns an Express
middleware. The state lives in the lib's module scope; the
guards close over it. `/ops/metrics` continues to read the live
counters through accessor functions passed at mount time.

**Why guards first**: they have the smallest individual surface
area, they have well-defined interfaces (Express middleware), and
they are the load-bearing piece that protects the handler. If a
guard regression slips in, the handler has more failure modes;
isolating guards first lets us harden their tests before touching
the handler.

**Risk**: medium. Each guard touches shared state. Tests must
prove that state mutations from the lib still propagate to the
ops endpoints.

**Tests**: per-guard integration tests under
`backend/tests/talk_state.test.mjs`:
- Token-bucket fairness across keys.
- Idempotency-Key dedup (cache hit returns cached result).
- Session serial gate (two concurrent same-session POSTs → second
  waits or 429s, depending on configured behavior).
- Concurrency cap (N+1 concurrent → 503/429 per current behavior).
- `/ops/metrics` reflects the lib's state via accessor.

**Behavior diff**: zero.

### Phase 7b — extract `handleTalkRequest` into `lib/talk_handler.js`

**Scope**: the 3,800-line handler. Move it into a lib with **all
~80 deps passed as deps object**. The handler stays a single
function in v1; future PRs may split it internally into the STT /
prompt / LLM / TTS stages once it's extracted.

**Why so big**: the handler is genuinely interconnected. The
prompt assembly call uses memory the STT result wrote into;
the TTS call uses the LLM reply; the turn metadata storage uses
the full timeline. Splitting the handler internally before
moving it would change behavior; we move first, refactor inside
later.

**Risk**: highest of any phase. This is the V1 magic-moment
path. Acceptance criteria are strict:
- Existing talk-pipeline tests pass without modification.
- A new `tests/talk_handler.test.mjs` proves the deps-injected
  handler produces the same response envelope as the inline
  version for a canonical fixture.
- Manual smoke: human runs `smoke.sh` (or the v1 voice-to-page
  smoke from the queue) before and after the PR lands; outputs
  match.

**Behavior diff**: zero.

### Phase 7c — extract the supplier glue

**Scope**: the STT / chat / TTS supplier selection + routing
helpers that the handler imports. These are smaller (~600 lines
combined) but cross-cutting; the handler resolves which supplier
to call per turn. Extract into `lib/talk_supplier_glue.js`.

**Why last**: this is the cleanup phase. After 7a and 7b land,
the handler in 7b imports from supplier-glue. Splitting that
import surface into its own lib is a small mechanical move.

**Risk**: low after 7b lands. Mostly mechanical.

**Tests**: supplier-selection table tests +
`talk_supplier_glue.test.mjs`.

## Cross-cutting invariants Phase 7 must preserve

1. **Audio integrity**: the multer upload buffer must not be
   re-read or re-buffered. The handler currently consumes the
   buffer via `req.file?.buffer` once. Any extraction must keep
   the same single-pass model.
2. **Idempotency**: `talkIdempotencyCache` is keyed off
   `(userId|ip, Idempotency-Key)`. Cache entries carry the full
   response body (audio + metadata). Extraction must keep the
   keyspace and TTL identical.
3. **Session serial gate**: only one turn per session at a time.
   `talkInFlightBySession` is the live tracker. The guard
   currently sleeps + retries; extraction must preserve the same
   wait behavior, not switch to immediate 409/429.
4. **Concurrency cap**: `talkInFlight` is the global counter.
   `TALK_MAX_IN_FLIGHT` is the cap. Extraction must read the
   counter via accessor (it's mutated by both guards and the
   handler).
5. **Metrics emission**: every completed turn pushes one sample
   to `talkMetricsSamples` (capped at `TALK_METRICS_MAX_SAMPLES`).
   `/ops/metrics` reads the array. Sample shape is fixed.
6. **Turn meta storage**: `storeTalkTurnMeta({...})` is called
   exactly once per turn. iOS reads via `GET /talk/turn/:turnId`.
   Field set is fixed (transcript, reply, screenplay_cues,
   dialogue_timeline, render_contract, etc.).
7. **Response envelope**: `{ reply, audio_b64?, audio_url?,
   screenplay_cues, dialogue_timeline, render_contract,
   session_id, turn_id, state_version, ... }`. Every field is
   load-bearing for iOS playback. Zero shape change in Phase 7.
8. **Render contract**: `{ reply_role, authoritative_page_text_available,
   sync_ready }`. Drives iOS playback strategy. Unchanged.
9. **Error recovery paths**: inline-recovery, TTS-recovery, and
   the recovery prompt all have specific HTTP shapes iOS
   reconciles against. Extraction preserves them all.
10. **Audio chunking + streaming**: when streaming is enabled,
    response is `text/event-stream`. Event names: `meta`, `delta`,
    `trace`, `done`, `error`. Unchanged.

## What Phase 7 does NOT do

- No behavior changes. Decomposition is byte-identical.
- No internal split of `handleTalkRequest` into per-stage
  functions (STT → prompt → LLM → TTS) until 7b lands.
- No supplier change. Phase 5b already extracts `/realtime/*`
  routes; the talk handler's own supplier glue moves in 7c.
- No new tests for behavior that isn't already tested. New tests
  only prove the extraction preserved behavior.

## What we need from Codex before opening any sub-phase

1. **Sign-off on the phasing** (7a guards → 7b handler → 7c
   supplier glue). If Codex prefers handler-first or supplier-
   glue-first, the design note amends and we re-propose.
2. **Sign-off on the invariants list**. If any are wrong or
   missing, the note amends.
3. **A canonical fixture for the manual smoke** — a recorded
   audio file or a known-good text transcript that produces a
   predictable response envelope. This becomes the golden test
   for byte-identical behavior.

## Rollback plan

Each sub-phase is independently revertable. The handler stays a
single function so a phase-7b revert restores the inline 3,800
lines from one PR's diff. Same for guards and supplier glue.

## After this design note

If Codex accepts:
1. Open Phase 7a (guards + state) when no other decomp PR is in
   flight.
2. Wait for 7a to merge.
3. Open Phase 7b (handler).
4. Wait for 7b to merge.
5. Open Phase 7c (supplier glue).
6. Phase 8 (final sweep) can then close out `backend/index.js`.

If Codex requests changes:
1. This note is the source of truth; amends here.
2. No Phase 7 code opens until the note is signed off.
