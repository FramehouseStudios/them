---
id: T-decompose-phase8-ready
title: Phase 8 readiness — final sweep, index.js < 500 lines
owner: claude
status: planned
branch: (not opened — gated on Phase 7c finishing)
pillar: infra (backend architecture)
---

## Scope

Phase 8 is the final sweep. After Phases 0–7c land, `backend/index.js`
should contain only:

- Imports
- Dep configuration calls (configureUserStore, configureMemoryStore,
  configureOutboxStore, configureScreenplayStore, …)
- The startup boot sequence
- Mount calls for every route lib
- The Express app + listen() call
- A handful of small helpers that don't fit anywhere else

Target: **< 500 lines**, down from the current ~32,500 (and the
original 33,071).

## What Phase 8 actually does

1. Move any remaining inline helpers into the right `backend/lib/`
   modules.
2. Move the `methodNotAllowed` 405-handler block into a single
   `lib/method_not_allowed_routes.js`.
3. Consolidate the boot sequence into a clear linear flow.
4. Add a top-of-file table of contents comment listing every mount
   call with its lib file + line number.
5. Run the inline-route audit (`scripts/audit_inline_routes.mjs`)
   and confirm zero remaining inline routes.

## Verification

- `node --check backend/index.js` passes.
- `wc -l backend/index.js` < 500.
- `node scripts/audit_inline_routes.mjs` returns zero inline routes
  (the methodNotAllowed catch-alls are also moved).
- `cd backend && npm test` passes.
- `node scripts/pre_flight.mjs` returns zero findings.
- `node scripts/quality_gate.sh` passes (or the prior pass state).

## Gating

Gated on every prior phase merging. The final sweep is the easiest
to write but the most consequential to verify: any behavior change
that survived the prior phases would surface here.
