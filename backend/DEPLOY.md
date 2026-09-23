# io.them backend — deploy recipe

This is the single source of truth for deploying the backend. It assumes the
image is built from [`backend/Dockerfile`](Dockerfile) and the production
runtime requires the env vars enforced by `assertProductionEnv()` in
[`backend/config.js`](config.js).

## Pre-flight (every deploy)

1. **Migrations are up to date.**

   Render runs `node /app/ops/render_predeploy.mjs` from the newly built image
   before it can receive traffic. The release phase applies every
   `backend/migrations/*.sql` file through the same canonical runner exercised
   in CI. A checksum mismatch or failed migration aborts the deploy before the
   new application starts. New migrations must remain backward-compatible
   with the previous image, which continues serving while pre-deploy runs.
   In particular,
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
   explicit migration tooling. Import a validated nonempty legacy snapshot
   only while backend auth writes are stopped. The importer
   validates first, then replaces all four canonical auth tables and publishes
   the marker in one transaction so omitted stale sessions cannot survive a
   rerun. `--schema-only` never clears auth rows and never makes an empty auth
   database authoritative. `--allow-empty-auth` is destructive replacement
   tooling and must never be placed in a deploy or restart command. For an
   intentional empty replacement, first run
   with `--dry-run`, review its destructive warning, and keep auth writes
   stopped through the live transaction.

   A brand-new production database with no legacy users uses the narrower
   release initializer. After verifying that all four auth tables are empty,
   set the Render environment value exactly once:

   ```text
   AUTH_STORE_EMPTY_INIT_CONFIRMATION=initialize-empty-canonical-auth-store-v1
   ```

   The release transaction locks the auth tables, refuses markerless nonempty
   state, and only inserts the canonical marker. It never deletes auth data.
   Remove the value from Render after the first healthy deploy. Later releases
   see the valid marker and no-op without requiring the confirmation value.

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
| `PERSISTENCE_POSTGRES_POOL_MAX` | Pool clients per backend instance (default 10, clamped 1–100). Keep `instances × max` under the database's connection limit. |
| `PERSISTENCE_POSTGRES_IDLE_TIMEOUT_MS` | Idle client release (default 30000). |
| `PERSISTENCE_POSTGRES_STATEMENT_TIMEOUT_MS` | Server-side statement cap (default 3000). |
| `BACKEND_BUILD` | Appears as `application_name` `them-backend@<build>` in `pg_stat_activity`; `GET /ops/metrics` `pg_pool` shows live pool counts. |
| `JWT_SECRET` | HMAC signing key for access/refresh tokens. Required. |
| `OPENAI_API_KEY` | Talk + realtime supplier. Required. |
| `APP_TOKEN` | App-level shared secret sent as `X-APP-TOKEN`. Required. |
| `AUTH_APPLE_AUDIENCE` | Sign in with Apple Services ID / bundle identifier used for mandatory `aud` validation. Required. |
| `APP_STORE_ISSUER_ID` | App Store Server API issuer. Required for IAP verify+credit (D011 fail-closed). Set in Render, not in them/Release.local.env. |
| `APP_STORE_KEY_ID` | App Store Server API key ID. Required for IAP verify+credit (D011 fail-closed). Set in Render, not in them/Release.local.env. |
| `APP_STORE_PRIVATE_KEY` | App Store Server API private key (p8). Required for IAP verify+credit (D011 fail-closed). Set in Render, not in them/Release.local.env. |
| `APP_STORE_BUNDLE_ID` | App Store bundle ID for transaction verification (io.them.them). Required for IAP verify+credit (D011 fail-closed). Set in Render, not in them/Release.local.env. |
| `PORT` | Listen port. Defaults to 3000. |

`AUTH_STORE_EMPTY_INIT_CONFIRMATION` is a first-deploy confirmation, not a
standing runtime setting. Set it to
`initialize-empty-canonical-auth-store-v1` only after verifying that the new
production database contains no users, then remove it after the first healthy
deploy.

App Store Server API secrets (`APP_STORE_ISSUER_ID`, `APP_STORE_KEY_ID`, `APP_STORE_PRIVATE_KEY`, `APP_STORE_BUNDLE_ID`) are set in the Render dashboard (backend/render.yaml declares them with `sync: false`), not in `them/Release.local.env`. The Xcode `Release.local.env` holds `DEVELOPMENT_TEAM_ID`, `APP_TOKEN_RELEASE`, and `OPENAI_API_KEY` for the client side only.

Optional but commonly set: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`,
`CORS_ALLOW_ORIGIN`, `API_SCHEMA_VERSION`, `REQUIRE_USER_AUTH`,
`AUTH_REQUIRE_EMAIL_VERIFIED`, `KNOWLEDGE_CARDS_FILE` (override path for `knowledge_cards.json`; image ships the 90-card `backend/knowledge_cards.json` by default, falling back to 30-card `FALLBACK_KNOWLEDGE_CARDS` on first load only if file absent — logged via `lifecycleLogger` as `knowledge_cards loaded {count, source}`).
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

The blueprint provisions a managed Postgres alongside the web service and
injects its private `connectionString` into `DATABASE_URL`. Never copy or
commit the generated database URL. Render also generates the backend-only
`JWT_SECRET`; provide the app-shared `APP_TOKEN` separately so it can match the
signed client configuration. Before the first deploy, provide the one-time
`AUTH_STORE_EMPTY_INIT_CONFIRMATION` described above. The paid web-service plan
runs `/app/ops/render_predeploy.mjs` on separate release compute before the new
container starts; any migration or auth-boundary failure leaves the prior
healthy deployment in place. Keep `numInstances: 1` until auth snapshot writes
are replaced by row-scoped transactions.

## Other targets

### Fly.io

The Dockerfile is fly-compatible. Generate a `fly.toml` with:

```sh
fly launch --no-deploy --dockerfile Dockerfile --copy-config=false
fly secrets set DATABASE_URL=... JWT_SECRET=... OPENAI_API_KEY=... APP_TOKEN=... AUTH_APPLE_AUDIENCE=... APP_STORE_ISSUER_ID=... APP_STORE_KEY_ID=... APP_STORE_PRIVATE_KEY=... APP_STORE_BUNDLE_ID=...
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
