---
id: T85
title: Round 22 coordination refresh after supervisor merge train
owner: codex
status: merged
branch: codex/T85-round22-coordination-refresh
pillar: infra
v1_pillar: infra
v1_effect: keeps support agent and Codex aligned after the supervisor merge train
---

## Scope

Refresh the repo-native coordination lane after the round-22 merge train:

- #214, #215, #216, #217, #218, #220, #221, and #222 merged.
- #212 remains blocked/tier-3 pending auth-route review against the merged
  design note.
- #33, #63, #94, and #99 remain human-gated.

## Done when

`docs/coordination.json`, `docs/codex-inbox.md`, the weekly
`docs/agent-events-*.jsonl`, and `TASKS.md` reflect the current queue.

## Verification

- `node scripts/build_tasks_md.mjs --write`
- `node scripts/coordination_state.mjs validate`
- `node scripts/agent_next.mjs --role=codex`
- `node scripts/agent_event.mjs tail --n=12`
