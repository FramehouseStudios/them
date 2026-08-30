---
id: T-preflight-task-id-matches-filename
title: Pre-flight rule task-id-mismatch-filename
owner: support
status: merged
branch: support/T-preflight-task-id-matches-filename
pillar: infra (pre-flight rule)
v1_pillar: infra
v1_effect: closes the silent cross-reference-break gap — a task file with `id: T-foo` saved as `T-bar.md` would silently break any reference from coordination.json / support-inbox / sibling task files
---

## Scope

Adds a new pre-flight check under `scripts/pre_flight.mjs`:

- `task-id-mismatch-filename` — task file declares `id: <X>` in
  YAML front matter but the filename basename is `<Y>.md`.

Grandfather: files without YAML front matter; files without an
`id:` field (separate concern).

## Why

`coordination.json`, `support-inbox.md`, and sibling task files
all cross-reference each other by task id. A typo where the
file is named `T-foo-fix.md` but the front matter says
`id: T-foo-fixed` silently breaks every cross-reference and
status rollup.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: closes the silent cross-reference-break gap. Every
  task id in YAML front matter must match the filename basename.
  Mismatches were previously undetected and would break
  coordination rollups in surprising ways.`

## Verification

- `node scripts/pre_flight.mjs` → 0 new findings on current main
  (all active tasks have matching id + filename).
- `node --test scripts/pre_flight.test.mjs` → fixture coverage for
  mismatch, match, and legacy non-YAML grandfathering.
- Rule compares `id:` field value vs `path.basename(file, ".md")`.

## Done when

Rule lands; pre-flight clean on current main.

## Followups (not in this PR)

- Companion `task-missing-id` rule that flags tasks with YAML
  front matter but no `id:` field at all. (Most task files do
  declare an id today, but the rule would harden the discipline.)
