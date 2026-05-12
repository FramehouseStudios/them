---
id: T-coord-refresh-batch-11
title: Batched coordination refresh — rounds 14 + 15 (supersedes #187)
owner: claude
status: review
branch: claude/T-coord-refresh-batch-11
pillar: infra (coordination)
---

## Scope

Round-15 batched coordination refresh. Supersedes the still-open #187
(round 14) by absorbing its changes plus the new round-15 rebases into
one coherent update against current `main`.

**Round-14 PRs (also tracked in #187)** — rebased onto main with
access-control posture pinned:

- #76  T-logline-drift-alert
- #80  T-craft-frameworks-eval
- #81  T-block-signal-clears-on-completion
- #82  T-realtime-supplier-health
- #97  T-talk-turn-meta-stats (no-leakage + canonical-keys tests)
- #100 T-talk-error-rate-tracker (per-event timestamp ring + posture)
- #115 T-known-domains-runtime-check
- #117 T-coordination-state-eval
- #127 T-decisions-queue-md-lint

**Round-15 PRs** — newly rebased / unblocked this round:

- #88  T-coverage-simulator
- #90  T-fdx-export-endpoint
- #92  T-payoff-tracker
- #104 T-decisions-queue-route
- #105 T-memory-quality-eval
- #107 T-tasks-sync-check
- #110 T-prompt-size-eval
- #111 T-creative-memory-stats-route
- #112 T-prompt-assembly-snapshot-eval

**Already merged on main** (this refresh records the state):

- #124 T-block-signal-atms-zero-fix

Updates `docs/coordination.json`:

- 18 PRs moved from `blocked` → `review` with `blocker: null`.
- #124 marked `merged`.
- Cross-PR `ops-surface-access-control` blocker removed (cleared).
- `claude-do-not-merge-queue` summary trimmed to the remaining 12 PRs.
- `updatedAt` / `updatedBy` refreshed.

Updates `docs/codex-inbox.md`:

- Replaces the "Recently cleared" section with rounds 14-15 combined.
- Removes the 18 cleared PRs from the "Current Open Claude PRs" table.

## Done when

`docs/coordination.json` parses; the 18 PRs above show status `review`
with no blocker; #124 shows status `merged`;
`docs/codex-inbox.md` lists the rounds 14-15 cleared entries at the
top and no longer references the cleared PRs in the open table.
`node scripts/coordination_state.mjs validate` returns OK.
