---
id: T-build-tasks-md-anchors
title: Add AUTOGEN anchors to TASKS.md + harden anchor matcher
owner: claude
status: review
branch: claude/T-build-tasks-md-anchors
pillar: infra (coordination)
---

## Scope

`scripts/build_tasks_md.mjs --write` is the canonical regenerator
for the active-tasks section of TASKS.md. PR #67 shipped the
regenerator but TASKS.md lacked the BEGIN/END AUTOGEN anchors, so
`--write` was a no-op.

This PR:

1. **Hardens the matcher**: `current.indexOf(BEGIN_ANCHOR)` happily
   matched the anchor strings inside the inline reference quoted in
   T-tasks-per-row's own description. Running `--write` once would
   overwrite from inside the description, corrupting unrelated rows.
   Switched to a `findStandaloneAnchor()` that requires the anchor
   to sit alone on its own line (surrounded by newlines or buffer
   ends). Inline mentions are now correctly ignored.

2. **Adds the anchors** as standalone lines at the bottom of
   TASKS.md (`<!-- BEGIN AUTOGEN active-tasks -->` /
   `<!-- END AUTOGEN active-tasks -->`).

3. **Runs `--write` once** to populate the autogen section with a
   mirror of every `tasks/_active/T-*.md` file. The hand-maintained
   table above stays the canonical source for now; the autogen
   block is a parallel view that lets future PRs incrementally
   migrate rows.

## Done when

`node scripts/build_tasks_md.mjs --write` overwrites only the
between-anchors region; inline mentions in descriptions don't
match; the autogen block is present at the end of TASKS.md.
