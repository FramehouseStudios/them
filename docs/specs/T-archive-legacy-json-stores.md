# Spec: T-archive-legacy-json-stores

**Status**: ready (Claude can implement).
**Owner**: claude (backend scope).
**V1 pillar**: infra (enables all)
**V1 effect**: closes the "production runs Postgres but the repo
still ships 3.6 MB of JSON dev data" gap. Today `screenplay_store.json`
(3.6 MB) and `user_memory_store.json` (296 KB) are in the repo and
in the working directory of the backend process. They are never
read in production (assertProductionEnv now requires Postgres), but
they bloat clones, end up in the Docker build context, and create
the false impression that the JSON adapter is supported in prod.

## Problem

`backend/screenplay_store.json` and `backend/user_memory_store.json`
were the working store before the Postgres migration (`PHASE2`).
They are still present in the repo at their last-edited contents.
The persistence adapter prefers Postgres when `DATABASE_URL` is set
and falls back to JSON otherwise; in production the new boot guard
ensures Postgres is the only path. So these files are:

- Useful in dev (when no DATABASE_URL is set).
- Useless and confusing in CI and in the Docker image (the
  `.dockerignore` added in `T-backend-deploy-image` already excludes
  them).
- Risky: they contain real user-generated content. If they end up
  in a public-facing artifact (a leaked artifact zip, a CDN cache,
  etc.), that's a data leak.

## Scope

In:
- Move the JSON store files into a `backend/data/_legacy/` directory
  (the `data/` dir already exists and is in `.dockerignore`).
- Update `persistence_json.js` to read from the new path while
  honoring `PERSISTENCE_JSON_ROOT` for tests.
- Add a `.gitignore` entry for `backend/data/_legacy/*.json` so
  per-developer dev state doesn't churn in PRs.
- Commit a small `.keep` and a `README.md` in `backend/data/_legacy/`
  explaining the migration.
- Update `docs/v1-definition.md` and `backend/DEPLOY.md` to
  reference the new path.

Out:
- Removing the JSON adapter entirely. Dev workflow still wants it
  (zero-setup `npm test`). Removal is `T-remove-json-adapter`,
  contingent on the team being comfortable that no one needs the
  JSON adapter anymore.
- Migrating the dev data itself (the JSON files) into a Postgres
  test fixture. That's a follow-up.

## Approach

1. `git mv backend/screenplay_store.json backend/data/_legacy/`
   (same for user_memory_store.json and outbox_store.json,
   knowledge_cards.json).
2. Update `lib/persistence_json.js` `root` default to point to
   `backend/data/_legacy/`.
3. Add a one-time backward-compat fallback: if the new path does
   not exist but the old root does, read from the old path with a
   deprecation warning printed once.
4. Add `backend/data/_legacy/*.json` to `.gitignore` *after* the
   move commit (keeps the historical entries reachable in git
   history but stops new dev state from cluttering PRs).
5. Add a `backend/data/_legacy/README.md` explaining the path.

## Acceptance

- `npm test` passes against the new path.
- `npm start` (dev mode, no DATABASE_URL) still loads the same data.
- The four legacy JSON files no longer sit at `backend/<filename>.json`.
- A migration test asserts the deprecation warning fires when only
  the old path is present.
- `du -sh backend/` decreases by ~4 MB.

## Risks

- Some script or test hard-codes the old path. Mitigation: grep for
  the four file names; any hit gets updated in this PR.
- The deprecation-fallback path remains in code forever if nobody
  cleans it up. Mitigation: add a TODO with a removal date (90 days
  after merge).

## Out-of-scope follow-ups

- `T-remove-json-adapter` (when the team is ready).
- `T-store-fixtures-in-postgres` (Postgres test fixtures so JSON
  mode is no longer needed in `npm test`).
