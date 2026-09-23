---
id: T81
title: Refresh coordination after PR #193/#194
owner: codex
status: merged
branch: codex/T81-refresh-after-pr193-194
pillar: infra (coordination)
---

## Scope

Record that support agent PR #193 merged the route-local parser cleanup,
support agent PR #194 merged the backend-index decomposition spec update, and
support agent PR #195 was closed as a stale duplicate coordination refresh.

## Done when

`docs/coordination.json`, `docs/codex-inbox.md`, the agent-event lane,
and `TASKS.md` agree that #193/#194 are merged, #195 is closed, and
the only remaining open support agent PRs are human-gated (#33, #63, #94,
#99). Coordination validation, agent-next, task generation, event tail,
and diff checks pass.
