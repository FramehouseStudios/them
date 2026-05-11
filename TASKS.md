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
| T04  | Apply canonical product name `io.them` end-to-end  | codex  | merged            |
| T05  | Add `first_page_written` client telemetry event    | codex  | merged            |
| T07  | Promote backend persistence to Postgres canonical  | claude | merged            |
| T07a | Wire `outbox_store` diagnostic snapshots           | claude | merged            |
| T07-eval-gate | Verify eval gate against Postgres          | claude | in-progress       |
| T07-cutover | Drop dual-write JSON paths after Postgres soak | claude | blocked-T07-eval |
| T08  | Centralize prompt assembly + first memory tier (backend) | claude | merged            |
| T08w-triggers | Fire creative-memory write triggers from `/talk` | claude | merged            |
| T08-postgres | Move creative memory store to persistence adapter | claude | merged            |
| T10  | Codify single design system (color/typo/spacing)   | codex  | merged            |
| T11  | 60-second magic-moment onboarding                  | codex  | merged            |
| T12  | Adopt perceived-speed primitives system-wide       | codex  | merged            |
| T13  | Add second realtime supplier behind interface      | claude | merged            |
| T13-client | Add iOS realtime supplier selection            | codex  | merged            |
| T29  | Hook iOS reply-side character mentions             | codex  | merged            |
| T14  | Triage G3 backend feature snapshot                 | codex  | merged            |
| T23  | Add craft completeness RC release gate             | claude | merged            |
| T24  | Consolidate iOS ScreenplayPromptBuilder path      | codex  | merged            |
| T25  | Add Story Circle + Hero's Journey craft frameworks | codex  | merged            |
| T26  | Polish Craft tab framework and drift UX            | codex  | merged            |
| T-format-linter | Hollywood format linter (rules v1)        | claude | merged            |
| T27  | Add Codex-to-Claude live handoff ledger            | codex  | merged            |
| T28  | Surface format lint cards in iOS Studio            | codex  | merged            |
| T30  | Backend `/memory/record-character-mention` endpoint | claude | merged            |
| T-logline-distiller | Distill, persist, and drift-score loglines | claude | merged            |
| T-block-detector | Detect writer-block patterns from talk telemetry | claude | merged            |
| T-trait-library | Build per-character trait and voice inventory | claude | merged            |
| T-twist-engine | Beat-aware reversal suggestion engine         | claude | merged            |
| T31  | Refresh coordination statuses after merge stack    | codex  | merged            |
| T32  | Enable reply-side character mention memory flag | codex  | merged            |
| T33  | Add Claude command center and prompt printer      | codex  | merged            |
| T-codex-inbox | Add Codex inbox + prompt printer (Claude→Codex)    | claude | merged         |
| T34  | Build iOS logline rail consumer                   | codex  | merged            |
| T35  | Build iOS block-signal nudge surface              | codex  | merged            |
| T36  | Build iOS character-traits side-rail consumer      | codex  | merged            |
| T37  | Build iOS twist-card consumer                     | codex  | merged            |
| T-accepted-twist-log | Persist accepted twist cards for prompt context | claude | merged         |
| T-coordination-state | Fast-path coordination.json + CLI helper        | claude | merged         |
| T-auto-merge-tier1 | Auto-merge workflow for Tier 1 PRs              | claude | merged         |
| T-decisions-queue | One-file queue for human decisions               | claude | merged         |
| T-strict-auto-merge | Require explicit Codex approval; drop 4h quiet path | claude | merged |
| T-tasks-per-row | Per-row task files + TASKS.md regenerator        | claude | merged    |
| T-block-signal-system-prompt | Inject coaching block when writer is stuck    | claude | review     |
| T38  | Wire iOS accepted twist-card actions              | codex  | review            |

---

## Current next-10 checklist (2026-05-11 after #66 merge)

1. Review-ready Codex PR #71 (`T38`) needs external review/merge; Codex must not merge its own PR.
2. Claude rebases conflict-blocked PRs #63 and #67 over current main.
3. Review PR #63 (`T-trust-tiers`) after rebase; merge only if the human accepts the standing pre-approval policy changes.
4. Use merged PR #66 (`T-decisions-queue`) for human-needed questions.
5. Review PR #67 (`T-tasks-per-row`) after rebase; merge only if the generator keeps `TASKS.md` faithful.
6. Human fixes the PR #33 `OPENAI_API_KEY` Actions secret, then Claude refreshes the eval-gate branch without weakening it.
7. After eval-gate is truly green, Claude resumes `T07-cutover` to drop legacy dual-write JSON paths.
8. Use merged PR #65 (`T-coordination-state`) as the fast machine-readable queue: `node scripts/coordination_state.mjs read`.
9. Use merged PR #64 (`T-auto-merge-tier1`) carefully: only label routine Tier 1 PRs after review, and use blocking labels/comments for anything risky.
10. After PR #71 merges, run release-readiness plus live-backend smoke passes for T34/T35/T36/T37/T38, including accepted-twist Keep/Dismiss/Reload.

---

## Active work — full detail

### T01 — Triage 409-file uncommitted snapshot
- **Owner:** human
- **Branch:** —
- **Pillar:** infra (enables all)
- **Status:** ready
- **Done when:** the snapshot on `codex-save-primary-folder-20260420` is split into ≤6 intent-grouped branches, each open as a PR; no orphan changes remain on the source branch; stale `claude/*` branches with no merged work are deleted.

### T04 — Apply canonical product name `io.them` end-to-end
- **Owner:** codex
- **Branch:** `codex/T04-io-them-canonical-name`
- **Pillar:** living companion (identity)
- **Status:** merged
- **Done when:** `Info.plist` `CFBundleDisplayName`, `README.md` title line, onboarding copy, and any user-visible string read `io.them` (or final agreed casing); no user-visible surface still reads `Framehouse`, `them`, `Clementine`, or `Her*`. References `D001`.

### T05 — Add `first_page_written` client telemetry event
- **Owner:** codex
- **Branch:** `codex/T05-first-page-telemetry`
- **Pillar:** voice→scene (measurement)
- **Status:** merged
- **Done when:** event fires once per user the first time they ship a screenplay-formatted page; visible in the analytics destination; documented in `docs/`.

### T07 — Promote backend persistence to Postgres canonical
- **Owner:** claude
- **Branch:** `claude/T07-postgres-canonical`
- **Pillar:** longitudinal learning
- **Status:** merged
- **Scope (this PR — foundation):** adapter interface + JSON impl + Postgres impl + initial schema for all four store domains + forward and reverse migration scripts + adapter contract tests. Outbox is the proof-wired store.
- **Scope (follow-up rows, claimed by Claude after this PR merges):** wire `memory_store` (T07a), `screenplay_store` (T07b), and the knowledge embeddings cache (T07c) onto the adapter. Each is a focused PR.
- **Done when (this PR):** adapter contract tests green; both backends pass the same contract; `scripts/migrate_stores_to_postgres.mjs` and `scripts/dump_stores_to_json.mjs` round-trip a sample dataset; outbox_store reads/writes via the adapter when `DATABASE_URL` is set, falls back to JSON when unset; `docs/T07-persistence-canonical.md` documents the architecture and the migration runbook.
- **Done when (overall T07):** all four `*_store.json` paths at backend root deprecated; backend reads/writes only via the adapter (Postgres in CI/prod, JSON in local dev as the explicit fallback); `npm run eval:gate` green with `DATABASE_URL` set.

### T07a — Wire `outbox_store` to persistence adapter
- **Owner:** claude
- **Branch:** `claude/T07a-outbox-snapshots`
- **Pillar:** longitudinal learning + infra (enables all)
- **Status:** merged
- **Architectural call:** the outbox is a queue with worker semantics, not domain KV data. `scaleBackplane` is its canonical operational layer (in-memory + Redis stream + Postgres `outbox` table when `SCALE_POSTGRES_URL` is set). The T07 persistence adapter is for KV-style domain data (memory, screenplay, embeddings, craft, creative_memory). Forcing the queue onto the adapter would erase scaleBackplane's queue semantics. **Decision proposed in `docs/T07a-outbox-architecture.md`:** the queue stays on `scaleBackplane`; T07a contributes diagnostic/recovery-grade *snapshots* of outbox state into the adapter under the `outbox` domain, so backend operators have a Postgres-visible record of outbox health without changing the queue path.
- **Done when:** `OutboxSnapshotter` writes periodic JSON snapshots into the persistence adapter; backend wires the snapshotter at startup; tests assert snapshot shape + that the snapshotter does not interfere with scaleBackplane; `docs/T07a-outbox-architecture.md` documents the architecture and proposes the formal decision (D-something, human authors).

### T07-eval-gate — Verify eval gate against Postgres
- **Owner:** claude
- **Branch:** `claude/T07-eval-gate-postgres`
- **Pillar:** longitudinal learning + infra (enables all)
- **Status:** in-progress
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
- **Status:** merged
- **Scope (narrowed):** backend memory tier + backend-side prompt assembly. The original done-when referenced `ScreenplayPromptBuilder` (iOS) which is out of Claude's scope and not yet on `main`. iOS prompt-path consolidation is a sibling Codex follow-up — Codex to add a row when the dirty iOS state lands.
- **Done when (backend portion):** A creative-companion memory record (style, characters, tone, habits) persists per user; a single `buildModelPrompt(...)` is the only path used by `handleTalkRequest`; every model-bound prompt carries the memory context when present and degrades cleanly when absent; new eval `run_creative_memory_eval.mjs` covers both states and is wired into `eval:gate`; design and final state documented in `docs/T08-prompt-centralization-and-memory-tier.md`.
- **Design doc:** [docs/T08-prompt-centralization-and-memory-tier.md](docs/T08-prompt-centralization-and-memory-tier.md)

### T08w-triggers — Fire creative-memory write triggers from `/talk`
- **Owner:** claude
- **Branch:** `claude/T08w-triggers`
- **Pillar:** living companion + longitudinal learning
- **Status:** merged
- **Done when:** character mentions, scene completions, and tone signals detected in `/talk` exchanges trigger the corresponding `recordXxx` calls on `creativeMemoryStore`; `run_creative_memory_eval.mjs` covers at least one trigger-fired case.

### T08-postgres — Move creative memory store to persistence adapter
- **Owner:** claude
- **Branch:** `claude/T08-postgres`
- **Pillar:** living companion + longitudinal learning
- **Status:** merged
- **Done when:** `creative_memory_store.js` uses `createPersistence(...)` for the chosen memory domain, its public API stays unchanged, and the eval suite stays green.

### T10 — Codify single design system (color, typography, spacing)
- **Owner:** codex
- **Branch:** `codex/T10-design-system`
- **Pillar:** mobile-first
- **Status:** merged
- **Done when:** one color file, one typography file, one spacing scale; legacy `HerColors`, `FountainTypography`, and `*Chrome*` styling consolidated or deprecated; lint or build rule fails any new file that bypasses them.

### T11 — 60-second magic-moment onboarding
- **Owner:** codex
- **Branch:** `codex/T11-magic-moment-onboarding`
- **Pillar:** voice→scene + mobile-first
- **Status:** merged
- **Done when:** cold-start to a properly formatted screenplay page in ≤60 seconds on a real iPhone, validated by the human; `first_page_written` (T05) fires; flow uses centralized prompts (T08).

### T12 — Adopt perceived-speed primitives system-wide
- **Owner:** codex
- **Branch:** `codex/T12-perceived-speed`
- **Pillar:** mobile-first + voice→scene
- **Status:** merged
- **Done when:** skeletons, optimistic writes, and audio-first responses are the default in the studio surface; measured time-to-perceived-response is ≤100 ms for the magic-moment path.

### T38 — Wire iOS accepted twist-card actions
- **Owner:** codex
- **Branch:** `codex/T38-accepted-twist-ios`
- **Pillar:** living companion + longitudinal learning
- **Status:** review
- **Done when:** the iOS twist-card surface can record accepted twists with `POST /craft/twist/accepted`, dismiss them with `DELETE /craft/twist/accepted/:twistId`, and reload accepted twists with `GET /craft/twist/accepted?projectId=`; request/response contracts are covered by tests; failures degrade to non-blocking UI messages while PR #59 is still pending.

### T13 — Add second realtime supplier behind existing interface
- **Owner:** claude
- **Branch:** `claude/T13-realtime-supplier-interface`
- **Pillar:** living companion (resilience)
- **Status:** merged
- **Scope (this PR — foundation):** extract a `RealtimeSupplier` interface; wrap the existing OpenAI client-secret minting path as `OpenAIRealtimeSupplier`; ship a `StubRealtimeSupplier` that satisfies the interface deterministically (placeholder for a future real second supplier); factory selects via `REALTIME_PROVIDER` env var; `POST /realtime/client_secret` routes through the supplier interface; smoke tests assert both suppliers satisfy the interface contract.
- **Scope (follow-up):** integrate a real second supplier (ElevenLabs Conversational AI / Anthropic Realtime / etc.) once API access is provisioned. The interface this PR ships keeps that follow-up to a single new file + a small factory entry.
- **Done when (foundation, this PR):** OpenAI logic extracted behind the interface; stub second supplier passes the same contract test; runtime config via `REALTIME_PROVIDER` defaults to `openai`; `POST /realtime/client_secret` returns the supplier's mint result regardless of provider; tests exercise both paths.
- **Done when (overall T13):** a real second supplier ships behind the same interface and is exercised end-to-end against a live account in CI.

### T13-client — Add iOS realtime supplier selection
- **Owner:** codex
- **Branch:** `codex/T13-realtime-supplier-client`
- **Pillar:** living companion (resilience)
- **Status:** merged
- **Done when:** iOS can choose server default, OpenAI, or stub realtime supplier for `/realtime/client_secret`; the selection is visible in Voice settings and sent in the client-secret request; both OpenAI and stub request paths are exercised by tests or smoke coverage.

### T29 — Hook iOS reply-side character mentions
- **Owner:** codex
- **Branch:** `codex/T-ios-reply-character-mentions`
- **Pillar:** living companion + longitudinal learning
- **Status:** merged
- **Done when:** the iOS screenplay-render path extracts likely rendered character cues from final page text and posts them to `/memory/record-character-mention` behind an opt-in feature flag; missing endpoint or disabled flag is a safe no-op; tests cover extraction, feature flag behavior, and request shape.
- **Dependency:** Claude/backend still needs to ship `/memory/record-character-mention`; Codex will leave the call site guarded until that endpoint exists.


### T25 — Add Story Circle + Hero's Journey craft frameworks
- **Owner:** codex
- **Branch:** `codex/T25-additional-craft-frameworks`
- **Pillar:** voice→scene + living companion
- **Status:** merged
- **Done when:** `backend/lib/craft_frameworks.js` exposes Story Circle and Hero's Journey definitions; each has a JSON fixture under `backend/fixtures/craft/`; framework list/lookup endpoints include them; schema and backend tests validate all four frameworks; macOS tests and generic iOS build remain green.

### T14 — Triage G3 backend feature snapshot
- **Owner:** codex
- **Branch:** `codex/T14-g3-snapshot-triage`
- **Pillar:** living companion + longitudinal learning
- **Status:** merged
- **Done when:** the G3 backend feature work is split into intent-grouped commits or explicitly routed to Claude with context; no G3 backend changes remain orphaned in the dirty tree.
- **Decision:** Option A from the handoff brief. Codex will own the snapshot triage because the work appears to have been authored before the protocol existed; Claude should run backend eval gates before merge.

### T23 — Add craft completeness RC release gate
- **Owner:** claude
- **Branch:** `claude/T23-craft-completeness-gate`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Done when:** new `scripts/check_craft_completeness.mjs` reads a craft report (file path or `craft_reports` adapter key), exits 0 when `coverage.complete === true` (including overrides), exits 1 with actionable diagnostics otherwise; `scripts/quality_gate.sh` runs it under `RUN_CRAFT_COMPLETENESS_GATE=1`; the release-preflight workflow flips the env var on by default for `rc-*` runs; tests assert pass on `report_complete.json` + `report_with_override.json` and fail on `report_with_drift.json`.

### T24 — Consolidate iOS ScreenplayPromptBuilder path
- **Owner:** codex
- **Branch:** `codex/T24-prompt-builder-consolidation`
- **Pillar:** living companion + longitudinal learning
- **Status:** merged
- **Done when:** every model-bound prompt request from iOS is produced through one Swift `ScreenplayPromptBuilder` entry point; legacy prompt-construction sites are replaced; the builder routes screenplay requests through the backend endpoint that runs canonical `buildModelPrompt(...)`; tests cover the single-path contract.

### T27 — Add Codex-to-Claude live handoff ledger
- **Owner:** codex
- **Branch:** `codex/T27-claude-live-handoff`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Done when:** a repo-visible Codex-maintained handoff ledger exists, records each completed Codex task/PR with verification and Claude action items, and PR descriptions point Claude to the ledger as the real-time supervisor status source.

### T26 — Polish Craft tab framework and drift UX
- **Owner:** codex
- **Branch:** `codex/T26-craft-tab-polish`
- **Pillar:** voice→scene + living companion
- **Status:** merged
- **Done when:** the Craft tab has a live-framework switcher, a user-facing override creation flow, and a major-turn timeline that visualizes drift from expected page bands; fixtures support SwiftUI previews; macOS tests and generic iOS build remain green.

### T-format-linter — Hollywood format linter (rules v1)
- **Owner:** claude
- **Branch:** `claude/T-format-linter`
- **Pillar:** voice-to-scene + living companion (industry-rule layer of the Craft Intelligence Suite)
- **Status:** merged
- **Scope:** purely rule-based (no LLM). Rules v1 covers scene-heading shape, character-cue caps + own-line, parenthetical density, action-line voice flags, page-economy heuristic. Each violation is a structured suggestion with severity (`hard` | `medium` | `soft`), not a rejection. Endpoint `POST /craft/format/lint` accepts a screenplay text payload + framework hint and returns suggestions. No iOS work in this PR; Codex's `T-format-iOS` row consumes the endpoint when it's ready.
- **Done when:** `backend/lib/format_linter.js` exposes `lintScreenplay({ text, frameworkId? })` returning structured suggestions; route mounts under `/craft/format/lint`; ≥15 unit tests cover each rule (positive + negative cases); fixture-driven tests against the existing `report_complete.json` source screenplay shape; full backend test suite stays green; design notes in `docs/T-format-linter.md`.


### T28 - Surface format lint cards in iOS Studio
- **Owner:** codex
- **Branch:** `codex/T28-format-lint-ios`
- **Pillar:** voice-to-scene + living companion
- **Status:** merged
- **Done when:** iOS has typed client/models for `POST /craft/format/lint`; Studio import/export/document warnings surface severity, rule id, message, and page/line hints as craft lint cards; formatting suggestions are available without blocking save/export; focused tests cover decoding and warning mapping.

### T30 — Backend `/memory/record-character-mention` endpoint
- **Owner:** claude
- **Branch:** `claude/T30-record-character-mention-endpoint`
- **Pillar:** living companion + longitudinal learning
- **Status:** merged
- **Scope:** unblocks Codex PR #50 (T29). Adds `POST /memory/record-character-mention` that persists rendered screenplay character cues through `creativeMemoryStore.recordCharacterMention(...)` — the canonical creative-memory path, not ad hoc JSON. Accepts both `character_name` (snake_case) and `characterName` (camelCase). Threads `source`, `tags`, `write_id`, `line`, and `metadata.{screenplay_write_id, screenplay_project_id, screenplay_version_id}` onto the character record so reply-side mentions are distinguishable from user-input mentions. Missing optional metadata never fails the request. Returns the typed receipt iOS expects: `{ ok, action, characterName, source }`.
- **Done when:** the endpoint is mounted in `backend/index.js`, persists through `creativeMemoryStore`, validates/sanitizes name and source, accepts snake_case+camelCase, returns the typed receipt; ≥5 endpoint integration tests cover (1) snake_case payload, (2) camelCase payload, (3) metadata + write_id + line preservation, (4) invalid/empty character_name rejection, (5) idempotent-ish repeated mentions; the full backend suite stays green. Codex can enable `memory.reply_character_mentions_enabled` once this merges.

### T-logline-distiller — Distill, persist, and drift-score loglines
- **Owner:** claude
- **Branch:** `claude/T-logline-distiller`
- **Pillar:** living companion + longitudinal learning
- **Status:** merged
- **Done when:** backend exposes `POST /craft/logline/distill`, `GET /craft/logline/drift`, and `GET /craft/logline/history`; loglines persist in the `craft_loglines` domain with migration coverage; deterministic mode is default, optional LLM mode uses the existing classifier interface; drift scoring is tested; full backend suite is green.

### T-block-detector — Detect writer-block patterns from talk telemetry
- **Owner:** claude
- **Branch:** `claude/T-block-detector`
- **Pillar:** living companion + longitudinal learning
- **Status:** merged
- **Done when:** backend derives structured writer-block signals from `/talk` telemetry, scene-attempt gaps, repeated stalled drafts, and retry loops; exposes a typed endpoint or prompt-context block for iOS companion nudges; tests cover no-signal, soft-signal, and high-confidence block states; docs explain thresholds and privacy behavior.

### T-trait-library — Build per-character trait and voice inventory
- **Owner:** claude
- **Branch:** `claude/T-trait-library`
- **Pillar:** living companion + longitudinal learning
- **Status:** merged
- **Done when:** backend maintains a persistence-backed per-character trait/voice inventory from creative memory and screenplay dialogue; traits are deduped, source-tagged, and retrievable for prompt assembly; tests cover merge, decay/update, and empty-state behavior; docs explain how iOS should consume it.

### T-twist-engine — Beat-aware reversal suggestion engine
- **Owner:** claude
- **Branch:** `claude/T-twist-engine`
- **Pillar:** voice→scene + living companion
- **Status:** merged
- **Done when:** backend produces deterministic beat-aware reversal/twist suggestions using craft framework and classification data; optional LLM mode is isolated behind existing provider patterns; suggestions cite the beat/turn they operate on; tests cover deterministic output, missing craft context, and malformed input.

### T31 — Refresh coordination statuses after merge stack
- **Owner:** codex
- **Branch:** `codex/T31-coordination-status-cleanup`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Done when:** `TASKS.md` and `docs/codex-claude-live-handoff.md` accurately reflect the merged PR stack, current Claude blockers, and next Codex/Claude handoff state; no stale review/in-progress rows remain for already-merged tasks; Claude has GitHub supervisor comments on active Claude PRs.

---

## Completed (last 30 days)

### T09 — Modularize `DraftStudio` and `ScreenplayStudio` into SwiftPM packages
- **Owner:** codex
- **Branch:** `codex/T09-studio-modularization`
- **Merged:** 2026-05-09 via PR #24.
- **Note:** Added local SwiftPM packages, wired them into app and tests, reduced `ContentView.swift` to 7 LOC, and verified macOS tests plus iOS generic build.

### T21 — Add craft-aware prompts and beat classification
- **Owner:** claude
- **Branch:** `claude/T21-craft-prompts-classification`
- **Merged:** 2026-05-09 via PR #23.
- **Note:** Added craft prompt blocks and deterministic/LLM beat classification; merged after resolving the T22 persistence overlap.

### T22 — Persist craft snapshots and turn overrides
- **Owner:** claude
- **Branch:** `claude/T22-craft-snapshots-persistence`
- **Merged:** 2026-05-09 via PR #20.
- **Note:** Persisted craft reports and overrides through the T07 adapter, including restart-safe override IDs.

### T02 — Resolve `archive/` vs `Archive/` case collision
- **Owner:** codex
- **Branch:** `codex/T02-archive-case-collision`
- **Merged:** 2026-05-09 via PR #21.
- **Note:** Git already tracked lowercase `archive/...`; the local worktree directory was normalized from `Archive/` to `archive/`, and D004 records lowercase `archive/` as the proposed canonical casing.

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

### T32 — Enable reply-side character mention memory flag
- **Owner:** codex
- **Branch:** `codex/T32-enable-reply-mentions`
- **Pillar:** living companion + longitudinal learning
- **Status:** merged
- **Done when:** the iOS reply-side character mention hook defaults on now that T30 is merged; explicit user/debug defaults can still disable it; focused tests cover default-on, explicit-off, and request-shape behavior; the handoff ledger records the completion for Claude.

---

### T33 — Add Claude command center and prompt printer
- **Owner:** codex
- **Branch:** `codex/T33-claude-command-center`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Done when:** a short repo-visible Claude inbox exists with current assignment, blockers, and Codex supervisor status; a script prints the exact prompt/brief to send Claude; `docs/codex-claude-live-handoff.md` points agents to the new inbox so the human no longer has to copy/paste long checklists.

### T-codex-inbox — Add Codex inbox + prompt printer (Claude→Codex)
- **Owner:** claude
- **Branch:** `claude/T-codex-inbox`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Scope:** symmetric reverse of T33. Adds `docs/codex-inbox.md` (Claude-maintained — current open Claude PRs awaiting Codex action, endpoint contracts ready to consume, blockers, decisions Claude needs from Codex) and `scripts/print_codex_prompt.mjs` (mirrors `print_claude_prompt.mjs` for the Codex direction). Updates `docs/codex-claude-live-handoff.md` so Codex standard read includes the inbox, and `docs/claude-inbox.md` so the human sees both ends of the contract. Removes the need to copy/paste a Claude→Codex handoff after each Claude PR.
- **Done when:** `docs/codex-inbox.md` exists with current open Claude PRs, endpoint contracts, blockers, and decisions Claude needs from Codex; `scripts/print_codex_prompt.mjs` extracts the same sections and renders a compact prompt; `docs/codex-claude-live-handoff.md` Fast Path lists the new inbox; `docs/claude-inbox.md` notes that Claude maintains the reciprocal channel.

---

### T-accepted-twist-log — Persist accepted twist cards for prompt context
- **Owner:** claude
- **Branch:** `claude/T-accepted-twist-log`
- **Pillar:** living companion + longitudinal learning (Craft Intelligence Suite, Layer 2 follow-up)
- **Status:** merged
- **Scope:** when a writer accepts a twist card surfaced by `POST /craft/twist/suggest` (T-twist-engine), the choice should persist so subsequent prompt-assembly can reference the chosen reversal. New persistence domain `accepted_twists` keyed by `projectId:versionId:twistId` (migration 006). Pure analysis module `backend/lib/accepted_twist_log.js` exposes `recordAcceptedTwist`, `getAcceptedTwistsForProject`, `removeAcceptedTwist`, `buildAcceptedTwistsBlockForPrompt`. Two endpoints under `/craft/twist/accepted`: `POST` to record an acceptance; `GET` to fetch the chronological log for a project; `DELETE /craft/twist/accepted/:twistId?projectId=` to un-accept. Twist shape mirrors the merged T-twist-engine `{ id, label, hook, severity, rationale }`. iOS twist-card consumer (Codex follow-up) can POST on acceptance and consume the GET when re-loading the timeline.
- **Done when:** module exposes the four functions; new `accepted_twists` domain in `KNOWN_DOMAINS` + migration `006_accepted_twists.sql`; endpoints mounted under `/craft/twist/accepted*`; ≥10 unit tests + ≥4 endpoint integration tests; full backend test suite stays green; design notes in `docs/T-accepted-twist-log.md`.

---

### T34 — Build iOS logline rail consumer
- **Owner:** codex
- **Branch:** `codex/T34-ios-logline-rail`
- **Pillar:** living companion + longitudinal learning
- **Status:** merged
- **Done when:** iOS has typed client/models for `POST /craft/logline/distill`, `GET /craft/logline/drift`, and `GET /craft/logline/history`; the Studio rail surfaces current logline, drift, and recent history without blocking writing; focused tests cover decoding and view-state mapping; handoff docs name the next Claude/Codex follow-up.

---

### T35 — Build iOS block-signal nudge surface
- **Owner:** codex
- **Branch:** `codex/T35-block-signal-nudge`
- **Pillar:** living companion + longitudinal learning
- **Status:** merged
- **Done when:** iOS has typed client/models for `GET /memory/block-signal`; the Studio companion or craft rail renders a non-blocking block-signal nudge gated by backend `level`; focused tests cover decoding and view-state mapping; handoff docs name the next Claude/Codex follow-up.

### T-coordination-state — Fast-path coordination.json + CLI helper
- **Owner:** claude
- **Branch:** `claude/T-coordination-state`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Scope:** new `docs/coordination.json` is a tiny shared state file (open PRs by tier, blockers by owner, decisions pending, endpoints awaiting iOS consumers). `scripts/coordination_state.mjs` is a dependency-free CLI for read/open-prs/blockers/decisions/add-pr/close-pr/set-pr/add-blocker/clear-blocker/add-decision/clear-decision. Agents stamp `updatedAt` + `updatedBy` automatically. Replaces "re-read three ledgers to see what's open" with one fast read.
- **Done when:** the JSON file exists with the current open Claude PRs seeded; the CLI reads + mutates it correctly; `node scripts/coordination_state.mjs read` returns a useful summary; both agents can call it without breaking the existing inbox/handoff docs.

---

### T-auto-merge-tier1 — Auto-merge workflow for Tier 1 PRs
- **Owner:** claude
- **Branch:** `claude/T-auto-merge-tier1`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Scope:** new GitHub Actions workflow `.github/workflows/auto-merge-tier1.yml`. Activates on PRs (open/sync/label/comment) and on completion of the `quality-gate` workflow. For PRs carrying the `tier-1` label (and not `tier-2`/`tier-3`/`needs-human`/`do-not-merge`), the workflow verifies the merge state is `CLEAN`, then checks for explicit approval through a trusted formal review or trusted `Codex supervisor update: approved` / `Claude supervisor update: approved` comment. There is no quiet-time fallback. If all gates pass, it squash-merges and deletes the branch. Tier 3 PRs are never auto-merged. Companion to T-trust-tiers (PR #63).
- **Done when:** workflow file lands; PR description names the exact gates the workflow checks; the `tier-1` label can be created in the repo (workflow tolerates the label not existing by simply skipping).

---

### T36 — Build iOS character-traits side-rail consumer
- **Owner:** codex
- **Branch:** `codex/T36-ios-character-traits`
- **Pillar:** living companion + longitudinal learning
- **Status:** merged
- **Done when:** iOS has typed client/models for `GET /memory/character-traits`; the Studio side rail surfaces character voice/trait cards with loading, empty, and retry states; focused tests cover decoding and view-state mapping; handoff docs name the next Claude/Codex follow-up.

---

### T37 — Build iOS twist-card consumer
- **Owner:** codex
- **Branch:** `codex/T37-ios-twist-cards`
- **Pillar:** living companion + screenplay craft
- **Status:** merged
- **Done when:** iOS has typed client/models for `POST /craft/twist/suggest`; the Studio craft or companion rail can request beat-aware reversal cards from the merged twist engine with loading, empty, and retry states; focused tests cover request shape, decoding, and view-state mapping; handoff docs name the next Claude/Codex follow-up.

---

### T-decisions-queue — One-file queue for human decisions
- **Owner:** claude
- **Branch:** `claude/T-decisions-queue`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Scope:** `docs/decisions-queue.md` is the single place either agent posts "needs human" questions, with a one-line question per entry, the reason it matters, and a safe default. AGENTS.md `Decisions` section gains a one-paragraph pointer so the convention is durable. Open entries follow a stamped shape (`D-<slug>`, `Asked by`, `Asked at`, `Why it matters`, `Question`, `Default if no answer`). Resolved entries move to the bottom with the human's answer. Replaces decisions hidden inside PR bodies and chat memory.
- **Done when:** the file exists with the documented template and no open entries; AGENTS.md's `Decisions` section names the queue as the canonical channel.

---

### T-strict-auto-merge — Require explicit Codex approval
- **Owner:** claude
- **Branch:** `claude/T-strict-auto-merge`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Scope:** tighten `.github/workflows/auto-merge-tier1.yml` by removing the four-hour quiet-time fallback and requiring an explicit trusted cross-agent approval signal before any Tier 1 PR can auto-merge.
- **Done when:** the workflow has no quiet-time merge path; approval still requires a trusted OWNER/MEMBER/COLLABORATOR review or supervisor approval comment; the PR verifies with the workflow evaluate check.

---

### T-tasks-per-row — Per-row task files + TASKS.md regenerator
- **Owner:** claude
- **Branch:** `claude/T-tasks-per-row`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Scope:** new `tasks/_active/` directory holds one markdown file per active task (YAML-style front matter + Scope/Done-when body). `scripts/build_tasks_md.mjs` reads these files and renders both the quick-view table and the per-task detail blocks. `--write` mode looks for `<!-- BEGIN AUTOGEN active-tasks -->` / `<!-- END AUTOGEN active-tasks -->` anchors in TASKS.md and overwrites between them; the anchors do not exist yet, so `--write` is a no-op until a follow-up adds them. Removes the recurring “two agents touch line 42 of TASKS.md” merge-conflict class without breaking the current flow.
- **Done when:** `tasks/README.md` documents the layout; `tasks/_active/` is seeded with at least the per-row files for this PR + T-trust-tiers; `node scripts/build_tasks_md.mjs` prints a valid rendered section; TASKS.md remains the source of truth until a follow-up flips the anchors on.

---

## Notes

- Claim a row by editing it to `Owner=<you>, Status=in-progress` **as the first commit on your new branch**. If two agents try to claim the same row, the merge conflict on this file is the correct signal — do not work around it; resolve the intent.
- New rows must include a one-line "done when" before they go to `ready` or `ready-for-claude`. A row without a definition of done does not belong in this file.
- When a row reaches `merged`, move it to "Completed" with the merge date. Prune rows older than 30 days.
