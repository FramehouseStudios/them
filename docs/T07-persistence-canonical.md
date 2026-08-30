# T07 — Backend Persistence Canonical (Postgres + JSON Adapter)

**Status:** in-progress (this PR ships the foundation; per-store wiring is follow-up rows)
**Owner:** support
**Branch:** `support/T07-postgres-canonical`
**Pillar:** longitudinal learning

## Problem

The backend has four persistent stores that today read and write JSON files at the backend root: `outbox_store.json`, `user_memory_store.json`, `screenplay_store.json`, and `knowledge_embeddings_cache.json`. JSON files are fragile across restarts in clustered or cloud-deployed environments, do not survive Procfile-driven redeploys cleanly, and offer no schema evolution path. The audit's recommendation #7 was *"Resolve dual persistence — pick Postgres or JSON, not both."*

T07 picks Postgres as canonical. JSON remains supported as a deliberate fallback for **single-process local development**.

## Architecture

### One adapter, two backends

```
                  +-----------------------------+
                  |   createPersistence()       |
                  |   (chooses backend by env)  |
                  +-----------------------------+
                          |              |
                  DATABASE_URL set    DATABASE_URL unset
                          |              |
              +-----------v---+    +-----v-----------+
              | PostgresImpl  |    | JsonFileImpl    |
              +---------------+    +-----------------+
                       \                /
                        \              /
                  +------v------------v------+
                  |  Stores (outbox, memory, |
                  |  screenplay, embeddings) |
                  +--------------------------+
```

The contract is identical for both backends. Tests run against both.

### The contract

```js
const persistence = createPersistence({ /* env-driven by default */ });

await persistence.put({ domain, key, value });          // upsert
const v = await persistence.get({ domain, key });       // null if absent
await persistence.delete({ domain, key });              // no-op if absent
const rows = await persistence.list({ domain, prefix?, limit? });
await persistence.clear({ domain });                    // empties one domain
await persistence.close();                               // releases pool / nothing
```

- `domain` is one of `KNOWN_DOMAINS`: `outbox`, `user_memory`, `screenplay`, `knowledge_embeddings`. Adding a domain requires a code change (intentional — schema evolution should be deliberate).
- `key` is a non-empty string ≤ 512 characters.
- `value` is any JSON-serializable document. `undefined` is rejected (use `null` to represent absence).
- `list` returns `[{ key, value }]` sorted ascending; `prefix` does string prefix filtering; `limit` is clamped to `[1, 10000]` with a default of 1000.

### Postgres backend

- One table per domain: `persistence_<domain>`. Schema in [`backend/migrations/001_init_persistence.sql`](../backend/migrations/001_init_persistence.sql).
- `(key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())`.
- Writes are `INSERT … ON CONFLICT (key) DO UPDATE` upserts. Idempotent.
- Each table has an `updated_at` index for cleanup and observability.
- `pg` is imported lazily so JSON-only deployments do not need it installed.

### JSON backend

- One file per domain at `${PERSISTENCE_JSON_ROOT}/<domain>.json`, where root defaults to `backend/data/persistence/`.
- Each file is a flat object: `{ [key]: value }`.
- Writes serialize per domain via an in-process mutex chain; atomic via tmp + rename.
- **Single-process only.** Multi-process / clustered backends must use Postgres mode. This is the intended split.

## Migration

### Forward — JSON → Postgres

`scripts/migrate_stores_to_postgres.mjs`:

```bash
DATABASE_URL=postgres://... node scripts/migrate_stores_to_postgres.mjs
```

Run the data import with backend auth writes stopped. The auth portion is an
exact snapshot replacement: rows absent from `user_store.json` are deleted in
the same transaction that installs the imported rows and canonical marker.
Running it against a live writer could therefore discard a session created
after the source snapshot was captured.

Flags:

- `--schema-only` — apply the persistence and auth table migrations; no data
  load and no deletion of existing auth rows. Migration 011 may mark an
  existing nonempty auth store, but it never authorizes an empty database as
  canonical. Production remains fail-closed until a validated import publishes
  the marker for an empty store.
- `--allow-empty-auth` — explicitly authorize an exact empty auth replacement.
  A live run with a valid four-array empty snapshot deletes every canonical
  user, session, reset token, and verification token in the auth transaction.
- `--dry-run` — parse and validate the source snapshot and report counts; do
  not connect to Postgres or write. An allowed empty snapshot emits a prominent
  warning because the corresponding live run is destructive.
- `--backend DIR` — point at a different backend root (defaults to `./backend`).

The script:

1. Reads every legacy file before the first database operation and requires a
   recognized, structurally valid `user_store.json`. Empty auth snapshots fail
   closed unless `--allow-empty-auth` explicitly authorizes exact replacement;
   `--schema-only` is not an empty-data operation.
2. Validates auth identity uniqueness, credential completeness, consistent
   email-verification metadata, bounded PBKDF2 work factors, complete encoded
   password digests, session/token lifetimes, and every user reference before
   any schema or data write.
3. Applies the pre-import persistence/auth schema migrations (idempotent).
4. Extracts non-auth records using a per-source extractor that knows the
   legacy shape (for example, `user_memory_store.json` buckets become
   `byUserId:<id>` keys) and upserts them through the persistence adapter.
5. In one Postgres transaction, installs the marker table, rejects an
   incompatible future marker version, clears all four auth tables, inserts the
   exact validated auth snapshot, and publishes the canonical initialization
   marker. Any delete, insert, or marker failure rolls the entire auth
   replacement back. Re-running with the same snapshot produces the same
   canonical state.

### Reverse — Postgres → JSON

`scripts/dump_stores_to_json.mjs`:

```bash
DATABASE_URL=postgres://... node scripts/dump_stores_to_json.mjs
```

Flags: `--dry-run`, `--backend DIR`.

The script reverses the forward extractors so a round-trip produces an equivalent JSON file. Used for:

- Rolling back a Postgres deployment to JSON mode.
- Local debugging from a Postgres backup.
- Disaster recovery: re-seed JSON mode from a Postgres snapshot.

## Per-store wiring (follow-up rows)

This PR does not yet rewire each store to use the adapter. The wiring is mechanical and benefits from being reviewed per-store:

- **T07a** — wire `outbox_store` (smallest, best-abstracted). Configure outbox via `createPersistence(...)` in `backend/index.js`.
- **T07b** — wire `screenplay_store`.
- **T07c** — wire `memory_store` (largest; 559 lines of domain logic).
- **T07d** — wire the knowledge embeddings cache.

Each follow-up row claims itself, lands on its own branch, and goes through review independently.

## Why ship the foundation alone

Doing the foundation as one PR and per-store wirings as separate PRs is deliberate:

- **Reviewability.** A 700-line adapter + tests is a defensible review surface. A 700-line adapter plus 4 store rewirings is not.
- **Risk isolation.** If wiring `memory_store` introduces a regression, the rollback is `git revert` of a small commit, not a giant one.
- **Postgres availability.** Each follow-up can be gated on the team having a real Postgres instance to validate against. The foundation can land before that.

## Eval gate against Postgres (T07-eval-gate)

`.github/workflows/eval-gate-postgres.yml` runs the full
`npm run eval:gate` path against a live Postgres service container so
the persistence-canonical foundation is exercised end-to-end.

### Triggers

- `workflow_dispatch` — run manually from the Actions tab. Optional
  `keep_data` input keeps the migrated data after the run for
  debugging (default: drop the schema after the run).
- `push` to `support/T07*` or `support/backend-T07*` branches — auto-runs
  the gate when persistence-related branches change.
- `schedule` — nightly at 09:00 UTC so the gate stays green even when
  no PR touched persistence today.

### What it does

1. Boots a `postgres:16` service container with a fixed user, password,
   and database (test-only credentials).
2. Waits for Postgres to be ready, then applies every migration under
   `backend/migrations/0*.sql` in order (`001`, `002`, `003`, ...).
3. Confirms the `persistence_*` tables exist.
4. Runs `bash ./scripts/quality_gate.sh` with `RUN_QUALITY_GATE=1`,
   `RUN_SERVER=1`, and the `DATABASE_URL` env var set to the local
   container, plus the standard required secrets
   (`OPENAI_API_KEY`; `APP_TOKEN` falls back to a CI test value when the secret is absent).
5. Captures the gate's backend log on failure and produces a
   `GITHUB_STEP_SUMMARY` with row counts per `persistence_*` table.

### Required secrets

- `OPENAI_API_KEY` — required by prompt regression and talk recovery.
- `APP_TOKEN` — used by speculative reuse, smoke, and ops alert. The workflow falls back to `them-eval-gate-app-token` when the secret is absent so PR checks can run in fresh repositories.
- `JWT_SECRET` — falls back to a hard-coded test value when the
  secret is not configured. Production runs should set it.

The workflow fails fast (with a step-summary diagnosis) before any
eval execution if `OPENAI_API_KEY` is missing or does not look like
a literal OpenAI key value. If CI reports that `OPENAI_API_KEY` is
invalid, update the repository Actions secret itself; the workflow
cannot evaluate a secret that was saved as a shell command, file path,
or placeholder.

### Local invocation

```bash
# Boot a local Postgres for the gate
docker run --rm -d --name them-eval-pg \
  -e POSTGRES_USER=io_them -e POSTGRES_PASSWORD=io_them_test \
  -e POSTGRES_DB=io_them -p 5432:5432 postgres:16

# Apply migrations
PGPASSWORD=io_them_test psql -h localhost -U io_them -d io_them \
  -f backend/migrations/001_init_persistence.sql
PGPASSWORD=io_them_test psql -h localhost -U io_them -d io_them \
  -f backend/migrations/002_craft_persistence.sql
PGPASSWORD=io_them_test psql -h localhost -U io_them -d io_them \
  -f backend/migrations/003_creative_memory_persistence.sql

# Run the gate
DATABASE_URL=postgres://io_them:io_them_test@localhost:5432/io_them \
RUN_QUALITY_GATE=1 RUN_SERVER=1 \
  bash ./scripts/quality_gate.sh

# Cleanup
docker stop them-eval-pg
```

### Promotion path

This workflow is currently advisory. Once it has been green for a
short soak (~7 days, captured in the T07-cutover row), promote by:

1. Adding a `workflow_call` to it in `release-preflight.yml` so RC
   runs invoke it.
2. Marking the `support/T07-cutover` row's blocker as cleared.
3. Removing the legacy `*_store.json` write paths (T07-cutover scope).

## Verification

- `cd backend && node --test tests/persistence_adapter.test.mjs` → 21 tests, all pass.
- The Postgres adapter is exercised through a tight in-memory pg-shaped mock that asserts the exact SQL the adapter emits. This means schema drift in the adapter or a regression in the SQL fails tests immediately, even without a live database.
- `cd backend && npm test` continues to pass (no existing tests modified).

`npm run eval:gate` is **not** run in this PR — gate requires backend boot with `OPENAI_API_KEY` and `APP_TOKEN` not present in the worktree, and the new persistence layer is not wired into any code path the gate exercises until the per-store follow-ups land. CI will run it.

## Open questions

1. **Migration ordering with running production.** A live deployment migrating from JSON to Postgres will want a window where both are written so a rollback is non-destructive. **Proposed:** add a `dual-write` mode to the adapter as part of T07a (the first store wiring) — when enabled, writes go to both backends; reads come from Postgres. After confidence, dual-write is turned off.
2. **Embeddings cache size.** `knowledge_embeddings_cache.json` may be large (megabytes). Postgres `JSONB` handles this fine, but the migration script reads the entire JSON into memory at once. **Proposed:** revisit in T07d with a streaming migration if the file is over ~50 MB.
3. **PERSISTENCE_JSON_ROOT default.** Currently `backend/data/persistence/`. Should we share `backend/data/` with anything else, or keep it persistence-specific? **Proposed:** keep it persistence-specific. Other stores have their own paths today.

## Final shipped state (T07 foundation PR contents)

Three reviewable commits on `support/T07-postgres-canonical`:

1. **T07 row claim** — TASKS.md update with scope split.
2. **Adapter + JSON + Postgres + schema + tests** — the foundation.
3. **Migration scripts + this design doc.**

What is intentionally not in this PR:
- Per-store wiring (T07a-d).
- Backend boot path changes that read `DATABASE_URL` for stores (will land with T07a).
- Eval-gate green with `DATABASE_URL` set (requires per-store wiring + a live test database).
