---
id: T-ops-routes-list-route
title: GET /ops/routes manifest of optional surfaces
owner: claude
status: merged
branch: claude/T-ops-routes-list-route
pillar: ops (observability)
---

## Scope

`/ops/health-summary` (PR #134) returns a boolean `features` map.
That answers "is X wired?" but not "what URL exposes X?". iOS
clients still have to keep a separate hard-coded table mapping
features to paths.

This PR adds `GET /ops/routes` — a small frozen manifest of the
optional HTTP routes this deployment exposes, grouped by domain.
Each entry has `method`, `path`, `group`. Strict subset of what
`index.js` mounts; a future "remove this route" change must also
update this list so the snapshot test catches divergence.

Returns `{ schemaVersion, total, routes[] }` with
`Cache-Control: no-store`.

## Done when

`GET /ops/routes` returns the frozen manifest; tests cover snapshot
properties + integration; `npm test` green.
