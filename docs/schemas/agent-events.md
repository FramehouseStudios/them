# agent-events record schema

Canonical record shape for entries in
`docs/agent-events-<YYYY>-W<WW>.jsonl` — the live event lane both
agents emit after every PR open / merge / close / coord refresh /
review-blocker call.

## Where it lives

- `docs/agent-events-2026-W20.jsonl` (and prior weeks).
- One JSON object per line; append-only.
- Written via `scripts/agent_event.mjs append --by=... --kind=...`.

## Owner

- **Both agents write.** Claude appends after every backend PR
  state change. Codex appends after iOS merge-train activity and
  coord refreshes.
- **Schema enforcement**: `scripts/agent_event.mjs` validates
  required fields + canonical `kind` values before append.

## Access-control posture

**SAFE-PUBLIC** (within the repo). No PII, no tokens. Comments
are human-readable summaries; never include user content or
secrets.

## Record shape

```json
{
  "at": "2026-05-14T05:43:52.673Z",
  "by": "claude",
  "kind": "pr_opened",
  "pr": 254,
  "comment": "T-deeper-lib-tests-batch-3: 33 tests across..."
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `at` | string | yes | ISO 8601 UTC timestamp, set by `agent_event.mjs` |
| `by` | string | yes | `"claude"` or `"codex"` |
| `kind` | string | yes | one of the canonical kinds (see below) |
| `pr` | int | no | PR number, when applicable to the kind |
| `comment` | string | yes | one-line human-readable summary |

## Canonical `kind` values

| Kind | When | `pr` required? |
| --- | --- | --- |
| `session_start` | agent begins a working session | no |
| `pr_opened` | new PR opened | yes |
| `pr_rebased` | PR rebased onto current main | yes |
| `pr_merged` | PR merged | yes |
| `pr_closed` | PR closed without merge | yes |
| `review_blocker` | reviewer flagged a blocking issue | yes |
| `blocker_cleared` | blocker resolved | yes |
| `coord_refresh` | coordination.json + inboxes refreshed | no |
| `spec_opened` | spec PR opened | yes |
| `spec_approved` | spec PR approved by other agent | yes |
| `note` | freeform note — clarifications, design proposals, links | optional |

Unknown kinds are rejected by `agent_event.mjs`.

## Invariants

- **Append-only.** Never rewrite a prior line. Corrections go in
  a new `note` event.
- **One-line per record.** Each line is valid JSON; the file is
  JSONL, not JSON.
- **Week-bucketed filenames** prevent any single file from
  growing unbounded. New weeks roll into a new file.

## Compatibility rules

- New `kind` values require a `scripts/agent_event.mjs` update
  AND a `DECISIONS.md` entry if it changes coordination protocol.
- New optional fields on records are tolerated; older entries
  without them read with defaults.
- The `at` / `by` / `kind` triple is load-bearing for the rollup
  in `coordination.json` — never rename.

## Consumers

- `docs/coordination.json` — coord refresh reads the event lane to
  build the activity summary.
- Human reviewers — scan the JSONL to reconstruct what happened
  since the last coord refresh.
- Future: a CI dashboard could chart event rate by `kind` over
  time.

## Changelog

- v1 — initial documented shape. Canonical `kind` set established
  in `T-agent-events-jsonl-live-lane`.
