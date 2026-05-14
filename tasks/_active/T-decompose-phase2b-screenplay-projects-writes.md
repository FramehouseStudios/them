---
id: T-decompose-phase2b-screenplay-projects-writes
title: Decompose backend/index.js — Phase 2b (7 /screenplay/projects/* write routes)
owner: claude
status: merged
branch: claude/T-decompose-phase2b-screenplay-projects-writes
pillar: infra (backend architecture)
---

## Scope

Phase 2b of the `backend/index.js` decomposition (spec:
`docs/specs/T-decompose-backend-index.md`). Phase 0 (#183), Phase 1
(#190), and Phase 2a (#192) all merged on main. Phase 2b extracts the
7 remaining write routes into the same lib file that Phase 2a created.

Routes extracted byte-identically to
`backend/lib/screenplay_projects_routes.js`:

- `POST /screenplay/projects`
- `POST /screenplay/projects/:projectId/outline`
- `POST /screenplay/projects/:projectId/scenes`
- `POST /screenplay/projects/:projectId/beats`
- `POST /screenplay/projects/:projectId/collaborators`
- `POST /screenplay/projects/:projectId/comments`
- `POST /screenplay/projects/:projectId/version`

19 new deps added to `mountScreenplayProjectsRoutes`: owner mutation
helpers (`markScreenplayOwnerDirty`, `createScreenplayId`,
`createEmptyScreenplayOutline`, `parseScreenplayOutlineInput`,
`upsertScreenplaySceneRecord`, `upsertScreenplayBeatRecord`,
`getLatestScreenplayVersion`, `scoreScreenplayDraft`,
`buildDraftExcerpt`), payload serializers (`toScreenplayScenePayload`,
`toScreenplayBeatPayload`, `toScreenplayVersionPayload`), and 6
write-side normalizers (`normalizeScreenplayStringList`,
`normalizeScreenplayPhaseValue`,
`normalizeStoredScreenplayThreadViewState`,
`normalizeStoredScreenplayDiffAcknowledgementState`,
`normalizeStoredScreenplayWriteAnchors`,
`normalizeStoredScreenplayBindings`). Required-deps guard fails
loud at mount for every dep.

Each POST handler mounts its own `express.json()` with the same
limit the inline handler used (matches Codex #90 + the pre-flight
`route-needs-own-parser` rule from #193).

Access-control posture unchanged: **PER-USER**. Same as Phase 2a.

## Verification

- `node --test backend/tests/screenplay_projects_routes.test.mjs`
  → **29/29 pass** (was 13 after Phase 2a; +16 for the 7 new POSTs
  exercising create/update/404/400/version-conflict paths plus a
  stale `base_version_id` 409 regression added during Codex review).
- Required-deps guard tested for **all 32 deps** (was 15 after 2a).
- `node --check backend/index.js` passes.
- `backend/index.js`: **-410 net lines** (~32,680 down from
  ~33,090). Combined with Phase 2a's -88, the full Phase 2 saved
  ~498 lines from index.js.

## Done when

The 7 write routes are no longer inline; the lib file contains all
12 `/screenplay/projects/*` handlers; tests pass; behavior is
byte-identical with the previous inline handlers.

## Next phase

Phase 3: extract `/screenplay/companion/state` (GET + POST),
`/screenplay/paginate`, `/screenplay/revision-colors`. Spec already
in place. Per spec, max 1 decomp PR in flight, so Phase 3 is gated
on this landing.
