# tasks/_archive — landed-and-shipped work

This directory holds task files whose work has merged into `main`
and whose lane is no longer active. Moving a merged task here keeps
`tasks/_active/` as the live workbench and prevents the rollups in
`scripts/agent_next.mjs` / `scripts/v1_status.mjs` from drowning in
finished work.

## When to move a task here

Move `tasks/_active/T-<id>.md` → `tasks/_archive/T-<id>.md` when:

- the PR or PRs the task tracks have merged into `main`, AND
- there is no follow-up sub-phase or rebase the task should keep
  pointing at.

A task with `status: merged` left in `_active/` triggers the
`task-archive-merged` pre-flight finding for any task first
committed on or after 2026-05-14 (the day the rule landed). The
rule grandfathers earlier merged-in-active tasks so the noise from
the pre-rule backlog doesn't drown out new findings — those files
remain valid history and can be archived in a follow-up cleanup PR.

## What goes in the archive

- Task files with `status: merged` whose PR landed on `main`.
- Decomposition phase task files after the phase merges
  (e.g. `T-decompose-phase6-memories.md` once Phase 6 lands).
- Schema-doc task files after the doc lands on `main`.

## What does NOT go here

- Files with `status: review` — those stay in `_active/` until
  merge.
- Files with `status: in-progress` / `ready-for-claude` / `planned`
  — live work always stays in `_active/`.
- Coord-refresh task files where the refresh is currently in
  flight — those stay in `_active/` until they land.
- Sub-design notes in `tasks/_proposals/`. Those have a separate
  lifecycle (review → merge as a design note; they don't move to
  `_active/` unless an implementation task carries the same id).

## How to move

```bash
git mv tasks/_active/T-foo.md tasks/_archive/T-foo.md
# Add a merged_at field to the YAML front matter if the rule
# requires it (post-2026-05-14 cutoff). Example:
#   merged_at: 2026-05-15T12:00:00Z
git commit -m "archive: T-foo (merged in #NNN)"
```

The pre-flight rule never rejects the move — it only flags
missing archives. A bulk cleanup PR can `git mv` many files at
once with a single commit; reviewers shouldn't need to re-evaluate
each task's body.

## Pre-flight rule shape

The `task-archive-merged` rule in `scripts/pre_flight.mjs`:

- File scope: `tasks/_active/T*.md` with YAML front matter.
- Fires when `status: merged` AND the file's first commit on
  `main` is on or after `2026-05-14T00:00:00Z`, unless an explicit
  `merged_at:` (YAML) or `Merged-At:` (body) timestamp before the
  cutoff is present.
- Warn-only by default; `--strict` fails the run.
- If `git` is unavailable, the rule silently skips (does not
  break offline runs).
