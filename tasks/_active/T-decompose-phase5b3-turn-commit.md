---
id: T-decompose-phase5b3-turn-commit
title: Decompose backend/index.js — Phase 5b.3 (/realtime/turn_commit)
owner: claude
status: review
branch: claude/T-decompose-phase5b3-turn-commit
pillar: infra (backend architecture)
v1_pillar: realtime
v1_effect: continues the realtime route decomposition required by docs/v1-definition.md line 68 — extracts the memory-write commit route into its own testable lib; only 5b.4 (/realtime/call) remains in the 5b chain after this lands
---

## Scope

Phase 5b.3 of the decomposition (spec:
`docs/specs/T-decompose-backend-index.md`, design note #227).
This sub-phase is the heaviest by dep count: ~20 functions
spanning the memory-write pipeline.

Extracts `POST /realtime/turn_commit` to
`backend/lib/realtime_turn_commit_route.js`.

## Dependencies (20 functions + 1 constant)

### Helpers (3)
- `createRequestId`, `normalizeSnippet`, `sanitizeStudioTurnMetadata`

### Memory context (3)
- `resolveWritableMemoryContext`
- `sanitizePersistedSessionMemory`
- `persistWritableMemoryContext`

### Request / IP (2)
- `normalizeClientIp`, `clientIp`

### Director / metric / emotion-memory pipeline (8)
- `directorFlagsFromTranscript`
- `getUserMetricState`
- `countSessionStartsForDay`
- `formatLocalDateStamp`
- `updateSessionEmotionMemory`
- `updateSessionAfterReply`
- `recordUserTalkMetrics`
- `maybeRefineActiveThemesWithLLM`

### Turn meta + read state (3)
- `storeTalkTurnMeta`
- `buildReadStateMeta`
- `applyReadStateHeaders`

### Constant (1)
- `DEEP_TURN_SCORE_THRESHOLD`

## Byte-identical invariants

All preserved per the #227 design note:

- **201 envelope** keys exactly match the inline source:
  `ok, action: "realtime_turn_commit", status: "committed",
  source: "realtime", turn_id, request_id, session_id,
  state_version, last_turn_id, last_updated_at,
  history_updated_at, memory_updated_at, schema_version,
  backend_build, backend_boot_id`.
- **400 missing-fields envelope** unchanged:
  `{ stage: "realtime_turn_commit", error: "..." }`.
- **`storeTalkTurnMeta` called exactly once per successful
  commit** with the canonical render contract
  `{ reply_role: "final", authoritative_page_text_available:
  false, sync_ready: false }`. Not called when `lastTurnId`
  is null.
- **Read-state headers** preserved: `Cache-Control: no-store`,
  `x-turn-id`, `x-turn-meta-available` (1 when turn id present,
  0 otherwise), plus whatever `applyReadStateHeaders` sets.
- **Memory write pipeline**:
  `resolveWritableMemoryContext → sanitizePersistedSessionMemory
   → updateSessionEmotionMemory → updateSessionAfterReply
   → persistWritableMemoryContext`. Same call order, same args.
- **Diagnostic line** preserved as `console.warn` (lib
  precedent established in 5b.1 / 5b.2) with the same string
  template.
- **Body limit** unchanged at `256kb`.
- **Field-name fallbacks** preserved:
  - transcript: `transcript | user_message | userMessage`
  - reply: `reply | assistant_message | assistantMessage`
  - request_id: `request_id | requestId | <auto rid>`
  - studio meta: `studio | body | null`
- **No module-level state mutation.** The lib does NOT call
  any setter back into index.js — same byte-identical-rotation
  rule that Codex flagged in 5b.1 (#238 review). A regression
  test pins this invariant.

## V1 pillar / effect

- `V1 pillar: realtime`
- `V1 effect: continues the realtime route decomposition. After
  5b.3, only 5b.4 (/realtime/call) remains in the 5b chain.
  V1 line 68 ("Realtime route decomposition lands before talk-
  pipeline Phase 7") moves one item closer.`

## Verification

```
node --test backend/tests/realtime_turn_commit_route.test.mjs
```

→ **21/21 pass**:

- Factory + mount guards (4 tests): body limit constant, mount
  rejects null app, mount rejects each of the 20 missing-fn
  deps, mount rejects non-number DEEP_TURN_SCORE_THRESHOLD.
- 400 missing-fields envelope (3 tests): missing transcript,
  missing reply, missing both.
- 201 canonical envelope (2 tests): full field set, request_id
  rid-fallback.
- Field-name fallbacks (3 tests): user_message, userMessage,
  assistant_message + assistantMessage.
- storeTalkTurnMeta invariant (3 tests): exactly-once on
  success, canonical render contract, NOT called without
  lastTurnId.
- Read-state headers (3 tests): Cache-Control + x-turn-id +
  x-turn-meta-available; x-turn-meta-available=0 when no
  lastTurnId; applyReadStateHeaders called once.
- Memory-write side-effect (2 tests): persistWritableMemoryContext
  invoked with (ctx, nextMemory, nowTs); pipeline call order.
- #238 invariant inheritance (1 test): no setter-shaped dep
  accepted.

Plus:
- `node --check backend/index.js` passes.
- `backend/index.js` shrinks by **92 net lines** (121 inline →
  29 mount call).
- Pre-flight clean.

## Done when

Inline `POST /realtime/turn_commit` no longer in `index.js`;
lib file exists with the SAFE-PUBLIC + PER-USER-via-deps
posture documented; 21/21 tests pass; all invariants preserved.

## Next phase

Phase 5b.4: extract `POST /realtime/call` (the WebRTC SDP
proxy). Last sub-phase of 5b per #227. Gated on this PR merging
per spec (max 1 decomp PR in flight).
