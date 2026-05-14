---
id: T-decompose-phase7-ready
title: Phase 7 readiness — talk pipeline (handler / state / supplier glue)
owner: claude
status: planned
branch: (not opened — gated on Phase 6.1 finishing)
pillar: infra (backend architecture)
---

## Scope

Phase 7 is the highest-risk decomp phase. The talk pipeline is:

- `handleTalkRequest(...)` — the central handler that ties STT, the
  LLM call, TTS, memory writes, metrics, and idempotency together.
- The state machine that manages in-flight talk turns, session
  serial guards, idempotency cache, and concurrency guards.
- The supplier glue that picks STT/TTS/chat suppliers and threads
  them through the handler.

Cumulatively this is the largest single chunk of `backend/index.js`
(~5,000+ lines). Per the spec, Phase 7 ships as **three sub-PRs**:

- **7a**: `lib/talk_handler.js` — pure handler signature + body,
  with all helpers as deps.
- **7b**: `lib/talk_state_machine.js` — the in-flight tracking,
  idempotency cache, session serial guard, concurrency guard,
  rate limiter wrapper.
- **7c**: `lib/talk_supplier_glue.js` — STT/chat/TTS supplier
  selection and routing.

Each sub-phase opens only after the previous one merges. This is
the only spec-mandated sequential decomp phase — every other phase
can in principle be parallelized once the spec is amended; Phase 7
must be serial because the three pieces share live state.

## Pre-Phase-7 requirements

Before opening 7a:
1. All earlier phases (5, 5b, 6, 6.1) merged.
2. Existing talk-pipeline test coverage audited: any inline-only
   test paths need to be extractable too.
3. Cross-agent design review window per the protocol spec: design
   note in `tasks/_proposals/T-decompose-phase7a.md` for Codex to
   comment on before any code lands. Talk pipeline behavior must
   not change. Acquire explicit Codex approval before opening.

## Risk

Highest of any phase. Talk pipeline owns the most critical user
journey (record → reply → playback). Any byte-diff regression here
is user-visible. Extraction should reduce surface area, not add it.

## Gating

Sequential. 7a → 7b → 7c. Spec amendment may be needed to clarify
the sequencing rule.
