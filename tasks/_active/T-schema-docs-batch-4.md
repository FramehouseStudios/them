---
id: T-schema-docs-batch-4
title: Schema doc batch 4 — talk-errors + talk-turn-stats + block-signal-history + fountain-export + agent-events
owner: claude
status: review
branch: claude/T-schema-docs-batch-4
pillar: infra (schema discipline)
v1_pillar: infra
v1_effect: extends schema discipline to the operator ops surfaces (/talk/errors, /talk/turn/stats), the block-signal history route, the fountain export endpoint, and the agent-events JSONL record format
---

## Scope

Adds 5 new envelope/record docs under `docs/schemas/`:

- `talk-errors.md` — `GET /talk/errors` (talk_error_counter
  envelope) — SAFE-PUBLIC ops surface.
- `talk-turn-stats.md` — `GET /talk/turn/stats` (talk_turn_stats
  aggregate envelope) — SAFE-PUBLIC ops surface.
- `block-signal-history.md` — `GET /block-signal/history` — the
  PER-USER bounded history for the V1 line 49 surface.
- `fountain-export.md` — `GET /screenplays/{id}/export?format=fountain`
  with ordering invariants pinned by v1_screenplay_smoke (#231).
- `agent-events.md` — record shape for
  `docs/agent-events-*.jsonl` (the live event lane both agents
  emit on every PR state change).

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: extends schema discipline to the operator ops
  surfaces and to the agent-events JSONL record format. iOS
  doesn't consume the ops envelopes, but Codex's coord refresh
  reads agent-events — having that record format canonicalized
  prevents kind-name drift.`

## Verification

- All 5 docs follow the schema-doc pattern (Endpoint, Schema
  version, Owner, Access-control posture, Fields, Errors,
  Invariants, Compatibility, Changelog).
- Cross-references match `INDEX.md` placement (will need an
  INDEX update in a followup; deferred here to keep this PR
  focused on the new docs).
- No live route is touched.

## Done when

5 new schema docs land.

## Followups (not in this PR)

- Update `docs/schemas/INDEX.md` to list the 5 new docs under
  their surface groups.
- Wire `talk-errors` and `talk-turn-stats` references into
  `docs/runbook-v1-smoke.md` if/when the ops dashboard becomes
  a V1 surface.
