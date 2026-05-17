---
id: T83
title: Define V1 and product-state handoff loop
owner: codex
status: review
branch: codex/T83-v1-product-operating-system
pillar: infra (product execution)
---

## Scope

Convert the Codex/Claude efficiency feedback into durable repo behavior:

- Add the operative V1 definition and binary checklist.
- Make `docs/claude-inbox.md` an iOS-driven backend queue instead of a stale
  historical log.
- Update the throughput protocol so every PR links to a V1 pillar/effect,
  Codex owns coordination state, Claude uses event-lane updates, and product
  state is reported asynchronously.

## Done when

The repo contains a short V1 definition, a current Claude inbox with the next
backend priorities Codex actually wants, and protocol text that prevents
coordination refresh churn from replacing product progress.

## Verification

Passed:

- `node scripts/build_tasks_md.mjs --write` (existing filename/id warnings)
- `node scripts/coordination_state.mjs validate`
- `node scripts/agent_next.mjs --role=codex --limit=10`
- `git diff --check`

Not run: iOS build or backend tests; this is docs/protocol only.
