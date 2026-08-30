---
id: T147
title: Refresh support agent handoff after Phase 7c design merge
owner: codex
status: review
branch: codex/T147-phase7c-handoff-refresh
pillar: infra
v1_pillar: talk
v1_effect: unblocks support agent's Phase 7c talk supplier-glue implementation with explicit Codex constraints and keeps launch blockers isolated
---

## Scope

Record that PR #349's Phase 7c design note is merged, give support agent the exact
implementation lane, and keep the release-config/manual-smoke blockers separate
from backend decomposition work.

## Done When

- `docs/coordination.json`, `docs/support-inbox.md`, and
  `docs/live-handoff.md` say Phase 7c implementation is assigned.
- The handoff forbids side PRs and preserves the talk-path merge caution.
- `agent_next` routes support agent to the Phase 7c implementation instead of polling
  or inventing unrelated work.
- Verification commands are recorded.

## Verification

- `node scripts/agent_next.mjs --role=support --limit=5 --no-events`
  routes support agent to Phase 7c implementation.
- `node scripts/coordination_state.mjs validate` passed.
- `node scripts/pre_flight.mjs --strict` passed.
- `git diff --check` passed.
