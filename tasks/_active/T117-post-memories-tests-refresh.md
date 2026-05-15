---
id: T117
title: Refresh queue after memories tests merge
owner: codex
status: in-progress
branch: codex/T117-post-memories-tests-refresh
pillar: infra
v1_pillar: infra
v1_effect: keeps the active queue clean after PR 316 and preserves Phase 7b as Claude's next lane
---

## Scope

Archive the merged T116 handoff refresh task and Claude's memories deeper-test
task, regenerate `TASKS.md`, and emit a short coordination event.

## Done When

- T116 is marked `merged` and moved to `tasks/_archive/`.
- T-memories-route-deeper-tests is marked `merged` and moved to
  `tasks/_archive/`.
- `agent_next` still points Claude at Phase 7b talk-handler implementation.

## Verification

- `node scripts/build_tasks_md.mjs --write`
- `node scripts/pre_flight.mjs --strict`
- `node scripts/agent_next.mjs --role=claude --limit=5 --no-events`
- `git diff --check`

Not run: iOS build/themTests or backend npm test, because this is coordination
metadata only.
