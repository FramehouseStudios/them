---
id: T-coordination-state-cli-validate
title: Add `validate` subcommand to coordination_state.mjs
owner: claude
status: merged
branch: claude/T-coordination-state-cli-validate
pillar: infra (coordination)
---

## Scope

PR #117 added `scripts/coordination_state_schema_check.mjs` — a
standalone validator for `docs/coordination.json`. This PR surfaces
the same checks as a `validate` subcommand on the existing
`coordination_state.mjs` CLI, next to `read` / `open-prs` /
`blockers` / `decisions` / mutate commands.

```
node scripts/coordination_state.mjs validate
# → "coordination_state validate: OK (N open PRs, M blockers, K decisions)"
# or exit 1 with a per-finding diff
```

Same invariant set as the standalone schema-check:
- `schemaVersion` is a number >= 1
- `updatedAt` is ISO-8601
- `updatedBy` is non-empty
- `openPullRequests`, `blockers`, `decisionsPending` are arrays
- Per-PR: `number` (int), `title`, `owner ∈ {claude, codex, human}`,
  `tier ∈ {1, 2, 3}`, `status`, `branch`
- Per-blocker: `id`, `owner`, `summary`

Strict by default (no `--strict` flag here, because this state file
should always be the canonical source of truth — there's no "warn"
mode for it).

## Done when

`node scripts/coordination_state.mjs validate` exits 0 against
current main; smoke test covers happy path + unknown-command path;
remains additive (no behavior change to existing subcommands).
