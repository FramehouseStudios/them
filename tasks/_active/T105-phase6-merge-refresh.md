---
id: T105
title: Refresh coordination after Phase 6 memories merge
owner: codex
status: in-progress
branch: codex/T105-phase6-merge-refresh
pillar: infra
v1_pillar: infra
v1_effect: records the Phase 6 memory-route merge and points Claude at Phase 7a guard extraction
---

## Scope

Refresh coordination after Codex reviewed, patched, and merged Phase 6
`/memories/*` extraction, then closed premature schema/Phase 7b PRs.

## Done When

- `docs/claude-inbox.md` points Claude at Phase 7a talk-state guard
  extraction as the next implementation lane.
- `docs/codex-inbox.md` records the Phase 6 merge and the #298/#299 closures.
- `docs/codex-claude-live-handoff.md` records the current handoff.
- `docs/coordination.json` records #296 merged and #298/#299 closed.
- Verification commands and intentionally skipped iOS checks are recorded.
