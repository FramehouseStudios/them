---
id: T100-agent-next-inbox-backlog
title: Surface support agent inbox backlog in agent_next
owner: codex
status: merged
branch: codex/T100-agent-next-inbox-backlog
pillar: infra (coordination)
v1_pillar: infra
v1_effect: makes the next support agent backend lane visible from agent_next even when all open PRs are parked behind human gates
---

## Scope

Teach `scripts/agent_next.mjs` that human-gated PRs are parked and should not
consume support agent's active WIP. When no actionable support agent PR exists, surface the
ordered backend backlog from `docs/support-inbox.md`.

## Done when

- `agent_next --role=support` shows the top support agent inbox request when only
  human-gated PRs remain.
- The output no longer tells support agent to clear blockers that only the human can
  clear.
- Regression tests cover both behaviors.
