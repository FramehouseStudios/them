---
id: T106
title: Warn agents when agent_next is run from a stale checkout
owner: codex
status: in-progress
branch: codex/T106-agent-next-stale-main-warning
pillar: infra
v1_pillar: infra
v1_effect: prevents stale local queues from sending Claude back to old work after Codex has refreshed main
---

## Scope

Teach `scripts/agent_next.mjs` to warn when the current checkout is behind or
diverged from `origin/main`, using only local git refs. This prevents agents
from acting on stale `docs/claude-inbox.md` content after supervisor refreshes
land on main.

## Done When

- `agent_next` text output includes a checkout warning when the local checkout
  is behind or diverged from `origin/main`.
- JSON output exposes the checkout status for machine readers.
- Fixture-based tests remain deterministic and are not affected by the real
  repo checkout.
- A regression test covers the behind-`origin/main` warning.
