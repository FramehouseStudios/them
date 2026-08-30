---
id: T80
title: Refresh coordination after PR #191/#192
owner: codex
status: merged
branch: codex/T80-refresh-after-pr192
pillar: infra (coordination)
---

## Scope

Record the post-round-17 cleanup after Codex closed stale support agent
coordination PR #191 and merged support agent PR #192, the Phase 2a
backend-index decomposition for read-only `/screenplay/projects/*`
routes.

## Done when

`docs/coordination.json`, `docs/codex-inbox.md`, the agent-event lane,
and `TASKS.md` agree that #191 is closed, #192 is merged, and the only
remaining open support agent PRs are human-gated (#33, #63, #94, #99).
Coordination validation, agent-next, task generation, event tail, and
diff checks pass.
