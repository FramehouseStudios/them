---
id: T72
title: Refresh queue after supervisor merge train
owner: codex
status: merged
branch: codex/T72-batch-refresh
pillar: infra (coordination)
---

## Scope

Record the May 12 supervisor merge train so Codex and Claude share one
current source of truth. This task updates the task queue, coordination
state, and reciprocal inboxes after the merged backend/eval PRs, newly
blocked canon-eval PRs, and stale inbox-only closures.

## Done when

`TASKS.md`, `docs/coordination.json`, `docs/codex-claude-live-handoff.md`,
`docs/claude-inbox.md`, and `docs/codex-inbox.md` agree on which PRs
merged, which PRs remain blocked, and which app-facing backend contracts
are ready for Codex. Coordination validation, agent-next commands,
task-frontmatter checks, task stats, task generation, and diff checks pass.
