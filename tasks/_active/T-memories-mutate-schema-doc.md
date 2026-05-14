---
id: T-memories-mutate-schema-doc
title: docs/schemas/memories-mutate.md
owner: claude
status: review
branch: claude/T-memories-mutate-schema-doc
pillar: infra (schema discipline)
v1_pillar: memory
v1_effect: documents the four /memories/* mutation endpoints (update/forget/promote/feedback) — gives iOS a fixed contract for the memory-card edit/delete/promote UX before Phase 6 extracts the routes
---

## Scope

Ships `docs/schemas/memories-mutate.md` — canonical request +
response shapes for four sibling endpoints:

- `POST /memories/update` — mutate a memory card.
- `POST /memories/forget` — delete a memory card.
- `POST /memories/promote` — promote a card to a theme.
- `POST /memories/feedback` — record human feedback on a card.

All four share:
- 256kb body limit.
- Same `card_id` / `key` addressing.
- Same read-state response metadata (matches `memories-list.md`).
- Same `memory_quality` refresh on the post-mutation state.
- Same `Cache-Control: no-store` + `applyReadStateHeaders` cycle.
- 200 on success / 400 on failure with `ok: bool` + `message`.

Per-route differences:
- `update` + `promote` echo the updated `memory_card`.
- `forget` echoes `forgotten_id` + `theme_key`.
- `promote` echoes `theme_key`.

Plus an INDEX.md row under the Memory surface section.

## V1 pillar / effect

- `V1 pillar: memory`
- `V1 effect: documents the four mutation endpoints iOS needs
  for the memory-card UI (edit / delete / promote / feedback).
  V1 line 54 ("Human privacy decision is made for full memory
  export/delete") gates the forget endpoint's policy semantics —
  the schema doc canonicalizes the backend response now so the
  policy call doesn't reshape the contract.`

## Verification

- Doc matches the four inline handlers in `backend/index.js`
  line-by-line for request fields, response fields, status
  verbs, and 200/400 cycles.
- INDEX entry placed under Memory surface alongside the
  existing memory schema docs.
- Pre-flight clean.

## Done when

`docs/schemas/memories-mutate.md` lands + INDEX entry added.

## Followups (not in this PR)

- `docs/schemas/memories-export.md` for `GET /memories/export`
  (full memory dump; the last endpoint in the cluster).
- Phase 6 extraction of the four routes to
  `backend/lib/memories_route.js` per #228 design note. This
  doc will need a small amendment to reference the lib once
  the extraction lands.
