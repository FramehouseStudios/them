---
id: T145
title: Refresh coordination after auth and memory export merges
owner: codex
status: in-progress
branch: codex/T145-post-auth-memory-refresh
pillar: infra
v1_pillar: memory
v1_effect: records that PR #212 and PR #94 landed, clearing stale auth/export gates so V1 completion can focus on release config and manual smoke
---

## Scope

Refresh the supervisor ledger, coordination state, Claude inbox, and launch
handoff after Codex merged PR #212 and PR #94.

## Done When

- `docs/coordination.json` marks PR #212 and PR #94 merged.
- Stale #212/#94 human-gated blockers are removed from the coordination queue.
- `docs/codex-claude-live-handoff.md` tells Claude that auth extraction and
  core-only memory export are merged.
- `docs/claude-inbox.md` keeps Claude in V1 smoke-failure support mode.
- Coordination validation passes.

## Verification

- Pending.
