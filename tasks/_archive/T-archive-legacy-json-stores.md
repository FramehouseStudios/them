---
id: T-archive-legacy-json-stores
title: Move backend/*_store.json into backend/data/_legacy/
owner: support
status: merged
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

## Closed on evidence (2026-09-23)

Superseded by earlier work; nothing left to build.

- `backend/screenplay_store.json` (the 3.6 MB file) was deleted from git in
  `017f2b3e` and no longer exists at the backend root.
- `backend/user_memory_store.json`, `user_store.json`, `outbox_store.json`
  and `knowledge_embeddings_cache.json` are ignored by `.gitignore` ("User
  data stores (never commit user data)"), as is `backend/data/`.
- `lib/persistence_json.js` already defaults to `backend/data/persistence/`
  (`DEFAULT_ROOT`), overridable with `PERSISTENCE_JSON_ROOT`; production
  runs Postgres (`DEPLOY.md`).
- `backend/knowledge_cards.json` (37 KB) is tracked on purpose: a curated
  craft-card seed loaded by `index.js`, not user content.
