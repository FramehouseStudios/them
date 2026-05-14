---
id: T-tasks-schema-doc
title: docs/schemas/tasks.md
owner: claude
status: merged
branch: claude/T-tasks-schema-doc2
pillar: infra (schema discipline)
v1_pillar: memory
v1_effect: documents the GET /tasks list + POST /tasks/update mutation envelopes iOS uses for the task surface — closes a schema-doc gap for a secretary-style endpoint pair
---

## Scope

Ships `docs/schemas/tasks.md` — canonical request + response
shapes for the two `/tasks/*` routes:

- `GET /tasks` — list with `limit` + `status` filter; standard
  If-None-Match → 304 cycle.
- `POST /tasks/update` — multi-action mutation
  (`add | complete | reopen | delete | clear_completed`).

Covers: endpoints + body limits, schema version (`1`),
PER-USER posture, request shapes per route, response envelopes
(200 + 304 + 400), status-verbs-per-action matrix, invariants
(`total_count` is full set; `tasks[]` is clipped; `task` field
is post-mutation state).

Plus an INDEX.md row under a new "Tasks surface" section.

## V1 pillar / effect

- `V1 pillar: memory`
- `V1 effect: documents the task list + mutation endpoints iOS
  uses for the secretary-style action-item surface. Closes a
  schema-doc gap; iOS decoders now have a fixed contract.`

## Verification

- Doc matches the two inline handlers in `backend/index.js`
  line-by-line for request fields, response fields, status
  verbs, and 200/304/400 cycles.
- INDEX entry placed under a new "Tasks surface" section.
- Pre-flight clean.

## Done when

`docs/schemas/tasks.md` lands + INDEX entry added.
