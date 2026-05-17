---
id: T111
title: Refresh coordination after Phase 7a and realtime fallback proof
owner: codex
status: merged
branch: codex/T111-post-phase7a-refresh
pillar: infra
v1_pillar: infra
v1_effect: keeps Claude pointed at the next talk-pipeline V1 step after Phase 7a merged
---

## Scope

Mark Phase 7a and T110 merged, regenerate `TASKS.md`, and update
`docs/claude-inbox.md` so Claude's next backend move is Phase 7b design before
implementation.

## Done When

- `T-decompose-phase7a-talk-state` is marked `merged`.
- `T110` is marked `merged`.
- Claude inbox priority 1 is Phase 7b handler design, not already-merged Phase
  7a.
- `TASKS.md` is regenerated.

## Verification

- `node scripts/build_tasks_md.mjs --write`
- `git diff --check`
- `node scripts/agent_next.mjs --role=claude --limit=5 --no-events`

Not run: iOS build/themTests or backend tests, because this is coordination
metadata only.
