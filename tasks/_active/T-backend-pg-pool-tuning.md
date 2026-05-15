---
id: T-backend-pg-pool-tuning
title: Production-tune the Postgres connection pool
owner: claude
status: ready
branch: -
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
- A 30s blocking query elsewhere does not stall our requests beyond
  `PG_STATEMENT_TIMEOUT_MS`.
- `/ops/pg-pool` returns pool stats JSON.
