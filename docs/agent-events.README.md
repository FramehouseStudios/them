# agent-events.jsonl — live event lane

Append-only JSONL file (rotated weekly) that lets Claude and Codex
see each other's transitions in near-real-time without waiting for
a coordination-refresh PR.

`docs/coordination.json` remains canonical state. This file is the
**live tape of intent** — every PR open / rebase / merge / blocker
flag / clear is recorded here as soon as it happens.

## File layout

```
docs/agent-events-<YYYY>-W<WW>.jsonl   # current ISO week
docs/agent-events-2026-W18.jsonl       # previous week (kept)
docs/agent-events-2026-W17.jsonl       # ...
```

Each line is a single JSON object:

```jsonl
{"at":"2026-05-12T18:02:00Z","by":"claude","kind":"pr_rebased","pr":88,"comment":"clean rebase, 16/16 pass"}
{"at":"2026-05-12T18:05:00Z","by":"codex","kind":"pr_merged","pr":88}
{"at":"2026-05-12T18:06:00Z","by":"codex","kind":"review_blocker","pr":92,"blocker_kind":"needs_payoff_dedupe_regression","blocker_against_pr":98}
```

## Canonical event kinds

| Kind | Emitted by | Required fields |
|---|---|---|
| `session_start` | either | — |
| `pr_opened` | either | `pr` |
| `pr_rebased` | claude | `pr`, recommended: `comment` |
| `pr_merged` | codex | `pr` |
| `pr_closed` | either | `pr` |
| `review_blocker` | codex | `pr`, `blocker_kind`, recommended: `blocker_against_pr` |
| `blocker_cleared` | claude | `pr`, recommended: `comment` |
| `coord_refresh` | either | — |
| `spec_opened` | claude | `pr` (the spec PR) |
| `spec_approved` | codex | `pr` (the spec PR) |
| `note` | either | use sparingly; prefer typed kinds |

All events carry `at` (ISO-8601), `by` (claude|codex|human), and
`kind`. Anything else is optional or kind-specific.

## CLI

```bash
# Append a new event
node scripts/agent_event.mjs append \
  --by=claude --kind=pr_rebased --pr=88 \
  --comment="clean rebase, 16/16 pass"

# Tail recent events
node scripts/agent_event.mjs tail --n=20

# `agent_next` also surfaces recent events beside the canonical queue
node scripts/agent_next.mjs --role=claude --events-limit=5
node scripts/agent_next.mjs --role=codex --events-since=2026-05-12T18:00:00Z

# Filter
node scripts/agent_event.mjs tail --by=codex --kind=review_blocker
node scripts/agent_event.mjs tail --since=2026-05-12T00:00:00Z

# Weekly summary
node scripts/agent_event.mjs stats
```

## What goes here vs. coordination.json

| | agent-events.jsonl | coordination.json |
|---|---|---|
| Authority | Tape of intent | Canonical state |
| Update cadence | Per transition (seconds) | Per refresh PR (hours) |
| Mutability | Append-only | Read/write/replace |
| Rotation | Weekly | None — single file |
| Used for | "what just happened?" | "what's currently true?" |

A typical Claude session goes:

1. Read `agent_next` and `coordination_state read` (canonical state plus
   recent events).
2. Optionally read `agent_event tail --n=20` for a wider event tape.
3. Act.
4. Append events as I act (`pr_rebased`, `coord_refresh`, etc.).

Codex's loop is symmetric, plus `pr_merged` after each merge train
slot.

## Non-goals

- This is **not** a chat channel. Don't emit `note` for things that
  should be a PR comment or a spec.
- This is **not** a replacement for `DECISIONS.md`. Architectural
  decisions still get recorded there.
- This is **not** signed or hardened against tampering — both agents
  trust each other.
- This is **not** for the human-decision queue
  (`docs/decisions-queue.md` is still canonical for that).
