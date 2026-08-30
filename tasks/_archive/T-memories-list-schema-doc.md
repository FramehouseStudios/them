---
id: T-memories-list-schema-doc
title: docs/schemas/memories-list.md
owner: support
status: merged
branch: support/T-memories-list-schema-doc
pillar: infra (schema discipline)
v1_pillar: memory
v1_effect: documents the GET /memories envelope iOS consumes for the V1 line 53 "plain-language memory summary" surface — gives Codex a fixed contract to read against before Phase 6 extracts the route
---

## Scope

Ships `docs/schemas/memories-list.md` — canonical response shape
for `GET /memories`. Covers:

- Endpoint + method.
- Schema version (`1`).
- PER-USER access-control posture.
- Query parameters: `limit` (default 24, max 120) and
  `sinceVersion` (delta-no-change short-circuit).
- `If-None-Match` etag handling (304).
- Full 200 envelope with 25+ field types documented.
- Delta-no-change response shape (when `sinceVersion` matches
  current `state_version`).
- 304 response details.
- Read-state headers set by `applyReadStateHeaders`.
- Invariants (limit caps, delta vs full body, etc.).
- Side effects (background `maybeBackfillThemesFromHistory`).
- Compatibility rules + V1 alignment + changelog.

Plus an INDEX.md row under the Memory surface section.

## V1 pillar / effect

- `V1 pillar: memory`
- `V1 effect: closes the schema-doc gap for the GET /memories
  envelope. V1 line 53 ("iOS exposes a plain-language memory
  summary and refresh state") depends on this surface; iOS
  decoders now have a fixed contract.`

## Verification

- Doc matches the inline `app.get("/memories", ...)` handler in
  `backend/index.js` line-by-line for the response field set,
  the headers, the delta-no-change short-circuit, and the etag
  cycle.
- INDEX entry sits under Memory surface alongside
  `memory-stats.md` and `block-signal*.md`.
- Pre-flight clean.

## Done when

`docs/schemas/memories-list.md` lands + INDEX entry added.

## Followups (not in this PR)

- Schema docs for the other four `/memories/*` routes
  (`/memories/export`, `/memories/update`, `/memories/forget`,
  `/memories/promote`, `/memories/feedback`) — each can ship
  in its own PR or a batch.
- This doc will need an amendment when Phase 6 extracts
  `app.get("/memories", ...)` to `backend/lib/memories_route.js`
  per the #228 design note.
