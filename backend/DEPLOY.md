# io.them backend — deploy recipe

This is the single source of truth for deploying the backend. It assumes the
image is built from [`backend/Dockerfile`](Dockerfile) and the production
runtime requires the env vars enforced by `assertProductionEnv()` in
[`backend/config.js`](config.js).

## Pre-flight (every deploy)

1. **Migrations are up to date.**

   Inspect `backend/migrations/` and confirm every `*.sql` has been applied
   to the production Postgres instance. New migrations need to land before
   code that depends on them. In particular,
   `011_auth_store_metadata.sql` must run before this auth build starts. It
   creates the marker table and marks an existing nonempty auth store, but it
   deliberately does not authorize an empty database as canonical.

2. **Quality gate is green.**

   ```sh
   cd backend
   npm test
   npm run eval:gate
   ```

   Both must pass. `eval:gate` requires `OPENAI_API_KEY` (see also
   `docs/ci-openai-secret-fix.md` if CI is failing).

3. **Never use legacy auth state during a database outage.**

   Production must run with `DATABASE_URL` set. The
   `persistence_adapter.js` factory picks Postgres when `DATABASE_URL` is
   present and the boot-time guard now refuses to start without it. Auth-store
   hydration also fails closed if Postgres cannot be read; the process must
   never fall back to a stale local session snapshot during an outage.
   Production also fails closed when the canonical marker is absent; it never
   guesses whether an empty database is virgin or represents intentional
   deletion. Local JSON development retains the one-time virgin-adapter
   backfill. Before the first production boot, publish the marker through the
   explicit migration tooling: import a validated nonempty legacy snapshot, or
   use an intentionally empty four-array snapshot with `--allow-empty-auth`.
   Run an import only while backend auth writes are stopped. The importer
   validates first, then replaces all four canonical auth tables and publishes
   the marker in one transaction so omitted stale sessions cannot survive a
   rerun. `--schema-only` never clears auth rows and never makes an empty auth
   database authoritative. For an intentional empty replacement, first run
   with `--dry-run`, review its destructive warning, and keep auth writes
   stopped through the live transaction.

4. **Keep the V1 backend at one instance.**

   Auth mutations are serialized by an in-process lock and persisted as a
   complete auth-store snapshot. That is safe for the V1 single-instance
   deployment, but not for horizontal scaling: two writers can prune each
   other's records or rotate the same refresh token twice. Before increasing
   instance count, replace auth snapshot writes with row-scoped Postgres
   transactions and compare-and-swap refresh rotation.

## Required production environment

| Var | Purpose |
|-----|---------|
| `NODE_ENV=production` | Enables `REQUIRE_APP_TOKEN`, `REQUIRE_CLIENT_TOKEN`, and the boot-time env guard. |
| `DATABASE_URL` | Postgres connection string. Required. |
| `JWT_SECRET` | HMAC signing key for access/refresh tokens. Required. |
| `OPENAI_API_KEY` | Talk + realtime supplier. Required. |
| `APP_TOKEN` | App-level shared secret sent as `X-APP-TOKEN`. Required. |
| `AUTH_APPLE_AUDIENCE` | Sign in with Apple Services ID / bundle identifier used for mandatory `aud` validation. Required. |
| `PORT` | Listen port. Defaults to 3000. |

Optional but commonly set: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`,
`CORS_ALLOW_ORIGIN`, `API_SCHEMA_VERSION`, `REQUIRE_USER_AUTH`,
`AUTH_REQUIRE_EMAIL_VERIFIED`.
For V1 production, do not set `REQUIRE_USER_AUTH=false`; production requires
login and the startup guard refuses that insecure opt-out.
Production Apple Sign In verifies identity tokens against Apple's JWKS by
`kid` and requires `AUTH_APPLE_AUDIENCE` so every token is bound to this app;
`AUTH_APPLE_JWT_PUBLIC_KEY` and `AUTH_APPLE_TEST_JWT_SECRET` are non-production
fixture fallbacks.

The boot will throw a multi-line error listing every missing var; the
process will not start.

## Render (default target — see `render.yaml`)

```sh
# First-time setup
render blueprint launch render.yaml

# Subsequent deploys
git push origin main
# Render builds the Dockerfile and runs the new image after the health
# check at /healthz responds 200.
```

The blueprint provisions a managed Postgres alongside the web service. After
the first launch, copy the generated `DATABASE_URL` into the service env
vars (Render does not auto-link the two on the free plan).

## Other targets

### Fly.io

The Dockerfile is fly-compatible. Generate a `fly.toml` with:

```sh
fly launch --no-deploy --dockerfile Dockerfile --copy-config=false
fly secrets set DATABASE_URL=... JWT_SECRET=... OPENAI_API_KEY=... APP_TOKEN=... AUTH_APPLE_AUDIENCE=...
fly deploy
```

### Self-hosted (legacy `run.production.sh`)

`run.production.sh` still works for a local-style deploy that sources
`.env.production`. Prefer the container path for any shared environment.

## Rollback

Render: revert the deploy in the dashboard. The previous image is kept.
Fly: `fly releases list && fly releases rollback <version>`.

The backend is stateless except for Postgres, but migration 011 creates a
one-way auth compatibility boundary. After that migration is applied, **do not
roll back to an image that predates marker-aware canonical auth hydration**.
Those older images ignore `persistence_auth_store_meta`; when the canonical
auth tables are intentionally empty, an old image can load a stale
`user_store.json` mirror and recreate deleted users or sessions. Roll forward
with a repaired marker-aware image instead. A rollback is safe only when the
target image contains the canonical marker logic and its expected marker schema
is compatible with the database.

## Smoke after deploy

```sh
node ../scripts/live_backend_health.mjs --url="$BASE_URL"
# expect: [OK] for /healthz and /api/version
```

Then run the iOS V1 manual smoke from `docs/runbook-v1-smoke.md` against
the new backend.

For the production custom domain, `https://api.them.io/healthz` must return
the JSON readiness envelope directly. A redirect to a parked them.io page or
Render `x-render-routing: no-server` means DNS/custom-domain attachment still
needs operator work before TestFlight or desktop release.
