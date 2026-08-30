---
id: T-preflight-task-archive-merged
title: pre-flight rule: warn when status:merged tasks linger in tasks/_active/
owner: support
status: merged
branch: support/T-preflight-task-archive-merged
pillar: infra
v1_pillar: infra
v1_effect: extends the pre-flight rule set so the task workbench doesn't drown in finished work — nudges merged-but-not-archived tasks toward tasks/_archive/, which this PR also establishes.
---

## Scope

Adds the `task-archive-merged` pre-flight rule plus the
`tasks/_archive/` directory with a README that documents the
convention. The rule fires on `tasks/_active/T*.md` files with
YAML front matter declaring `status: merged` whose first commit
on `main` is on or after the cutoff (2026-05-14T00:00:00Z).

Pre-rule files are grandfathered via git first-commit lookup —
the rule does NOT spam warnings for the ~98 existing
merged-in-active tasks shipped before the rule landed.

## Rule design

- File scope: `tasks/_active/T*.md` (support agent `T-` prefix or
  Codex `T<digit>` prefix) with YAML front matter.
- Trigger: `status: merged` declared in YAML.
- Grandfather logic, in order:
  1. Explicit `merged_at:` (YAML) or `Merged-At:` (body) ISO
     timestamp before the cutoff → silent.
  2. File's first git commit on `main` before the cutoff → silent.
  3. Otherwise → warn.
- If `git` is unavailable: silently skip (warn-only check should
  not break offline runs).
- Warn-only by default; `--strict` makes the rule fail the run.

## Files

- `scripts/pre_flight.mjs` — add `checkTaskArchiveMerged()` and
  wire it into the orchestration block.
- `scripts/pre_flight.test.mjs` — 6 tests:
  - fires on post-cutoff first commit + status:merged
  - grandfathers explicit pre-cutoff `merged_at` YAML
  - grandfathers body-line `Merged-At` pre-cutoff
  - skips `status: review`
  - skips files without YAML front matter
  - handles missing `git` silently
- `tasks/_archive/README.md` — convention doc explaining when to
  move tasks here, when not to, and how to add `merged_at:` for
  pre-rule grandfathering.

## Verification commands

```bash
node scripts/pre_flight.mjs
node --test scripts/pre_flight.test.mjs
```

All tests pass. Pre-flight prints 36 warnings against the
existing `_active/` backlog (tasks first committed on/after the
cutoff that lack archive metadata). These are actionable — a
follow-up cleanup PR can `git mv` them to `tasks/_archive/` in
one commit.

## What this PR does NOT do

- Move any of the 36 backlog files. That's a follow-up cleanup
  task that should batch through one PR per agent or as a Codex
  coordination refresh.
- Make the rule `--strict` mode default. Warn-only avoids
  breaking the pre-flight gate while the backlog is cleared.
- Touch `coordination.json` or `docs/support-inbox.md`. Pure
  rule + directory + README.

## Done when

- New check function lands in `scripts/pre_flight.mjs`.
- 6 new tests pass under `scripts/pre_flight.test.mjs`.
- `tasks/_archive/README.md` documents the convention.
- Pre-flight prints actionable warnings against the existing
  backlog (not noise — each line has a clear remedy).
