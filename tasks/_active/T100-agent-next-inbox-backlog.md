---
id: T100-agent-next-inbox-backlog
title: Surface Claude inbox backlog in agent_next
owner: codex
status: review
branch: codex/T100-agent-next-inbox-backlog
pillar: infra (coordination)
v1_pillar: infra
v1_effect: makes the next Claude backend lane visible from agent_next even when all open PRs are parked behind human gates
---

## Scope

Teach `scripts/agent_next.mjs` that human-gated PRs are parked and should not
consume Claude's active WIP. When no actionable Claude PR exists, surface the
ordered backend backlog from `docs/claude-inbox.md`.

## Done when

- `agent_next --role=claude` shows the top Claude inbox request when only
  human-gated PRs remain.
- The output no longer tells Claude to clear blockers that only the human can
  clear.
- Regression tests cover both behaviors.
