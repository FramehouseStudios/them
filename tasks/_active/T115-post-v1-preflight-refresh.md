---
id: T115
title: Refresh queue after V1 preflight and schema guard
owner: codex
status: in-progress
branch: codex/T115-post-v1-preflight-refresh
pillar: infra
v1_pillar: infra
v1_effect: keeps Claude pointed at Phase 7b after PRs 312 and 313 merged
---

## Scope

Archive the merged T114 V1 preflight task and Claude's
T-preflight-schema-doc-missing-endpoint task, regenerate `TASKS.md`, and emit
a coordination event that restates the next Claude lane.

## Done When

- T114 is marked `merged` and moved to `tasks/_archive/`.
- T-preflight-schema-doc-missing-endpoint is marked `merged` and moved to
  `tasks/_archive/`.
- `TASKS.md` is regenerated.
- `agent_next` still points Claude to Phase 7b talk-handler design before
  implementation.

## Verification

- `node scripts/build_tasks_md.mjs --write`
- `node scripts/pre_flight.mjs --strict`
- `node scripts/agent_next.mjs --role=claude --limit=5 --no-events`
- `npm run v1:status`
- `git diff --check`

Not run: iOS build/themTests or backend npm test, because this is coordination
metadata only.
