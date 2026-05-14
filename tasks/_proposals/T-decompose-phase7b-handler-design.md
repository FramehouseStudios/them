---
id: T-decompose-phase7b-handler-design
title: Phase 7b sub-design — handleTalkRequest extraction
owner: claude
status: proposed
target_pr: none yet (sub-design refinement; opens after Phase 7a lands)
pillar: infra (backend architecture)
v1_pillar: talk
v1_effect: refines the Phase 7b plan (#223) with the explicit dep map, the splitting-vs-monolithic decision, and the response-envelope pinning approach needed before opening the extraction PR
---

## Scope

Sub-design refinement of Phase 7b — the **heaviest extraction
in the entire decomp spec**. The `handleTalkRequest` function in
`backend/index.js` spans **~3,564 lines** (28474 → 32037 in the
current main HEAD) and is the V1 talk pillar's load-bearing
implementation. Phase 7b moves it into
`backend/lib/talk_handler.js` byte-identical.

This is a **design refinement**, not an extraction PR. Phase 7b
code does NOT open until Phase 7a (`talk_state.js` — the 4
guards per #293) lands. Per spec: max 1 decomp PR in flight.

## Why a sub-design

The parent #223 design note sketches the three-sub-phase staging
(7a guards → 7b handler → 7c supplier glue). Phase 7b is by far
the largest, riskiest, and most-V1-impactful of the three. The
#245 + #238 reviews established that high-risk extractions ship
a sub-design first. This note is that gate for 7b.

## Surface to extract

**Single function**: `async function handleTalkRequest(req, res)`.

Boundaries on main today:
- **Start**: line 28474 (`async function handleTalkRequest(req, res) {`).
- **End**: line 32037 (closing `}` of the function).
- **Total**: ~3,564 lines.

Mount point: already in `backend/lib/talk_pipeline.js`'s
`mountTalkPipelineRoutes(app, { handleTalkRequest, ... })` —
the lib already receives `handleTalkRequest` as a dep. Phase
7b ONLY moves the function definition; the mount call doesn't
change shape.

## Splitting vs. monolithic

**Decision: monolithic move in 7b. Internal splits ship in
post-7b refactor PRs, NOT in this extraction.**

Rationale:
- Internal splits would alter the call graph (e.g. extracting
  the STT block into a separate function changes where errors
  propagate from). That's a refactor, not a byte-identical
  extraction.
- The risk profile is "move 3,564 lines, prove they behave
  the same." Adding "and also restructure them" doubles the
  surface area and the review burden.
- The handler IS genuinely interconnected — STT writes into
  memory; prompt-assembly reads that memory; LLM reply gets
  stamped into the same memory; TTS produces audio metadata
  that lands in the response. Splitting prematurely creates
  cross-function data flow that's harder to reason about.

**Acceptance criterion**: a future "split handleTalkRequest
into stages" PR is welcome; it ships AFTER 7b lands and uses
this lib's tests as a regression baseline.

## Dependency map

`handleTalkRequest` references **~80+** module-scope symbols
in `backend/index.js`. They divide into roughly 7 buckets:

### Bucket 1: Request shape + identity (10 deps)
- `clientIp`, `createRequestId`, `randomUUID`
- `parseTalkStreamMode`
- `TALK_STREAM_AUDIO_ENABLED`
- `normalizeAssistantSelfName`, `getAssistantSelfNameForIp`,
  `setAssistantSelfNameForIp`
- `normalizeClientToken`
- `recordCreativeMemoryTriggersForRequest`

### Bucket 2: Memory context (~12 deps)
- `resolveWritableMemoryContext`, `persistWritableMemoryContext`
- `sanitizePersistedSessionMemory`, `sanitizeStudioTurnMetadata`
- `createEmptyEmotionMemory`
- `updateSessionEmotionMemory`, `updateSessionAfterReply`
- `applyUserIdentityIntentToMemory`
- `setPersistedUserMemoryForIp`
- `normalizeUserPersonName`
- `getUserMetricState`, `recordUserTalkMetrics`

### Bucket 3: STT pipeline (~10 deps)
- The OpenAI Whisper / STT supplier resolution + invocation
  helpers
- `fetchWithTimeout`, `isAbortError`
- Audio file ingestion utilities

### Bucket 4: Prompt assembly + LLM call (~12 deps)
- `buildModelPrompt`, `buildModelPromptParts`
- `buildCraftContextBlock`
- `creativeMemoryStore.getCreativeMemoryForPrompt`
- The chat-completion supplier + retry helpers
- `recordCraftPromptInjection`

### Bucket 5: TTS + audio synthesis (~10 deps)
- The TTS supplier glue (will move to Phase 7c)
- `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID`, `TTS_VOICE`,
  `TTS_SPEED` constants
- `interactiveVoiceProfile`-style config
- `streamStudioRealtimeText` (already extracted to
  `realtime_studio_render_routes.js` — Phase 7b imports from
  the lib, not from index.js)

### Bucket 6: Turn meta + response shaping (~10 deps)
- `storeTalkTurnMeta` (the load-bearing "exactly-once" call
  also used by `realtime_turn_commit_route.js`)
- `buildReadStateMeta`, `applyReadStateHeaders`
- `incrementErrorCounter`
- The `render_contract` builder
- The screenplay-output extractor for replies that contain
  formatted screenplay text

### Bucket 7: Block-signal / craft / theme stamping (~16 deps)
- `directorFlagsFromTranscript`
- `maybeRefineActiveThemesWithLLM`
- The block-signal recorder
- The craft-classifier / archetype pipeline calls
- The accepted-twist log writer
- `incrementThemeQualitySignal` (also used by Phase 6)

**Total**: ~80 deps. Each is currently a module-scope
reference. After 7b, they're all passed through the lib's
factory as `deps` object members.

## Factory shape

```js
import { mountTalkHandler } from "./lib/talk_handler.js";

const handleTalkRequest = mountTalkHandler({
  // Bucket 1: identity helpers
  clientIp, createRequestId, randomUUID,
  parseTalkStreamMode, normalizeAssistantSelfName,
  getAssistantSelfNameForIp, setAssistantSelfNameForIp,
  normalizeClientToken,
  recordCreativeMemoryTriggersForRequest,
  // Bucket 2: memory context
  resolveWritableMemoryContext, persistWritableMemoryContext,
  sanitizePersistedSessionMemory, sanitizeStudioTurnMetadata,
  createEmptyEmotionMemory,
  updateSessionEmotionMemory, updateSessionAfterReply,
  applyUserIdentityIntentToMemory,
  setPersistedUserMemoryForIp,
  normalizeUserPersonName,
  getUserMetricState, recordUserTalkMetrics,
  // Bucket 3: STT pipeline
  // (full list documented in the extraction PR)
  // Bucket 4: prompt + LLM
  buildModelPrompt, buildModelPromptParts, buildCraftContextBlock,
  creativeMemoryStore,
  // Bucket 5: TTS
  // (full list)
  // Bucket 6: turn meta
  storeTalkTurnMeta, buildReadStateMeta, applyReadStateHeaders,
  incrementErrorCounter,
  // Bucket 7: block-signal + craft + theme
  directorFlagsFromTranscript, maybeRefineActiveThemesWithLLM,
  incrementThemeQualitySignal,
  // ... full list documented in the extraction PR
  // Constants
  TALK_STREAM_AUDIO_ENABLED, ELEVENLABS_VOICE_ID,
  ELEVENLABS_MODEL_ID, TTS_VOICE, TTS_SPEED,
  CLEMENTINE_PROFILE, DEEP_TURN_SCORE_THRESHOLD,
  // ... full constant list documented in the extraction PR
});
```

`mountTalkHandler` returns the `handleTalkRequest` function
itself — the existing `mountTalkPipelineRoutes(app, {
handleTalkRequest, ... })` call doesn't change shape; it
just receives the function from the lib instead of from
inline.

## Byte-identical invariants Phase 7b MUST preserve

Per the parent #223 note's invariants list, plus the
specific ones surfaced by writing this sub-design:

1. **Response envelope** is the contract in
   `docs/schemas/talk-response.md` (already on main, with the
   #261 drift fix applied). The lib MUST produce the same
   field set, casing, and ordering.

2. **Turn meta `storeTalkTurnMeta` is called exactly once per
   successful turn** with the canonical render contract. This
   is load-bearing for the talk-turn-meta surface and for
   iOS's offline-replay UX.

3. **Memory write order** is preserved:
   `resolveWritableMemoryContext → sanitizePersistedSessionMemory
   → updateSessionEmotionMemory → updateSessionAfterReply →
   persistWritableMemoryContext`. Same calls, same order, same
   args. Phase 6 / `realtime_turn_commit_route` already pin
   this; 7b inherits the rule.

4. **All console.log lines** preserve their prefixes
   (`[NEW TALK]`, `[talk]`, `[creative_memory] trigger error`,
   etc.). Ops dashboards keying on those prefixes keep working.
   Per the 5b precedent: `console.log` → `console.warn` in the
   lib.

5. **All HTTP status codes** unchanged:
   - 200 happy path
   - 4xx: rate-limit, validation, idempotency cache-hit
   - 5xx: STT/LLM/TTS failures
   - 415: unsupported audio
   - 503: supplier unavailable

6. **All response headers** unchanged:
   - `Cache-Control: no-store`
   - `x-turn-id`, `x-turn-meta-available`
   - SSE headers when streaming

7. **All side effects in their original order** — error
   counters increment exactly when the inline source
   increments; metrics record exactly when the inline source
   records; theme backfill, block-signal stamping, accepted-
   twist log writes all happen in the same order with the
   same arguments.

8. **No new module-level state**. The talk_handler lib does
   NOT introduce setters that mutate global state from outside.
   The #238 invariant inheritance regression test pins this.

## Test plan

Two test files under `backend/tests/`:

### `talk_handler_unit.test.mjs`
- Factory shape (the mount returns a function).
- Mount rejects missing deps (spot-check 10-15 of the 80).
- Mount rejects bad-type constants.
- The returned function has the right arity.

### `talk_handler.test.mjs` (integration)
With ~30 stubbed deps, exercise the major branches:

- **Happy path**: text turn → 200 envelope with the canonical
  16-key field set.
- **Voice turn**: audio upload → STT → LLM → TTS → 200 with
  audio fields populated.
- **Streaming**: SSE event sequence (meta, delta, done).
- **Rate-limit denied**: 429 envelope.
- **STT failure**: 502/503 path with stage="stt".
- **LLM failure**: 502 path with stage="chat".
- **TTS failure**: 200 with reply but no audio fields.
- **Idempotency hit**: returns cached response without
  re-invoking helpers.
- **Memory write order**: stubbed memory helpers called in
  the exact order documented above.
- **storeTalkTurnMeta exactly-once invariant**: assert called
  exactly once on success, never on failure paths.
- **Render contract**: stub the response builder; assert
  `render_contract.reply_role`, `authoritative_page_text_available`,
  `sync_ready` shape.
- **Console.warn for diagnostics**: capture and assert log
  prefixes preserved.

### Regression invariants (cross-cut)
- `v1_voice_to_page_smoke.test.mjs` continues to pass.
- `talk_pipeline.test.mjs` continues to pass.

## Risk + rollback

**Risk: highest of any extraction**. The handler is the V1
magic-moment path. A regression here breaks the iOS user
experience directly.

**Rollback**: revert the Phase 7b PR. Because the handler is a
single function that's now imported via factory, the revert is
mechanical. No data migration, no state to rebuild.

**Pre-merge gate**: a human-run manual smoke on
`smoke.sh` (or equivalent) before AND after the PR lands.
Codex's call on whether to require this.

## What Phase 7b does NOT do

- Split the handler internally (deferred to a post-7b refactor).
- Move the STT / chat / TTS supplier glue (that's 7c).
- Change any response field, status code, header, or log line.
- Optimize the prompt assembly path (out of scope; behavior
  must be identical).

## What we need from Codex before opening any 7b PR

1. **Sign-off on the monolithic-vs-split decision** (this note
   recommends monolithic).
2. **Sign-off on the factory shape** (mountTalkHandler returns
   the handler function; mountTalkPipelineRoutes consumes it
   unchanged).
3. **Sign-off on the test plan** — specifically whether the
   integration test should stub 30 deps or use a full real-deps
   integration test instead.
4. **Explicit go-ahead** to open the extraction PR. Default
   stance: 7b extraction stays parked until this design note
   merges AND #296 (Phase 6) merges.

## Done when (this design note)

This note lands as a proposal. Phase 7b extraction does NOT
open until:
1. Phase 6 (#296) merges.
2. Phase 7a (talk-state guards) extraction lands per the
   #293 sub-design.
3. Codex reviews this note and gives explicit go-ahead on
   monolithic-move + factory shape + test plan.

## After this design note

If Codex accepts: file the extraction PR with `mountTalkHandler`
+ both test files + the full 80-dep mapping inline in the lib's
header comment. If Codex pushes back on monolithic, this note
gets updated with the alternative splitting plan before code
opens.
