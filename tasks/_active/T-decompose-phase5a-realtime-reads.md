---
id: T-decompose-phase5a-realtime-reads
title: Decompose backend/index.js — Phase 5a (2 read-only /realtime/* routes)
owner: support
status: review
branch: support/T-decompose-phase5-realtime-routes
pillar: infra (backend architecture)
v1_pillar: realtime
v1_effect: closes prerequisite for V1 line 68 'Realtime route decomposition lands before talk-pipeline Phase 7' (read-only /realtime/* routes)
---

## Scope

Phase 5a of the decomposition (spec:
`docs/specs/T-decompose-backend-index.md`). Phases 0–4 merged.

Extracted byte-identically to `backend/lib/realtime_routes.js`:

- `GET /realtime/health`
- `GET /realtime/bridge`

The 5 write/streaming/call routes (`POST /realtime/client_secret`,
`POST /realtime/studio_render`, `POST /realtime/studio_render_stream`,
`POST /realtime/turn_commit`, `POST /realtime/call`) follow in
Phase 5b. That extraction is much heavier (~40 deps, supplier
mint state machine, LLM streaming path, WebRTC SDP exchange) so
it gets its own PR per the Phase 2a/2b precedent.

5 deps passed by reference. Supplier resolved at request time via
`getRealtimeSupplier()` accessor — the live supplier can change
during process lifetime via failover, so freezing it at mount time
would be wrong. Required-deps guard fails loud at mount.

Access-control posture: **SAFE-PUBLIC**.

## Verification

- `node --test backend/tests/realtime_routes.test.mjs` → **8/8 pass**.
- Required-deps guard tested.
- Live-supplier accessor pattern tested (mutate supplier between
  two requests, second reflects change).
- No-leakage scan on response.
- `node --check backend/index.js` passes.
- `backend/index.js`: -20 net lines.

## Done when

Phase 5a is merged. Phase 5b opens after.
