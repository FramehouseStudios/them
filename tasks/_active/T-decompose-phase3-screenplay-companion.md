---
id: T-decompose-phase3-screenplay-companion
title: Decompose backend/index.js — Phase 3 (companion + paginate + revision-colors)
owner: claude
status: review
branch: claude/T-decompose-phase3-screenplay-companion
pillar: infra (backend architecture)
---

## Scope

Phase 3 of the `backend/index.js` decomposition (spec:
`docs/specs/T-decompose-backend-index.md`). Phases 0–2b all merged
on main. Per spec, max 1 decomp PR in flight.

Routes extracted byte-identically to
`backend/lib/screenplay_companion_routes.js`:

- `GET /screenplay/companion/state` (PER-USER)
- `POST /screenplay/companion/state` (PER-USER)
- `POST /screenplay/paginate` (STATELESS)
- `POST /screenplay/revision-colors` (STATELESS)

15 deps passed by reference: owner helpers, envelope/header helpers,
companion-state normalizer + payload serializer, screenplay
revision payload builder, line splitter, draft excerpt builder, plus
the standard parsing utilities. Required-deps guard fails loud at
mount for every dep.

Each POST handler mounts its own `express.json()` with the same
limit the inline handler used.

## Verification

- `node --test backend/tests/screenplay_companion_routes.test.mjs`
  → **12/12 pass** (cold companion state, save + firstPageWrittenAt
  preserve, paginate line/page math + clamping + length-profile,
  revision-colors color default + 400 paths).
- Required-deps guard tested for all 15 deps.
- `node --check backend/index.js` passes.
- `backend/index.js`: **-79 net lines** (102 deletions, 23 insertions
  for the mount call). index.js now at 32,601 lines.

## Done when

The 4 routes are no longer inline; the lib file exists with the
documented per-route access-control posture; tests pass; behavior
is byte-identical with the previous inline handlers.

## Next phase

Phase 4 (per spec): extract auth routes (~11 routes). Auth is
tier-3 sensitive but the inline block is already well-isolated.
Per spec, max 1 decomp PR in flight, so Phase 4 is gated on this
landing.
