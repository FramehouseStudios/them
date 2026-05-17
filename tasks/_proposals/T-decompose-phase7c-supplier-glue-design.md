---
id: T-decompose-phase7c-supplier-glue-design-v2
title: Phase 7c sub-design — talk supplier glue extraction
owner: claude
status: proposed
target_pr: none yet (sub-design refinement; opens after Phase 7b lands)
pillar: infra (backend architecture)
v1_pillar: talk
v1_effect: refines the Phase 7c plan (#223) — the final, smallest sub-phase of the talk-pipeline decomposition; completes the 7-chain after the handler itself lands in 7b
---

## Scope

Sub-design refinement of Phase 7c — the LAST sub-phase of the
talk-pipeline decomposition (#223 parent design). After Phase
7a (talk-state guards per #293) and Phase 7b (handler
extraction per #298 sub-design) both land, Phase 7c moves the
STT / chat / TTS supplier-selection + routing helpers into
`backend/lib/talk_supplier_glue.js`.

**Design note only.** Phase 7c code does NOT open until Phase
7b lands and Codex reviews this note.

## Scope: what 7c extracts

Three logical groups, ~600 lines total:

### Group 1: STT supplier glue (~150-200 lines)
- STT supplier resolver (Whisper / Replicate / fallback).
- Supplier-call wrapper with retry + timeout.
- Error → stage="stt" mapper.

### Group 2: Chat-completion supplier glue (~200-250 lines)
- Chat supplier resolver (OpenAI / Anthropic / stub).
- Supplier-call wrapper with streaming support.
- Token-count + retry logic.
- Error → stage="chat" mapper.

### Group 3: TTS supplier glue (~200-250 lines)
- TTS supplier resolver (ElevenLabs / OpenAI TTS / stub).
- Supplier-call wrapper with format selection.
- Audio-metadata builder.
- Error → stage="tts" mapper.

## Factory shape

Unlike Phase 7a (4 factories returning middlewares) and 7b (1
factory returning the handler), Phase 7c exports **3 supplier
objects** with the canonical interface:

```js
import {
  createSttSupplier,
  createChatSupplier,
  createTtsSupplier,
} from "./lib/talk_supplier_glue.js";

const sttSupplier = createSttSupplier({
  OPENAI_API_KEY, WHISPER_MODEL,
  fetchWithTimeout, isAbortError, incrementErrorCounter,
});
// sttSupplier.transcribe({...}) → { ok, transcript, error, stage }
// sttSupplier.kind = "openai-whisper" | "replicate" | "stub"

// Same shape for chatSupplier (chat({...})) and
// ttsSupplier (synthesize({...})).
```

The post-7b `handleTalkRequest` takes these as deps. The lib
swap from 7c is invisible to the handler — same call shape,
same return shape.

## Byte-identical invariants

- **Stage names** (`stt` / `chat` / `tts`) unchanged.
- **Retry policies** unchanged.
- **Timeout values** unchanged.
- **Error counter codes** unchanged.
- **Audio metadata** (duration_ms, mime_type) computed
  identically.
- **No module-level state** — supplier objects close over
  config + deps; no setters. #238 invariant regression test
  pins this.

## Test plan

`backend/tests/talk_supplier_glue.test.mjs`:

### Per-supplier (3 groups × 4-5 tests each)

| Group | Tests |
| --- | --- |
| STT | factory shape; happy path; timeout → stage="stt"; supplier kind reported; fallback to second supplier |
| Chat | factory shape; happy path; streaming chunk callback; timeout → stage="chat"; retry-then-fail |
| TTS | factory shape; happy path; audio metadata correct; format selection; timeout → stage="tts" |

### Cross-cutting

- All 3 suppliers expose the canonical interface.
- Stage names + error counter codes preserved exactly.
- #238 invariant inheritance — no setter-shaped exports.

## Risk + rollback

**Risk: low after 7b lands**. Supplier-glue functions are
self-contained. Rollback: revert. No migration.

## What 7c does NOT do

- Add new supplier kinds.
- Optimize retry policies or change timeout defaults.
- Change supplier-resolution priority order.
- Touch the realtime supplier surface (handled by Phase 5b).

## What Codex needs to sign off

1. 3-supplier-object shape vs single-factory (this note
   recommends 3 separate factories).
2. Test plan scope.
3. Explicit go-ahead.

## Done when

This note lands as a proposal. Phase 7c extraction does NOT
open until Phase 7b merges + this note merges.

## After Phase 7c lands

**The decomp chain is complete.** Phase 8 (final sweep) targets
`backend/index.js` < 500 lines. Combined with #293 (7a design)
+ #298 (7b design) + this note, the entire talk-pipeline chain
is designed end-to-end.

Post-decomp arc would consider:
- Internal splits of `handleTalkRequest` (STT / prompt / LLM /
  TTS stages as separate functions inside `talk_handler.js`).
- Per-supplier deeper tests.
- A `talk_handler` integration test using the real supplier
  libs end-to-end with stubbed HTTP.
