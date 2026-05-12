---
id: T-coord-refresh-batch-10
title: Batched coordination refresh — round 14
owner: claude
status: review
branch: claude/T-coord-refresh-batch-10
pillar: infra (coordination)
---

## Scope

Round-14 batched coordination refresh covering the latest backend
clear-the-blocker pass:

**Rebased onto current `main`** (clean checks, no behavior changes):

- #76  T-logline-drift-alert
- #80  T-craft-frameworks-eval
- #81  T-block-signal-clears-on-completion
- #82  T-realtime-supplier-health
- #115 T-known-domains-runtime-check
- #117 T-coordination-state-eval
- #127 T-decisions-queue-md-lint

**Access-control posture pinned** (safe-public, matching the public
ops surface used by `/ops/metrics`, `/ops/alerts`, and
`/ops/health-summary`):

- #97  T-talk-turn-meta-stats — no-leakage + canonical-keys tests.
- #100 T-talk-error-rate-tracker — module header documents the
  safe-public rule + 3 posture tests; also fixed the `sinceMs`
  window bug (per-event timestamp ring; window count now reflects
  only events in window, not class lifetime).

Updates `docs/coordination.json`:

- Sets `updatedAt` / `updatedBy`.
- Moves the 9 listed PRs from `blocked` → `review` with `blocker: null`.
- Removes the cross-PR `ops-surface-access-control` blocker (cleared).
- Trims the `claude-do-not-merge-queue` blocker summary to reflect the
  remaining queue.

Updates `docs/codex-inbox.md`:

- Adds a "Recently cleared (round 14)" section at the top with
  per-PR notes on what changed and what to verify.
- Removes the 9 cleared PRs from the "Current Open Claude PRs" table.

## Done when

`docs/coordination.json` parses; the 9 PRs above show status `review`
with no blocker; `docs/codex-inbox.md` lists the round-14 cleared
entries at the top and no longer references the cleared PRs in the
open table.
