---
id: T138
title: Refresh queue after Launch Doctor proof PRs
owner: codex
status: merged
branch: codex/T138-refresh-after-launch-proof-prs
pillar: mobile-first
v1_pillar: ios
v1_effect: clears stale Codex queue entries after Launch Doctor recorder and deterministic smoke proof merges
---

## Scope

Refresh the machine-readable coordination lane after PR #338 and PR #339
merged, so `agent_next` no longer points Codex at already-landed Launch Doctor
proof work.

## Done When

- `docs/coordination.json` marks PR #338 and PR #339 merged.
- The live event lane records the merge events.
- The handoff ledger tells support agent to stay in V1 smoke-failure support mode.
- `agent_next` and launch-room commands no longer point Codex at stale PR #338.

## Verification

- `node scripts/coordination_state.mjs validate` passed.
- `node scripts/agent_next.mjs --role=codex --limit=5 --no-events` passed and no longer points Codex at PR #338.
- `node scripts/v1_launch_room.mjs --role=codex` passed.
- `node scripts/v1_launch_room.mjs --role=support` passed.
- `node scripts/pre_flight.mjs --strict` passed.
- `git diff --check` passed.
