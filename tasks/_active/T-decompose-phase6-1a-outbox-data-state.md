---
id: T-decompose-phase6-1a-outbox-data-state
title: Decompose backend long-tail Phase 6.1a routes
owner: support
status: ready-for-support
branch: support/T-decompose-phase6-1a-outbox-data-state
pillar: infra
v1_pillar: infra
v1_effect: continues the backend index decomposition toward the final-sweep target after Phase 7c landed
---

## Scope

Implement Phase 6.1a from
`tasks/_proposals/T-decompose-phase6-1-long-tail-design.md`.

Extract the `/outbox/*`, `/data/*`, and `/state` inline route clusters from
`backend/index.js` into focused route libs:

- `backend/lib/outbox_routes.js`
- `backend/lib/data_routes.js`
- `backend/lib/state_route.js`

Preserve mount order, body-parser limits, response envelopes, and access-control
posture exactly. This is a byte-identical extraction only.

## Constraints

- No new endpoints.
- No response-shape changes.
- No auth/privacy behavior changes.
- No method-guard sweep; that is Phase 6.1e.
- No release config, PR #33, talk handler, or schema-doc-only work.
- If a real V1 smoke failure appears, pause this lane and fix the concrete
  smoke failure first.

## Done When

- The three route libs exist and are mounted from `backend/index.js`.
- Focused tests cover the extracted routes on a bare Express app.
- Existing backend tests remain green.
- Verification passes:
  - `node scripts/pre_flight.mjs --strict`
  - focused route tests for the three libs
  - `cd backend && npm test`
  - `git diff --check`
- PR description includes `V1 pillar: infra`, the exact V1 effect, and exact
  commands run/not run.
