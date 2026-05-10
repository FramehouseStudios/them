# TASKS.md — io.them Active Work

> **Rule:** Every task has one owner, one branch, one scope, and one definition of done. Every task must serve at least one north-star pillar — **mobile-first**, **voice→scene**, **living companion**, **longitudinal learning**. See `AGENTS.md`.

## Status vocabulary
`ready` → `ready-for-claude` → `in-progress` → `review` → `merged`

## Branch conventions
- `codex/<task-id>-<short-name>`
- `claude/backend-<short-name>`

---

## Active work — quick view

| ID   | Title                                              | Owner  | Status            |
|------|----------------------------------------------------|--------|-------------------|
| T01  | Triage 409-file uncommitted snapshot               | human  | ready             |
| T02  | Resolve `archive/` vs `Archive/` case collision    | codex  | review            |
| T04  | Apply canonical product name `io.them` end-to-end  | codex  | ready             |
| T05  | Add `first_page_written` client telemetry event    | codex  | ready             |
| T07  | Promote backend persistence to Postgres canonical  | claude | in-progress       |
| T07a | Wire `outbox_store` to persistence adapter          | claude | ready-for-claude  |
| T07-eval-gate | Verify eval gate against Postgres          | claude | ready-for-claude  |
| T07-cutover | Drop dual-write JSON paths after Postgres soak | claude | blocked-T07-eval |
| T08  | Centralize prompt assembly + first memory tier (backend) | claude | in-progress       |
| T08w-triggers | Fire creative-memory write triggers from `/talk` | claude | ready-for-claude |
| T08-postgres | Move creative memory store to persistence adapter | claude | ready-for-claude |
| T09  | Modularize `DraftStudio` and `ScreenplayStudio`    | codex  | blocked-T02       |
| T10  | Codify single design system (color/typo/spacing)   | codex  | ready             |
| T11  | 60-second magic-moment onboarding                  | codex  | blocked-T09       |
| T12  | Adopt perceived-speed primitives system-wide       | codex  | blocked-T09       |
| T13  | Add second realtime supplier behind interface      | claude | ready-for-claude  |
| T14  | Triage G3 backend feature snapshot                 | codex  | ready             |
| T21  | Add craft-aware prompts and beat classification    | claude | ready-for-claude  |
| T22  | Persist craft snapshots and turn overrides         | claude | ready-for-claude  |
| T23  | Add craft completeness RC release gate             | claude | blocked-T22       |

---

## Current next-10 checklist (2026-05-09 post-drain)

1. Claude starts T07a: wire outbox durability through the persistence adapter.
2. Claude starts T07-eval-gate: run `npm run eval:gate` against Postgres in CI.
3. Claude starts T08w-triggers: write creative-memory signals from `/talk` post-processing.
4. Claude starts T08-postgres: move `creative_memory_store` onto the persistence adapter.
5. Claude starts T21: feed craft schemas into prompts and add scene-to-beat classification.
6. Claude starts T22: persist craft snapshots and turn overrides.
7. Claude starts T23 after T22: enforce missing-major-turn RC gate.
8. Codex starts T02: resolve `archive/` vs `Archive/` to unblock T09.
9. Codex starts T10: consolidate the app design system once T02 is clear.
10. Codex starts T04 or T05, depending whether identity polish or telemetry is the stronger product move.

---

## Active work — full detail

### T01 — Triage 409-file uncommitted snapshot
- **Owner:** human
- **Branch:** —
- **Pillar:** infra (enables all)
- **Status:** ready
- **Done when:** the snapshot on `codex-save-primary-folder-20260420` is split into ≤6 intent-grouped branches, each open as a PR; no orphan changes remain on the source branch; stale `claude/*` branches with no merged work are deleted.

### T02 — Resolve `archive/` vs `Archive/` case collision
- **Owner:** codex
- **Branch:** `codex/T02-archive-case-collision`
- **Pillar:** infra (enables all)
- **Status:** review
- **Done when:** only one casing exists in the repo; contents are migrated; commit explicitly states the casing chosen and why; entry recorded in `DECISIONS.md`.
- **Review note:** Git already tracked lowercase `archive/...`; the local worktree directory was normalized from `Archive/` to `archive/`, and D004 records lowercase `archive/` as the proposed canonical casing.

### T04 — Apply canonical product name `io.them` end-to-end
- **Owner:** codex
- **Branch:** —
- **Pillar:** living companion (identity)
- **Status:** ready
- **Done when:** `Info.plist` `CFBundleDisplayName`, `README.md` title line, onboarding copy, and any user-visible string read `io.them` (or final agreed casing); no user-visible surface still reads `Framehouse`, `them`, `Clementine`, or `Her*`. References `D001`.

### T05 — Add `first_page_written` client telemetry event
- **Owner:** codex
- **Branch:** —
- **Pillar:** voice→scene (measurement)
- **Status:** ready
- **Done when:** event fires once per user the first time they ship a screenplay-formatted page; visible in the analytics destination; documented in `docs/`.

### T07 — Promote backend persistence to Postgres canonical
- **Owner:** claude
- **Branch:** `claude/T07-postgres-canonical`
- **Pillar:** longitudinal learning
- **Status:** in-progress
- **Scope (this PR — foundation):** adapter interface + JSON impl + Postgres impl + initial schema for all four store domains + forward and reverse migration scripts + adapter contract tests. Outbox is the proof-wired store.
- **Scope (follow-up rows, claimed by Claude after this PR merges):** wire `memory_store` (T07a), `screenplay_store` (T07b), and the knowledge embeddings cache (T07c) onto the adapter. Each is a focused PR.
- **Done when (this PR):** adapter contract tests green; both backends pass the same contract; `scripts/migrate_stores_to_postgres.mjs` and `scripts/dump_stores_to_json.mjs` round-trip a sample dataset; outbox_store reads/writes via the adapter when `DATABASE_URL` is set, falls back to JSON when unset; `docs/T07-persistence-canonical.md` documents the architecture and the migration runbook.
- **Done when (overall T07):** all four `*_store.json` paths at backend root deprecated; backend reads/writes only via the adapter (Postgres in CI/prod, JSON in local dev as the explicit fallback); `npm run eval:gate` green with `DATABASE_URL` set.

### T07a — Wire `outbox_store` to persistence adapter
- **Owner:** claude
- **Branch:** —
- **Pillar:** longitudinal learning + infra (enables all)
- **Status:** ready-for-claude
- **Done when:** outbox queue durability runs through the persistence adapter when `DATABASE_URL` is set, with `scaleBackplane` retained for cross-process state; the non-mechanical architecture is documented before implementation.

### T07-eval-gate — Verify eval gate against Postgres
- **Owner:** claude
- **Branch:** —
- **Pillar:** longitudinal learning + infra (enables all)
- **Status:** ready-for-claude
- **Done when:** CI runs the full `npm run eval:gate` path against a live Postgres instance and passes; the result is recorded in `docs/T07-persistence-canonical.md`.

### T07-cutover — Drop dual-write JSON paths after Postgres soak
- **Owner:** claude
- **Branch:** —
- **Pillar:** longitudinal learning + infra (enables all)
- **Status:** blocked-T07-eval
- **Done when:** with `DATABASE_URL` set in CI for more than seven days and no adapter errors logged, legacy `*_store.json` write paths in screenplay, memory, and embeddings are removed; loads become adapter-only.

### T08 — Centralize prompt assembly + first memory tier (backend)
- **Owner:** claude
- **Branch:** `claude/backend-T08-memory-tier`
- **Pillar:** living companion + longitudinal learning
- **Status:** in-progress
- **Scope (narrowed):** backend memory tier + backend-side prompt assembly. The original done-when referenced `ScreenplayPromptBuilder` (iOS) which is out of Claude's scope and not yet on `main`. iOS prompt-path consolidation is a sibling Codex follow-up — Codex to add a row when the dirty iOS state lands.
- **Done when (backend portion):** A creative-companion memory record (style, characters, tone, habits) persists per user; a single `buildModelPrompt(...)` is the only path used by `handleTalkRequest`; every model-bound prompt carries the memory context when present and degrades cleanly when absent; new eval `run_creative_memory_eval.mjs` covers both states and is wired into `eval:gate`; design and final state documented in `docs/T08-prompt-centralization-and-memory-tier.md`.
- **Design doc:** [docs/T08-prompt-centralization-and-memory-tier.md](docs/T08-prompt-centralization-and-memory-tier.md)

### T08w-triggers — Fire creative-memory write triggers from `/talk`
- **Owner:** claude
- **Branch:** —
- **Pillar:** living companion + longitudinal learning
- **Status:** ready-for-claude
- **Done when:** character mentions, scene completions, and tone signals detected in `/talk` exchanges trigger the corresponding `recordXxx` calls on `creativeMemoryStore`; `run_creative_memory_eval.mjs` covers at least one trigger-fired case.

### T08-postgres — Move creative memory store to persistence adapter
- **Owner:** claude
- **Branch:** —
- **Pillar:** living companion + longitudinal learning
- **Status:** ready-for-claude
- **Done when:** `creative_memory_store.js` uses `createPersistence(...)` for the chosen memory domain, its public API stays unchanged, and the eval suite stays green.

### T09 — Modularize `DraftStudio` and `ScreenplayStudio` into SwiftPM packages
- **Owner:** codex
- **Branch:** —
- **Pillar:** infra (enables all)
- **Status:** blocked-T02
- **Done when:** `DraftStudio` and `ScreenplayStudio` are local SwiftPM packages; `ContentView.swift` is below 500 LOC; clean build green; `themTests` pass.

### T10 — Codify single design system (color, typography, spacing)
- **Owner:** codex
- **Branch:** —
- **Pillar:** mobile-first
- **Status:** ready
- **Done when:** one color file, one typography file, one spacing scale; legacy `HerColors`, `FountainTypography`, and `*Chrome*` styling consolidated or deprecated; lint or build rule fails any new file that bypasses them.

### T11 — 60-second magic-moment onboarding
- **Owner:** codex
- **Branch:** —
- **Pillar:** voice→scene + mobile-first
- **Status:** blocked-T09
- **Done when:** cold-start to a properly formatted screenplay page in ≤60 seconds on a real iPhone, validated by the human; `first_page_written` (T05) fires; flow uses centralized prompts (T08).

### T12 — Adopt perceived-speed primitives system-wide
- **Owner:** codex
- **Branch:** —
- **Pillar:** mobile-first + voice→scene
- **Status:** blocked-T09
- **Done when:** skeletons, optimistic writes, and audio-first responses are the default in the studio surface; measured time-to-perceived-response is ≤100 ms for the magic-moment path.

### T13 — Add second realtime supplier behind existing interface
- **Owner:** claude
- **Branch:** —
- **Pillar:** living companion (resilience)
- **Status:** ready-for-claude
- **Done when:** a second supplier ships behind the existing `Realtime` interface; the supplier choice is configurable at runtime; smoke test exercises both paths.

### T14 — Triage G3 backend feature snapshot
- **Owner:** codex
- **Branch:** —
- **Pillar:** living companion + longitudinal learning
- **Status:** ready
- **Done when:** the G3 backend feature work is split into intent-grouped commits or explicitly routed to Claude with context; no G3 backend changes remain orphaned in the dirty tree.
- **Decision:** Option A from the handoff brief. Codex will own the snapshot triage because the work appears to have been authored before the protocol existed; Claude should run backend eval gates before merge.

### T21 — Add craft-aware prompts and beat classification
- **Owner:** claude
- **Branch:** —
- **Pillar:** voice-to-scene + living companion
- **Status:** ready-for-claude
- **Done when:** structure-help and page-write prompts receive craft schema context; LLM-assisted scene-to-beat classification uses the shared JSON schema; prompt regression and classification evals are green.

### T22 — Persist craft snapshots and turn overrides
- **Owner:** claude
- **Branch:** —
- **Pillar:** longitudinal learning + living companion
- **Status:** ready-for-claude
- **Done when:** craft snapshots persist per screenplay version; user overrides for false-positive major-turn detections round-trip through storage; backend tests prove overrides affect later analysis responses.

### T23 — Add craft completeness RC release gate
- **Owner:** claude
- **Branch:** —
- **Pillar:** infra (enables all)
- **Status:** blocked-T22
- **Done when:** release/RC gates fail when required major turns are missing, show actionable diagnostics, and pass when a fixture screenplay has complete craft coverage or accepted overrides.

---

## Completed (last 30 days)

### T06 — Flip `RUN_QUALITY_GATE=1` default in release CI
- **Owner:** claude
- **Branch:** `claude/T06-quality-gate-default`
- **Merged:** 2026-05-09 via PR #7, completed by Codex app-doc follow-up PR #18.

### T06-iOS — Update iOS quality gate doc for CI enforcement
- **Owner:** codex
- **Branch:** `codex/T06-ios-quality-gate-doc`
- **Merged:** 2026-05-09 via PR #18.

### T03 — Strip `test.mp3` / `test.wav` from app target
- **Owner:** codex
- **Branch:** `codex/T03-strip-test-assets`
- **Merged:** 2026-05-09 via PR #1.

### T15 — Fix iOS simulator test host configuration
- **Owner:** codex
- **Branch:** `codex/T15-ios-test-host`
- **Merged:** 2026-05-09 via PR #4.

### T16 — Exclude local tooling artifacts from app bundle
- **Owner:** codex
- **Branch:** `codex/T16-exclude-local-artifacts`
- **Merged:** 2026-05-09 via PR #5.

### T17 — Add Swift craft report and beat-sheet models
- **Owner:** codex
- **Branch:** `codex/T17-craft-report-models`
- **Merged:** 2026-05-09 via PR #3.

### T18 — Add backend craft schemas and analysis endpoints
- **Owner:** claude
- **Branch:** `claude/T18-craft-schemas-analysis`
- **Merged:** 2026-05-09 via PR #6.

### T19 — Add BackendClient craft API methods
- **Owner:** codex
- **Branch:** `codex/T19-backend-client-craft-api`
- **Merged:** 2026-05-09 via PR #14.

### T20 — Build Craft tab, turn timeline, and beat sheet
- **Owner:** codex
- **Branch:** `codex/T20-craft-tab-timeline-beats`
- **Merged:** 2026-05-09 via PR #16.

---

## Notes

- Claim a row by editing it to `Owner=<you>, Status=in-progress` **as the first commit on your new branch**. If two agents try to claim the same row, the merge conflict on this file is the correct signal — do not work around it; resolve the intent.
- New rows must include a one-line "done when" before they go to `ready` or `ready-for-claude`. A row without a definition of done does not belong in this file.
- When a row reaches `merged`, move it to "Completed" with the merge date. Prune rows older than 30 days.
