# Spec: T-decompose-backend-index

**Status**: spec (awaiting Codex approval before implementation PRs)
**Owner**: claude
**Scope**: backend
**Acceptance**: human signed off on the problem framing; Codex
approves the phasing + safety mechanisms before any phase-N
implementation PR opens.

## Problem

`backend/index.js` is **33,071 lines**. It contains:

- 117 inline `app.get/post/put/delete/all` route handlers
- ~6,500 lines of inline route bodies (lines 26,500–33,071)
- ~26,500 lines of setup, helpers, `handleTalkRequest` and the
  talk-pipeline state machine
- 40 imports, 667 top-level functions, 5 `app.use(...)` middleware
  mounts
- 24 routes already extracted via the `mount<X>Route(app, deps)`
  pattern (the right direction — we just haven't applied it
  backwards to the inline routes)

Symptoms:
- Merge conflicts on every PR that touches the file (we see them
  every rebase round).
- New contributors / LLM agents can't load the whole file in their
  context window.
- Unit testing route-by-route is awkward when the route is inline.
- Reading any specific route requires scrolling 26k+ lines first.
- Adding a new route requires landing in the right of ~6 zones in
  the file; the right zone is not obvious.

## Goal

Cut `index.js` to **< 500 lines**: imports, dep init, mount calls,
bootstrap. Every route handler lives in `backend/lib/<domain>_*.js`
with its own tests. The existing `mount<X>Route(app, deps)` pattern
is already correct — this spec applies it backwards to the rest.

## Non-goals

- Not changing any route's externally-visible behavior.
- Not rewriting `handleTalkRequest` or the talk-pipeline state
  machine internally — only relocating it.
- Not introducing a new framework or routing layer.
- Not changing the persistence adapter contract.

## Safety mechanisms (load-bearing — every phase must follow these)

1. **One phase = one PR**. Each phase is independently reviewable,
   independently mergeable, and rollbackable.
2. **Test coverage before extraction**. Each route being extracted
   gets an integration test (live Express server, no mocks) added
   to the same PR. If the test passes against the inline version
   AND the extracted version, the extraction is safe.
3. **Behavior diff = zero**. Pre and post `npm test` outputs must
   match. Pre and post `node scripts/pre_flight.mjs` must match.
4. **Mount order preserved**. The order routes are registered with
   Express must not change (middleware fall-through matters).
5. **WIP cap respected**. At most 1 decomposition PR in flight at a
   time. Each phase waits for the prior to merge.
6. **Two-review-cycle cap**. If a phase needs more than 2 review
   rounds, the scope is wrong — split it.

## Phases (ranked by impact-per-risk)

### Phase 0 — this spec + proof of concept

**Spec PR** (this one) plus **one tiny concrete extraction**:
`/health` + `/bridge` → `backend/lib/health_route.js`. Two routes,
no shared state, no auth, zero risk. If this lands cleanly the
strategy is proven; the rest of the phases follow.

### Phase 1 — pure read-only ops endpoints

Move 5 routes into `lib/ops_observability_routes.js`:
- `GET /ops/metrics`
- `GET /ops/alerts`
- `GET /outbox`
- `POST /outbox/retry`
- `GET /state`

Lines saved: ~600.

### Phase 2 — screenplay project + version routes

Move 9 routes into `lib/screenplay_projects_routes.js`:
- `GET /screenplay/projects` (list)
- `POST /screenplay/projects` (create)
- `GET /screenplay/projects/:projectId`
- `GET /screenplay/projects/:projectId/outline`
- `POST /screenplay/projects/:projectId/outline`
- `POST /screenplay/projects/:projectId/scenes`
- `POST /screenplay/projects/:projectId/beats`
- `GET /screenplay/projects/:projectId/collaborators`
- `POST /screenplay/projects/:projectId/collaborators`
- `GET /screenplay/projects/:projectId/comments`
- `POST /screenplay/projects/:projectId/comments`
- `POST /screenplay/projects/:projectId/version`

Lines saved: ~2,500. Touches `screenplay_store.js` deps but doesn't
change them.

### Phase 3 — screenplay companion + assistive routes

Move 5 routes into `lib/screenplay_companion_routes.js`:
- `GET /screenplay/companion/state`
- `POST /screenplay/companion/state`
- `POST /screenplay/paginate`
- `POST /screenplay/revision-colors`
- `POST /screenplay/export` (already partly in lib; finish it)
- `POST /screenplay/prompt/build`

Lines saved: ~1,200.

### Phase 4 — auth routes

Move 11 routes into `lib/auth_routes.js`:
- `POST /auth/signup, login, apple, refresh, logout`
- `POST /auth/sessions, sessions/revoke, request_password_reset,
  reset_password, request_email_verification, verify_email`

Heaviest phase from a security perspective. Adds integration tests
for token handling + password reset round-trip. May split into 2
PRs (signup/login + session management).

Lines saved: ~3,500.

### Phase 5 — realtime supplier routes

Move 6 routes into `lib/realtime_routes.js`:
- `POST /realtime/call, client_secret, turn_commit, studio_render,
  studio_render_stream, bridge`

Lines saved: ~2,000.

### Phase 6 — memory + history + recap + secretary + linkedin + visual

Group remaining domain routes into:
- `lib/memory_data_routes.js` (memories/*, /data/*)
- `lib/history_routes.js` (/history, /history/annotate_turn)
- `lib/assistive_routes.js` (/recap, /recap/today, /secretary/calendar, /linkedin/analyze, /visual/*)

Lines saved: ~3,000.

### Phase 7 — talk pipeline

The hard one. `handleTalkRequest` plus the talk-pipeline state
machine is the bulk of the remaining ~14,000 lines.

Sub-phases:
- 7a: extract `handleTalkRequest` into `lib/talk_handler.js`
  (route body only; deps still in index.js)
- 7b: extract the talk-pipeline state (turn meta store,
  idempotency cache, concurrency guards) into
  `lib/talk_pipeline_state.js`
- 7c: extract the realtime supplier glue into
  `lib/talk_supplier_glue.js`

Each sub-phase is its own PR. Tested via the existing
`run_studio_*_smoke.mjs` evals + the `talk.integration.test.mjs`
suite.

Lines saved: ~10,000.

### Phase 8 — sweep

Whatever's left after phases 1–7. Mostly:
- Boot-time config + dep init
- Method-not-allowed handlers
- `app.listen()` and graceful shutdown

Target: `index.js` < 500 lines, structured as:
```
imports
config / env
dep init (persistence, supplier, scale backplane, etc.)
app + global middleware
mount<X>Route(app, deps)  // for every route, in order
404 / method-not-allowed
app.listen + signal handling
```

## Anti-goals (do NOT do during decomposition)

- Don't rename routes (breaks iOS).
- Don't change response shapes (breaks iOS).
- Don't add new schema fields (breaks contract evals).
- Don't change which JSON body limits apply to which route.
- Don't deduplicate "similar" code across routes unless the
  duplication is exact byte-for-byte. (Cross-route refactors are
  a SEPARATE follow-up after the file is decomposed.)

## Estimated effort

| Phase | PRs | Lines moved | Risk |
|---|---|---|---|
| 0 (this) | 2 | ~50 | trivial |
| 1 | 1 | ~600 | low |
| 2 | 1 | ~2,500 | low (read-heavy) |
| 3 | 1 | ~1,200 | low |
| 4 | 1–2 | ~3,500 | medium (auth surface) |
| 5 | 1 | ~2,000 | medium (supplier glue) |
| 6 | 3 | ~3,000 | low |
| 7 | 3 | ~10,000 | high (talk pipeline) |
| 8 | 1 | remainder | low |

**Total**: ~12–14 PRs over ~2–3 weeks if Codex review cadence stays
predictable. Each PR is independently small and reviewable.

## Open questions for Codex

1. Order — should auth (phase 4) move earlier given its security
   sensitivity, or later given its risk?
2. Sub-phase boundaries within phase 7 — does the proposed split
   (handler / state / supplier glue) match how you'd partition the
   talk pipeline?
3. Naming — `screenplay_projects_routes.js` is plural; existing
   `block_signal_route.js` is singular. Which convention to follow?
   (I'll match whichever you pick.)
4. Should we adopt a single `routes/` subdirectory under `backend/`
   (e.g. `backend/routes/screenplay_projects.js`) or keep
   everything in `backend/lib/` flat?

## What lands today (if spec is approved)

- This spec PR.
- Phase 0 concrete cut: `/health` + `/bridge` → `backend/lib/health_route.js`
  with integration tests. Proves the pattern; merges as a fast-lane Tier 1 PR.

Subsequent phases land 1-per-PR per the WIP cap.
