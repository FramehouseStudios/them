# tasks/

Per-row task files for `TASKS.md`. Each currently-active task lives in
`tasks/_active/<task-id>.md`. `scripts/build_tasks_md.mjs` reads these
files and renders the quick-view table + detail blocks so two agents
editing different tasks never collide on the same line of
`TASKS.md`.

## Why

Pre-existing pattern was one shared `TASKS.md` table. Two agents
touching adjacent rows produced merge conflicts on every refresh. The
conflicts were never substantive — they were just two rows landing in
the same hunk. The per-row layout removes that class of conflict
entirely.

## File shape

`tasks/_active/T-<slug>.md`:

```markdown
---
id: T-<slug>            # must match the filename without `.md`
title: <one-line title>
owner: support | codex | human
status: ready | ready-for-support | in-progress | review | merged | blocked-<id>
branch: <branch-name or - if not yet>
pillar: <one of the north-star pillars or "infra (enables all)">
---

## Scope
<one paragraph>

## Done when
<one paragraph or short bullet list>
```

The YAML-style front matter is parsed by the regenerator. The body is
preserved verbatim into the detail block in the generated `TASKS.md`.

## Workflow

1. Claim a row: create `tasks/_active/T-<slug>.md` with `status: in-progress`.
2. Update the row by editing the file — status flips, blockers, scope
   tweaks all happen inside the per-row file.
3. When the task lands on `main`, the regenerator moves the entry into
   the historical "Completed" section (the per-row file may be
   deleted or kept as an archive; archival is a follow-up decision).
4. Run `node scripts/build_tasks_md.mjs --print` to see the rebuilt
   quick-view table. Run `--write` to actually overwrite the active
   section of `TASKS.md`. Until the flip is formalized, `TASKS.md`
   remains the source of truth; this PR ships the infrastructure for
   the eventual migration.

## Migration plan

This PR introduces the layout without making `TASKS.md` a build
artifact. Adoption is opt-in: agents can write to per-row files OR
the table directly. A follow-up PR will flip the canonical source
once enough rows have moved across.
