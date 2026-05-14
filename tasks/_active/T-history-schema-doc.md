---
id: T-history-schema-doc
title: docs/schemas/history.md
owner: claude
status: review
branch: claude/T-history-schema-doc
pillar: infra (schema discipline)
v1_pillar: memory
v1_effect: documents the GET /history list + POST /history/annotate_turn envelopes iOS uses for the conversation-history pane + studio-annotation loop — closes a schema-doc gap
---

## Scope

Ships `docs/schemas/history.md` — canonical request +
response shapes for the two `/history/*` routes:

- `GET /history` — paginated history with `limit`,
  `sinceTurnId` (delta filter), `screenplayProjectId` filter;
  standard If-None-Match → 304.
- `POST /history/annotate_turn` — merge studio metadata onto a
  specific turn; 200 on success, 400/404 on validation/missing.

Covers: endpoints + body limits, schema version (`1`),
PER-USER posture, request shapes per route, response envelopes
(200 list + 200 annotate + 304 + 400 + 404), invariants
(annotate MERGES, doesn't replace; turn ids are unique).

Plus an INDEX.md row under the Memory surface section.

## V1 pillar / effect

- `V1 pillar: memory`
- `V1 effect: documents the conversation-history list + the
  studio-annotation loop iOS uses to enrich past turns with
  Studio metadata. iOS decoders + future Phase 6 extraction
  both benefit from a fixed contract.`

## Verification

- Doc matches the two inline handlers in `backend/index.js`
  line-by-line for request fields, response shapes, error
  envelopes, and read-state headers.
- INDEX entry placed under Memory surface alongside the rest
  of the memory-cluster schema docs.
- Pre-flight clean.

## Done when

`docs/schemas/history.md` lands + INDEX entry added.
