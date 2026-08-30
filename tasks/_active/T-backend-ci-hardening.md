---
id: T-backend-ci-hardening
title: CI secret-format validation + Dockerfile build gate
owner: claude
status: review
branch: claude/backend-ci-hardening
pillar: infra (enables all)
v1_pillar: infra
v1_effect: closes V1 CI gap; malformed OPENAI_API_KEY now fails fast with a clear message, and Dockerfile regressions are caught before deploy.
---

## Scope

- `quality-gate.yml`: new "Validate OPENAI_API_KEY format" step that hits
  `api.openai.com/v1/models` once and fails the gate with a one-line
  error referencing `docs/ci-openai-secret-fix.md`.
- New `docker-build.yml`: PRs touching `backend/Dockerfile`, deps, or
  the image build context build the image and verify
  `assertProductionEnv` actually fires.

## Done when

- A PR that bumps a `backend/lib/*` file triggers `docker-build`.
- A malformed `OPENAI_API_KEY` secret now reports a one-line CI error.
- `backend/.env.example` exists and documents every var.
