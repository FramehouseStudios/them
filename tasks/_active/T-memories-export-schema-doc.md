---
id: T-memories-export-schema-doc
title: docs/schemas/memories-export.md
owner: claude
status: review
branch: claude/T-memories-export-schema-doc
pillar: infra (schema discipline)
v1_pillar: memory
v1_effect: documents the GET /memories/export full-dump envelope iOS uses for the V1 line 54 "human privacy decision is made for full memory export/delete" gate — canonicalizes the shape so the privacy decision can be applied additively
---

## Scope

Ships `docs/schemas/memories-export.md` — last of the
`/memories/*` cluster of schema docs. Sibling to
`memories-list.md` (read) and `memories-mutate.md` (write).

Covers:
- Endpoint + method + no query parameters.
- Schema version (`1`) — outer envelope + inner `export_json` payload.
- PER-USER posture (same as the rest of the cluster).
- Full 200 response envelope (15 fields).
- The inner `export_json` payload shape (14 fields, including
  the full `memory_cards`, `themes`, `tasks`, `history_threads`).
- Server-generated `filename` pattern.
- Read-state headers (Cache-Control + applyReadStateHeaders).
- Invariants (export is read-only; caps on cards/threads;
  tasks include status="all").
- V1 alignment (line 54 privacy decision).
- Compatibility rules + changelog.

Plus an INDEX.md row under the Memory surface section.

## V1 pillar / effect

- `V1 pillar: memory`
- `V1 effect: documents the GET /memories/export full-dump
  endpoint that V1 line 54 ("Human privacy decision is made
  for full memory export/delete") gates. The schema doc
  canonicalizes the current shape so a future redaction layer
  can be added additively.`

## Verification

- Doc matches the inline `app.get("/memories/export", ...)`
  handler in `backend/index.js` line-by-line for the outer
  envelope, the inner export_json payload structure, the
  filename pattern, and the read-state headers.
- INDEX entry placed under Memory surface alongside the other
  `/memories/*` schema docs (memories-list, memories-mutate).
- Pre-flight clean.

## Done when

`docs/schemas/memories-export.md` lands + INDEX entry added.
This completes the schema-doc coverage for the entire
`/memories/*` cluster (5 routes documented across 3 docs).

## Followups (not in this PR)

- Phase 6 extraction of the cluster to
  `backend/lib/memories_route.js` per #228 design note. All
  three memories-* schema docs will need a small amendment to
  reference the lib once the extraction lands.
- V1 line 54 privacy decision (Codex / human-gated) may add
  redaction fields to the inner export_json payload. The
  current doc explicitly notes that additive-only changes are
  tolerated.
