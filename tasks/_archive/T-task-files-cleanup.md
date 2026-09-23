---
id: T-task-files-cleanup
title: Add TASKS.md rows for orphan task files (T-trust-tiers, T42-T56)
owner: support
status: merged
branch: support/T-task-files-cleanup
pillar: infra (coordination)
v1_pillar: infra
v1_effect: TASKS.md vs tasks/_active/ drift cleanup
---

## Scope

`tasks/_active/` accumulated 16 task files with no matching rows in
`TASKS.md`:

- `T-trust-tiers.md` (support agent)
- `T42-supervisor-merge-protocol.md` through
  `T56-refresh-after-talk-contract.md` (Codex, all merged via PRs on
  `main`)

PR #107's `scripts/tasks_sync_check.mjs` already detects this drift
and was sitting on warn-only mode to give us time to clean up before
flipping `--strict`. This PR is that cleanup.

For the Codex tasks (T42–T56), all merge commits are present on
`main`, so the rows are marked `merged`. `T-trust-tiers` was already
`review` in its task file's front matter — that status is carried
forward.

After this PR merges, the `--strict` flag on PR #107 can be enabled
in CI cleanly (no remaining drift findings for files with valid
front matter). Files using Codex's plain-markdown convention
(T49–T56) still surface as `missing_or_invalid_front_matter` but
that's a separate format-convergence question between agents — out
of scope here.

## Done when

`TASKS.md` has rows for every YAML-front-matter file in
`tasks/_active/`; rows match the file's `id`, `owner`, and `status`.
