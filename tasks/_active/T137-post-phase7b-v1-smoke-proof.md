---
id: T137
title: Refresh deterministic V1 smoke proof after Phase 7b
owner: codex
status: review
branch: codex/T137-post-phase7b-v1-smoke-proof
pillar: voice→scene
v1_pillar: talk
v1_effect: refreshes deterministic V1 smoke proof after the backend talk-handler extraction and Launch Doctor recorder landed
---

## Scope

Run the deterministic V1 smoke pack on current `main` after Phase 7b and the
Launch Doctor recorder merge, then update the proof artifact with the latest
result.

## Done When

- `backend` deterministic V1 smoke pack passes on the current branch.
- `docs/v1-deterministic-smoke-proof.md` records the new verification time,
  branch, and result.
- The task row records exactly what was run and what was not run.

## Verification

- `cd backend && npm run eval:v1-smokes` passed.
- `node scripts/coordination_state.mjs validate` passed.
- `node scripts/pre_flight.mjs --strict` passed.
- `git diff --check` passed.
- Not run: Xcode build/tests; this proof refresh changes docs/task state only.
