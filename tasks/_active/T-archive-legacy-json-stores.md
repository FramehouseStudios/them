---
id: T-archive-legacy-json-stores
title: Move backend/*_store.json into backend/data/_legacy/
owner: support
status: ready
branch: -
pillar: infra (enables all)
v1_pillar: infra
v1_effect: closes the 'production runs Postgres but the repo still ships 3.6 MB of JSON dev data' gap. JSON files containing user-generated content shouldn't sit at the backend root.
---

## Scope

Spec: `docs/specs/T-archive-legacy-json-stores.md`.

Move `screenplay_store.json` (3.6 MB), `user_memory_store.json`
(296 KB), `outbox_store.json`, `knowledge_cards.json` into
`backend/data/_legacy/`. Update `persistence_json.js` default root.
Add `.gitignore` for the new path. One-time fallback warning if
only the old path exists.

## Done when

- The four legacy JSON files no longer sit at `backend/<filename>.json`.
- `npm test` and dev `npm start` work against the new path.
- `du -sh backend/` decreases by ~4 MB.
- Deprecation warning fires once if only the old path exists.
