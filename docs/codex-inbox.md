# Codex Inbox

This is the short handoff Codex should read after `AGENTS.md`, `TASKS.md`,
`DECISIONS.md`, and `docs/codex-claude-live-handoff.md`.

Claude maintains this file. It is the symmetric reverse of
`docs/claude-inbox.md` and removes the need for the human to copy/paste
Claude→Codex handoffs after each Claude PR.

Claude updates this file at the end of every Claude task or PR. Each
update should fit the standing PR template: task id, branch, PR URL,
exact endpoints/files changed, exact tests run, what Codex should
consume next, and any blockers.

## Current Open Claude PRs (2026-05-11 — 13 open)

| PR | Task | Tier | Status | Codex action |
| --- | --- | --- | --- | --- |
| [#33](https://github.com/FramehouseStudios/them/pull/33) | T07 eval gate | 3 | blocked | Human-owned blocker: replace the malformed GitHub Actions secret `OPENAI_API_KEY` with the literal OpenAI key. Do not weaken the gate. |
| [#63](https://github.com/FramehouseStudios/them/pull/63) | T-trust-tiers | 3 | policy-gated | Review only with explicit human approval of standing trust/pre-approval policy changes. |
| [#74](https://github.com/FramehouseStudios/them/pull/74) | T-prompt-wire-traits-and-twists | 2 | review | Wires trait library + accepted twist log into the canonical prompt-assembly path. Closes the longitudinal-learning loop. Backend test full suite green (303 pass). Additive iOS response shape. |
| [#76](https://github.com/FramehouseStudios/them/pull/76) | T-logline-drift-alert | 1 | review | Adds `alert: { level, actionable, recommendation }` to drift response. iOS logline rail can gate the nudge card on `alert.actionable`. |
| [#79](https://github.com/FramehouseStudios/them/pull/79) | T-first-page-telemetry-sink | 1 | review | New `POST /telemetry/first-page-written` + `GET /stats`. iOS T05 event can POST here so the magic-moment SLA is measurable server-side. |
| [#80](https://github.com/FramehouseStudios/them/pull/80) | T-craft-frameworks-eval | 1 | review | New `npm run eval:craft-frameworks` runs analyzer across all 4 frameworks. Bundleable into `eval:gate` as a follow-up. |
| [#81](https://github.com/FramehouseStudios/them/pull/81) | T-block-signal-clears-on-completion | 1 | review | Tests-only PR locking in score-level recovery for the block detector. |
| [#82](https://github.com/FramehouseStudios/them/pull/82) | T-realtime-supplier-health | 1 | review | New `GET /realtime/health` (shape probe free; `?deep=1` does a real mint with 30s cache). Pairs with PR #84. |
| [#83](https://github.com/FramehouseStudios/them/pull/83) | T-fountain-export-endpoint | 1 | review | New `POST /screenplay/export/fountain`. iOS Studio export can produce a `.fountain` file with no client-side Fountain serializer. |
| [#84](https://github.com/FramehouseStudios/them/pull/84) | T-realtime-supplier-failover | 2 | review | When primary realtime mint fails, transparent stub fallback so `/talk` never returns 502. Response carries `fallback: true` + `fallback_reason`. |
| [#85](https://github.com/FramehouseStudios/them/pull/85) | T-backend-surface-smoke | 1 | review | New `npm run eval:backend-surface-smoke` hits every iOS-facing route with canonical fixtures. Catches the gap between unit tests and prod. |
| [#86](https://github.com/FramehouseStudios/them/pull/86) | T-genre-classifier | 1 | review | New `POST /craft/genre/classify` returns genre buckets + tone. Pure, deterministic. |
| [#87](https://github.com/FramehouseStudios/them/pull/87) | T-screenplay-import-fountain | 1 | review | New `POST /screenplay/import/fountain` parses Fountain text back into the canonical screenplay shape. Closes the round-trip with #83. |
| [#88](https://github.com/FramehouseStudios/them/pull/88) | T-coverage-simulator | 1 | review | New `POST /craft/coverage/simulate` returns "what a reader sees" report. iOS Craft tab can render the warnings array as pre-submission cards. |

## Endpoint Contracts Ready to Consume (when each lands)

These iOS consumers can begin drafting in parallel; Codex doesn't have to wait for merge.

| Endpoint | PR | Suggested iOS consumer |
| --- | --- | --- |
| `GET /craft/logline/drift` (extended) | #76 | Logline rail uses `alert.actionable` to gate the nudge card; renders `alert.recommendation` verbatim. |
| `POST /telemetry/first-page-written` | #79 | iOS T05 event also POSTs here (in addition to client analytics). |
| `GET /realtime/health` | #82 | Optional small "voice supplier ready" indicator in Voice settings. |
| `POST /screenplay/export/fountain` | #83 | Studio "Export → Fountain" Share Sheet. |
| `POST /realtime/client_secret` (extended) | #84 | Existing call path; iOS can optionally show a degraded-mode banner when `fallback: true`. |
| `POST /craft/genre/classify` | #86 | Craft tab hint card showing top genre + secondary tones. |
| `POST /screenplay/import/fountain` | #87 | Studio "Import .fountain" action. |
| `POST /craft/coverage/simulate` | #88 | Pre-submission coverage report card in Craft tab. |

## What Codex should consume next (in order)

1. **PR #76** (drift alert) — Tier 1, additive response field. Fastest review.
2. **PR #74** (prompt-wire) — Tier 2, touches prompt path. Highest-value review.
3. **PRs #79, #82, #83, #86, #87, #88** — Tier 1 endpoints iOS can directly wire up.
4. **PR #84** (failover) — Tier 2, /talk resilience.
5. **Eval-only PRs (#80, #81, #85)** — tests/eval-only, can be reviewed in parallel.
6. **PR #63** (trust tiers) — needs human acceptance.
7. **PR #33** — wait on human secret fix.

## Coordination Infrastructure (live on main)

1. **Trust tiers** — every PR carries a tier label (once #63 merges).
2. **Auto-merge workflow** — merges Tier 1 PRs with explicit cross-agent approval; no quiet-time fallback.
3. **Coordination state** (`docs/coordination.json` + `scripts/coordination_state.mjs`) — fast read of open PRs / blockers.
4. **Decisions queue** (`docs/decisions-queue.md`) — single place for "needs human" questions.
5. **Per-row task files** (`tasks/_active/`) — optional; eliminates TASKS.md merge conflicts.

## Blockers Affecting Codex

- Claude PR #33 is blocked by the repository Actions `OPENAI_API_KEY` secret (human-owned).
- Claude PR #63 is clean but policy-gated; merge only with explicit human acceptance.
- Claude PR #74 wires the prompt path through trait library + accepted twist log; review carefully because it touches the canonical prompt assembly.

## Decisions Claude Needs from Codex

- **PR #63 (T-trust-tiers)** — explicit human acceptance of the standing trust-tier policy.

## Human Shortcut

Instead of copy/pasting a long handoff, send Codex this:

```text
Read AGENTS.md, TASKS.md, DECISIONS.md, docs/codex-claude-live-handoff.md,
then docs/codex-inbox.md. Pick the next Codex action from the open
Claude PRs section.
```

To print the same compact handoff prompt from the repo:

```bash
node scripts/print_codex_prompt.mjs
```
