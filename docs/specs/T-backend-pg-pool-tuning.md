# Spec: T-backend-pg-pool-tuning

**Status**: ready (support agent can implement).
**Owner**: support.
**V1 pillar**: infra (enables all)
**V1 effect**: closes a V1 deploy gap. The Postgres adapter
(`backend/lib/persistence_postgres.js`) uses `new Pool({ connectionString })`
with default settings: `max=10`, no idle timeout, no statement
timeout, no application_name. Under any real load this either
exhausts the pool or holds idle connections indefinitely.

## Problem

Default `pg.Pool` settings are not production-ready:

- `max=10` connections is too few for V1 traffic if Render upgrades
  us to a single shared-CPU instance with concurrent users.
- No `idleTimeoutMillis` → idle conns held until Postgres or LB drops
  them at random.
- No `connectionTimeoutMillis` → a sick database hangs the request.
- No `statement_timeout` → a runaway query holds a connection
  indefinitely.
- No `application_name` → ops can't tell which workload owns a
  given connection in `pg_stat_activity`.

## Scope

In:
- Replace the `new Pool({ connectionString })` call with a tuned
  configuration:
  ```js
  new Pool({
    connectionString: databaseUrl,
    max: parsePositiveInt(process.env.PG_POOL_MAX, 20),
    idleTimeoutMillis: parsePositiveInt(process.env.PG_POOL_IDLE_MS, 30_000),
    connectionTimeoutMillis: parsePositiveInt(process.env.PG_POOL_CONN_MS, 5000),
    application_name: `them-backend@${process.env.BACKEND_BUILD || "dev"}`,
    statement_timeout: parsePositiveInt(process.env.PG_STATEMENT_TIMEOUT_MS, 10_000),
  });
  ```
- A `pool.on('error', ...)` handler that logs and increments an
  ops counter (no process-exit; the pool reconnects).
- A `/ops/pg-pool` endpoint exposing `totalCount`, `idleCount`,
  `waitingCount`.

Out:
- Read-replica routing.
- PgBouncer integration. Render's managed Postgres handles
  connection multiplexing; we don't need our own pgbouncer for V1.

## Approach

Five-line config change in `persistence_postgres.js`. New env vars
documented in `backend/.env.example` and `backend/DEPLOY.md`.
Status endpoint mirrors the `/ops/metrics` pattern.

## Acceptance

- `SELECT application_name FROM pg_stat_activity WHERE state='idle'`
  returns `them-backend@<build>` for connections we own.
- A 30s `pg_sleep(30)` query from another session does not block
  our requests beyond `PG_STATEMENT_TIMEOUT_MS` (10s default).
- `/ops/pg-pool` returns the pool stats in JSON.
- Defaults are conservative enough for Render Starter; documented in
  DEPLOY.md.

## Risks

- A `statement_timeout` lower than a real query needs could cause
  legitimate failures. Mitigation: 10s is well above any current
  query; if a real one needs longer, it should run async.
- Increasing `max` past the database's `max_connections` causes
  errors. Mitigation: the DEPLOY.md note specifies "set max ≤
  database max_connections / number_of_instances".

## Out-of-scope follow-ups

- `T-backend-pg-circuit-breaker` — break the pool when error rate
  exceeds a threshold.
- `T-backend-pg-readonly-replica` — route GETs to a replica.
