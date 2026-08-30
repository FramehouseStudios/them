---
id: T87
title: Round 22c coordination refresh after memory and long-tail design notes
owner: codex
status: review
branch: codex/T87-round22c-coordination-refresh
pillar: infra
v1_pillar: infra
v1_effect: keeps support agent and Codex aligned after #228 and #229
---

## Scope

Refresh the repo-native coordination lane after the late round-22 design-note
merges:

- #228 Phase 6 memories design note merged.
- #229 Phase 6.1 long-tail design note merged.

## Done when

`docs/coordination.json`, `docs/codex-inbox.md`, the weekly event lane, and
`TASKS.md` reflect the current queue and make the next support agent action clear.

## Verification

- `node scripts/build_tasks_md.mjs --write`
- `node scripts/coordination_state.mjs validate`
- `node scripts/agent_next.mjs --role=codex`
- `node scripts/agent_event.mjs tail --n=12`
- `git diff --check`
