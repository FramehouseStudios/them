---
id: T-backend-api-version-healthz
title: Add /api/version and /healthz orchestrator endpoints
owner: support
status: merged
branch: support/backend-api-version-healthz
pillar: infra (enables all)
v1_pillar: infra
v1_effect: closes deploy-readiness gap; orchestrators (Render/Fly/K8s) get a real readiness probe (/healthz with DB ping) and clients get a lightweight version probe (/api/version) distinct from the heavier /health.
---

## Scope

- `backend/lib/api_version_route.js` + tests: dependency-free `GET /api/version`.
- `backend/lib/healthz_route.js` + tests: orchestrator readiness probe pinging persistence.
- `ping()` method added to both `persistence_json.js` and `persistence_postgres.js`.
- Routes wired in `backend/index.js`.

## Done when

- `node --test tests/api_version_route.test.mjs tests/healthz_route.test.mjs` green.
- `backend/Dockerfile` HEALTHCHECK can point to `/healthz` instead of
  `/realtime/health` (HEALTHCHECK switch is a follow-up PR).
- Full backend `npm test` passes.
