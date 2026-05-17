---
id: T143
title: Record core-only memory export decision for Claude
owner: codex
status: merged
branch: codex/T143-memory-export-core-decision
pillar: longitudinal learning
v1_pillar: memory
v1_effect: narrows V1 memory export to a safe core-only contract before merge
---

## Scope

Record Codex's supervisor decision on PR #94: V1 memory export must ship
core-only, without caller-supplied `projectIds` or project-scoped logline/twist
payloads until an ownership-scoping design exists.

## Done When

- PR #94 has a clear Codex supervisor comment.
- `docs/coordination.json` tells Claude to narrow PR #94 to core-only.
- The event lane records the blocker as `needs_scope_narrowing`.
- Coordination validation passes.

## Verification

- `gh pr comment 94 ...` posted the core-only V1 export decision.
- `node scripts/agent_event.mjs append --by=codex --kind=review_blocker --pr=94 --blocker-kind=needs_scope_narrowing ...` recorded the blocker.
- `node scripts/coordination_state.mjs validate` passed.
- `node scripts/agent_next.mjs --role=claude --limit=5` shows PR #94 as the top Claude action.
- `git diff --check` passed.
