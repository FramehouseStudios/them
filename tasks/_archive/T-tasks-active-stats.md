---
id: T-tasks-active-stats
title: At-a-glance counts over tasks/_active/
owner: support
status: merged
branch: support/T-tasks-active-stats
pillar: infra (coordination)
---

## Scope

Quick "how much is in flight?" report over `tasks/_active/`:

```
$ node scripts/tasks_active_stats.mjs
tasks_active_stats: 41 task file(s)

by owner:
    26  codex
    15  support

by status:
    17  merged
    14  review
    10  in-progress

by pillar:
     9  infra (enables all)
     ...
```

`--json` emits the same data as machine-readable JSON for CI /
inbox automation.

Sits next to `tasks_sync_check.mjs` (PR #107) and
`tasks_active_frontmatter_eval.mjs` (PR #155) — the same parse-the-
front-matter loop, different report. Skips files that don't parse
(YAML front-matter or `# Tn — title` header) and surfaces them as
`unrecognized` instead of crashing.

Useful for inbox refresh PRs ("queue has 26 codex tasks, 15
support") and for the human's at-a-glance read.

## Done when

`node scripts/tasks_active_stats.mjs` prints a valid summary;
`--json` emits parseable JSON; smoke test green.
