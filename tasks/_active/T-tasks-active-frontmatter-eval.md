---
id: T-tasks-active-frontmatter-eval
title: Validate every tasks/_active/T-*.md front-matter
owner: claude
status: review
branch: claude/T-tasks-active-frontmatter-eval
pillar: infra (coordination)
---

## Scope

Sits next to PR #107's `scripts/tasks_sync_check.mjs` (which
validates the TASKS.md ↔ tasks/_active/ row mapping). This script
validates the **content** of each task file in `tasks/_active/`.

Two accepted layouts:

1. **YAML front matter** (Claude convention):

   ```yaml
   ---
   id: T-<slug>
   title: ...
   owner: claude | codex | human
   status: ready | in-progress | review | merged | blocked-...
   branch: ...
   ---
   ```

2. **Legacy header** (Codex convention for T42–T68):

   ```
   # T49 — Post-T48 Coordination Refresh

   Owner: codex
   Status: in-progress
   Branch: codex/T49-...
   ```

Filename matching is lenient: `<id>.md` or `<id>-<slug>.md` both
pass (Codex's `id: T60` + filename `T60-export-formats-picker.md`
is accepted alongside Claude's strict `id == filename` convention).

Default mode prints findings + exits 0. `--strict` exits 1 on any
finding — flip to that in CI once both conventions are normalized.

## Done when

`node scripts/tasks_active_frontmatter_eval.mjs` exits 0 against
the current `tasks/_active/` (40 files); smoke test exits 0 in
both modes.
