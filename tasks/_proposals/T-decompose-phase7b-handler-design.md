---
id: T-decompose-phase7b-handler-design
title: Phase 7b sub-design (fresh) — handleTalkRequest extraction
owner: support
status: proposed
target_pr: none yet (sub-design refinement; implementation opens after Codex accepts)
pillar: infra (backend architecture)
v1_pillar: talk
v1_effect: refines the Phase 7b plan now that Phase 7a (#306) is merged. Specifies the exact handler boundary, the dep contract, the byte-identical invariants the move must preserve, and the test plan, so Phase 7b implementation can be reviewed against a written contract rather than ad-hoc.
---

## Scope

Sub-design refinement of Phase 7b — the SECOND sub-phase of the
talk-pipeline decomposition (#223 parent design). Phase 7a
(`backend/lib/talk_state.js`, #306) is merged. Phase 7b moves
`handleTalkRequest` itself — the largest single function in
`backend/index.js` — into `backend/lib/talk_handler.js`.

This is a **fresh design note**, not implementation. The closed
#298 was premature; this refined note incorporates the post-7a
state (idempotency helpers now flow through
`talkIdempotencyHelpers`, the four guards already pass through
`mountTalkPipelineRoutes`, accessors come from `talk_state.js`).

Phase 7b implementation is cleared to open after PR #314's accepted design
constraints and T132's scope-tool decision. support agent should proceed with the
implementation lane, not another design-note round.

## Codex acceptance amendments

Accepted on PR #314, 2026-05-14, with these implementation constraints:

1. Use a handler-factory name such as `createTalkHandler`, not
   `mountTalkHandler`, unless the function actually mounts routes.
   In this repo, `mount*` functions receive `app` and register routes.
2. Keep the monolithic move for 7b, but group the dependency contract by
   bucket (`config`, `helpers`, `state`, `memory`, `prompt`, `suppliers`,
   `realtime`, `craft`, `logger`) instead of shipping an 80-argument flat
   destructure. Required-deps guards still need to fail clearly for missing
   load-bearing deps.
3. The integration tests must mount the real extracted handler with stubbed
   deps through `mountTalkPipelineRoutes`. Do not make the integration test
   file only exercise a fake handler; that would miss the risky seam.
4. Human/Codex decision on 2026-05-16: add `acorn` and `acorn-walk` as backend
   devDependencies and use them as deterministic tooling for the dependency
   closure. This is tooling/test support only, not runtime app behavior. Do not
   hand-maintain the closure by guesswork, do not ask for human-in-the-loop
   dependency convergence, and do not transfer 7b to Codex unless this focused
   tooling path still blocks.

Manual smoke is required before merging the implementation PR, not before
opening it.

## Why a fresh design note

#223 sketched three sub-phases (guards, handler, supplier glue).
Phase 7a's design refinement note (#293) set the precedent:
high-risk extractions ship a sub-design before code so reviewers
can argue contract before mechanics. #298 was closed because it
arrived before Phase 7a landed; this v2 lands after Phase 7a is
on `main` and reflects the new lib seam.

## Handler boundary

> **Boundary correction (verified against `main` @ #323,
> 2026-05-15).** The numbers below were measured at #314. After
> Phase 7a (#306) and subsequent merges the function is smaller and
> shifted. Verified current boundary:
>
> - Definition: `backend/index.js:27673`
>   `async function handleTalkRequest(req, res) {`
> - Close brace (column 0): `backend/index.js:31236`
> - Inner body to move (byte-exact): lines **27674–31235**
>   (**3,562 lines**); brace-balance over 27673–31236 is net 0.
> - Registration unchanged: `mountTalkPipelineRoutes(app, { … })`
>   at `backend/index.js:31299`, `handleTalkRequest,` at line 31306.
> - Per amendment #1 the factory is `createTalkHandler(deps)`
>   (it returns the handler; it does not mount routes).
>
> **Dep-contract status:** the ~80-name list below is the
> Codex-reviewed *intent*, but it predates #323 and is NOT
> the source of truth for wiring. Per T132, the safe wiring method is
> deterministic lexical-scope tooling: use `acorn` / `acorn-walk` as
> backend devDependencies to compute the closure, prove it complete in
> `backend/tests/talk_handler_closure.test.mjs`, then run the focused
> talk suite and full backend tests. The design-mandated **human manual
> smoke** (record + play back a real voice turn) remains a pre-merge
> gate because an agent cannot truthfully perform that app-level smoke.

`handleTalkRequest` (original #314 estimate, superseded by the
correction above) was cited at `backend/index.js:27673`–`31514`
(**~3,842 lines**). It is the entire voice-to-page pipeline body:

  1. STT (Whisper / Replicate / stub fallback)
  2. Memory load + read-state snapshot
  3. Identity / persona resolution
  4. Prompt assembly (turn meta + creative memory + persona)
  5. Chat-completion call (OpenAI / alternate provider / streaming)
  6. Memory write (commit turn meta, persist user memory)
  7. Block-signal + craft analysis side-effects
  8. TTS (ElevenLabs / OpenAI TTS / stub)
  9. Response shape (200 audio body OR 200 JSON envelope)
 10. Error envelope on stage failure (stt / chat / tts)

Phase 7b moves the entire function. Internal sub-splits
(STT / prompt+LLM / TTS / commit / response) are a separate
post-7b refactor lane — out of scope for 7b.

## Recommended factory shape

```js
import { mountTalkHandler } from "./lib/talk_handler.js";

const handleTalkRequest = mountTalkHandler({
  // ---------- config (constants) ----------
  OPENAI_API_KEY,
  CHAT_TIMEOUT_MS, STT_TIMEOUT_MS, TTS_TIMEOUT_MS,
  CHAT_MODEL_FAST, CHAT_MODEL_DEEP,
  WHISPER_MODEL, REPLICATE_MODEL,
  ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL,
  TALK_MAX_IN_FLIGHT, TALK_TURN_META_TTL_MS,
  TALK_TURN_META_MAX_SIZE,
  TALK_METRICS_DEGRADED_P95_MS, TALK_METRICS_DEGRADED_ERROR_RATE,
  CHAT_LOAD_SHED_IN_FLIGHT, CHAT_LOAD_SHED_P95_MS,
  CHAT_LOAD_SHED_MIN_SAMPLES, CHAT_LOAD_SHED_NONCRITICAL_ONLY,

  // ---------- request helpers ----------
  clientIp, createRequestId, normalizeClientToken,
  normalizeClientIp, sanitizeForLog,

  // ---------- talk-state seam (from Phase 7a lib) ----------
  talkIdempotencyHelpers, // commitSuccess, clearPending, captureResponseHeaders
  recordTalkMetric,
  incrementErrorCounter,

  // ---------- identity / memory ----------
  resolveWritableMemoryContext,
  persistWritableMemoryContext,
  setPersistedUserMemoryForIp,
  selectMemoryRecordForRead,
  normalizeAssistantSelfName,
  getAssistantSelfNameForIp,
  normalizeUserPersonName,
  buildReadStateMeta,
  applyReadStateHeaders,
  ifNoneMatchStateHit,

  // ---------- prompt + LLM ----------
  buildModelPrompt,
  buildBlockCoachingBlockForPrompt,
  buildMemoryCards,
  buildConversationHistoryThreads,
  buildMemoryQualitySnapshot,
  maybeBackfillThemesFromHistory,
  computeBlockSignal,

  // ---------- turn meta ----------
  storeTalkTurnMeta, readTalkTurnMeta, canReadTalkTurnMeta,

  // ---------- supplier shape (boxed — will be replaced by 7c) ----------
  callSttSupplier,    // STT call wrapper (current inline)
  callChatSupplier,   // chat call wrapper (current inline)
  callTtsSupplier,    // TTS call wrapper (current inline)
  isAbortError, fetchWithTimeout, sleepMs,

  // ---------- realtime / scale ----------
  scaleBackplane,

  // ---------- block + craft ----------
  shouldRecordTwist,
  acceptedTwistLog,

  // ---------- logger / clock ----------
  logger = console,
  now = () => Date.now(),
});

// handleTalkRequest is `async (req, res) => Promise<void>`.
```

**~80 explicit deps** across 11 buckets. The handler closes over
these via destructuring at mount time; no module-level state
escapes the lib's scope.

## Why monolithic in 7b, not split

The current handler has tight coupling across stages:

- STT result feeds the prompt assembly.
- Prompt assembly reads memory state mid-flight.
- LLM response triggers memory writes BEFORE TTS.
- TTS errors bypass memory writes via specific control flow.
- Idempotency / metric calls are scattered across all stages.

Splitting these into per-stage sub-functions inside `talk_handler.js`
is valuable but RISKY in the same PR as the lib move. The
byte-identical invariant Codex enforces (response envelopes,
counter order, log prefixes, side-effect order) is much easier to
prove for a verbatim move than for a structural rewrite.

**Recommendation**: Phase 7b ships the lib move only. A separate
follow-up refactor PR (Phase 7b.1) splits the internal stages.

## Byte-identical invariants (8 total)

1. **Response envelopes** under all success + failure paths
   unchanged. The 200 audio-body shape, the 200 JSON shape, and
   the `{ stage, error }` envelopes for `stt`/`chat`/`tts` stages
   stay byte-identical.

2. **`storeTalkTurnMeta` is called exactly once per successful
   request**, with the same payload fields in the same order
   (`turnId`, `transcriptText`, `aiText`, `audioDurationMs`,
   `lane`, etc.). The current order is `storeTalkTurnMeta` →
   `recordTalkMetric` → `commitTalkIdempotencySuccess`.

3. **Memory write order is preserved**. The handler calls
   `setPersistedUserMemoryForIp` at four specific points; their
   relative ordering against `storeTalkTurnMeta` and TTS dispatch
   must stay the same. Reordering changes the eventual-consistency
   contract for `/state` / `/memories` reads on the same
   request lifecycle.

4. **Log prefixes** preserved. Every `console.log` / `logger.log`
   call inside the handler keeps its `[<requestId>] <stage> ...`
   prefix. No new log lines, no removed log lines, no relabeled
   stage names.

5. **Status codes** preserved. The current 200/400/401/403/409/
   422/429/500/503 routing is exact. No new codes; no narrowing
   of existing codes.

6. **Headers** preserved. The handler sets `Content-Type`
   (audio/mpeg / application/json), `Content-Length`,
   `x-turn-id`, `x-stage`, `x-talk-status`, and several
   stream-related headers in specific orders. The extracted
   handler reproduces these exactly.

7. **Side-effect ordering** preserved across stages:
   `recordTalkMetric` → `commitTalkIdempotencySuccess` →
   `incrementErrorCounter` (on error) → memory persist → response
   send. Each call site keeps its current relative position.

8. **No module-level state in the lib**. The handler closes over
   deps via parameters. No `let`/`const` mutable state at
   `talk_handler.js` module scope — that's the #238 rule
   inherited from 7a. The lib's only "state" is the deps passed
   in at mount time.

## Test plan

Two test files:

### `backend/tests/talk_handler_unit.test.mjs`

Pure-unit tests against `mountTalkHandler({...})` with all deps
stubbed. ~20 tests covering:

- Factory required-deps guard (throws at mount for each missing dep).
- Stub STT success → triggers prompt assembly with expected args.
- Stub chat success → triggers TTS dispatch with expected args.
- STT timeout → 500 with `{ stage: "stt", error }`.
- Chat timeout → 500 with `{ stage: "chat", error }`.
- TTS timeout → 500 with `{ stage: "tts", error }`.
- Memory write happens BEFORE TTS dispatch in the happy path.
- Idempotency commit happens AFTER memory write.
- `storeTalkTurnMeta` called exactly once per success.
- `setPersistedUserMemoryForIp` ordering across the four call sites.

### `backend/tests/talk_handler.test.mjs`

Integration tests on a bare Express app with the lib mounted via
`mountTalkPipelineRoutes` against a stubbed `mountTalkHandler`.
~10 tests covering:

- Happy path: POST /talk with stub multipart audio → 200 JSON envelope.
- Idempotency: same Idempotency-Key returns cached body on retry.
- Concurrency cap: N+1 returns 503 via the (already-extracted) guard.
- Load shed: high `talkInFlight()` shifts model to fast.
- Block-signal side-effect runs even on TTS error.
- `/ops/metrics` reflects post-turn sample correctly.

Full backend `npm test` must remain green (currently 1147 tests).

## Risk + rollback

**Risk: highest of the spec.** The handler is the V1 voice-to-page
backbone. A regression here is user-visible.

**Pre-merge gate**:

- The implementation PR may open without a human smoke.
- Before merge, a human runs a manual smoke against the intended backend
  (record + send a turn, verify reply, verify audio/fallback, verify saved
  turn) after pre-flight and review feedback are addressed.
- The PR body must include exact manual-smoke instructions and must not claim
  the smoke passed unless the human actually ran it.

**Rollback**: revert the PR. The lib is self-contained; no
external state migration. The handler's closure over deps means
nothing leaks into module scope.

## What Phase 7b does NOT do

- Move the STT / chat / TTS supplier glue. That's Phase 7c.
- Split the handler into per-stage sub-functions. That's the
  post-7b refactor lane (Phase 7b.1, opens only after 7b lands).
- Add new ops/metrics fields, log prefixes, or status codes.
- Change the response envelope shape — every byte the iOS app
  reads today comes back unchanged.

## Codex signoff state

Signed off as of PR #314 plus T132:

1. Use deterministic `acorn` / `acorn-walk` closure tooling for dep discovery.
2. Keep 7b monolithic; no stage-splitting in this PR.
3. Preserve the 8 byte-identical invariants above.
4. Keep the two-file test plan, with the real extracted handler mounted through
   `mountTalkPipelineRoutes`.
5. Manual smoke gates merge, not PR opening.
6. support agent owns the implementation lane unless the scope-tool path still blocks.

## Done when

This note lands on main. Phase 7b extraction may open after:

1. PR #314 accepted the design and T132 accepted deterministic scope tooling.
2. No other decomp PR is in flight (max-1-in-flight rule).
3. The implementation PR follows the Codex acceptance amendments above.
