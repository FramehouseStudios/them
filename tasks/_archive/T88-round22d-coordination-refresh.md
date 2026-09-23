---
id: T88
title: Round 22d coordination refresh after V1 smoke fixture pack
owner: codex
status: merged
branch: codex/T88-round22d-coordination-refresh
pillar: infra
v1_pillar: infra
v1_effect: records the merged deterministic V1 smoke fixtures so support agent and Codex share the latest V1 test surface
---

## Scope

Refresh the repo-native coordination lane after #231 merged:

- #231 V1 smoke fixture pack for screenplay export, memory recall, and
  realtime failover.

## Done when

`docs/coordination.json`, `docs/codex-inbox.md`, the weekly event lane, and
`TASKS.md` reflect the current queue and smoke coverage.

## Verification

- `node scripts/build_tasks_md.mjs --write`
- `node scripts/coordination_state.mjs validate`
- `node scripts/agent_next.mjs --role=codex`
- `node scripts/agent_event.mjs tail --n=12`
- `git diff --check`
