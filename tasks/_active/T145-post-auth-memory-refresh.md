---
id: T145
title: Refresh coordination after auth and memory export merges
owner: codex
status: review
branch: codex/T145-post-auth-memory-refresh
pillar: infra
v1_pillar: memory
v1_effect: records that PR #212 and PR #94 landed, clearing stale auth/export gates so V1 completion can focus on release config and manual smoke
---

## Scope

Refresh the supervisor ledger, coordination state, support agent inbox, and launch
handoff after Codex merged PR #212 and PR #94.

## Done When

- `docs/coordination.json` marks PR #212 and PR #94 merged.
- Stale #212/#94 human-gated blockers are removed from the coordination queue.
- `docs/live-handoff.md` tells support agent that auth extraction and
  core-only memory export are merged.
- `docs/support-inbox.md` keeps support agent in V1 smoke-failure support mode.
- Coordination validation passes.

## Verification

- `node scripts/coordination_state.mjs validate` passed.
- `node scripts/agent_next.mjs --role=support --limit=5` passed and shows
  support agent in V1 smoke-failure support mode with #94/#212 merged.
- `node scripts/agent_next.mjs --role=codex --limit=10` passed.
- `node scripts/v1_launch_room.mjs --role=support` passed and points support agent at
  manual-smoke failure support.
- `node scripts/pre_flight.mjs --strict` passed.
- `git diff --check` passed.
