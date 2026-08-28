---
id: T-screenplay-idor-regression
title: Prove cross-account screenplay project isolation
owner: codex
status: review
branch: codex/T-screenplay-idor-regression
pillar: infra
v1_pillar: screenplay
v1_effect: prevents a signed-in user from reading or mutating another writer's private screenplay by guessing its project id
---

## Scope

- Port the useful test-only IDOR coverage from stale launch-safety PR #364
  onto the current release line without resurrecting its divergent branch.
- Create two real accounts against the spawned backend and seed private title,
  outline, comment, and draft sentinels for the owner.
- Prove a second valid account cannot enumerate or directly read the project,
  cannot mutate it through any current project write route, and cannot bypass
  ownership with a spoofed `X-User-Id` header.
- Prove an anonymous header-only attacker remains unauthenticated and rejected
  writes leave the owner's project unchanged.

## Done When

- Project, outline, collaborator, and comment reads return `404` cross-account
  without private content in the response.
- Outline, scene, beat, collaborator, comment, and version writes return `404`
  cross-account; project DELETE remains an exact `405` with `Allow: GET`.
- The owner still sees the original title and draft, with exactly one version
  and one comment and no attacker content.
- Focused and full backend tests, strict pre-flight, task-frontmatter
  validation, syntax checks, and `git diff --check` pass.

## Verification

- `cd backend && node --test tests/screenplay_project_idor.integration.test.mjs`
  - Passed 1/1.
- `cd backend && npm test`
  - Passed 1235, skipped 1, failed 0.
- `node scripts/pre_flight.mjs --strict`
  - Passed with no findings.
- `node scripts/tasks_active_frontmatter_eval.mjs --strict`
  - Passed 95 task files.
- `node --check backend/tests/screenplay_project_idor.integration.test.mjs`
  - Passed.
- `git diff --check`
  - Passed.
