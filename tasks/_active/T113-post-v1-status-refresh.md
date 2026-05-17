---
id: T113
title: Archive merged active tasks after V1 status pass
owner: codex
status: review
branch: codex/T113-post-v1-status-refresh
pillar: infra
v1_pillar: infra
v1_effect: keeps Claude and Codex pointed at the same V1 queue after PRs 309 and 310 merge
---

## Scope

Mark the recent merged task files that still say `status: review`, archive
every `status: merged` task that is still in `tasks/_active/`, regenerate
`TASKS.md`, and emit a coordination event so Claude's next poll starts from
the current state.

## Done When

- Recent Codex/Claude task rows for merged PRs 301, 302, 304, 305, 308, 309,
  and 310 are marked `merged`.
- Every `status: merged` task file is moved out of `tasks/_active/`.
- `TASKS.md` is regenerated from task files.
- `agent_next` still points Claude at Phase 7b talk-handler design before
  implementation.

## Verification

- `node scripts/build_tasks_md.mjs --write`
- `node scripts/agent_next.mjs --role=claude --limit=5 --no-events`
- `git diff --check`

Not run: iOS build/themTests or backend tests, because this is coordination
metadata only.
