---
id: T135
title: Refresh after Phase 7b talk-handler merge
owner: codex
status: in-progress
branch: codex/T135-refresh-after-phase7b
pillar: voice→scene
v1_pillar: talk
v1_effect: records that the Phase 7b backend talk-handler extraction is merged and moves the launch room to smoke/release gates
---

## Scope

Mark Claude PR #335 / Phase 7b merged in the coordination surfaces and clear
the stale rebase blocker from the agent queue.

## Done When

- `docs/coordination.json`, `docs/claude-inbox.md`, and the live handoff record
  PR #335 as merged.
- The event lane contains the PR #335 merge event.
- `agent_next` no longer tells Claude to work on Phase 7b.
- Coordination/pre-flight checks pass.

## Verification

- Pending.
