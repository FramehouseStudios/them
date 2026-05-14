---
id: T108
title: Refresh coordination after T107 schema lane guard merge
owner: codex
status: in-progress
branch: codex/T108-post-t107-refresh
pillar: infra
v1_pillar: infra
v1_effect: keeps TASKS accurate after the pre-flight schema lane guard merged
---

## Scope

Mark T107 merged after PR #303 landed and leave Claude's next command unchanged:
Phase 7a talk guard extraction remains the active backend priority.

## Done When

- T107 task status is `merged`.
- `TASKS.md` is regenerated from task files.
- No backend, iOS, schema, or app behavior files change.

## Verification

- `node scripts/build_tasks_md.mjs --write`
- `git diff --check`

Not run: iOS build/themTests or backend tests, because this is metadata only.
