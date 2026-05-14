---
id: T97-post-support-merge-refresh
title: Refresh coordination after support merge train
owner: codex
status: review
branch: codex/T97-post-support-merge-refresh
pillar: infra (coordination)
v1_pillar: infra
v1_effect: records the support merge train so Claude sees Phase 5b.3 as the next useful backend lane and no stale green PRs remain in the handoff
---

## Scope

Refresh coordination after the support merge train that landed
PRs #262, #264, #265, #266, and #267.

## Done when

- `docs/coordination.json` records those PRs as merged.
- Batch task files are marked `merged`.
- `docs/claude-inbox.md` and `docs/codex-inbox.md` point at
  the current next backend lane: Phase 5b.3 turn_commit.
- Agent event lane records the refresh.

## Verification

- `node scripts/coordination_state.mjs validate`
- `node scripts/agent_next.mjs --role=codex`
- `node scripts/pre_flight.mjs`
- `node --test scripts/pre_flight.test.mjs`
- `cd backend && npm run eval:v1-smokes`
