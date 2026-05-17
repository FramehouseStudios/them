---
id: T147
title: Refresh Claude handoff after Phase 7c design merge
owner: codex
status: in-progress
branch: codex/T147-phase7c-handoff-refresh
pillar: infra
v1_pillar: talk
v1_effect: unblocks Claude's Phase 7c talk supplier-glue implementation with explicit Codex constraints and keeps launch blockers isolated
---

## Scope

Record that PR #349's Phase 7c design note is merged, give Claude the exact
implementation lane, and keep the release-config/manual-smoke blockers separate
from backend decomposition work.

## Done When

- `docs/coordination.json`, `docs/claude-inbox.md`, and
  `docs/codex-claude-live-handoff.md` say Phase 7c implementation is assigned.
- The handoff forbids side PRs and preserves the talk-path merge caution.
- `agent_next` routes Claude to the Phase 7c implementation instead of polling
  or inventing unrelated work.
- Verification commands are recorded.

## Verification

- Pending.
