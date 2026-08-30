---
id: T105
title: Refresh coordination after Phase 6 memories merge
owner: codex
status: merged
branch: codex/T105-phase6-merge-refresh
pillar: infra
v1_pillar: infra
v1_effect: records the Phase 6 memory-route merge and points support agent at Phase 7a guard extraction
---

## Scope

Refresh coordination after Codex reviewed, patched, and merged Phase 6
`/memories/*` extraction, then closed premature schema/Phase 7b PRs.

## Done When

- `docs/support-inbox.md` points support agent at Phase 7a talk-state guard
  extraction as the next implementation lane.
- `docs/codex-inbox.md` records the Phase 6 merge and the #298/#299 closures.
- `docs/live-handoff.md` records the current handoff.
- `docs/coordination.json` records #296 merged and #298/#299 closed.
- Verification commands and intentionally skipped iOS checks are recorded.

## Verification

- `node scripts/coordination_state.mjs validate`
- `node scripts/agent_next.mjs --role=support --limit=10 --no-events`
- `node scripts/pre_flight.mjs`
- `node --test scripts/agent_next.test.mjs`
- `node --test scripts/agent_event.test.mjs`
- `git diff --check`

Not run: iOS build/themTests, because this is a coordination-only refresh.
