---
id: T95-schema-doc-drift-gate
title: Gate schema docs against backend field drift
owner: codex
status: merged
branch: codex/T95-schema-doc-drift-gate
pillar: infra
v1_pillar: infra
v1_effect: prevents stale schema documentation from misleading iOS and backend integration work
---

## Scope

- Add a pre-flight guard that catches schema documentation using field names or status values that no longer match the canonical backend implementation.
- Cover the current drift class that blocked schema docs batch 3, especially outbox event docs vs `backend/lib/outbox_store.js`.
- Keep the rule warn-only in normal pre-flight mode and strict-failing under `--strict`.

## Done When

- A schema doc that describes outbox events with stale snake_case/legacy status fields is reported before review.
- Clean schema docs and repos without schema docs still pass.
- The guard is covered by local script tests.

## Verification

- `node --check scripts/pre_flight.mjs`
  - Passed.
- `node --test scripts/pre_flight.test.mjs`
  - Passed, 35/35.
- `node scripts/pre_flight.mjs`
  - Passed, no findings.
- `git diff --check`
  - Passed.
