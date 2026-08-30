---
id: T-tasks-sync-check
title: CI script to detect tasks/_active vs TASKS.md drift
owner: support
status: merged
branch: support/T-tasks-sync-check
pillar: infra (coordination)
---

## Scope

`scripts/tasks_sync_check.mjs` reads every `tasks/_active/T-*.md`
file and checks that:

1. The filename matches its front-matter `id`.
2. There's a row in `TASKS.md` with the same `id`.
3. The row's status and owner columns match the task file's
   front-matter (when both are present).

Drift surfaces as a list of findings. Default mode prints findings
and exits 0 (safe to wire into observability without breaking CI
today). `--strict` exits non-zero when drift exists — flip to that
once the current drift is cleaned up.

Also adds `scripts/tasks_sync_check.test.mjs` which execs the script
in both modes and asserts the exit codes match the documented
contract, so a future refactor of the parser can't silently break
the gate.

## Done when

`node scripts/tasks_sync_check.mjs` runs cleanly in both modes;
`node --test scripts/tasks_sync_check.test.mjs` green.
