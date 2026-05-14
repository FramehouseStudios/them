---
id: T-decompose-phase5b-ready
title: Phase 5b readiness — 5 heavy /realtime/* write/streaming/call routes
owner: claude
status: planned
branch: (not opened — gated on #215 merging)
pillar: infra (backend architecture)
---

## Scope

Phase 5b of the decomposition. Phase 5a (#215) shipped the 2
read-only `/realtime/*` routes. Phase 5b extracts the 5 remaining:

- `POST /realtime/client_secret` (supplier mint + failover state machine)
- `POST /realtime/studio_render` (LLM call to renderStudioRealtimeText)
- `POST /realtime/studio_render_stream` (SSE streaming with deltas)
- `POST /realtime/turn_commit` (memory persistence + metrics)
- `POST /realtime/call` (WebRTC SDP exchange with OpenAI)

## Estimated deps surface

~40 deps total. Realtime config constants
(OPENAI_API_KEY, OPENAI_REALTIME_MODEL, OPENAI_REALTIME_VOICE,
OPENAI_REALTIME_INPUT_TRANSCRIPTION_MODEL,
OPENAI_REALTIME_CLIENT_SECRET_TTL_SECONDS), supplier loaders
(createRealtimeSupplier, mintWithFailover), error counter,
streaming helpers (renderStudioRealtimeText, streamStudioRealtimeText),
memory write path (resolveWritableMemoryContext,
sanitizePersistedSessionMemory, directorFlagsFromTranscript,
updateSessionEmotionMemory, updateSessionAfterReply,
persistWritableMemoryContext), metrics (getUserMetricState,
countSessionStartsForDay, recordUserTalkMetrics,
maybeRefineActiveThemesWithLLM), turn meta (storeTalkTurnMeta,
buildReadStateMeta, applyReadStateHeaders), and WebRTC helpers
(buildRealtimeSessionConfig, fetchWithTimeout, isAbortError).

## Suggested split

To stay within reviewable PR size, Phase 5b could be split further:

- **5b.1**: `/realtime/client_secret` only (supplier mint + failover
  state machine; ~150 lines).
- **5b.2**: `/realtime/studio_render` + `/realtime/studio_render_stream`
  (LLM call + SSE streaming; ~160 lines).
- **5b.3**: `/realtime/turn_commit` (memory write path, the heaviest
  single handler; ~120 lines).
- **5b.4**: `/realtime/call` (WebRTC SDP; ~60 lines).

Each sub-phase shares the realtime config constants but otherwise
has a distinct deps surface. Easier to review than one 600-line PR.

## Gating

Phase 5b is gated on Phase 5a (#215) landing.
