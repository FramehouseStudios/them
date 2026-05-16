---
id: T144
title: Refresh coordination after T143 merge
owner: codex
status: in-progress
branch: codex/T144-refresh-after-t143
pillar: infra
v1_pillar: memory
v1_effect: records that the core-only memory export decision merged
---

## Scope

Refresh coordination after PR #345 merged so agent prompts know that the
core-only memory export decision is now canonical on `main`.

## Done When

- `docs/coordination.json` marks PR #345 merged.
- `docs/codex-claude-live-handoff.md` marks T143 merged.
- Claude's next action remains narrowing PR #94 to the V1 core-only memory
  export contract.
- Coordination validation passes.

## Verification

- Pending.
