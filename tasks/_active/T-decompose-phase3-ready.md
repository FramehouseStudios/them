---
id: T-decompose-phase3-ready
title: Phase 3 readiness — /screenplay/companion + /paginate + /revision-colors
owner: claude
status: planned
branch: (not opened — gated on round-19 PR train landing)
pillar: infra (backend architecture)
---

## Scope

Phase 3 of the `backend/index.js` decomposition (spec:
`docs/specs/T-decompose-backend-index.md`). Per spec, max 1 decomp
PR in flight; this task tracks the readiness state.

Routes to extract → `backend/lib/screenplay_companion_routes.js`:

- `GET /screenplay/companion/state`
- `POST /screenplay/companion/state`
- `POST /screenplay/paginate`
- `POST /screenplay/revision-colors`

Plus possibly `POST /screenplay/prompt/build` if it groups well.

## Estimated line-savings

~1,200 from the spec; revised down based on Phase 2 (~500 actual
vs. ~2,500 estimated). Phase 3 is smaller — 4-5 routes total. Real
savings probably 200-400 lines from `backend/index.js`.

## Deps surface preview

Most of Phase 2's 32 deps are reusable. New deps the companion
routes touch:

- `normalizeStoredScreenplayCompanionState`
- `toScreenplayCompanionStatePayload`
- The paginate + revision-colors handlers each have their own
  helper functions; need to inspect before opening the PR.

## Gating

Phase 3 PR opens when:

1. Round-19 PR train lands (#200, #201, #202).
2. No other decomp PR is in flight (per spec rule).
3. Phase 2b (#197 — already merged on main today) is reflected in
   the coord state.

## Next action

When the round-19 train lands, open the Phase 3 PR following the
pattern proven by Phase 0 / 1 / 2a / 2b:

1. Create `backend/lib/screenplay_companion_routes.js` with
   `mountScreenplayCompanionRoutes(app, deps)`.
2. Required-deps guard fails loud at mount.
3. Add integration tests with bare-Express fixtures.
4. Replace inline handlers in `backend/index.js` with one mount call.
5. Update `docs/specs/T-decompose-backend-index.md` progress log.
