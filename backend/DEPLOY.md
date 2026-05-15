# io.them backend — deploy recipe

This is the single source of truth for deploying the backend. It assumes the
image is built from [`backend/Dockerfile`](Dockerfile) and the production
runtime requires the env vars enforced by `assertProductionEnv()` in
[`backend/config.js`](config.js).

## Pre-flight (every deploy)

1. **Migrations are up to date.**

   Inspect `backend/migrations/` and confirm every `*.sql` has been applied
   to the production Postgres instance. New migrations need to land before
   code that depends on them.

2. **Quality gate is green.**

   ```sh
   cd backend
   npm test
   npm run eval:gate
   ```

   Both must pass. `eval:gate` requires `OPENAI_API_KEY` (see also
   `docs/ci-openai-secret-fix.md` if CI is failing).

3. **No legacy JSON store will be loaded.**

   Production must run with `DATABASE_URL` set. The
   `persistence_adapter.js` factory picks Postgres when `DATABASE_URL` is
   present and the boot-time guard now refuses to start without it.

## Required production environment

| Var | Purpose |
|-----|---------|
| `NODE_ENV=production` | Enables `REQUIRE_APP_TOKEN`, `REQUIRE_CLIENT_TOKEN`, and the boot-time env guard. |
| `DATABASE_URL` | Postgres connection string. Required. |
| `JWT_SECRET` | HMAC signing key for access/refresh tokens. Required. |
| `OPENAI_API_KEY` | Talk + realtime supplier. Required. |
| `APP_TOKEN` | App-level shared secret sent as `X-APP-TOKEN`. Required. |
| `PORT` | Listen port. Defaults to 3000. |

Optional but commonly set: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`,
`AUTH_APPLE_AUDIENCE`, `AUTH_APPLE_JWT_PUBLIC_KEY`, `CORS_ALLOW_ORIGIN`,
`API_SCHEMA_VERSION`, `REQUIRE_USER_AUTH`, `AUTH_REQUIRE_EMAIL_VERIFIED`.

The boot will throw a multi-line error listing every missing var; the
process will not start.

## Render (default target — see `render.yaml`)

```sh
# First-time setup
render blueprint launch render.yaml

# Subsequent deploys
git push origin main
# Render builds the Dockerfile and runs the new image after the health
# check at /realtime/health responds 200.
```

The blueprint provisions a managed Postgres alongside the web service. After
the first launch, copy the generated `DATABASE_URL` into the service env
vars (Render does not auto-link the two on the free plan).

## Other targets

### Fly.io

The Dockerfile is fly-compatible. Generate a `fly.toml` with:

```sh
fly launch --no-deploy --dockerfile Dockerfile --copy-config=false
fly secrets set DATABASE_URL=... JWT_SECRET=... OPENAI_API_KEY=... APP_TOKEN=...
fly deploy
```

### Self-hosted (legacy `run.production.sh`)

`run.production.sh` still works for a local-style deploy that sources
`.env.production`. Prefer the container path for any shared environment.

## Rollback

Render: revert the deploy in the dashboard. The previous image is kept.
Fly: `fly releases list && fly releases rollback <version>`.

The backend is stateless except for Postgres. As long as the database
schema is compatible, rolling the image back is safe.

## Smoke after deploy

```sh
curl -fsS "$BASE_URL/realtime/health"
# expect: 200 with { ok: true, ... }
```

Then run the iOS V1 manual smoke from `docs/runbook-v1-smoke.md` against
the new backend.
