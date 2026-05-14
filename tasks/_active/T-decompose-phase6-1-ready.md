---
id: T-decompose-phase6-1-ready
title: Phase 6.1 readiness — long-tail single-domain clusters
owner: claude
status: planned
branch: (not opened — gated on Phase 6 finishing)
pillar: infra (backend architecture)
---

## Scope

Phase 6.1 extracts the long-tail single-domain inline clusters
identified by the round-21 audit:

| Prefix | Inline count | Target lib |
| --- | --- | --- |
| `/data` | 4 | `lib/data_routes.js` |
| `/history` | 4 | `lib/history_routes.js` |
| `/tasks` | 4 | `lib/tasks_routes.js` |
| `/recap` | 4 | `lib/recap_routes.js` |
| `/secretary` | 4 | `lib/secretary_routes.js` |
| `/session` | 3 | `lib/session_routes.js` |
| `/state` | 2 | `lib/state_route.js` |
| `/linkedin` | 2 | `lib/linkedin_routes.js` |
| `/visual` | 1 | `lib/visual_routes.js` (currently `/visual/context`; will extract with the realtime studio_render family in Phase 5b instead) |

Each cluster gets its own PR following the established pattern.
Most are small (~50 lines per route), so 7 small PRs is realistic
even with the max-1-decomp-PR-in-flight rule — they can ship one
after another at the cadence of the Codex auto-merge train.

## Estimated total line savings

~600 lines removed from `backend/index.js` once Phase 6.1 finishes.

## Gating

Each sub-phase opens after the previous one merges.
