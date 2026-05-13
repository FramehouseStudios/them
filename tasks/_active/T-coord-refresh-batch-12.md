---
id: T-coord-refresh-batch-12
title: Batched coordination refresh — round 17 (post merge train)
owner: claude
status: review
branch: claude/T-coord-refresh-batch-12
pillar: infra (coordination)
---

## Scope

Round-17 batched coordination refresh. Reflects the massive merge
train that ran since the last on-main refresh: the original 25
Claude PRs from round 16, plus the follow-on supervisor merges for
the coordination schema check, first-page telemetry sink, prompt
context wiring, realtime failover, format-linter/eval umbrella, and
ops route extraction.

**Merged on main since last refresh** (status → `merged`,
blocker → `null`):

  #76, #80, #81, #82, #83, #85, #86, #88, #90, #92, #97, #100,
  #104, #105, #107, #110, #111, #112, #115, #124, #127, #159,
  #161, #163, #164, #166, #171, #117, #79, #74, #84, #190.

**Still open after this refresh**:

  #33 — human-owned `OPENAI_API_KEY` secret repair.
  #63 — trust-policy PR, human-gated and superseded in practice by D005.
  #94 — creative-memory export, human privacy/data-control gate.
  #99 — creative-memory delete, human privacy/data-control gate.

Updates `docs/coordination.json`:

- Round-16 and round-17 PRs moved from `blocked`/`review` → `merged`.
- Cross-PR `ops-surface-access-control` blocker dropped (cleared
  via #97 + #100 already landed).
- `claude-do-not-merge-queue` cleared. Remaining blockers are human-owned.
- `updatedAt` / `updatedBy` refreshed.

Updates `docs/codex-inbox.md`:

- New "Recently cleared" section summarizing the full merged train.
- "Current Open Claude PRs" table trimmed to actual still-open,
  human-gated PRs.

## Done when

`node scripts/coordination_state.mjs validate` returns OK; merged
PRs show `status: merged`; the open-PR table no longer references
PRs that have merged; remaining blockers are human-owned.
