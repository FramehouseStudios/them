---
id: T-coord-refresh-batch-17
title: Coord refresh round 21 — Phase 4 + 5a + 4 lib tests + Phase 5b–8 readiness
owner: claude
status: review
branch: claude/T-coord-refresh-batch-17
pillar: infra (coordination)
---

## Scope

Round-21 batched coordination refresh covering this session's 9 PRs
plus 5 readiness task files for the remaining decomp phases.

In review:
- #212 T-decompose-phase4-auth-routes (11 auth routes extracted)
- #215 T-decompose-phase5a-realtime-reads (2 read-only realtime routes)
- #216 T-memory-store-smoke-test (13 tests)
- #217 T-user-store-smoke-test (3 tests)
- #218 T-user-auth-smoke-test (5 tests — closes lib-missing-test gap)

Merged on main during this session:
- #214 T-protocol-infra-batch (AGENTS.md event-lane reminder, lib
  README, audit_inline_routes.mjs script, canon-strict comment)

Readiness task files (planned, gated on prior phase landing):
- T-decompose-phase5b-ready.md — 5 heavy realtime routes (suggested
  to split further into 4 sub-phases due to deps surface).
- T-decompose-phase6-ready.md — `/memories/*` cluster.
- T-decompose-phase6-1-ready.md — long-tail single-domain clusters
  (/data, /history, /tasks, /recap, /secretary, /session, /state,
  /linkedin).
- T-decompose-phase7-ready.md — talk pipeline (sequential 7a → 7b → 7c).
- T-decompose-phase8-ready.md — final sweep, index.js < 500 lines.

## State of the decomposition

After this round:

| Phase | PR | Net lines saved | Status |
| --- | --- | --- | --- |
| 0 | #183 | -39 | merged |
| 1 | #190 | -22 | merged |
| 2a | #192 | -88 | merged |
| 2b | #197 | -410 | merged |
| 3 | #204 | -79 | merged |
| 4 | #212 | -5 | review |
| 5a | #215 | -20 | review |

Total to date: **-663 lines** from `backend/index.js`.
Remaining: ~32,575 lines → target <500 after Phases 5b–8.

## Lib test coverage

After this round all 7 stateful libs have at least smoke coverage
(utils, persona, screenplay_store, outbox_store, memory_store,
user_store, user_auth). The `lib-missing-test` pre-flight rule
should report zero findings on main once #216/#217/#218 land.

## Done when

`node scripts/coordination_state.mjs validate` returns OK; #212/
#215/#216/#217/#218 show `status: review`; #214 shows `status:
merged`; the 5 readiness task files exist; the inbox table reflects
the 5 review PRs.
