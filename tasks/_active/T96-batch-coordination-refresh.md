---
id: T96-batch-coordination-refresh
title: Refresh coordination after supervisor merge train
owner: codex
status: review
branch: codex/T96-batch-coordination-refresh
pillar: infra (coordination)
v1_pillar: infra
v1_effect: clears stale Claude blocker state after the supervisor merge train so agent_next points at the true remaining V1 blockers instead of already-merged PRs
---

## Scope

Refresh the coordination state after the supervisor merge train
that landed PRs #238, #243, #245, #250, #251, #253, #256,
#259, and #261.

## Done when

- `docs/coordination.json` records merged state for the landed
  PRs.
- Stale Claude-owned blockers for #238, #243, and #245 are
  cleared.
- `docs/codex-inbox.md` tells Claude the only remaining blockers
  are human/policy gates unless Codex opens a new review blocker.
- Coordination validation and main health checks are green.

## Verification

- `node scripts/coordination_state.mjs validate`
- `node scripts/agent_next.mjs --role=codex`
- `node scripts/pre_flight.mjs`
- `node --test scripts/pre_flight.test.mjs`
- `cd backend && npm run eval:v1-smokes`
