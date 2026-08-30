---
id: T-decompose-phase2a-screenplay-projects-reads
title: Decompose backend/index.js — Phase 2a (5 /screenplay/projects/* GET routes)
owner: support
status: merged
branch: support/T-decompose-phase2-screenplay-projects
pillar: infra (backend architecture)
---

## Scope

Phase 2a of the `backend/index.js` decomposition plan documented in
`docs/specs/T-decompose-backend-index.md` (Phase 0 → PR #183, Phase 1 →
PR #190 merged today). The spec's Phase 2 covers 12 routes; this PR
extracts the 5 read-only ones first. The 7 write routes (POST, version)
follow in Phase 2b once this lands. Per spec, max 1 decomposition PR in
flight.

Extracts byte-identically:

- `GET /screenplay/projects` (list)
- `GET /screenplay/projects/:projectId`
- `GET /screenplay/projects/:projectId/outline`
- `GET /screenplay/projects/:projectId/collaborators`
- `GET /screenplay/projects/:projectId/comments`

→ `backend/lib/screenplay_projects_routes.js` (198 lines), exposing
`mountScreenplayProjectsRoutes(app, deps)`. 15 deps passed in:
owner-record helpers, envelope/header helpers, payload serializers,
and the parsing utilities. Required-deps guard fails loud at mount.

Access-control posture documented at the module header:
**PER-USER**. Every handler resolves an owner record from the request
(cookie / token / X-Client-Token) and reads only that owner's
projects. Response carries project content (titles, outlines, draft
excerpts, comments), so this is NOT safe-public. The handlers already
ran unauthenticated keyed off owner records in the existing inline
code — this PR preserves exactly that behavior (no access-control
change; only a code-organization change).

## Verification

- `node --test backend/tests/screenplay_projects_routes.test.mjs`
  → **13/13 pass** (cold list, include_versions+limit, 404 paths,
  outline include_project flag, collaborators payload, comment
  sorting/actor flagging, etc.).
- `node --check backend/index.js` passes.
- 5 inline handlers removed; 1 mount call added.
- `backend/index.js`: **-88 net lines** (111 deletions, 23 insertions
  including the new mount call).
- Required-deps guard tested for each of the 15 deps.

## Done when

The 5 GET routes are no longer inline; the lib file exists with a
documented per-user access-control posture; tests pass; behavior is
byte-identical with the previous inline handlers.

## Next phase

Phase 2b will extract the 7 write routes (POST + version) into the
same lib file. Phase 2b also gives the lib file a small `screenplay_*`
write helper surface (upsertScreenplaySceneRecord, etc.) that needs
mocking in tests.
