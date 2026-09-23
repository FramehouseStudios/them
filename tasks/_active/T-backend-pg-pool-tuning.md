---
id: T-backend-pg-pool-tuning
title: Production-tune the Postgres connection pool
owner: support
status: review
branch: claude/pg-pool-tuning
pillar: infra (enables all)
v1_pillar: infra
v1_effect: closes a V1 deploy gap; the pg.Pool uses all defaults (max=10, no idle/connection/statement timeout, no application_name) which won't survive real load.
---

## Scope

Spec: `docs/specs/T-backend-pg-pool-tuning.md`.

Tuned `new Pool(...)` config in `lib/persistence_postgres.js`
(max, idleTimeoutMillis, connectionTimeoutMillis, statement_timeout,
application_name), a `pool.on('error')` handler, and `/ops/pg-pool`
status endpoint. New env vars documented in `.env.example` + DEPLOY.md.

## Done when

- `pg_stat_activity.application_name` shows `them-backend@<build>`.
  (config sets it; VERIFIED at the pool-config layer by unit test, live
  read of pg_stat_activity UNVERIFIED: no Postgres reachable from the dev
  machine on 2026-09-23. Clearance: run against a DATABASE_URL and
  `select application_name from pg_stat_activity`.)
- A 30s blocking query elsewhere does not stall our requests beyond
  `PERSISTENCE_POSTGRES_STATEMENT_TIMEOUT_MS`. (statement_timeout and
  query_timeout were already bounded before this task; live check
  UNVERIFIED, same clearance.)
- Pool stats JSON: shipped as the `pg_pool` field of `GET /ops/metrics`
  rather than a new `/ops/pg-pool` route, so `index.js` does not grow
  (D009). VERIFIED by route test and by a local boot on the JSON adapter
  (field is null there).
- `pool.on("error")` handler: VERIFIED by unit test with a fake pool
  (errors counted, warned, reported; process no longer exits on an idle
  client error).
