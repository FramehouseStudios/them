---
id: T-screenplay-companion-schema-doc
title: docs/schemas/screenplay-companion.md
owner: claude
status: review
branch: claude/T-screenplay-companion-schema-doc
pillar: infra (schema discipline)
v1_pillar: screenplay
v1_effect: documents the four Studio-companion routes iOS uses for the V1 screenplay-pillar surface (state read/write, pagination, revision colors) — closes the schema-doc gap for the Studio sidebar
---

## Scope

Ships `docs/schemas/screenplay-companion.md` — canonical
envelopes for the four Studio-companion routes:

- `GET /screenplay/companion/state` — read companion state
- `POST /screenplay/companion/state` — write companion state
- `POST /screenplay/paginate` — compute pagination for a draft
- `POST /screenplay/revision-colors` — revision-color diff

Covers: endpoints + body limits, schema version (1), PER-USER
posture, request shapes per route, response envelopes (state
read/write, pagination, revision colors), error cases,
invariants (state POST persists via markScreenplayOwnerDirty;
paginate always returns ≥ 1 page; lines_per_page clamped to
[24, 120]).

Plus INDEX.md row under Screenplay surface section.

## V1 pillar / effect

- `V1 pillar: screenplay`
- `V1 effect: documents the four Studio-companion routes iOS
  uses for the V1 screenplay-pillar surface. Closes the
  schema-doc gap for the Studio sidebar + pagination overlay
  + revision-mark UI.`

## Verification

- Doc matches the four handlers in
  `backend/lib/screenplay_companion_routes.js` line-by-line.
- INDEX entry placed under Screenplay surface.

## Done when

`docs/schemas/screenplay-companion.md` lands + INDEX entry added.
