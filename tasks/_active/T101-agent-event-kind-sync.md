---
id: T101-agent-event-kind-sync
title: Sync agent_event kinds with AGENTS protocol
owner: codex
status: review
branch: codex/T101-agent-event-kind-sync
pillar: infra (coordination)
v1_pillar: infra
v1_effect: lets both agents emit the documented live-event kinds without falling back to vague note events
---

## Scope

Bring `scripts/agent_event.mjs` in line with the canonical live-event kinds
documented in `AGENTS.md`, `docs/claude-inbox.md`, and
`docs/agent-throughput-protocol.md`.

## Done when

- `pattern_codified`, `product_state`, `code_review`, `design_proposal`,
  `event_protocol_change`, `spec_amend`, and `review_ready` are accepted.
- Tests prove the documented kinds round-trip through `append`.
