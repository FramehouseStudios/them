---
id: T-preflight-task-status-vocab
title: Pre-flight rule task-status-vocabulary
owner: support
status: merged
branch: support/T-preflight-task-status-vocab
pillar: infra (pre-flight rule)
v1_pillar: infra
v1_effect: closes the silent-status-typo gap — a task file with `status: shipped` (typo for `merged`) would silently drop from V1 status rollups; this rule catches the typo before it propagates
---

## Scope

Adds two new pre-flight checks under `scripts/pre_flight.mjs`:

- `task-missing-status` — task file has YAML front matter but no
  `status:` field.
- `task-invalid-status` — task file has a `status:` value that
  isn't one of the canonical workflow statuses or grandfathered
  coordination values:
  `ready | ready-for-support | in-progress | review | merged |
   planned | open | blocked | parked | closed | draft`.

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

- `node --test scripts/pre_flight.test.mjs` → fixture coverage for
  missing status, invalid status, AGENTS statuses, grandfathered
  statuses, and legacy/coord-refresh skips.
- `node scripts/pre_flight.mjs` → 0 findings on current branch.
- Rule body: validates against the set
  `{ready, ready-for-support, in-progress, review, merged, planned,
  open, blocked, parked, closed, draft}`.
- Skip behavior matches `checkTaskV1Pillar` precedent for legacy
  non-YAML files and coord-refresh files.

## Self-audit revisions

Two issues caught during cross-PR audit and addressed in the
same branch before re-review:

1. **File filter was too narrow.** Initial draft used
   `startsWith("T-")` which silently skipped 50 Codex-numbered
   task files (T48, T85, …). Expanded to also accept
   `^T\d` (Codex-style numeric ids) so both lanes are audited.

2. **Canonical set was too narrow.** Once the filter widened,
   Codex-owned tasks surfaced `in-progress` and `planned`; AGENTS.md
   also documents `ready` and `ready-for-support`. Shipping the
   narrow set would force noisy unrelated cleanup and incorrectly
   reject real workflow states. Widened the accepted set to:
   `ready | ready-for-support | in-progress | review | merged |
    planned | open | blocked | parked | closed | draft`.

3. **No fixture coverage.** Added regression tests for missing
   status, invalid status, AGENTS workflow statuses, grandfathered
   statuses, and skip behavior so this rule does not drift silently.

After revisions: pre-flight and fixture tests are clean on this
branch.

## Followups (not in this PR)

- Wire `task-invalid-status` and `task-missing-status` into the
  `--strict` failure set once the followup test lands.
- Consider collapsing `planned` into `open` and `in-progress`
  into `review` in a future cross-agent task-file pass. Out of
  scope here — coordinate via DECISIONS.md first.
