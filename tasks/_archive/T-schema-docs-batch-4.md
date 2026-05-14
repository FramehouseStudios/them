---
id: T-schema-docs-batch-4
title: Schema doc batch 4 — talk-errors + talk-turn-stats + block-signal-history + fountain-export + agent-events
owner: claude
status: merged
branch: claude/T-schema-docs-batch-4
pillar: infra (schema discipline)
v1_pillar: infra
v1_effect: extends schema discipline to the operator ops surfaces (/talk/errors, /talk/stats), the block-signal history route, the fountain export endpoint, and the agent-events JSONL record format
---

## Scope

Adds 5 new envelope/record docs under `docs/schemas/`:

- `talk-errors.md` — `GET /talk/errors` (talk_error_counter
  envelope) — SAFE-PUBLIC ops surface.
- `talk-turn-stats.md` — `GET /talk/stats` (talk_turn_stats
  aggregate envelope) — SAFE-PUBLIC ops surface.
- `block-signal-history.md` — `GET /memory/block-signal/history` — the
  PER-USER bounded history for the V1 line 49 surface.
- `fountain-export.md` — `POST /screenplay/export/fountain`
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
- `docs/schemas/INDEX.md` updated for all 5 new docs.
- `node scripts/pre_flight.mjs` passed.
- `node scripts/agent_event.mjs stats` passed.
- `git diff --check` passed.
- No live route is touched.

## Done when

5 new schema docs land.

## Followups (not in this PR)

- Wire `talk-errors` and `talk-turn-stats` references into
  `docs/runbook-v1-smoke.md` if/when the ops dashboard becomes
  a V1 surface.

## Self-audit / docs-vs-code revision

Initial drafts of three docs in this batch were drifted from the
live code — same class as Codex's #245 blocker. Self-audited
before re-requesting review and rewrote line-by-line against
the routes:

- **`block-signal-history.md`** — wrong endpoint
  (`/block-signal/history` → `/memory/block-signal/history`),
  wrong field set (`items[]` / `atMs` / `confidence` / `turn_id`
  / `history_cap` / `observed_at` → `entries[]` / `at` / `score`
  / `level` plus `counts.byLevel` / `newestAt` / `oldestAt`),
  wrong level set (`low|flow|pending|block` → `low|medium|high`).
  Rewritten against `summarizeHistory()` in
  `backend/lib/block_signal_history_route.js`.
- **`fountain-export.md`** — wrong method+path
  (`GET /screenplays/{id}/export?format=fountain` →
  `POST /screenplay/export/fountain`), wrong response shape
  (invented `project_id`/`version_id`/`fountain_text`/`scene_count`/etc.
  → live `{ schemaVersion: 1, fountain: "..." }` with an
  alternate raw-text mode via `Accept: text/plain`). Rewritten
  against `mountFountainExportRoute` in
  `backend/lib/fountain_export_route.js`.
- **`talk-turn-stats.md`** — wrong endpoint path
  (`/talk/turn/stats` → `/talk/stats`). Field set otherwise
  matched.

The `talk-errors.md` doc audited clean against the live code.
`agent-events.md` was adjusted during Codex supervisor review to
match `scripts/agent_event.mjs`: `comment` and `pr` are optional
at the validator level, and `review_blocker` requires
`blocker_kind`.
