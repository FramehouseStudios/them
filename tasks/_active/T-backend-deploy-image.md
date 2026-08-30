---
id: T-backend-deploy-image
title: Containerize the backend and document a deploy recipe
owner: support
status: review
branch: support/backend-deploy-image
pillar: infra (enables all)
v1_pillar: ios
v1_effect: closes V1 'no deploy manifest in repo' gap (audit finding 2026-05-14); production builds are reproducible from `backend/Dockerfile` and `backend/render.yaml`, and refuse to boot without required env per `assertProductionEnv`.
---

## Scope

- Add `backend/Dockerfile` (Node 20, two-stage, non-root, tini PID 1)
  with healthcheck wired to `/realtime/health`.
- Add `backend/.dockerignore` to keep secrets and JSON dev stores out
  of the image.
- Add `backend/render.yaml` as one valid deploy target (host-agnostic
  image; same Dockerfile runs on Fly, ECS, Cloud Run).
- Add `backend/DEPLOY.md` as the deploy recipe.
- Add `assertProductionEnv()` boot guard in `backend/config.js`,
  wired from `backend/index.js` startup, with full coverage in
  `backend/tests/config_assert_production_env.test.mjs`.
- Bump default PBKDF2 iterations to OWASP 2023 minimum (600k) in
  `backend/lib/user_store.js`. Existing accounts unaffected — they
  keep their stored iteration count.

## Done when

- `node --test tests/config_assert_production_env.test.mjs` passes.
- `node --test tests/user_store.test.mjs tests/user_auth.test.mjs`
  passes.
- `backend/DEPLOY.md`, `backend/Dockerfile`, `backend/render.yaml`,
  and `backend/.dockerignore` exist and are referenced from
  follow-on PR description.
- A future deploy can follow `DEPLOY.md` end-to-end without external
  knowledge.
