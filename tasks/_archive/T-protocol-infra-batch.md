---
id: T-protocol-infra-batch
title: Tighten backend extraction protocol helpers
owner: support
status: merged
branch: support/T-protocol-infra-batch
pillar: infra
v1_pillar: infra
v1_effect: AGENTS.md live-event lane reminder + backend/lib/README.md onboarding + audit script + canon-strict comment
---

## Scope

Add small support artifacts that make future backend extraction work cheaper:

- `backend/lib/README.md` documents the route extraction pattern.
- `scripts/audit_inline_routes.mjs` lists remaining inline live routes and
  separates method-not-allowed guards from priority counts.
- `scripts/quality_gate.sh` clarifies that canon eval failures already stop
  the gate through shell strict mode.
- `AGENTS.md` points agents at the event lane.

## V1 effect

Infrastructure for the V1 talk/realtime/screenplay checklist items: backend
route work should become easier to audit without distracting Codex from iOS
product work.

## Done when

The audit script runs in text and JSON mode, method guards are not counted as
live routes by default, and the docs avoid citing blocked auth work as accepted
precedent.

## Verification

Run:

- `node --check scripts/audit_inline_routes.mjs`
- `node scripts/audit_inline_routes.mjs`
- `node scripts/audit_inline_routes.mjs --json`
- `git diff --check`
