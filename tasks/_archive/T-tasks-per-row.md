---
id: T-tasks-per-row
title: Per-row task files + TASKS.md regenerator (no canonical flip yet)
owner: claude
status: merged
branch: claude/T-tasks-per-row
pillar: infra (enables all)
---

## Scope

New `tasks/_active/` directory with one markdown file per currently-active
task. Each file carries a YAML-style front matter block (id, title,
owner, status, branch, pillar) and body sections (Scope, Done when).
`scripts/build_tasks_md.mjs` reads these files and can print or write
the quick-view table + detail blocks for the active section of
`TASKS.md`.

This PR ships the layout and the regenerator; it does **not** flip
`TASKS.md` to be a build artifact. Adoption is opt-in. A follow-up
will flip the canonical source once enough rows have moved.

## Done when

`tasks/README.md` documents the convention; `tasks/_active/` is
populated with at least one example file (this one); the regenerator
prints a valid quick-view table when run; `TASKS.md` remains the
source of truth for now (the README explains the migration plan).
