---
id: T-preflight-task-status-vocab
title: Pre-flight rule task-status-vocabulary
owner: claude
status: review
branch: claude/T-preflight-task-status-vocab
pillar: infra (pre-flight rule)
v1_pillar: infra
v1_effect: closes the silent-status-typo gap — a task file with `status: shipped` (typo for `merged`) would silently drop from V1 status rollups; this rule catches the typo before it propagates
---

## Scope

Adds two new pre-flight checks under `scripts/pre_flight.mjs`:

- `task-missing-status` — task file has YAML front matter but no
  `status:` field.
- `task-invalid-status` — task file has a `status:` value that
  isn't one of the canonical vocabulary:
  `open | review | merged | closed | parked | blocked | draft`.

Same grandfathering rules as `checkTaskV1Pillar`:
- Files without YAML front matter are skipped.
- Coord-refresh task files are skipped.

## Why this matters

`v1_status.mjs` (PR #243), the coord-refresh rollups, and
`docs/v1-definition.md` reporting all key on `status:` to decide
which tasks are still in flight vs already-shipped vs blocked. A
typo like `status: shipped` (instead of `merged`) silently drops
the task from rollups — and silent drops are the worst class of
status-reporting bug.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: closes the silent-status-typo gap. The V1 status
  reporter and weekly coord-refresh both key on status; a typo
  would silently drop a task from rollups. The rule is warn-only
  by default, --strict to fail.`

## Verification

- `node scripts/pre_flight.mjs` → 0 new findings on current main
  (all active tasks already use canonical statuses).
- Rule body: validates against the set
  `{open, review, merged, closed, parked, blocked, draft}`.
- Grandfather list matches `checkTaskV1Pillar` precedent.

## Self-audit revisions

Two issues caught during cross-PR audit and addressed in the
same branch before re-review:

1. **File filter was too narrow.** Initial draft used
   `startsWith("T-")` which silently skipped 50 Codex-numbered
   task files (T48, T85, …). Expanded to also accept
   `^T\d` (Codex-style numeric ids) so both lanes are audited.

2. **Canonical set was too narrow.** Once the filter widened,
   Codex-owned tasks surfaced `in-progress` and `planned` as
   already-in-use status values. Both are reasonable synonyms
   of `open` (planned = not started, in-progress = open) and
   shipping them now would force a noisy cross-agent cleanup.
   Widened the canonical set to:
   `open | review | merged | closed | parked | blocked |
    draft | in-progress | planned`.

After both revisions: pre-flight is clean on main + this branch.

## Followups (not in this PR)

- Add a fixture-driven unit test under `scripts/tests/` that
  feeds the rule a bad-status file and verifies it fires.
- Wire `task-invalid-status` and `task-missing-status` into the
  `--strict` failure set once the followup test lands.
- Consider collapsing `planned` into `open` and `in-progress`
  into `review` in a future cross-agent task-file pass. Out of
  scope here — coordinate via DECISIONS.md first.
