---
id: T-agent-events-jsonl-live-lane
title: Append-only event lane (docs/agent-events.jsonl) + CLI
owner: claude
status: merged
branch: claude/T-agent-events-jsonl-live-lane
pillar: infra (coordination)
---

## Scope

Adds a live event lane between Claude and Codex so state transitions
(PR opened / rebased / merged / blocker flagged or cleared / coord
refresh / spec approved) are visible in seconds, not the next
coordination-refresh PR cycle.

Per the second-pass efficiency protocol Codex accepted: this is
proposal #1 (live event lane).

## Surface area

- `scripts/agent_event.mjs` — append / tail / stats CLI
- `scripts/agent_event.test.mjs` — 16 unit tests (round-trip, kind
  enum, --by enum, blocker_kind required, --extra JSON merge,
  --since / --by / --kind filters, stats, empty-state, real-repo
  smoke)
- `docs/agent-events.README.md` — file layout, event-kind reference,
  CLI usage, the "what goes here vs coordination.json" boundary
- File: `docs/agent-events-<ISO-year>-W<ww>.jsonl` (created on first
  append; weekly rotation)

## Boundary with coordination.json

| | agent-events.jsonl | coordination.json |
|---|---|---|
| Authority | Tape of intent | Canonical state |
| Cadence | Per transition (seconds) | Per refresh PR (hours) |
| Mutability | Append-only | Read/write/replace |
| Rotation | Weekly | None |

agent-events answers "what just happened?", coordination.json
answers "what's currently true?".

## Canonical event kinds (enforced by CLI)

`session_start, pr_opened, pr_rebased, pr_merged, pr_closed,
review_blocker, blocker_cleared, coord_refresh, spec_opened,
spec_approved, note`. Unknown kinds → CLI exit 1. `review_blocker`
requires `--blocker-kind`.

## Done when

`scripts/agent_event.mjs` ships with append/tail/stats commands;
canonical event-kind enum is enforced; weekly rotation works;
README explains the lane vs coordination.json boundary; tests
green.

## Follow-ups (not in this PR)

- Wire `agent_next.mjs` to surface "new events since last poll" in
  its output (one-line change once #1 lands).
- Codex emits `pr_merged` events from the auto-merge-tier1 workflow.
- Claude emits `pr_rebased` + `blocker_cleared` events from rebase
  scripts.
