---
id: T-decompose-phase6-ready
title: Phase 6 readiness — /memories/* + remaining /memory/* routes
owner: claude
status: planned
branch: (not opened — gated on Phase 5 finishing)
pillar: infra (backend architecture)
---

## Scope

Phase 6 extracts the `/memories/*` cluster and the remaining
`/memory/*` inline routes:

- `GET /memories` (line ~27037)
- `GET /memories/export` (line ~27125)
- `POST /memories/update` (line ~27192)
- `POST /memories/forget` (line ~27250)
- `POST /memories/promote` (line ~27298)
- `POST /memories/feedback` (line ~27351)

Already in their own libs (no work needed): `/memory/character-trait`,
`/memory/character-traits`, `/memory/record-character-mention`,
`/memory/stats`, `/memory/block-signal*`.

Each `/memories/*` handler is ~50-90 lines and touches the
memory_store sanitize path. Suggested target file:
`backend/lib/memories_routes.js` with `mountMemoriesRoutes(app, deps)`.

## Estimated deps surface

~15-20 deps: memory_store helpers (sanitizePersistedSessionMemory,
get/setPersistedUserMemoryForIp, save/loadUserMemoryStore), envelope
helpers, normalizers from utils, plus the memory-specific helpers
that live inline in index.js today (probably need to extract some
into the lib too).

## Gating

Gated on Phase 5b finishing (max 1 decomp PR in flight per spec).
