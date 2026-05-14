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
| T-build-tasks-md-anchors | Add AUTOGEN anchors to TASKS.md + harden anchor matcher | claude | merged |
| T-archetype-engine | Character archetype classifier (hero/mentor/shadow/etc) | claude | merged |
| T-archetype-engine-canon-eval | Pin canonical archetype set + per-entry shape | claude | merged |
| T-screenplay-import-fountain | POST /screenplay/import/fountain (parser)        | claude | merged |
| T-coverage-simulator | What-a-reader-sees coverage report + endpoint           | claude | merged |
| T-fdx-export-endpoint | POST /screenplay/export/fdx (Final Draft XML)   | claude | merged |
| T-payoff-tracker | Setup → payoff detection + endpoint                          | claude | merged |
| T-talk-turn-meta-stats | GET /talk/stats — aggregate /talk health (safe-public)   | claude | merged |
| T-talk-error-rate-tracker | In-memory error counter + GET /talk/errors (safe-public) | claude | merged |
| T-realtime-supplier-health | Supplier shape + live probe + /realtime/health   | claude | merged |
| T-block-signal-clears-on-completion | Behavioral tests lock block-signal recovery | claude | merged |
| T-craft-frameworks-eval | Eval that runs analyzer against all frameworks   | claude | merged     |
| T-fountain-export-endpoint | POST /screenplay/export/fountain (Fountain text) | claude | merged |
| T-backend-surface-smoke | Whole-surface smoke eval for every iOS-facing route | claude | merged |
| T-genre-classifier | Deterministic genre + tone classifier + endpoint | claude | merged |
| T-realtime-supplier-failover | Transparent stub fallback when primary mint fails | claude | merged |
| T-block-signal-system-prompt | Inject coaching block when writer is stuck    | claude | merged     |
| T-block-signal-history-tracking | Persist block-signal samples to creative memory habits | claude | merged |
| T-block-signal-history-route | GET /memory/block-signal/history read endpoint        | claude | merged |
| T-block-signal-history-bounds-eval | Pathological-input guard on the BS history buffer | claude | merged |
| T-prompt-assembly-block-signal-cap-eval | Cap on `<block_signal>` block size under pathological inputs | claude | merged |
| T-talk-turn-meta-contract-snapshot | Pin /talk/turn/:turnId response key set + error codes  | claude | merged |
| T-talk-turn-rate-limit-route | Optional rate-limit middleware on talk-turn reads | claude | merged |
| T-screenplay-export-markdown | POST /screenplay/export format=md|markdown            | claude | merged |
| T-decisions-queue-fixture-template | docs/decisions-queue-template.md entry skeleton | claude | merged |
| T-coordination-state-cli-validate | Add validate subcommand to coordination_state.mjs | claude | merged |
| T-coordination-state-mutate-eval | Round-trip eval over coordination_state.mjs mutators | claude | merged |
| T-creative-memory-version-check-eval | Pin creative-memory snapshot version field | claude | merged |
| T-creative-memory-store-eviction-eval | Guard creative-memory character roster growth | claude | merged |
| T-known-domains-startup-check | Validate KNOWN_DOMAINS at backend startup | claude | merged |
| T-screenplay-export-pdf-error-clarity | Add helpful PDF rejection payload | claude | merged |
| T-ops-routes-list-route | GET /ops/routes curated manifest of optional surfaces    | claude | merged |
| T-decisions-queue-md-lint | Lint docs/decisions-queue.md format                       | claude | merged |
| T-block-signal-atms-zero-fix | Honor atMs=0 in recordBlockSignalSample (falsy-coerce bug)    | claude | merged |
| T-known-domains-runtime-check | KNOWN_DOMAINS invariants (frozen, snake_case, roundtrip) | claude | merged |
| T-prompt-assembly-snapshot-eval | Pin canonical buildModelPrompt block order            | claude | merged |
| T-prompt-size-eval | Char-budget guard on assembled model prompts             | claude | merged |
| T-memory-quality-eval | Multi-turn creative-memory recall eval                   | claude | merged |
| T-tasks-sync-check | CI script to detect tasks/_active vs TASKS.md drift      | claude | merged |
| T-decisions-queue-route | GET /coordination/decisions-queue as JSON                | claude | merged |
| T-creative-memory-stats-route | GET /memory/stats content-free summary                  | claude | merged |
| T-coordination-state-eval | Schema check on docs/coordination.json                | claude | merged |
| T38  | Wire iOS accepted twist-card actions              | codex  | merged            |
| T39  | Fix missing Studio SF Symbol warning              | codex  | merged            |
| T40  | Fix app UserDefaults suite warning                | codex  | merged            |
| T41  | Defer Studio debug-state publishing               | codex  | merged            |
| T-trust-tiers | Trust tiers + standing pre-approvals (AGENTS.md)              | claude | review            |
| T42-supervisor-merge-protocol | Codex self-merge authority + agent handoff fast lane | codex | merged |
| T43-refresh-claude-queue | Refresh Claude queue after supervisor protocol merge      | codex | merged |
| T44-creative-memory-export-triage | Triage creative-memory export privacy gate       | codex | merged |
| T45-craft-route-json-parser | Parse Craft route JSON in production                   | codex | merged |
| T46-post-review-queue-refresh | Refresh queue after Codex PR reviews                  | codex | merged |
| T47-refresh-after-new-claude-prs | Refresh queue after new Claude PR triage           | codex | merged |
| T48-ios-archetype-traits | Surface character archetypes in the Studio traits rail   | codex | merged |
| T49-post-t48-coordination-refresh | Post-T48 coordination refresh                     | codex | merged |
| T50-refresh-after-pr103-merge | Refresh coordination after PR #103 merge              | codex | merged |
| T51-refresh-after-new-eval-prs | Refresh queue for eval PR blockers                   | codex | merged |
| T52-refresh-after-pr114-merge | Refresh coordination after PR #114 merge              | codex | merged |
| T53-ios-block-signal-history | Add iOS block-signal history surface                   | codex | merged |
| T54-refresh-after-block-history-merge | Refresh queue after block-history eval merge | codex | merged |
| T55-close-stale-handoff-prs | Close stale handoff PRs                                | codex | merged |
| T56-refresh-after-talk-contract | Refresh queue after talk contract merge            | codex | merged |
| T-task-files-cleanup | Add TASKS.md rows for orphan task files                     | claude | merged |
| T60  | Consume screenplay export formats in Studio       | codex  | merged            |
| T61  | Refresh coordination after T60 merge              | codex  | merged            |
| T62  | Quiet offline Studio export-format refresh        | codex  | merged            |
| T63  | Refresh coordination after T62 merge              | codex  | merged            |
| T64  | Quiet offline session-evolution launch probe      | codex  | merged            |
| T65  | Refresh coordination after T64 merge              | codex  | merged            |
| T66  | Refresh queue after Claude PR triage              | codex  | merged            |
| T67  | Refresh queue after PR #148 triage                | codex  | merged            |
| T68  | Refresh queue after PR #150/#151 merges           | codex  | merged            |
| T69  | Refresh queue after PR #134 merge                 | codex  | merged            |
| T70  | Refresh queue after PR #154/#155/#156/#158 merges | codex  | merged            |
| T71  | Add agent throughput protocol and next-action CLI | codex  | merged            |
| T72  | Refresh queue after supervisor merge train        | codex  | merged            |
| T73  | Build iOS Fountain import surface                 | codex  | merged            |
| T74  | Surface ops route manifest in diagnostics         | codex  | merged            |
| T75  | Surface talk-turn rate-limit retry affordance     | codex  | merged            |
| T76  | Refresh coordination after efficiency merge train | codex  | merged            |
| T77  | Refresh coordination after PR #180/#181           | codex  | merged            |
| T-decompose-phase0-health-route | Extract `/health` + `/bridge` from backend index | claude | merged |
| T78  | Refresh coordination after PR #183                | codex  | merged            |
| T79  | Codify second-pass agent efficiency protocol      | codex  | merged            |
| T80  | Refresh coordination after PR #191/#192           | codex  | merged            |
| T81  | Refresh coordination after PR #193/#194           | codex  | review            |
| T-decompose-phase1-ops-routes | Extract `/ops/metrics` + `/ops/alerts` from backend index | claude | merged |
| T-decompose-phase2a-screenplay-projects-reads | Extract 5 `/screenplay/projects/*` GET routes from backend index | claude | merged |
| T-decompose-phase2b-screenplay-projects-writes | Extract 7 `/screenplay/projects/*` write routes from backend index | claude | merged |
| T-decompose-phase3-screenplay-companion | Extract `/screenplay/companion/state` + `/paginate` + `/revision-colors` from backend index | claude | merged |
| T-decompose-phase5a-realtime-reads | Extract 2 read-only `/realtime/*` routes from backend index | claude | review |
| T-logline-drift-alert | Structured drift alert (level + recommendation)  | claude | review      |
| T-first-page-telemetry-sink | Server-side magic-moment SLA event sink         | claude | merged     |
| T-prompt-wire-traits-and-twists | Prompt-assembly consumes traits + accepted twists | claude | merged |

---

## Current next-10 checklist (2026-05-13 after round-17 merge train)

1. Keep PR #33 parked until the human replaces the malformed GitHub Actions `OPENAI_API_KEY` secret.
2. Keep PR #63 parked unless the human explicitly approves trust-policy changes beyond D005.
3. Keep PR #94 parked until the human approves the creative-memory export privacy posture.
4. Keep PR #99 parked until the human approves the creative-memory delete privacy posture and V1 scope.
5. Start the iOS consumer for `POST /craft/coverage/simulate`.
6. Start the iOS consumer for `POST /screenplay/export/fdx`.
7. Start the iOS payoff-tracker surface for `POST /craft/payoff/track`.
8. Start the iOS talk stats / health surface for `GET /talk/stats` and the ops route extractions.
9. Wire first-page telemetry from the app into `POST /telemetry/first-page-written`.
10. Use PR #84's fallback-aware `/realtime/client_secret` response to show a realtime degraded-mode affordance.

---

## Active work — full detail

### T40 — Fix app UserDefaults suite warning
- **Owner:** codex
- **Branch:** `codex/T40-userdefaults-suite-warning`
- **Pillar:** mobile-first
- **Status:** merged
- **Done when:** app launch and test runs no longer open a `UserDefaults` suite using the app bundle identifier; Studio debug preference mirroring still writes to the standard app defaults and any legacy shared mirror domain intentionally; focused tests cover the domain selection behavior.

### T41 — Defer Studio debug-state publishing
- **Owner:** codex
- **Branch:** `codex/T41-defer-studio-debug-publish`
- **Pillar:** mobile-first
- **Status:** merged
- **Done when:** Studio debug-state publication no longer mutates SwiftUI storage synchronously from `onChange`/view-update callbacks; macOS verification no longer logs SwiftUI "Publishing changes from within view updates" for this path; full themTests and generic iOS build pass.

---

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
- **Status:** merged
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
- **Status:** merged
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

### T-logline-drift-alert — Structured drift alert (level + recommendation)
- **Owner:** claude
- **Branch:** `claude/T-logline-drift-alert`
- **Pillar:** living companion + voice→scene
- **Status:** in-progress
- **Scope:** the drift score from `computeDrift({ ... })` is currently a number + a sentence summary. iOS surfaces (T-twist-engine consumers, future logline rail) need a structured signal to decide whether to render a nudge card. This PR adds an additive `alert: { level, actionable, recommendation }` field on the response and the underlying `computeDrift` return. `level` maps from score by the same thresholds the summary already uses; `actionable` flips true at `level >= "firm"`; `recommendation` is a one-liner the iOS card can show verbatim. Additive only — existing decoders ignore the new field.
- **Done when:** `computeDrift(...)` returns an `alert` field on every code path (including the empty-history case); `GET /craft/logline/drift` echoes it; ≥4 unit tests for the threshold bands + a "no history" baseline + an endpoint integration test; full backend suite stays green.

### T-prompt-wire-traits-and-twists — Prompt-assembly consumes traits + accepted twists
- **Owner:** claude
- **Branch:** `claude/T-prompt-wire-traits-and-twists`
- **Pillar:** living companion + longitudinal learning
- **Status:** review
- **Scope:** the trait library (T-trait-library) and accepted twist log (T-accepted-twist-log) persist data but `lib/prompt_assembly.js` does not read either. Closes the longitudinal-learning loop. Extends `buildModelPrompt` and `buildMemoryBlock` to render `creative_memory.characters[].traits` inline per character (compact one-line summary from `trait_library.buildTraitsBlockForPrompt`) and to add a new `<accepted_twists>` block when accepted-twist entries are supplied. `wrapSystemPromptWithCreativeMemory` in `backend/index.js` learns to read accepted twists via `getAcceptedTwistsForProject` when a `projectId` is present in `req.body`.
- **Done when:** `buildModelPrompt` accepts an `acceptedTwists` array and renders it as an `<accepted_twists>...</accepted_twists>` block; character traits surface as inline `traits:` lines under each recurring-character entry; ≥6 prompt-assembly unit tests + ≥2 wrapSystemPromptWithCreativeMemory integration tests; full backend suite stays green; the canonical model-bound prompt path now respects the data Layer 2 stores.

---

### T39 — Fix missing Studio SF Symbol warning
- **Owner:** codex
- **Branch:** `codex/T39-fix-missing-symbol`
- **Pillar:** mobile-first
- **Status:** merged
- **Done when:** the Studio UI no longer asks SwiftUI for the unavailable `square.stack.badge.plus` SF Symbol; replacement icon preserves the duplicate/stack action meaning; focused build verification passes without the missing-symbol runtime warning.

---

### T60 — Consume screenplay export formats in Studio
- **Owner:** codex
- **Branch:** `codex/T60-export-formats-picker`
- **Pillar:** mobile-first + screenplay craft
- **Status:** merged
- **Done when:** iOS has typed client/model coverage for `GET /screenplay/export/formats`; the Studio export menu can render supported formats from the backend contract while preserving local fallback options; focused tests cover decoding, fallback ordering, and unsupported-format filtering; handoff docs tell Claude the endpoint has an app consumer.

---

### T61 — Refresh coordination after T60 merge
- **Owner:** codex
- **Branch:** `codex/T61-post-t60-coordination-refresh`
- **Pillar:** mobile-first + infra
- **Status:** merged
- **Done when:** `TASKS.md`, `docs/coordination.json`, `docs/codex-claude-live-handoff.md`, `docs/claude-inbox.md`, and `docs/codex-inbox.md` reflect PR #137/T60 merged; PR #133/#134 blockers are current; prompt printers and coordination-state checks are green.

---

### T62 — Quiet offline Studio export-format refresh
- **Owner:** codex
- **Branch:** `codex/T62-studio-offline-refresh-quiet`
- **Pillar:** mobile-first + infra
- **Status:** merged
- **Done when:** Studio still discovers backend export formats when appropriate, but app/test launches do not surface noisy localhost connection failures; manual Refresh Formats remains available; focused tests cover the quiet/fallback behavior.

---

### T63 — Refresh coordination after T62 merge
- **Owner:** codex
- **Branch:** `codex/T63-post-t62-coordination-refresh`
- **Pillar:** mobile-first + infra
- **Status:** merged
- **Done when:** `TASKS.md`, `docs/coordination.json`, `docs/codex-claude-live-handoff.md`, `docs/claude-inbox.md`, and `docs/codex-inbox.md` reflect PR #139/T62 merged; Claude's #133/#134 blockers are current against post-T62 `main`; coordination prompt/check scripts pass.

---

### T64 — Quiet offline session-evolution launch probe
- **Owner:** codex
- **Branch:** `codex/T64-session-evolution-quiet`
- **Pillar:** mobile-first + infra
- **Status:** merged
- **Done when:** app/test launches no longer surface noisy localhost `/session/evolution`, `/session`, `/history`, health, keychain, project-outline, or Studio navigator probes during XCTest/offline startup; manual or backend-backed refresh remains available; focused tests cover the quiet policy.

---

### T65 — Refresh coordination after T64 merge
- **Owner:** codex
- **Branch:** `codex/T65-post-t64-coordination-refresh`
- **Pillar:** mobile-first + infra
- **Status:** merged
- **Done when:** `TASKS.md`, `docs/coordination.json`, `docs/codex-claude-live-handoff.md`, `docs/claude-inbox.md`, and `docs/codex-inbox.md` reflect PR #146/T64 merged; Claude's #133/#134 blockers remain current; coordination prompt/check scripts pass.

---

### T66 — Refresh queue after Claude PR triage
- **Owner:** codex
- **Branch:** `codex/T66-refresh-after-claude-pr-triage`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Done when:** `TASKS.md`, `docs/coordination.json`, `docs/codex-claude-live-handoff.md`, `docs/claude-inbox.md`, and `docs/codex-inbox.md` reflect PR #141/#143/#144 merged, PR #142 blocked with a precise review finding, PR #145 closed as stale, and PR #147/T65 merged; coordination prompt/check scripts pass.

---

### T67 — Refresh queue after PR #148 triage
- **Owner:** codex
- **Branch:** `codex/T67-refresh-after-pr148-triage`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Done when:** `TASKS.md`, `docs/coordination.json`, `docs/codex-claude-live-handoff.md`, `docs/claude-inbox.md`, and `docs/codex-inbox.md` reflect PR #148 blocked with the route-manifest scope/rebase finding; coordination prompt/check scripts pass.

---

### T68 — Refresh queue after PR #150/#151 merges
- **Owner:** codex
- **Branch:** `codex/T68-refresh-after-pr150-151`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Done when:** `TASKS.md`, `docs/coordination.json`, `docs/codex-claude-live-handoff.md`, `docs/claude-inbox.md`, and `docs/codex-inbox.md` reflect PR #150 and PR #151 merged; T67 status is internally consistent; coordination prompt/check scripts pass.

---

## Notes

- Claim a row by editing it to `Owner=<you>, Status=in-progress` **as the first commit on your new branch**. If two agents try to claim the same row, the merge conflict on this file is the correct signal — do not work around it; resolve the intent.
- New rows must include a one-line "done when" before they go to `ready` or `ready-for-claude`. A row without a definition of done does not belong in this file.
- When a row reaches `merged`, move it to "Completed" with the merge date. Prune rows older than 30 days.

---

<!-- BEGIN AUTOGEN active-tasks -->

## Active work — quick view (auto-generated from tasks/_active/)

| ID                                             | Title                                                                                    | Owner  | Status      |
|------------------------------------------------|------------------------------------------------------------------------------------------|--------|-------------|
| T-agent-events-jsonl-live-lane                 | Append-only event lane (docs/agent-events.jsonl) + CLI                                   | claude | merged      |
| T-archetype-engine-canon-eval                  | Pin canonical archetype set + per-entry shape                                            | claude | merged      |
| T-backfill-v1-pillar-legacy                    | Backfill V1 pillar/effect on 13 legacy non-merged task files                             | claude | review      |
| T-block-detector-canon-eval                    | Pin block-detector envelope + SIGNAL_WEIGHTS + level thresholds                          | claude | merged      |
| T-block-signal-atms-zero-fix                   | Honor atMs=0 in recordBlockSignalSample (falsy-coerce bug)                               | claude | merged      |
| T-block-signal-history-bounds-eval             | Pathological-input guard on the block-signal history buffer                              | claude | review      |
| T-block-signal-history-route                   | GET /memory/block-signal/history read endpoint                                           | claude | review      |
| T-block-signal-history-tracking                | Persist block-signal samples to creative memory habits                                   | claude | review      |
| T-build-tasks-md-anchors                       | Add AUTOGEN anchors to TASKS.md + harden anchor matcher                                  | claude | merged      |
| T-coord-refresh-batch-12                       | Batched coordination refresh — round 17 (post merge train)                               | claude | review      |
| T-coord-refresh-batch-15                       | Coord refresh round 19 — mark #197/#199/#200/#201/#202 merged                            | claude | review      |
| T-coordination-state-cli-validate              | Add `validate` subcommand to coordination_state.mjs                                      | claude | merged      |
| T-coordination-state-eval                      | Schema check on docs/coordination.json                                                   | claude | merged      |
| T-coordination-state-mutate-eval               | Round-trip eval over coordination_state.mjs mutate subcommands                           | claude | merged      |
| T-creative-memory-stats-route                  | GET /memory/stats content-free summary                                                   | claude | merged      |
| T-creative-memory-store-eviction-eval          | Pathological-input guard on creative-memory character roster                             | claude | merged      |
| T-creative-memory-version-check-eval           | Pin the `version` field on creative-memory snapshots                                     | claude | merged      |
| T-decisions-queue-fixture-template             | docs/decisions-queue-template.md (copy-paste entry template)                             | claude | merged      |
| T-decisions-queue-md-lint                      | Lint docs/decisions-queue.md format                                                      | claude | merged      |
| T-decisions-queue-route                        | GET /coordination/decisions-queue returns the queue as JSON                              | claude | merged      |
| T-decompose-backend-index                      | Decompose 33k-line backend/index.js into per-domain route libs                           | claude | merged      |
| T-decompose-phase0-health-route                | Phase 0 PoC — extract /health + /bridge to lib/health_route.js                           | claude | merged      |
| T-decompose-phase1-ops-routes                  | Decompose backend/index.js — Phase 1 (/ops/metrics + /ops/alerts)                        | claude | merged      |
| T-decompose-phase2a-screenplay-projects-reads  | Decompose backend/index.js — Phase 2a (5 /screenplay/projects/* GET routes)              | claude | merged      |
| T-decompose-phase2b-screenplay-projects-writes | Decompose backend/index.js — Phase 2b (7 /screenplay/projects/* write routes)            | claude | merged      |
| T-decompose-phase3-ready                       | Phase 3 readiness — /screenplay/companion + /paginate + /revision-colors                 | claude | merged      |
| T-decompose-phase3-screenplay-companion        | Decompose backend/index.js — Phase 3 (companion + paginate + revision-colors)            | claude | merged      |
| T-decompose-phase5a-realtime-reads             | Decompose backend/index.js — Phase 5a (2 read-only /realtime/* routes)                   | claude | review      |
| T-deeper-lib-tests-batch                       | Deeper direct tests for user_store (with planned followups for memory_store + user_auth) | claude | review      |
| T-deeper-memstore-and-user-auth-tests          | Deeper tests for memory_store + user_auth                                                | claude | review      |
| T-eval-gate-add-canon-evals                    | Umbrella `npm run eval:canon` for canonical-contract evals                               | claude | merged      |
| T-fix-214-audit-and-readme                     | Fix #214 follow-up — audit script + lib README precedent + task file with V1 pillar      | claude | review      |
| T-format-linter-rules-canon-eval               | Pin canonical rule_id set + envelope for format_linter                                   | claude | merged      |
| T-known-domains-runtime-check                  | KNOWN_DOMAINS invariants (frozen, snake_case, roundtrip)                                 | claude | merged      |
| T-known-domains-startup-check                  | Boot-time invariant check on KNOWN_DOMAINS                                               | claude | merged      |
| T-memory-quality-eval                          | Multi-turn creative-memory recall eval                                                   | claude | merged      |
| T-ops-health-summary-eval                      | Deployment-level eval pinning /ops/health-summary features map                           | claude | merged      |
| T-ops-health-summary-route                     | GET /ops/health-summary cheap uptime-dashboard endpoint                                  | claude | merged      |
| T-ops-routes-list-route                        | GET /ops/routes manifest of optional surfaces                                            | claude | merged      |
| T-pre-flight-outbox-console-cleanup            | Convert outbox console.log → console.warn/error (pre-flight class 1)                     | claude | merged      |
| T-pre-flight-self-check-script                 | scripts/pre_flight.mjs — catch recurring review feedback locally                         | claude | merged      |
| T-prompt-assembly-block-signal-cap-eval        | Cap on <block_signal> block size under pathological inputs                               | claude | merged      |
| T-prompt-assembly-readme                       | README for backend/lib/prompt_assembly.js                                                | claude | merged      |
| T-prompt-assembly-snapshot-eval                | Pin canonical buildModelPrompt block order                                               | claude | merged      |
| T-prompt-size-eval                             | Char-budget guard on assembled model prompts                                             | claude | merged      |
| T-protocol-infra-batch                         | Tighten backend extraction protocol helpers                                              | claude | review      |
| T-schema-docs-batch-2                          | Schema docs batch — talk + screenplay + realtime + ops + memory + block-signal           | claude | review      |
| T-schema-docs-scaffold                         | Bootstrap docs/schemas/ with README + 3 first envelope docs                              | claude | review      |
| T-screenplay-export-formats-list-route         | GET /screenplay/export/formats canonical format list                                     | claude | review      |
| T-screenplay-export-markdown                   | POST /screenplay/export format=md|markdown                                               | claude | review      |
| T-screenplay-export-pdf-error-clarity          | Add human-readable help payload to PDF export rejection                                  | claude | merged      |
| T-talk-turn-meta-contract-snapshot             | Pin /talk/turn/:turnId response key set + error codes                                    | claude | review      |
| T-talk-turn-rate-limit-helper                  | Pure token-bucket rate limiter for talk-turn reads                                       | claude | merged      |
| T-talk-turn-rate-limit-route                   | Optional rate-limit middleware on GET /talk/turn/:turnId                                 | claude | merged      |
| T-task-files-cleanup                           | Add TASKS.md rows for orphan task files (T-trust-tiers, T42-T56)                         | claude | review      |
| T-tasks-active-frontmatter-eval                | Validate every tasks/_active/T-*.md front-matter                                         | claude | merged      |
| T-tasks-active-stats                           | At-a-glance counts over tasks/_active/                                                   | claude | merged      |
| T-tasks-per-row                                | Per-row task files + TASKS.md regenerator (no canonical flip yet)                        | claude | merged      |
| T-tasks-sync-check                             | CI script to detect tasks/_active vs TASKS.md drift                                      | claude | merged      |
| T-trait-library-canon-eval                     | Pin canonical TRAIT_KEYWORDS + cap constants                                             | claude | merged      |
| T-trust-tiers                                  | Trust tiers + standing pre-approvals (AGENTS.md)                                         | claude | review      |
| T-twist-engine-canon-eval                      | Pin TWIST_LIBRARY framework set + per-twist field shape                                  | claude | merged      |
| T-untested-libs-followups                      | Add tests for remaining untested infrastructure libs                                     | claude | planned     |
| T-user-auth-roundtrip-tests                    | Full handler round-trip tests for backend/lib/user_auth.js                               | claude | review      |
| T-v1-pillar-rule-and-canon-wire                | Pre-flight V1 pillar rule + wire 4 V1 smokes into eval:canon                             | claude | review      |
| T-v1-three-smoke-fixtures                      | V1 smoke fixtures — screenplay export + memory recall + realtime failover                | claude | review      |
| T-v1-voice-to-page-smoke                       | V1 voice-to-page smoke fixture + automated subset                                        | claude | review      |
| T42-supervisor-merge-protocol                  | Codex self-merge authority + agent handoff fast lane                                     | codex  | review      |
| T43-refresh-claude-queue                       | Refresh Claude queue after supervisor protocol merge                                     | codex  | review      |
| T44-creative-memory-export-triage              | Triage creative-memory export privacy gate                                               | codex  | review      |
| T46-post-review-queue-refresh                  | Refresh queue after Codex PR reviews                                                     | codex  | review      |
| T47-refresh-after-new-claude-prs               | Refresh queue after new Claude PR triage                                                 | codex  | review      |
| T48-ios-archetype-traits                       | Surface character archetypes in the Studio traits rail                                   | codex  | in-progress |
| T60                                            | Consume screenplay export formats in Studio                                              | codex  | merged      |
| T61                                            | Refresh coordination after T60 merge                                                     | codex  | merged      |
| T62                                            | Quiet offline Studio export-format refresh                                               | codex  | merged      |
| T63                                            | Refresh coordination after T62 merge                                                     | codex  | merged      |
| T64                                            | Quiet offline session-evolution launch probe                                             | codex  | merged      |
| T65                                            | Refresh coordination after T64 merge                                                     | codex  | merged      |
| T66                                            | Refresh queue after Claude PR triage                                                     | codex  | merged      |
| T67                                            | Refresh queue after PR #148 triage                                                       | codex  | merged      |
| T68                                            | Refresh queue after PR #150/#151 merges                                                  | codex  | merged      |
| T69                                            | Refresh queue after PR #134 merge                                                        | codex  | merged      |
| T70                                            | Refresh queue after PR #154/#155/#156/#158 merges                                        | codex  | merged      |
| T71                                            | Add agent throughput protocol and next-action CLI                                        | codex  | merged      |
| T72                                            | Refresh queue after supervisor merge train                                               | codex  | merged      |
| T73                                            | Build iOS Fountain import surface                                                        | codex  | merged      |
| T74                                            | Surface ops route manifest in diagnostics                                                | codex  | merged      |
| T75                                            | Surface talk-turn rate-limit retry affordance                                            | codex  | merged      |
| T76                                            | Refresh coordination after efficiency merge train                                        | codex  | merged      |
| T77                                            | Refresh coordination after PR #180/#181                                                  | codex  | merged      |
| T78                                            | Refresh coordination after PR #183                                                       | codex  | merged      |
| T79                                            | Codify second-pass agent efficiency protocol                                             | codex  | merged      |
| T80                                            | Refresh coordination after PR #191/#192                                                  | codex  | merged      |
| T81                                            | Refresh coordination after PR #193/#194                                                  | codex  | review      |
| T82                                            | Refresh coordination after PR #204/#205/#206/#207                                        | codex  | review      |
| T83                                            | Define V1 and product-state handoff loop                                                 | codex  | review      |
| T84                                            | Surface talk health and error diagnostics in iOS                                         | codex  | review      |
| T85                                            | Round 22 coordination refresh after supervisor merge train                               | codex  | review      |
| T86                                            | Round 22b coordination refresh after design-note mini-train                              | codex  | review      |
| T87                                            | Round 22c coordination refresh after memory and long-tail design notes                   | codex  | review      |
| T88                                            | Round 22d coordination refresh after V1 smoke fixture pack                               | codex  | review      |
| T89                                            | Round 22e coordination refresh after schema docs batch 2                                 | codex  | review      |
| T90                                            | V1 memory and realtime diagnostics in iOS                                                | codex  | review      |
| T91                                            | Round 22f coordination refresh                                                           | codex  | review      |
| T92                                            | Round 22g coordination refresh                                                           | codex  | review      |
| T93                                            | Round 22h coordination refresh                                                           | codex  | review      |
| T94                                            | Claude supervisor note handoff                                                           | codex  | in-progress |

## Active work — full detail (auto-generated)

### T-agent-events-jsonl-live-lane — Append-only event lane (docs/agent-events.jsonl) + CLI
- **Owner:** claude
- **Branch:** claude/T-agent-events-jsonl-live-lane
- **Pillar:** infra (coordination)
- **Status:** merged

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

### T-archetype-engine-canon-eval — Pin canonical archetype set + per-entry shape
- **Owner:** claude
- **Branch:** claude/T-archetype-engine-canon-eval
- **Pillar:** evals (contract stability)
- **Status:** merged

## Scope

`backend/lib/archetype_engine.js` exports the frozen `ARCHETYPES`
map. iOS (T48) reads the labels and renders archetype tags. A
silent rename (`hero` → `protagonist`) or drop of any archetype
would regress every iOS consumer at once.

This eval pins:

- The full canonical label set:
  `hero, mentor, shadow, trickster, ally, herald, threshold_guardian, shapeshifter`
- `ARCHETYPES` is `Object.freeze`d.
- Every entry has: `traitKeywords`, `emotionalDefaults`, `tags`,
  `relationshipFragments`, `minSceneShare`, `weight`.
- `traitKeywords` / `emotionalDefaults` / `tags` are non-empty arrays.
- `minSceneShare` ∈ [0, 1]; `weight` is a positive finite number.
- Labels are lowercase snake_case; `tags` arrays have no duplicates.

Wired via `npm run eval:archetype-canon`.

## Done when

`backend/evals/run_archetype_canon_eval.mjs` exits 0 with all
checks passing; `npm test` still green.

### T-backfill-v1-pillar-legacy — Backfill V1 pillar/effect on 13 legacy non-merged task files
- **Owner:** claude
- **Branch:** claude/T-backfill-v1-pillar-legacy
- **Pillar:** infra
- **Status:** review

## Scope

The V1 pillar pre-flight rule shipped in #235 flagged 13 active
task files with YAML front matter, `status: review`, and no
`v1_pillar` / `v1_effect` declarations. This PR adds the
declarations.

Pillar mapping:

| Task | Pillar | Effect |
| --- | --- | --- |
| T-block-signal-history-bounds-eval | memory | V1 line 49 guard |
| T-block-signal-history-route | memory | V1 line 49 (history surface) |
| T-block-signal-history-tracking | memory | V1 line 49 (persist samples) |
| T-coord-refresh-batch-12 | infra | round-17 merge train |
| T-coord-refresh-batch-15 | infra | round-19 merge train |
| T-decompose-phase5a-realtime-reads | realtime | V1 line 68 |
| T-protocol-infra-batch | infra | lane reminder + lib README + audit |
| T-screenplay-export-formats-list-route | screenplay | V1 line 37 |
| T-screenplay-export-markdown | screenplay | V1 line 37 |
| T-talk-turn-meta-contract-snapshot | talk | V1 line 17 |
| T-task-files-cleanup | infra | TASKS.md drift |
| T-trust-tiers | infra | operating-model |
| T-untested-libs-followups | infra | lib-test gap |

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: closes the 13 task-missing-v1-pillar pre-flight
  findings against current main (rule added in #235).`

## Verification

- `node scripts/pre_flight.mjs` after this PR → only 10
  pre-existing `eval-missing-determinism-check` findings remain.
  Zero `task-missing-v1-pillar` findings.

## Done when

The 13 legacy task files have v1_pillar + v1_effect lines in
their YAML front matter. Pre-flight is clean for the V1 pillar
rule against current main.

### T-block-detector-canon-eval — Pin block-detector envelope + SIGNAL_WEIGHTS + level thresholds
- **Owner:** claude
- **Branch:** claude/T-block-detector-canon-eval
- **Pillar:** evals (contract stability)
- **Status:** merged

## Scope

`computeBlockSignal()` is the entry point for the block-signal
envelope read by iOS T35 (nudge surface) and T53 (sparkline).
Renaming a level (`medium` → `mid`) or dropping a `SIGNAL_WEIGHTS`
key would silently regress both surfaces.

This eval pins:

- `BLOCK_SIGNAL_SCHEMA_VERSION === 1`
- `SIGNAL_WEIGHTS` is `Object.freeze`d, has exactly the 4 canonical
  keys (`scene_completion_gap`, `attempt_completion_dropoff`,
  `short_turn_ratio`, `talk_turn_gap`), and the values sum to 1.0.
- `LEVEL_LOW_MAX` and `LEVEL_MEDIUM_MAX` are in (0, 1) with
  `LEVEL_LOW_MAX < LEVEL_MEDIUM_MAX`.
- `computeBlockSignal({ habits: {}, nowMs })` returns the canonical
  envelope with `schemaVersion`, `score` ∈ [0,1], `level` ∈
  {low, medium, high}, `signals[]`, `summary`, `habitsObserved`.
- `buildBlockCoachingBlockForPrompt` returns empty string for
  null/low input, non-empty with `writer-coaching-note` marker
  for medium/high.

Wired via `npm run eval:block-detector-canon`.

## Done when

`backend/evals/run_block_detector_canon_eval.mjs` exits 0 with all
checks passing; `npm test` still green.

### T-block-signal-atms-zero-fix — Honor atMs=0 in recordBlockSignalSample (falsy-coerce bug)
- **Owner:** claude
- **Branch:** claude/T-block-signal-atms-zero-fix
- **Pillar:** bugfix (creative-memory)
- **Status:** merged

## Scope

`recordBlockSignalSample({ atMs: 0 })` silently substituted `nowMs()`
because the store did `Number(atMs) || nowMs()` — `0` is falsy.
Surfaced by the side finding in PR #120
(T-block-signal-history-bounds-eval).

Switch to `Number.isFinite()` so:

- Valid finite timestamps (including 0) are honored verbatim.
- `NaN`, `"not a number"`, `undefined`, `null` cleanly fall back to
  `nowMs()`.

Two regression tests added to `tests/block_signal_history.test.mjs`:

- `atMs=0` is honored verbatim
- non-finite `atMs` (NaN, non-numeric string) falls back to a sane
  positive timestamp

## Done when

`Number.isFinite()` gate replaces the falsy coercion in
`recordBlockSignalSample`; both regression tests pass; `npm test`
green.

### T-block-signal-history-bounds-eval — Pathological-input guard on the block-signal history buffer
- **Owner:** claude
- **Branch:** claude/T-block-signal-history-bounds-eval
- **Pillar:** evals (layer-3-living)
- **Status:** review

## Scope

PR #103 covers happy-path semantics of `recordBlockSignalSample` (ring
buffer, debounce, NaN coercion). This eval pounds the buffer with
pathological inputs:

- 1,000 alternating low/medium/high samples — ring buffer must still
  cap at 30 and preserve newest.
- 500 same-level polls inside the 60s window — debounce must hold;
  exactly 1 entry recorded.
- Boundary: delta=59,999ms blocks; delta=60,000ms releases.
- Missing / empty / undefined userId is a no-op (no record created).
- `NaN`, `+Infinity`, `-Infinity` scores all coerce to 0.
- Pounding userA does not leak into userB's buffer.

Wired via `npm run eval:block-signal-history-bounds`. No LLM, no I/O.

## Side finding

The boundary tests revealed that `recordBlockSignalSample({ atMs: 0 })`
silently substitutes `nowMs()` because the store does
`Number(atMs) || nowMs()` — `0` is falsy. Not fixed in this PR (out of
scope for an eval) but worth a follow-up that uses `Number.isFinite()`
explicitly. The eval works around the gotcha by anchoring fixtures at
`atMs=1000` instead of `0`.

## Done when

`backend/evals/run_block_signal_history_bounds_eval.mjs` exits 0 with
all checks passing; `npm run eval:block-signal-history-bounds` works;
`npm test` still green.

### T-block-signal-history-route — GET /memory/block-signal/history read endpoint
- **Owner:** claude
- **Branch:** claude/T-block-signal-history-route
- **Pillar:** layer-3-living (creative-memory surfaces)
- **Status:** review

## Scope

PR #103 (now merged) added `habits.block_signal_history` — a 30-entry
ring buffer of block-signal samples written on each
`GET /memory/block-signal` call. That endpoint also re-runs the
debounce + ring-buffer semantics on every poll, which is exactly
what a sparkline UI does *not* want.

This PR adds `GET /memory/block-signal/history`: a read-only
projection that returns the buffer plus a small summary envelope:

```json
{
  "schemaVersion": 1,
  "entries": [...],
  "counts": { "total": N, "byLevel": { "low": ..., "medium": ..., "high": ... } },
  "newestAt": ...,
  "oldestAt": ...
}
```

Pure read — does not append a sample. Unauthenticated → zero-state
envelope (matches the polling endpoint's posture).

## Done when

`GET /memory/block-signal/history` mounted in `backend/index.js`;
`backend/tests/block_signal_history_route.test.mjs` covers summarizer
+ endpoint integration + mount guards; `npm test` green.

### T-block-signal-history-tracking — Persist block-signal samples to creative memory habits
- **Owner:** claude
- **Branch:** claude/T-block-signal-history-tracking
- **Pillar:** layer-3-living (creative-memory longitudinal)
- **Status:** review

## Scope

Each `GET /memory/block-signal` call evaluates the user's current
block-state but discards the sample after responding. To support
longitudinal "have I been stuck a lot lately?" insights and future UI
sparkline / coaching tone-shifts, the block-signal value should be
appended to the user's creative-memory `habits.block_signal_history`
ring buffer.

This PR adds `recordBlockSignalSample({ userId, score, level, atMs })`
to the creative-memory store with:
- 60-second debounce on same-level samples (so a stable level doesn't
  flood the buffer when the client polls frequently).
- Always-record on level change (low ↔ medium ↔ high transitions).
- 30-entry ring buffer cap (newest preserved).
- Non-finite score coerced to 0; missing `userId` is a no-op.

The block-signal HTTP route wires the call as a best-effort append
after computing the signal — never blocks the response, swallows
record errors.

## Done when

`backend/lib/creative_memory_store.js` exposes
`recordBlockSignalSample`; `backend/lib/block_signal_route.js` calls
it after computing the signal; `backend/tests/block_signal_history.test.mjs`
covers append / debounce / level-change / time-based recording /
ring-buffer cap / NaN coercion / endpoint integration; `npm test`
green.

### T-build-tasks-md-anchors — Add AUTOGEN anchors to TASKS.md + harden anchor matcher
- **Owner:** claude
- **Branch:** claude/T-build-tasks-md-anchors
- **Pillar:** infra (coordination)
- **Status:** merged

## Scope

`scripts/build_tasks_md.mjs --write` is the canonical regenerator
for the active-tasks section of TASKS.md. PR #67 shipped the
regenerator but TASKS.md lacked the BEGIN/END AUTOGEN anchors, so
`--write` was a no-op.

This PR:

1. **Hardens the matcher**: `current.indexOf(BEGIN_ANCHOR)` happily
   matched the anchor strings inside the inline reference quoted in
   T-tasks-per-row's own description. Running `--write` once would
   overwrite from inside the description, corrupting unrelated rows.
   Switched to a `findStandaloneAnchor()` that requires the anchor
   to sit alone on its own line (surrounded by newlines or buffer
   ends). Inline mentions are now correctly ignored.

2. **Adds the anchors** as standalone lines at the bottom of
   TASKS.md (`<!-- BEGIN AUTOGEN active-tasks -->` /
   `<!-- END AUTOGEN active-tasks -->`).

3. **Runs `--write` once** to populate the autogen section with a
   mirror of every `tasks/_active/T-*.md` file. The hand-maintained
   table above stays the canonical source for now; the autogen
   block is a parallel view that lets future PRs incrementally
   migrate rows.

## Done when

`node scripts/build_tasks_md.mjs --write` overwrites only the
between-anchors region; inline mentions in descriptions don't
match; the autogen block is present at the end of TASKS.md.

### T-coord-refresh-batch-12 — Batched coordination refresh — round 17 (post merge train)
- **Owner:** claude
- **Branch:** claude/T-coord-refresh-batch-12
- **Pillar:** infra (coordination)
- **Status:** review

## Scope

Round-17 batched coordination refresh. Reflects the massive merge
train that ran since the last on-main refresh: the original 25
Claude PRs from round 16, plus the follow-on supervisor merges for
the coordination schema check, first-page telemetry sink, prompt
context wiring, realtime failover, format-linter/eval umbrella, and
ops route extraction.

**Merged on main since last refresh** (status → `merged`,
blocker → `null`):

  #76, #80, #81, #82, #83, #85, #86, #88, #90, #92, #97, #100,
  #104, #105, #107, #110, #111, #112, #115, #124, #127, #159,
  #161, #163, #164, #166, #171, #117, #79, #74, #84, #190.

**Still open after this refresh**:

  #33 — human-owned `OPENAI_API_KEY` secret repair.
  #63 — trust-policy PR, human-gated and superseded in practice by D005.
  #94 — creative-memory export, human privacy/data-control gate.
  #99 — creative-memory delete, human privacy/data-control gate.

Updates `docs/coordination.json`:

- Round-16 and round-17 PRs moved from `blocked`/`review` → `merged`.
- Cross-PR `ops-surface-access-control` blocker dropped (cleared
  via #97 + #100 already landed).
- `claude-do-not-merge-queue` cleared. Remaining blockers are human-owned.
- `updatedAt` / `updatedBy` refreshed.

Updates `docs/codex-inbox.md`:

- New "Recently cleared" section summarizing the full merged train.
- "Current Open Claude PRs" table trimmed to actual still-open,
  human-gated PRs.

## Done when

`node scripts/coordination_state.mjs validate` returns OK; merged
PRs show `status: merged`; the open-PR table no longer references
PRs that have merged; remaining blockers are human-owned.

### T-coord-refresh-batch-15 — Coord refresh round 19 — mark #197/#199/#200/#201/#202 merged
- **Owner:** claude
- **Branch:** claude/T-coord-refresh-batch-15
- **Pillar:** infra (coordination)
- **Status:** review

## Scope

Round-19 batched coordination refresh covering the 5 PRs from this
session plus a Phase 3 readiness tracking task.

Merged on main since the last on-main coord refresh:
- #197 T-decompose-phase2b-screenplay-projects-writes
- #199 T-pre-flight-required-deps-rule
- #200 T-utils-smoke-test
- #201 T-eval-canon-into-gate
- #202 T-snapshot-eval-accepted-twists

Adds `tasks/_active/T-decompose-phase3-ready.md` to track Phase 3
readiness without opening the PR yet (max 1 decomp PR in flight
rule). Phase 3 (screenplay/companion + paginate + revision-colors)
gates on this round-19 train landing.

## Done when

`node scripts/coordination_state.mjs validate` returns OK; #197,
#199, #200, #201, and #202 show `status: merged`; the inbox "Current
Open Claude PRs" table lists only human-gated PRs; Phase 3 task file
documents what's next.

## Operational note

Worktree audit also ran this round: cleaned 10 stale local
worktrees that corresponded to merged/closed PRs. Active Claude
worktrees: 8 → ready for the next round of work.

### T-coordination-state-cli-validate — Add `validate` subcommand to coordination_state.mjs
- **Owner:** claude
- **Branch:** claude/T-coordination-state-cli-validate
- **Pillar:** infra (coordination)
- **Status:** merged

## Scope

PR #117 added `scripts/coordination_state_schema_check.mjs` — a
standalone validator for `docs/coordination.json`. This PR surfaces
the same checks as a `validate` subcommand on the existing
`coordination_state.mjs` CLI, next to `read` / `open-prs` /
`blockers` / `decisions` / mutate commands.

```
node scripts/coordination_state.mjs validate
# → "coordination_state validate: OK (N open PRs, M blockers, K decisions)"
# or exit 1 with a per-finding diff
```

Same invariant set as the standalone schema-check:
- `schemaVersion` is a number >= 1
- `updatedAt` is ISO-8601
- `updatedBy` is non-empty
- `openPullRequests`, `blockers`, `decisionsPending` are arrays
- Per-PR: `number` (int), `title`, `owner ∈ {claude, codex, human}`,
  `tier ∈ {1, 2, 3}`, `status`, `branch`
- Per-blocker: `id`, `owner`, `summary`

Strict by default (no `--strict` flag here, because this state file
should always be the canonical source of truth — there's no "warn"
mode for it).

## Done when

`node scripts/coordination_state.mjs validate` exits 0 against
current main; smoke test covers happy path + unknown-command path;
remains additive (no behavior change to existing subcommands).

### T-coordination-state-eval — Schema check on docs/coordination.json
- **Owner:** claude
- **Branch:** claude/T-coordination-state-eval
- **Pillar:** infra (coordination)
- **Status:** merged

## Scope

`docs/coordination.json` is read by the CLI helper, the inbox files,
and downstream automation. A typo or shape regression silently
corrupts every reader. This PR adds `scripts/coordination_state_schema_check.mjs`
which:

- Confirms the file parses.
- Asserts the top-level shape (`schemaVersion`, `updatedAt` ISO-8601,
  `updatedBy`, `openPullRequests`, `blockers`, `decisionsPending`,
  `endpointsAwaitingIosConsumer`).
- For each open PR, validates required fields and the `owner ∈
  {claude, codex, human}` + `tier ∈ {1, 2, 3}` enums.
- For each blocker, validates `id`, `owner`, `summary`.

A smoke test (`coordination_state_schema_check.test.mjs`) execs the
script and asserts exit 0 against the current repo state, so a future
parser refactor can't silently break the gate.

## Done when

`node scripts/coordination_state_schema_check.mjs` exits 0 against
`main`; `node --test scripts/coordination_state_schema_check.test.mjs`
green.

### T-coordination-state-mutate-eval — Round-trip eval over coordination_state.mjs mutate subcommands
- **Owner:** claude
- **Branch:** claude/T-coordination-state-mutate-eval
- **Pillar:** infra (coordination)
- **Status:** merged

## Scope

PR #117 ships a standalone schema check and PR #144 adds a
`validate` subcommand. Both validate the *current* file. Neither
catches the case where a future change to one of the *mutating*
subcommands silently produces a file that the validator rejects.

This PR adds `scripts/coordination_state_mutate_eval.mjs` which:

1. Builds a temp dir mirroring the script's expected layout
   (`scripts/coordination_state.mjs` + `docs/coordination.json`).
2. Seeds a minimal valid state.
3. Runs each mutating subcommand in turn:
   - `add-pr` → validate
   - `set-pr` → validate
   - `close-pr` → validate
   - `add-blocker` → validate
   - `clear-blocker` → validate
   - `add-decision` → validate
   - `clear-decision` → validate
4. Asserts every intermediate state passes `validate`.
5. Asserts the final state matches the seed shape (back to empty
   arrays) with a fresh `updatedAt`.

Smoke test execs the eval and asserts exit 0.

## Done when

`node scripts/coordination_state_mutate_eval.mjs` exits 0 against
the current CLI; smoke test green.

### T-creative-memory-stats-route — GET /memory/stats content-free summary
- **Owner:** claude
- **Branch:** claude/T-creative-memory-stats-route
- **Pillar:** layer-3-living (creative-memory surfaces)
- **Status:** merged

## Scope

`GET /memory/stats` returns counts and high-level shape of the
authenticated user's creative memory — **without** exposing names,
voice lines, lexical fingerprints, or twist content. iOS uses this
to badge the "what does the companion remember?" sidebar; the user
opens the existing per-domain endpoints (character traits, archetypes,
etc.) for full content.

Response shape:

```json
{
  "schemaVersion": 1,
  "hasMemory": true,
  "counts": {
    "characters": 3,
    "charactersWithVoice": 2,
    "charactersWithTraits": 1,
    "toneSignals": 2,
    "habitSignals": 1
  },
  "lastUpdatedMs": 1715000000000
}
```

Privacy posture: zero leakage by construction — `summarizeMemory()`
emits only numeric counts. Unauthenticated requests return the
zero-state envelope (same conservative pattern as `/memory/block-signal`).

## Done when

`GET /memory/stats` returns the summary; tests cover the summarizer
(no-leakage assertion), the integration path (cold/seeded/unauth),
and the mount guards; `npm test` green.

### T-creative-memory-store-eviction-eval — Pathological-input guard on creative-memory character roster
- **Owner:** claude
- **Branch:** claude/T-creative-memory-store-eviction-eval
- **Pillar:** evals (contract stability)
- **Status:** merged

## Scope

`recordCharacterMention()` is called from /talk turn handling and
from the iOS character mention path. Without bounds, a heavy user
could grow the per-user character array unbounded — every line of
dialogue introducing a new name.

This eval pins the load-bearing safety nets:

- **De-dup**: 50 mentions of "June" → exactly 1 record.
- **Whitespace-tolerant de-dup**: `"June"`, `"  June  "`, `"June"`
  all collapse to one record.
- **Store cap**: 200 unique names → store keeps exactly
  `CHARACTERS_MAX = 32` records (the most-recently-referenced);
  oldest 168 are dropped. Verified by asserting the most-recent
  name is kept and the oldest is dropped.
- **last_referenced freshness**: Re-mentioning an older record
  updates its `last_referenced` so it ranks above newer records
  for prompt-projection purposes.
- **Empty / whitespace-only / undefined name**: no-op (returns
  `{ action: "skipped" }`).

Wired via `npm run eval:creative-memory-eviction`.

## Done when

`backend/evals/run_creative_memory_eviction_eval.mjs` exits 0 with
all checks passing; `npm test` still green.

### T-creative-memory-version-check-eval — Pin the `version` field on creative-memory snapshots
- **Owner:** claude
- **Branch:** claude/T-creative-memory-version-check-eval
- **Pillar:** evals (contract stability)
- **Status:** merged

## Scope

`getCreativeMemoryForPrompt({ userId })` returns either `null` (cold
user) or an envelope whose canonical shape opens with `version`,
`userId`, `updatedAt`. iOS and the backend prompt-assembly path
both depend on `version` to know which decoding path to take. A
future refactor that drops the field would silently break every
consumer.

This eval pins:

1. Cold user → `null` (no envelope).
2. Seeded user → envelope with `version === 1` (current
   `SCHEMA_VERSION`).
3. Envelope has `userId` (non-empty string) + `updatedAt` (number).
4. `version` stays stable across multiple `recordCharacterMention`
   / `recordToneSignal` calls (a hot user doesn't bump it).

Wired via `npm run eval:creative-memory-version`.

## Done when

`backend/evals/run_creative_memory_version_eval.mjs` exits 0 with
all checks passing; `npm test` still green.

### T-decisions-queue-fixture-template — docs/decisions-queue-template.md (copy-paste entry template)
- **Owner:** claude
- **Branch:** claude/T-decisions-queue-fixture-template
- **Pillar:** infra (coordination)
- **Status:** merged

## Scope

`docs/decisions-queue.md` declares its own format inline, but the
format is easy to get subtly wrong (non-ISO date, multi-question
entry, missing default). PR #104 parses the file programmatically;
PR #127 lints it. This PR adds a copy-paste-friendly template at
`docs/decisions-queue-template.md` so both agents (and the human)
have one place to grab a known-good entry skeleton.

Includes:

- The canonical markdown template (the same one PR #104's parser
  expects).
- Required vs optional field rules.
- A concrete worked example.
- Anti-examples (multi-question, non-ISO date, slug with whitespace)
  that the lint script will reject.

No code change. Pure docs. Lives next to `docs/decisions-queue.md`
so the cross-reference is one filesystem hop away.

## Done when

`docs/decisions-queue-template.md` exists and matches the format
PR #104's parser + PR #127's lint accept.

### T-decisions-queue-md-lint — Lint docs/decisions-queue.md format
- **Owner:** claude
- **Branch:** claude/T-decisions-queue-md-lint
- **Pillar:** infra (coordination)
- **Status:** merged

## Scope

`docs/decisions-queue.md` declares its own format in the preamble.
PR #104 added a parser that reads the file programmatically. The
format and the parser have to stay in lockstep — a typo or missing
field in the markdown silently corrupts the read endpoint and any
downstream consumer.

This PR adds `scripts/decisions_queue_lint.mjs`, which validates:

1. The file parses (has `## Open` and `## Resolved` headers).
2. Every entry under `## Open` is `### D-<slug> — <question>`.
3. Each open entry has `Asked by` and `Asked at` (ISO YYYY-MM-DD).
4. Each open entry has at least one of `Question` / `Why it matters`
   / `Default if no answer`.
5. Slug IDs are unique across both sections.

Default mode prints findings and exits 0 (warn-only — safe to wire
into observability today). `--strict` exits non-zero so the future
CI flip is a one-line change.

Smoke test (`decisions_queue_lint.test.mjs`) runs the real script
against the real repo state and verifies the `--strict` exit-code
contract against a tampered temp fixture.

## Done when

`node scripts/decisions_queue_lint.mjs` runs cleanly against the
current main; `node --test scripts/decisions_queue_lint.test.mjs`
green.

### T-decisions-queue-route — GET /coordination/decisions-queue returns the queue as JSON
- **Owner:** claude
- **Branch:** claude/T-decisions-queue-route
- **Pillar:** coordination
- **Status:** merged

## Scope

`docs/decisions-queue.md` is the single-file queue of items waiting on
the human's decision (per T-decisions-queue). Today it's markdown-only,
which means iOS / dashboards / Codex's automation cannot surface
"unanswered for N days" without re-implementing the parser.

This PR adds a thin read-only projection of the file:

- `backend/lib/decisions_queue_route.js` exports a pure
  `parseDecisionsQueueMarkdown(text)` plus `mountDecisionsQueueRoute(app)`.
- The parser reads `### D-<slug> — <title>` entries under `## Open`
  and `## Resolved` headings, capturing each `- **Field name:**`
  bullet as a snake_cased key on the entry.
- The route returns `{ schemaVersion, open[], resolved[], counts }`
  with `Cache-Control: no-store`.
- A missing file is treated as an empty queue (200 + empty arrays),
  matching the conservative-defaults posture of other coordination
  surfaces.

The route resolves the queue path relative to the module via
`fileURLToPath(import.meta.url)`, so it's robust to whichever working
directory the server is launched from.

## Done when

`GET /coordination/decisions-queue` returns the parsed queue;
`backend/tests/decisions_queue_route.test.mjs` covers parser shape +
endpoint integration + missing-file fallback; `npm test` green.

### T-decompose-backend-index — Decompose 33k-line backend/index.js into per-domain route libs
- **Owner:** claude
- **Branch:** claude/T-decompose-backend-index
- **Pillar:** infra (velocity-at-scale)
- **Status:** merged

## Scope

Spec PR for the multi-phase decomposition of `backend/index.js`
(currently 33,071 lines). Full plan in
`docs/specs/T-decompose-backend-index.md`.

Per the spec-first protocol (proposal #3 from the second-pass
efficiency protocol Codex accepted): no implementation PRs open
until Codex approves the phasing + safety mechanisms.

## Surface area

- `docs/specs/T-decompose-backend-index.md` — full plan (8 phases,
  safety mechanisms, anti-goals, open questions)
- `tasks/_active/T-decompose-backend-index.md` — this file

No code change in this PR. The first concrete extraction (`/health`
+ `/bridge` → `lib/health_route.js`) ships as a separate proof-of-
concept PR sized so reviewers can verify the strategy on a tiny
diff before approving larger phases.

## Done when

Codex signs off on phasing + opens follow-up tasks for phases 1–7
in `tasks/_active/` (one per phase). Spec lives on main as the
canonical reference.

### T-decompose-phase0-health-route — Phase 0 PoC — extract /health + /bridge to lib/health_route.js
- **Owner:** claude
- **Branch:** claude/T-decompose-phase0-health-route
- **Pillar:** infra (velocity-at-scale)
- **Status:** merged

## Scope

Phase 0 proof-of-concept for the `T-decompose-backend-index` spec.
First concrete extraction from the 33k-line `backend/index.js`.

Moves the (byte-identical) inline `GET /health` and `GET /bridge`
handlers into `backend/lib/health_route.js` behind a single
`mountHealthRoutes(app, deps)` function. Both routes share one
handler now; previously the same 30 lines of inline code lived
twice in index.js.

**Net effect**:
- `backend/index.js`: 33,071 → 33,032 lines (–39)
- New: `backend/lib/health_route.js` (109 lines, isolated, dep-injected)
- New: `backend/tests/health_route.test.mjs` (9 integration tests)
- **Behavior change: zero.** Same response, same headers, same status.

## Decisions captured here for the rest of the decomposition

1. **Live state read via accessor functions.** `talkInFlight` and
   `talkInFlightBySession` are mutable module-scoped state in
   index.js. Passing them as values would freeze the snapshot at
   mount time; passing them as accessor functions
   (`() => talkInFlight`) lets the handler read the current value
   at request time. This is the pattern future phases will use
   for any mutable module-scoped dep.

2. **Required-deps guard.** `mountHealthRoutes` throws on missing
   deps. Future phases follow.

3. **Pure helper + thin mount.** `buildHealthPayload` is exported
   for direct unit-testing; `mountHealthRoutes` is the Express
   glue. Future phases follow this two-function pattern.

## Done when

- `node --test tests/health_route.test.mjs` — 9/9 pass
- `npm test` — green (no regressions)
- index.js line count drops
- Behavior diff = zero (same response shape, same headers)

### T-decompose-phase1-ops-routes — Decompose backend/index.js — Phase 1 (/ops/metrics + /ops/alerts)
- **Owner:** claude
- **Branch:** claude/T-decompose-phase1-ops-routes
- **Pillar:** infra (backend architecture)
- **Status:** merged

## Scope

Phase 1 of the `backend/index.js` decomposition plan documented in
`docs/specs/T-decompose-backend-index.md` and approved in PR #181.
Phase 0 (`/health` + `/bridge`) landed in PR #183. This PR continues
the same pattern for the two `/ops/*` routes that remained inline.

Extracts the previously-inline handlers byte-identically:

- `/ops/metrics` → `backend/lib/ops_metrics_route.js`
- `/ops/alerts`  → `backend/lib/ops_alerts_route.js`

Each file exposes a `mount<X>Route(app, deps)` function. Live state
(`talkInFlight`, `talkInFlightBySession.size`,
`talkIdempotencyCache.size`, `talkMetricsSamples`, the scale
backplane status) is passed as **accessor functions** so the routes
read the current value at request time, not the value at mount time.
This is the pattern Phase 0 established with `/health`.

Both routes carry an explicit **safe-public** access-control posture
in the module header, matching `/ops/health-summary`, `/ops/routes`,
and the rest of the public ops surface.

## Verification

- `node --test backend/tests/ops_metrics_route.test.mjs`
  `backend/tests/ops_alerts_route.test.mjs` → **16/16 pass**.
- Required-deps guard tested: each missing dep throws at mount.
- Live-state accessor pattern tested: counters mutated between two
  requests reflect the new values without re-mounting.
- Safe-public posture tested: no-leakage scan for emails / Bearer /
  userId / deviceId / sessionId / prompt / completion / transcript
  / content / ipAddress.
- `node --check backend/index.js` passes.

`backend/index.js` shrinks by 22 net lines on this PR (44 deletions,
22 insertions for the two new mount calls). Plus 141 lines added
across the two new lib files.

## Done when

`/ops/metrics` and `/ops/alerts` are no longer inline in
`backend/index.js`; both lib files exist with mount + required-deps
guard + safe-public docs; both test files pass; the new mount calls
sit next to the other ops mount calls in `backend/index.js`; the
behavior is byte-identical with the previous inline handlers.

## Next phase

Phase 2 will extract the `/screenplay/*` project route cluster — the
largest single inline group in `backend/index.js`. Spec text already
in `docs/specs/T-decompose-backend-index.md`. Per the spec, max 1
decomposition PR in flight, so Phase 2 is gated on this PR landing.

### T-decompose-phase2a-screenplay-projects-reads — Decompose backend/index.js — Phase 2a (5 /screenplay/projects/* GET routes)
- **Owner:** claude
- **Branch:** claude/T-decompose-phase2-screenplay-projects
- **Pillar:** infra (backend architecture)
- **Status:** merged

## Scope

Phase 2a of the `backend/index.js` decomposition plan documented in
`docs/specs/T-decompose-backend-index.md` (Phase 0 → PR #183, Phase 1 →
PR #190 merged today). The spec's Phase 2 covers 12 routes; this PR
extracts the 5 read-only ones first. The 7 write routes (POST, version)
follow in Phase 2b once this lands. Per spec, max 1 decomposition PR in
flight.

Extracts byte-identically:

- `GET /screenplay/projects` (list)
- `GET /screenplay/projects/:projectId`
- `GET /screenplay/projects/:projectId/outline`
- `GET /screenplay/projects/:projectId/collaborators`
- `GET /screenplay/projects/:projectId/comments`

→ `backend/lib/screenplay_projects_routes.js` (198 lines), exposing
`mountScreenplayProjectsRoutes(app, deps)`. 15 deps passed in:
owner-record helpers, envelope/header helpers, payload serializers,
and the parsing utilities. Required-deps guard fails loud at mount.

Access-control posture documented at the module header:
**PER-USER**. Every handler resolves an owner record from the request
(cookie / token / X-Client-Token) and reads only that owner's
projects. Response carries project content (titles, outlines, draft
excerpts, comments), so this is NOT safe-public. The handlers already
ran unauthenticated keyed off owner records in the existing inline
code — this PR preserves exactly that behavior (no access-control
change; only a code-organization change).

## Verification

- `node --test backend/tests/screenplay_projects_routes.test.mjs`
  → **13/13 pass** (cold list, include_versions+limit, 404 paths,
  outline include_project flag, collaborators payload, comment
  sorting/actor flagging, etc.).
- `node --check backend/index.js` passes.
- 5 inline handlers removed; 1 mount call added.
- `backend/index.js`: **-88 net lines** (111 deletions, 23 insertions
  including the new mount call).
- Required-deps guard tested for each of the 15 deps.

## Done when

The 5 GET routes are no longer inline; the lib file exists with a
documented per-user access-control posture; tests pass; behavior is
byte-identical with the previous inline handlers.

## Next phase

Phase 2b will extract the 7 write routes (POST + version) into the
same lib file. Phase 2b also gives the lib file a small `screenplay_*`
write helper surface (upsertScreenplaySceneRecord, etc.) that needs
mocking in tests.

### T-decompose-phase2b-screenplay-projects-writes — Decompose backend/index.js — Phase 2b (7 /screenplay/projects/* write routes)
- **Owner:** claude
- **Branch:** claude/T-decompose-phase2b-screenplay-projects-writes
- **Pillar:** infra (backend architecture)
- **Status:** merged

## Scope

Phase 2b of the `backend/index.js` decomposition (spec:
`docs/specs/T-decompose-backend-index.md`). Phase 0 (#183), Phase 1
(#190), and Phase 2a (#192) all merged on main. Phase 2b extracts the
7 remaining write routes into the same lib file that Phase 2a created.

Routes extracted byte-identically to
`backend/lib/screenplay_projects_routes.js`:

- `POST /screenplay/projects`
- `POST /screenplay/projects/:projectId/outline`
- `POST /screenplay/projects/:projectId/scenes`
- `POST /screenplay/projects/:projectId/beats`
- `POST /screenplay/projects/:projectId/collaborators`
- `POST /screenplay/projects/:projectId/comments`
- `POST /screenplay/projects/:projectId/version`

19 new deps added to `mountScreenplayProjectsRoutes`: owner mutation
helpers (`markScreenplayOwnerDirty`, `createScreenplayId`,
`createEmptyScreenplayOutline`, `parseScreenplayOutlineInput`,
`upsertScreenplaySceneRecord`, `upsertScreenplayBeatRecord`,
`getLatestScreenplayVersion`, `scoreScreenplayDraft`,
`buildDraftExcerpt`), payload serializers (`toScreenplayScenePayload`,
`toScreenplayBeatPayload`, `toScreenplayVersionPayload`), and 6
write-side normalizers (`normalizeScreenplayStringList`,
`normalizeScreenplayPhaseValue`,
`normalizeStoredScreenplayThreadViewState`,
`normalizeStoredScreenplayDiffAcknowledgementState`,
`normalizeStoredScreenplayWriteAnchors`,
`normalizeStoredScreenplayBindings`). Required-deps guard fails
loud at mount for every dep.

Each POST handler mounts its own `express.json()` with the same
limit the inline handler used (matches Codex #90 + the pre-flight
`route-needs-own-parser` rule from #193).

Access-control posture unchanged: **PER-USER**. Same as Phase 2a.

## Verification

- `node --test backend/tests/screenplay_projects_routes.test.mjs`
  → **29/29 pass** (was 13 after Phase 2a; +16 for the 7 new POSTs
  exercising create/update/404/400/version-conflict paths plus a
  stale `base_version_id` 409 regression added during Codex review).
- Required-deps guard tested for **all 32 deps** (was 15 after 2a).
- `node --check backend/index.js` passes.
- `backend/index.js`: **-410 net lines** (~32,680 down from
  ~33,090). Combined with Phase 2a's -88, the full Phase 2 saved
  ~498 lines from index.js.

## Done when

The 7 write routes are no longer inline; the lib file contains all
12 `/screenplay/projects/*` handlers; tests pass; behavior is
byte-identical with the previous inline handlers.

## Next phase

Phase 3: extract `/screenplay/companion/state` (GET + POST),
`/screenplay/paginate`, `/screenplay/revision-colors`. Spec already
in place. Per spec, max 1 decomp PR in flight, so Phase 3 is gated
on this landing.

### T-decompose-phase3-ready — Phase 3 readiness — /screenplay/companion + /paginate + /revision-colors
- **Owner:** claude
- **Branch:** claude/T-decompose-phase3-screenplay-companion
- **Pillar:** infra (backend architecture)
- **Status:** merged

## Scope

Phase 3 of the `backend/index.js` decomposition (spec:
`docs/specs/T-decompose-backend-index.md`). Per spec, max 1 decomp
PR in flight; this task tracks the readiness state.

Routes to extract → `backend/lib/screenplay_companion_routes.js`:

- `GET /screenplay/companion/state`
- `POST /screenplay/companion/state`
- `POST /screenplay/paginate`
- `POST /screenplay/revision-colors`

Plus possibly `POST /screenplay/prompt/build` if it groups well.

## Estimated line-savings

~1,200 from the spec; revised down based on Phase 2 (~500 actual
vs. ~2,500 estimated). Phase 3 is smaller — 4-5 routes total. Real
savings probably 200-400 lines from `backend/index.js`.

## Deps surface preview

Most of Phase 2's 32 deps are reusable. New deps the companion
routes touch:

- `normalizeStoredScreenplayCompanionState`
- `toScreenplayCompanionStatePayload`
- The paginate + revision-colors handlers each have their own
  helper functions; need to inspect before opening the PR.

## Gating

Phase 3 PR opens when:

1. Round-19 PR train lands (#200, #201, #202).
2. No other decomp PR is in flight (per spec rule).
3. Phase 2b (#197 — already merged on main today) is reflected in
   the coord state.

## Outcome

Completed by PR #204 / `claude/T-decompose-phase3-screenplay-companion`.
The route module exists, required-deps guard is covered, and focused +
full backend tests passed before merge.

### T-decompose-phase3-screenplay-companion — Decompose backend/index.js — Phase 3 (companion + paginate + revision-colors)
- **Owner:** claude
- **Branch:** claude/T-decompose-phase3-screenplay-companion
- **Pillar:** infra (backend architecture)
- **Status:** merged

## Scope

Phase 3 of the `backend/index.js` decomposition (spec:
`docs/specs/T-decompose-backend-index.md`). Phases 0–2b all merged
on main. Per spec, max 1 decomp PR in flight.

Routes extracted byte-identically to
`backend/lib/screenplay_companion_routes.js`:

- `GET /screenplay/companion/state` (PER-USER)
- `POST /screenplay/companion/state` (PER-USER)
- `POST /screenplay/paginate` (STATELESS)
- `POST /screenplay/revision-colors` (STATELESS)

15 deps passed by reference: owner helpers, envelope/header helpers,
companion-state normalizer + payload serializer, screenplay
revision payload builder, line splitter, draft excerpt builder, plus
the standard parsing utilities. Required-deps guard fails loud at
mount for every dep.

Each POST handler mounts its own `express.json()` with the same
limit the inline handler used.

## Verification

- `node --test backend/tests/screenplay_companion_routes.test.mjs`
  → **12/12 pass** (cold companion state, save + firstPageWrittenAt
  preserve, paginate line/page math + clamping + length-profile,
  revision-colors color default + 400 paths).
- Required-deps guard tested for all 15 deps.
- `node --check backend/index.js` passes.
- `backend/index.js`: **-79 net lines** (102 deletions, 23 insertions
  for the mount call). index.js now at 32,601 lines.

## Done when

The 4 routes are no longer inline; the lib file exists with the
documented per-route access-control posture; tests pass; behavior
is byte-identical with the previous inline handlers.

## Next phase

Phase 4 (per spec): extract auth routes (~11 routes). Auth is
tier-3 sensitive but the inline block is already well-isolated.
Per spec, max 1 decomp PR in flight, so Phase 4 is gated on this
landing.

### T-decompose-phase5a-realtime-reads — Decompose backend/index.js — Phase 5a (2 read-only /realtime/* routes)
- **Owner:** claude
- **Branch:** claude/T-decompose-phase5-realtime-routes
- **Pillar:** infra (backend architecture)
- **Status:** review

## Scope

Phase 5a of the decomposition (spec:
`docs/specs/T-decompose-backend-index.md`). Phases 0–4 merged.

Extracted byte-identically to `backend/lib/realtime_routes.js`:

- `GET /realtime/health`
- `GET /realtime/bridge`

The 5 write/streaming/call routes (`POST /realtime/client_secret`,
`POST /realtime/studio_render`, `POST /realtime/studio_render_stream`,
`POST /realtime/turn_commit`, `POST /realtime/call`) follow in
Phase 5b. That extraction is much heavier (~40 deps, supplier
mint state machine, LLM streaming path, WebRTC SDP exchange) so
it gets its own PR per the Phase 2a/2b precedent.

5 deps passed by reference. Supplier resolved at request time via
`getRealtimeSupplier()` accessor — the live supplier can change
during process lifetime via failover, so freezing it at mount time
would be wrong. Required-deps guard fails loud at mount.

Access-control posture: **SAFE-PUBLIC**.

## Verification

- `node --test backend/tests/realtime_routes.test.mjs` → **8/8 pass**.
- Required-deps guard tested.
- Live-supplier accessor pattern tested (mutate supplier between
  two requests, second reflects change).
- No-leakage scan on response.
- `node --check backend/index.js` passes.
- `backend/index.js`: -20 net lines.

## Done when

Phase 5a is merged. Phase 5b opens after.

### T-deeper-lib-tests-batch — Deeper direct tests for user_store (with planned followups for memory_store + user_auth)
- **Owner:** claude
- **Branch:** claude/T-deeper-lib-tests-batch
- **Pillar:** infra (test coverage)
- **Status:** review

## Scope

Ships **deeper** coverage for `backend/lib/user_store.js` beyond
#217's smoke surface. 18 new tests covering the real user + auth-
session lifecycle:

- `createUser` — happy path, email-required rejection, password-
  too-short rejection, duplicate-email rejection.
- `createOrAttachAppleUser` — fresh apple user, attach to existing
  password user with matching email.
- `authenticateUser` — happy path, unknown-email rejection,
  wrong-password rejection.
- `issueAuthSession` + `getAuthSessionByToken` — round-trip.
- `rotateAuthSession` — fresh token, preserved family id, previous
  token invalidation.
- `revokeAuthSessionById` / `revokeAuthSessionByToken` /
  `revokeAllAuthSessionsForUser` — including `exceptSessionId`.
- `markUserEmailVerified` — happy path + unknown-user-null.

Uses real `fs` + `writeJsonFileAtomic` against a temp store path
so the persistence round-trip is genuinely exercised. Drains
in-memory state between tests so cross-test pollution is
impossible.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: infrastructure for "iOS exposes a plain-language
  memory summary and refresh state" (V1 line 53) — auth gates
  every memory-summary read. Also tier-3 stability across the
  whole user lifecycle (signup → auth → refresh → revoke).`

## Verification

`node --test backend/tests/user_store_deeper.test.mjs` → **18/18
pass**. Plus the existing #217 smoke (`user_store.test.mjs`) →
3/3 still pass.

## Planned followups (NOT in this PR)

The user asked for deeper tests on memory_store + user_store +
user_auth (3 libs). user_store is shipped here. The other two
each warrant their own ~500-line PR with full dep coverage:

### `memory_store_deeper.test.mjs` (followup)

`backend/lib/memory_store.js` has ~25 deps on the
`sanitizePersistedSessionMemory` path. #216 stubs each as a pass-
through. Deeper coverage requires:

- A real `clampUnit`, `createEmptyEmotionMemory`,
  `normalizeAffectionStyle`, etc. — most of which live in
  `backend/lib/utils.js` or as standalone helpers in
  `backend/index.js`.
- A real `personalitySignalKeys` + `rankPersonalitySignals` so
  the sanitize-on-read path actually surfaces personality signals.
- A real `pushBoundedUniqueFolded` so the listening-facts cap
  works.
- Fixtures that exercise: cold state, warm state with multiple
  characters, eviction at the max threshold, backfill-on-read.

This is a meaningful PR on its own. Filing as a followup keeps
this PR reviewable.

### `user_auth_deeper.test.mjs` (followup)

`backend/lib/user_auth.js` has ~15 deps on the auth handler
chain. #218 covers exports + `buildPublicUser` strip + handler
surface. Deeper coverage requires:

- A real JWT signing key + verify (HS256).
- A real `user_store` (already covered by `user_store_deeper`,
  could import).
- Apple identity token verify against a stubbed JWKS.
- Fixtures for: signup → login → refresh → logout round-trip,
  password reset (request → consume → all-sessions-revoke),
  email verification (request → consume → emailVerified flip),
  session-revoke flows.

This is also a meaningful PR on its own. Filing as a followup.

## Done when

`user_store_deeper.test.mjs` ships + passes. `T-untested-libs-
followups` is updated to note user_store is now deeply covered;
the memory_store + user_auth deeper followups stay open as
separate task entries.

### T-deeper-memstore-and-user-auth-tests — Deeper tests for memory_store + user_auth
- **Owner:** claude
- **Branch:** claude/T-deeper-memory-store-tests
- **Pillar:** infra (test coverage)
- **Status:** review

## Scope

Ships the **deeper** tier of coverage for two stateful libs:

### memory_store_deeper.test.mjs (10 tests)

Extends #216's smoke surface with:
- `sanitizeClientTokenAliasList` order preservation + 24-default cap.
- Multi-alias IP registration round-trip.
- Sequential `setPersistedUserMemoryForIp` calls update the same IP.
- Save → reset → load round-trip preserves multiple users.
- Save produces a valid JSON file.
- Cleanup respects `USER_MEMORY_MAX_TRACKED` (5-entry cap via the
  save-triggered cleanup chain).
- Live `userMemoryByIp.size` accessor reflects mutations.
- Tolerates empty memory object.

### user_auth_deeper.test.mjs (12 tests)

Extends #218's smoke surface with:
- `buildPublicUser` exposes snake_case keys (`user_id`, `email`,
  `email_verified`, `created_at`, `auth_provider`).
- `buildPublicUser` strips `passwordHash`, `salt`, `appleSubject`.
- `buildPublicUser` derives `auth_provider` from `appleSubject` /
  `password` presence.
- `buildManagedSession` tolerates null/undefined/empty.
- `createUserAuthSubsystem` returns 12 named handlers +
  `protectUserRoutes`.
- `handleAuthSignup` + `handleAuthLogin` return 503
  `user_auth_not_configured` when JWT secret is missing in
  production.
- Error envelope has `stage` + `error` keys.

## What this PR does NOT cover

- Full handler round-trips (signup → login → refresh → logout,
  password-reset, email-verification, Apple flow). Each requires
  a real user_store backing + real JWT signing and belongs in its
  own scoped PR.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: closes the deeper coverage gap for memory_store
  (V1 line 49 — block-signal history + character mentions persist
  through this lib) and user_auth (V1 line 17 — talk pipeline auth
  + tier-3 surface stability).`

## Verification

`node --test backend/tests/memory_store_deeper.test.mjs
backend/tests/user_auth_deeper.test.mjs` → **22/22 pass**.

## Followups

Full handler round-trip tests for user_auth (the harder PR) stay
filed in `T-untested-libs-followups`. memory_store sanitize-path
coverage is now genuinely deeper; further fixtures could exercise
the cross-user isolation + adapter dual-write paths but those are
already lightly covered through the route tests.

### T-eval-gate-add-canon-evals — Umbrella `npm run eval:canon` for canonical-contract evals
- **Owner:** claude
- **Branch:** claude/T-eval-gate-add-canon-evals
- **Pillar:** evals (contract stability)
- **Status:** merged

## Scope

Several canon-pinning evals already ship on main:

- `eval:creative-memory` — single-turn cold-vs-seeded prompt path
- `eval:creative-memory-version` — envelope `version` field
- `eval:block-signal-history-bounds` — pathological-input guard
- `eval:block-signal-block-cap` — `<block_signal>` block size cap
- `eval:archetype-canon` — archetype bucket stability
- `eval:backend-surface-smoke` — backend feature route surface
- `eval:ops-health-summary` — ops summary envelope
- `eval:trait-library-canon` — trait schema and prompt summary stability
- `eval:twist-engine-canon` — twist IDs across frameworks
- `eval:block-detector-canon` — block signal vocabulary and thresholds
- `eval:format-linter-canon` — screenplay format lint rule IDs

Today running them all requires many separate invocations. This PR
adds an umbrella `npm run eval:canon` that chains them, so a single
command exercises every merged canon eval. CI gates can switch from
listing individual scripts to this one umbrella.

Future canon evals get appended to this script as their PRs land,
keeping the umbrella in lockstep with the canon-pinning surface area.

No production code change. `eval:gate` is unchanged in this PR;
a follow-up will wire `eval:canon` into the gate.

## Done when

`npm run eval:canon` exits 0 against current main, running every
merged canon eval end-to-end.

### T-fix-214-audit-and-readme — Fix #214 follow-up — audit script + lib README precedent + task file with V1 pillar
- **Owner:** claude
- **Branch:** claude/T-fix-214-audit-and-readme
- **Pillar:** infra
- **Status:** review

## Scope

Round-22 review of merged #214 surfaced three fixes:

1. **`backend/lib/README.md` cited #212 as "thin-delegate pattern"
   precedent.** #212 is open and unaccepted as of this PR. Only
   phases merged on `main` count as precedent for the lib pattern.
   This PR replaces the reference with an explicit "accepted
   precedents" list of the 5 phases that have actually landed
   (#183, #190, #192, #197, #204), and adds a note that open / in-
   review PRs are NOT precedent.

2. **`scripts/audit_inline_routes.mjs` conflated live route
   handlers with `app.all(..., methodNotAllowed(...))` 405-handler
   catches.** The pre-fix audit reported 98 "inline routes" when in
   fact ~57 of those are method-guards (not real handler bodies).
   This inflated the remaining-decomp estimate and misdirected the
   next phase. Fix: split the two categories. Output now shows:

   - Live inline route handlers: 41 (real bodies to extract)
   - Method-guard (`app.all` + `methodNotAllowed`) catches: 57
     (these belong in their decomposition target's lib but are
      mechanically tracked separately)

   Sort order is by live count descending; method-guards listed in
   their own section at the bottom. JSON output (`--json`) preserves
   both fields.

3. **Missing task file with V1 pillar/effect.** Every PR must
   declare which V1 checklist item it touches per
   `docs/v1-definition.md`. This file is that record. The
   audit script and the lib README are infrastructure for every
   decomp item in V1's checklist — they don't themselves close a
   checklist item, but they prevent future decomp PRs from
   misdirecting the next phase or making unaccepted-precedent
   claims.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: infrastructure for all V1 backend-index decomposition
  checklist items (talk pipeline route decomposition, realtime
  route decomposition, screenplay route decomposition).`

## Verification

- `node scripts/audit_inline_routes.mjs` now reports 41 live inline
  routes + 57 method-guards (against current main).
- The `backend/lib/README.md` accepted-precedents list contains only
  merged phases.
- `node --check scripts/audit_inline_routes.mjs` passes.
- `node scripts/agent_event.mjs append --by=claude --kind=pr_opened
  --pr=N --comment="..."` will fire on PR open.

## Done when

The three fixes are merged. The lib README references only accepted
precedent; the audit script reports live + method-guard counts
separately; the task file records V1 pillar/effect.

## Followups

- Future decomp PRs cite their direct precedent merged phase by PR
  number, not by phase number alone.
- Future PRs include the `V1 pillar:` + `V1 effect:` lines in their
  description per the rule at the bottom of `docs/v1-definition.md`.

### T-format-linter-rules-canon-eval — Pin canonical rule_id set + envelope for format_linter
- **Owner:** claude
- **Branch:** claude/T-format-linter-rules-canon-eval
- **Pillar:** evals (contract stability)
- **Status:** merged

## Scope

`lib/format_linter.js`'s `lintScreenplay()` emits suggestions whose
`rule` field is a stable string ID. iOS T28 reads each `rule` and
renders a Studio card with that ID as the dedupe / dismiss key.
A silent rename would regress every iOS consumer + every analytics
counter.

This eval pins:

- Empty input → canonical zero envelope (`schemaVersion`,
  `ruleSetVersion`, `totalSuggestions`, `suggestions[]`,
  `bySeverity{hard,medium,soft}`).
- Noisy fixture → ≥ 3 suggestions, all from the canonical 8-rule
  set: `scene_heading_shape`, `character_cue_caps`,
  `parenthetical_density`, `parenthetical_count`,
  `action_voice_present`, `action_adverb_density`,
  `page_economy_overlong`, `blank_lines_around_headings`.
- Every suggestion has `rule` (canonical), `severity ∈ {hard,
  medium, soft}`, positive `line`, non-empty `message`.
- `bySeverity` totals sum to `totalSuggestions`.
- Suggestions are sorted by line ascending.
- Determinism: same input → same output.

Wired via `npm run eval:format-linter-canon`.

## Done when

`backend/evals/run_format_linter_canon_eval.mjs` exits 0 with all
checks passing; `npm test` still green.

### T-known-domains-runtime-check — KNOWN_DOMAINS invariants (frozen, snake_case, roundtrip)
- **Owner:** claude
- **Branch:** claude/T-known-domains-runtime-check
- **Pillar:** infra (persistence)
- **Status:** merged

## Scope

`KNOWN_DOMAINS` (in `backend/lib/persistence_adapter.js`) is the
single source of truth for which logical domains the adapter accepts.
A typo when a new store is added silently crashes the first call in
production when `assertDomain` runs. This PR adds cheap invariants:

1. `KNOWN_DOMAINS` is frozen — no late mutation.
2. No duplicate entries.
3. Every entry is non-empty, trimmed, lowercase, snake_case.
4. Every entry roundtrips through a fresh JSON persistence adapter
   (proves the domain is wired through to the on-disk path layout,
   not just declared).

No production code change. Catches regressions inside the unit-test
loop instead of at the first production call.

## Done when

`backend/tests/known_domains_invariants.test.mjs` covers all four
invariants; `npm test` green.

### T-known-domains-startup-check — Boot-time invariant check on KNOWN_DOMAINS
- **Owner:** claude
- **Branch:** claude/T-known-domains-startup-check
- **Pillar:** infra (persistence)
- **Status:** merged

## Scope

PR #115 pins KNOWN_DOMAINS invariants in unit tests. But unit tests
only run in CI / dev. A production deploy can still ship with a
corrupted KNOWN_DOMAINS (someone strips the `Object.freeze`, adds
a non-snake_case alias, or accidentally duplicates an entry).

This PR adds `lib/known_domains_startup_check.js` and calls it from
the server bootstrap. The check runs the same invariants as PR #115
(frozen, non-empty, all-string, trimmed, lowercase, snake_case, no
duplicates) at boot:

- Default (warn) mode: log a clear `[startup] KNOWN_DOMAINS
  invariants violated: ...` line and continue.
- `throwOnError=true`: throw, useful for a future "strict boot"
  flag.

Cheap — no I/O, single array iteration. Catches drift at deploy
time instead of at the first persistence call.

## Done when

`checkKnownDomainsAtStartup()` runs on server boot; happy path logs
nothing; tests cover the contract; `npm test` green.

### T-memory-quality-eval — Multi-turn creative-memory recall eval
- **Owner:** claude
- **Branch:** claude/T-memory-quality-eval
- **Pillar:** evals (layer-3-living)
- **Status:** merged

## Scope

`run_creative_memory_eval.mjs` covers the single-turn cold-vs-seeded
prompt-construction path. This PR adds a deeper eval —
`run_memory_quality_eval.mjs` — that simulates a multi-turn session
and asserts the *recall* loop closes across turns:

- Turn 1 (cold) emits a prompt with no `<creative_memory>` block.
- Turn 2 (after recording a character) emits a prompt that mentions
  that character.
- Turn 3 (after a tone signal) emits a prompt carrying both the
  character and the tone.
- Turn 4 updates the character's voice trait; that trait surfaces in
  the assembled prompt.
- Turn 5 adds a second character; both are present in the prompt and
  the new tag flows through.
- Bonus scenarios: per-user isolation (no leak between userIds) and
  determinism (same state + input → same prompt string).

Deterministic, no LLM. Exits non-zero on any failure so the existing
eval-gate hooks can pick it up. Exposed via `npm run eval:memory-quality`.

## Done when

`backend/evals/run_memory_quality_eval.mjs` exits 0 with all checks
passing; `backend/package.json` exposes `npm run eval:memory-quality`;
`npm test` still green.

### T-ops-health-summary-eval — Deployment-level eval pinning /ops/health-summary features map
- **Owner:** claude
- **Branch:** claude/T-ops-health-summary-eval
- **Pillar:** evals (contract stability)
- **Status:** merged

## Scope

PR #134 ships `GET /ops/health-summary` with unit tests over the
pure helper. This PR adds a deployment-level eval that pins the
**specific list of features** the production deployment advertises:

- `creative_memory`
- `block_signal`
- `block_signal_history`
- `talk_pipeline`
- `screenplay_export_markdown`
- `screenplay_export_formats`

A future refactor that removes one of those keys (or accidentally
flips one off) would silently regress every uptime dashboard reading
this endpoint. The eval mounts the route with the exact features
map from `backend/index.js` and asserts:

- HTTP 200 + `Cache-Control: no-store`
- `schemaVersion === 1`
- Envelope keys: `status`, `reasons`, `uptimeMs`, `uptimeHuman`,
  `node.version`, `node.platform`
- `features` contains exactly the canonical set; each value is `true`

Wired via `npm run eval:ops-health-summary`.

## Done when

`backend/evals/run_ops_health_summary_eval.mjs` exits 0 with all
16 checks passing; `npm test` still green.

### T-ops-health-summary-route — GET /ops/health-summary cheap uptime-dashboard endpoint
- **Owner:** claude
- **Branch:** claude/T-ops-health-summary-route
- **Pillar:** ops (observability)
- **Status:** merged

## Scope

`/ops/metrics` already exposes the heavy state (recent talk samples,
backplane status, concurrency counters), but it's expensive to dump
and verbose. Uptime dashboards / external healthchecks want a small
cheap response on a tight poll cadence.

This PR adds `GET /ops/health-summary`:

```json
{
  "schemaVersion": 1,
  "status": "ok" | "degraded" | "error" | "unknown",
  "reasons": [...],
  "uptimeMs": 12345,
  "uptimeHuman": "3m 25s",
  "node": { "version": "v24.x.x", "platform": "darwin" },
  "features": {
    "creative_memory": true,
    "block_signal": true,
    "block_signal_history": true,
    "talk_pipeline": true,
    "screenplay_export_markdown": true
  }
}
```

The `features` map answers "is this deployment fully wired?" without
calling into any per-user state. `status`/`reasons` come from the
existing `deriveBackendRuntimeStatus()`. `Cache-Control: no-store` on
every response.

Helper module is pure (no I/O), so tests cover `humanizeMs`,
`normalizeFeatures`, error fallback, header behavior, uptime offset,
and the mount guard — 11 tests total.

## Done when

`GET /ops/health-summary` returns the envelope above; helper has
unit tests; `npm test` green.

### T-ops-routes-list-route — GET /ops/routes manifest of optional surfaces
- **Owner:** claude
- **Branch:** claude/T-ops-routes-list-route
- **Pillar:** ops (observability)
- **Status:** merged

## Scope

`/ops/health-summary` (PR #134) returns a boolean `features` map.
That answers "is X wired?" but not "what URL exposes X?". iOS
clients still have to keep a separate hard-coded table mapping
features to paths.

This PR adds `GET /ops/routes` — a small frozen manifest of the
optional HTTP routes this deployment exposes, grouped by domain.
Each entry has `method`, `path`, `group`. Strict subset of what
`index.js` mounts; a future "remove this route" change must also
update this list so the snapshot test catches divergence.

Returns `{ schemaVersion, total, routes[] }` with
`Cache-Control: no-store`.

## Done when

`GET /ops/routes` returns the frozen manifest; tests cover snapshot
properties + integration; `npm test` green.

### T-pre-flight-outbox-console-cleanup — Convert outbox console.log → console.warn/error (pre-flight class 1)
- **Owner:** claude
- **Branch:** claude/T-pre-flight-outbox-console-cleanup
- **Pillar:** infra (hygiene)
- **Status:** merged

## Scope

Cleans up 6 of the 8 pre-existing findings flagged by
`scripts/pre_flight.mjs` (proposal #2, PR #177): `console.log` calls
in `backend/lib/outbox_snapshotter.js` and `backend/lib/outbox_store.js`.

`console.log` leaks to stdout and gets intermixed with payload
output that downstream collectors expect. Diagnostic messages
should go to stderr via `console.warn` or `console.error`.

Changes:

- `outbox_snapshotter.js:35` — `console.log` → `console.warn` in the
  default logger's `log` channel
- `outbox_store.js:58, 60` — enqueue/duplicate trace → `console.warn`
- `outbox_store.js:196` — batch summary → `console.warn`
- `outbox_store.js:241` — single-item trace → `console.warn`
- `outbox_store.js:259` — worker error → `console.error`

No behavior change beyond the stream the messages land in.
Existing outbox tests still pass.

## Pre-flight before / after

```
Before:
  [console-log-in-lib] (6)  ← all in outbox_*
  [route-needs-own-parser] (2)

After:
  [route-needs-own-parser] (2)
```

The 2 remaining route-parser findings (character_trait_route,
memory_character_mention_route) are a separate fix scope — those
involve adding `express.json()` mounts and adjusting tests.

## Done when

`node scripts/pre_flight.mjs` from main shows no `console-log-in-lib`
findings; outbox tests still pass.

### T-pre-flight-self-check-script — scripts/pre_flight.mjs — catch recurring review feedback locally
- **Owner:** claude
- **Branch:** claude/T-pre-flight-self-check-script
- **Pillar:** infra (coordination)
- **Status:** merged

## Scope

Ships proposal #2 of the second-pass efficiency protocol: a
one-shot self-check Claude runs **before** opening a PR. Catches
the recurring classes of review feedback locally so they don't
cost a full review cycle to surface and clear.

## Findings the script catches

| Check | Why | Reference |
|---|---|---|
| `route-needs-own-parser` | Route reads `req.body` without route-local `express.json()` | Codex #90 review |
| `middleware-error-escapes` | `next(new Error(...))` falls through to Express's default handler (HTML 500 instead of structured JSON) | Codex #87 review |
| `exported-const-not-frozen` | Exported ALL_CAPS array/object literal without `Object.freeze` | Codex canon-eval reviews (#160 / #161 / #163 / #164) |
| `console-log-in-lib` | `console.log` in `backend/lib/*` leaks to deploy logs (use `console.error`/`warn`) | hygiene |

Each finding lists file + line + a one-line explanation. Default
mode prints findings and exits 0; `--strict` exits 1.

## Current main snapshot

Running against `main` today surfaces 8 pre-existing findings:
- 6 `console.log` calls (outbox_snapshotter, outbox_store)
- 2 routes that read `req.body` without route-local parsers
  (character_trait_route, memory_character_mention_route)

The script defaults to **warn-only** so it can ship without forcing
those fixes in this PR. Once Codex cleans up the existing findings,
the strict-mode flip is a one-line CI change.

## Tests

`scripts/pre_flight.test.mjs` — 14 tests covering each check with
positive + negative fixtures + the --strict exit-code contract + a
real-repo smoke run.

## Done when

`scripts/pre_flight.mjs` runs cleanly against current main in warn
mode; `scripts/pre_flight.test.mjs` green.

## Follow-ups (not in this PR)

- Add `eval-missing-determinism-check` check (search
  `backend/evals/run_*_eval.mjs` for files without a determinism
  test).
- Add `schema-version-missing` check (search response envelopes
  for `return res.status(200).json({` without `schemaVersion`).
- Wire into a pre-push git hook (opt-in).
- Once existing findings are cleaned, flip CI to `--strict`.

### T-prompt-assembly-block-signal-cap-eval — Cap on <block_signal> block size under pathological inputs
- **Owner:** claude
- **Branch:** claude/T-prompt-assembly-block-signal-cap-eval
- **Pillar:** evals (prompt-stability)
- **Status:** merged

## Scope

`buildBlockCoachingBlockForPrompt(signal)` injects a `<block_signal>`
block into the assembled prompt for `medium`/`high` levels. Today
the structure caps at the literal lines we emit; only
`signal.summary` is a free-form pass-through. If a future change
sources `summary` from an unbounded place (model rationale, telemetry
trace), the block can blow up.

This eval asserts:

- `null` / `undefined` / `low` signals → empty block (happy-path
  prompt unchanged).
- `medium` / `high` with a normal summary → block < 500 chars.
- `medium` / `high` with a 10k pathological summary → block < 12k
  chars (the summary is the only growth surface; this caps it).
- Assembled prompts with a normal block_signal block stay under
  4k chars; with a pathological summary, still under 24k.

Wired via `npm run eval:block-signal-block-cap`.

## Done when

`backend/evals/run_block_signal_block_cap_eval.mjs` exits 0 with all
checks passing; `npm test` still green.

### T-prompt-assembly-readme — README for backend/lib/prompt_assembly.js
- **Owner:** claude
- **Branch:** claude/T-prompt-assembly-readme
- **Pillar:** docs (prompt-stability)
- **Status:** merged

## Scope

`buildModelPrompt()` is the single load-bearing entry point for
every model-bound prompt. Today its canonical layout (block order,
field set, tag names) is documented only in the function's source
comments and pinned by a handful of evals (PR #105, #110, #112,
#141). New contributors have to read the source to know that the
order is load-bearing and which evals will fail loudly if it
changes.

This PR adds `backend/lib/prompt_assembly.README.md` co-located
with the source, covering:

- The canonical block order (literal layout).
- Each field's source-of-truth (creative_memory_store,
  block_detector).
- The full table of pinned invariants and which PR pins each.
- The change-the-layout checklist (update snapshot eval +
  this README + bump SCHEMA_VERSION if shape change).

Docs-only. No code change.

## Done when

`backend/lib/prompt_assembly.README.md` exists and accurately
describes the layout and pinned invariants of the current
`buildModelPrompt` on main.

### T-prompt-assembly-snapshot-eval — Pin canonical buildModelPrompt block order
- **Owner:** claude
- **Branch:** claude/T-prompt-assembly-snapshot-eval
- **Pillar:** evals (layer-2-craft)
- **Status:** merged

## Scope

`buildModelPrompt()` concatenates labelled blocks in the canonical
order: `persona → <creative_memory> → <session> → <block_signal> →
userInput`. Several downstream concerns depend on that order
(model attention behavior, the prompt-regression baseline, iOS
prompt previews), but nothing pins it.

This eval runs `buildModelPrompt()` against a deterministic fixture
that exercises every block, then asserts the output equals a literal
expected string. A second check verifies the block tags appear in the
canonical order (defense in depth — catches structural drift even if
the literal string assertion is updated). Cold and memory-only
variants confirm optional blocks drop out cleanly.

Wired via `npm run eval:prompt-snapshot`. No LLM, no I/O.

## Done when

`backend/evals/run_prompt_assembly_snapshot_eval.mjs` exits 0;
`npm run eval:prompt-snapshot` works; `npm test` still green.

### T-prompt-size-eval — Char-budget guard on assembled model prompts
- **Owner:** claude
- **Branch:** claude/T-prompt-size-eval
- **Pillar:** evals (layer-2-craft)
- **Status:** merged

## Scope

Pins explicit upper bounds on the character length of prompts
produced by `buildModelPrompt()`, in three regimes:

- cold user (no memory)               <  2,000 chars
- light user (1 character + tone)     <  4,000 chars
- heavy user (50 characters + tone +
  habits + session ctx + coaching)    < 12,000 chars

Today these budgets are honored implicitly via `serializeCharacters`'s
top-8 cap. If a future change removes the cap, expands per-character
serialization, or introduces an unbounded section, this eval fails and
forces an explicit decision rather than silent token-budget creep.

Includes determinism checks (same store + input → same prompt size).
No LLM; deterministic and fast.

## Done when

`backend/evals/run_prompt_size_eval.mjs` exits 0 with all checks
passing; `npm run eval:prompt-size` works; `npm test` still green.

### T-protocol-infra-batch — Tighten backend extraction protocol helpers
- **Owner:** claude
- **Branch:** claude/T-protocol-infra-batch
- **Pillar:** infra
- **Status:** review

## Scope

Add small support artifacts that make future backend extraction work cheaper:

- `backend/lib/README.md` documents the route extraction pattern.
- `scripts/audit_inline_routes.mjs` lists remaining inline live routes and
  separates method-not-allowed guards from priority counts.
- `scripts/quality_gate.sh` clarifies that canon eval failures already stop
  the gate through shell strict mode.
- `AGENTS.md` points agents at the event lane.

## V1 effect

Infrastructure for the V1 talk/realtime/screenplay checklist items: backend
route work should become easier to audit without distracting Codex from iOS
product work.

## Done when

The audit script runs in text and JSON mode, method guards are not counted as
live routes by default, and the docs avoid citing blocked auth work as accepted
precedent.

## Verification

Run:

- `node --check scripts/audit_inline_routes.mjs`
- `node scripts/audit_inline_routes.mjs`
- `node scripts/audit_inline_routes.mjs --json`
- `git diff --check`

### T-schema-docs-batch-2 — Schema docs batch — talk + screenplay + realtime + ops + memory + block-signal
- **Owner:** claude
- **Branch:** claude/T-schema-docs-batch-2
- **Pillar:** infra (cross-agent contracts)
- **Status:** review

## Scope

Extends `docs/schemas/` per the round-22 protocol. The first batch
(#226) shipped 3 docs (auth, talk-turn-meta, ops-metrics). This
batch adds 8 more, covering every V1-critical envelope:

| File | Endpoint(s) | V1 pillar |
| --- | --- | --- |
| `talk-response.md` | `POST /talk` | talk |
| `screenplay-project.md` | `GET /screenplay/projects[/:id]` | screenplay |
| `screenplay-version.md` | `POST .../version` (+ 409 conflict) | screenplay |
| `realtime-health.md` | `GET /realtime/health` | realtime |
| `realtime-client-secret.md` | `POST /realtime/client_secret` | realtime |
| `ops-health-summary.md` | `GET /ops/health-summary` | infra/ops |
| `memory-stats.md` | `GET /memory/stats` | memory |
| `block-signal.md` | `/memory/block-signal*` | memory |

Each carries the full field table, sample response, compatibility
rules, and changelog. README catalog updated.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: infrastructure for every iOS-consumer V1 checklist
  item. After this PR + #226, every V1-critical response envelope
  has a canonical doc; backend lib headers + iOS decoders both
  read from the same source of truth.`

## Compatibility rules pinned in each doc

- Additive new optional keys are fine within a schemaVersion.
- Type narrowing (e.g. `string | null` → `string`) is a version
  bump.
- Removing keys is a version bump.
- iOS decoders MUST tolerate unknown keys (drop them, don't fail).

## Done when

The 8 docs exist with accurate field tables matching the current
backend behavior; the README catalog lists them all.

## Followups

Future docs (not in this batch): per-decomp-phase envelope docs
that ship alongside their extraction PR. E.g. when Phase 5b.1
extracts `/realtime/client_secret`, the doc here is amended (or
referenced) to reflect any changes — though the design rule says
extraction PRs are byte-identical, so the doc shouldn't need to
change.

### T-schema-docs-scaffold — Bootstrap docs/schemas/ with README + 3 first envelope docs
- **Owner:** claude
- **Branch:** claude/T-schema-docs-scaffold
- **Pillar:** infra (cross-agent contracts)
- **Status:** review

## Scope

Bootstrap `docs/schemas/` per the round-22 protocol: one canonical
source of truth per response envelope. Each schema doc carries the
field set, the schema version, the access-control posture, the
owner agent, sample response, and compatibility rules.

This PR ships:

- `docs/schemas/README.md` — directory contract, naming, update rule.
- `docs/schemas/auth.md` — `/auth/*` family (success + error
  envelopes, 11 routes).
- `docs/schemas/talk-turn-meta.md` — `GET /talk/turn/:turnId`.
- `docs/schemas/ops-metrics.md` — `GET /ops/metrics`.

Plus stubs / followup list for the rest of the V1 surface (talk
response, screenplay project / version, ops health summary, realtime
health / client_secret, memory stats, block signal).

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: infrastructure for every iOS-consumer V1 checklist
  item. Prevents backend ↔ iOS envelope drift, which today produces
  the same envelope description in three places (backend lib header,
  iOS decoder, human reconciliation).`

## Update rule (codified in README)

Every PR that touches a response envelope must:

1. Edit the corresponding `docs/schemas/<name>.md`.
2. If the change is non-additive, bump the schema version in the
   doc and in the response payload.
3. Mention the doc by path in the PR body / commit message.
4. Add a row to the doc's changelog.

If a PR ships an envelope change without touching the doc, review
should request the update before merge.

## Done when

The 3 starter docs reflect the shapes currently emitted by:
- `backend/lib/user_auth.js` `buildAuthEnvelope`
- `backend/lib/talk_pipeline.js` `GET /talk/turn/:turnId`
- `backend/lib/ops_metrics_route.js` `mountOpsMetricsRoute`

If Codex spots a field mismatch with the iOS decoder, the doc is
the source of truth; the doc amends and the decoder follows. If
the doc is wrong about backend behavior, the doc amends.

## Followups

Both agents can add docs for envelopes they own without
coordination. Adding is always safe. Renames/deletes need both
agents' sign-off. Suggested next-to-write list lives in the
README's "Future scaffolding to fill in" section.

### T-screenplay-export-formats-list-route — GET /screenplay/export/formats canonical format list
- **Owner:** claude
- **Branch:** claude/T-screenplay-export-formats-list-route
- **Pillar:** layer-1-craft (export discovery)
- **Status:** review

## Scope

`POST /screenplay/export` accepts a handful of `format` values
(`fountain`, `txt`, `fdx`, `md`, `markdown`) and rejects others.
Today iOS has to hard-code the set, guess the right MIME type, and
re-derive the right file extension. This PR adds a tiny
discoverable contract: `GET /screenplay/export/formats` returns the
canonical list as a frozen snapshot:

```json
{
  "schemaVersion": 1,
  "defaultFormat": "fountain",
  "formats": [
    { "format": "fountain",  "extension": "fountain", "mediaType": "text/plain; charset=utf-8",     "supported": true,  "description": "..." },
    { "format": "txt",       "extension": "fountain", "mediaType": "text/plain; charset=utf-8",     "supported": true,  "description": "Alias of fountain" },
    { "format": "fdx",       "extension": "fdx",      "mediaType": "application/vnd.final-draft",   "supported": true,  "description": "Final Draft XML" },
    { "format": "md",        "extension": "md",       "mediaType": "text/markdown; charset=utf-8",  "supported": true,  "description": "..." },
    { "format": "markdown",  "extension": "md",       "mediaType": "text/markdown; charset=utf-8",  "supported": true,  "description": "Alias of md" },
    { "format": "pdf",       "extension": "pdf",      "mediaType": "application/pdf",               "supported": false, "description": "Not supported locally" }
  ]
}
```

`Cache-Control: no-store`. The canonical set is `Object.freeze`d so
unit tests pin the snapshot — a future change to `POST /screenplay/export`
that adds a new format must also update this list (the test asserts
the symmetric set).

## Done when

`GET /screenplay/export/formats` returns the envelope above; the
snapshot is frozen at the module level; `npm test` green.

### T-screenplay-export-markdown — POST /screenplay/export format=md|markdown
- **Owner:** claude
- **Branch:** claude/T-screenplay-export-markdown
- **Pillar:** layer-1-craft (export)
- **Status:** review

## Scope

`POST /screenplay/export` already handles `fountain`, `txt`, `fdx`,
and rejects `pdf`. This PR adds `md` / `markdown` as a fourth format,
useful for handing a screenplay to any tool that consumes Markdown
(GitHub, Notion, Obsidian, Pandoc).

Conversion rules mirror the FDX paragraph-typing rules so a given
line ends up in the same logical role in both outputs:

- Scene Heading                       → `## ...`
- Character                           → `**...**`
- Parenthetical                       → `*...*`
- Transition                          → `> ...`
- Dialogue / Action                   → plain paragraph

Pure helper at `backend/lib/screenplay_markdown_export.js` so the
conversion is unit-testable without spinning up the full app.
12 unit tests cover paragraph typing, full conversion, empty/null
input, `\r\n` normalization, blank-line collapsing, and determinism.

## Done when

`POST /screenplay/export` accepts `format=md` and `format=markdown`,
returns `text/markdown; charset=utf-8` with a `.md` Content-Disposition;
the conversion helper is tested; `npm test` green.

### T-screenplay-export-pdf-error-clarity — Add human-readable help payload to PDF export rejection
- **Owner:** claude
- **Branch:** claude/T-screenplay-export-pdf-error-clarity
- **Pillar:** layer-1-craft (export)
- **Status:** merged

## Scope

`POST /screenplay/export` with `format=pdf` returns 400 with just
`{ stage, error: "pdf_export_not_supported_locally" }`. iOS / API
callers have to know in advance that this is a "not implemented"
situation rather than a transient failure, and they have to
re-derive the right fallback path from memory.

This PR extends the rejection payload with three additional fields
while keeping the existing `error` class string for backwards
compatibility:

- `message`: human-readable explanation pointing at Fountain /
  Markdown / FDX as alternatives.
- `alternative_formats`: array `["fountain", "fdx", "md"]` —
  caller can surface a chooser.
- `docs_path`: `"/screenplay/export/formats"` — points at PR #135's
  discoverable list.

No backwards-incompatible change for existing clients reading the
error class. Adds 4 integration-style tests that mirror the
production branch through a small fixture.

## Done when

`POST /screenplay/export` with `format=pdf` returns the augmented
payload; existing clients reading `error` still work; `npm test`
green.

### T-talk-turn-meta-contract-snapshot — Pin /talk/turn/:turnId response key set + error codes
- **Owner:** claude
- **Branch:** claude/T-talk-pipeline-error-class-snapshot
- **Pillar:** evals (contract stability)
- **Status:** review

## Scope

`GET /talk/turn/:turnId` is a load-bearing iOS contract — the client
reads every field of the success body and switches on the error
code. A silent rename or shape change in `lib/talk_pipeline.js`
would silently regress every iOS consumer at once.

This PR adds `backend/tests/talk_turn_meta_contract.test.mjs` which
pins:

1. The full set of canonical error codes: `invalid_turn_id`,
   `turn_not_found`, `forbidden`.
2. The exact key set of the success response body (14 keys, listed
   explicitly in the test).
3. The 3 default keys on `render_contract` for legacy turns
   (`reply_role`, `authoritative_page_text_available`, `sync_ready`).
4. `Cache-Control: no-store` on the response.

The test mounts the route in isolation with stub middleware so it
runs fast and deterministic; no real talk pipeline state required.

## Done when

`backend/tests/talk_turn_meta_contract.test.mjs` covers the four
contract surfaces; `npm test` green.

### T-talk-turn-rate-limit-helper — Pure token-bucket rate limiter for talk-turn reads
- **Owner:** claude
- **Branch:** claude/T-talk-turn-rate-limit-helper
- **Pillar:** infra (talk pipeline)
- **Status:** merged

## Scope

`GET /talk/turn/:turnId` is pinned as a contract (PR #125) but uses
a permissive read path: any caller can enumerate turn IDs at HTTP
throughput. We want a cheap per-key burst guard before a production
deploy.

This PR ships **the pure limiter only**, with no Express coupling.
A follow-up PR will mount it on the route once Codex reviews the
algorithm.

`backend/lib/talk_turn_rate_limit.js`:

- `createTalkTurnRateLimiter({ refillPerSec, capacity, capCacheEntries, nowFn })`
- Token bucket per key, refill rate R tokens/sec, capacity C.
- Deny with `{ allowed: false, reason: "rate_limited", retryAfterMs }`.
- LRU eviction at `capCacheEntries` (default 10,000) to bound memory.
- Missing/empty keys are rejected explicitly so unauthenticated traffic
  doesn't pool behind a single bucket.
- Deterministic with an injected `nowFn` so tests are fast and stable.

11 unit tests cover: first-call allowed, burst exhaustion, refill,
capacity cap, missing key, per-key isolation, LRU eviction, inspect/
reset, invalid config, determinism.

## Done when

`backend/lib/talk_turn_rate_limit.js` exports the factory; tests
green; `npm test` green. Mount happens in a follow-up PR.

### T-talk-turn-rate-limit-route — Optional rate-limit middleware on GET /talk/turn/:turnId
- **Owner:** claude
- **Branch:** claude/T-talk-turn-rate-limit-route
- **Pillar:** infra (talk pipeline)
- **Status:** merged

## Scope

PR #154 shipped the pure token-bucket limiter. This PR mounts it
on `GET /talk/turn/:turnId` as an **opt-in** middleware via a new
`turnReadRateLimiter` option on `mountTalkPipelineRoutes`. Omitting
the option preserves current behavior verbatim.

Behavior when supplied:

- Each request keys via `turnReadRateLimitKey(req)`:
  - `user:<userId>` if `req.user.id` / `req.authUser.id` / `req.userId`
    is set;
  - else `ip:<req.ip>` (falling back to `socket.remoteAddress`).
- Limiter's `attempt(key)` is checked before any other validation.
  Denied → 429 with `{ error: "rate_limited", retry_after_ms }`
  plus `Cache-Control: no-store` and `Retry-After` (seconds) headers.
- The limiter wins over `invalid_turn_id` / `turn_not_found` /
  `forbidden` — a hammering attacker can't peek at error classes
  past their quota.

5 integration tests cover: omitted limiter, available tokens,
burst exhaustion → 429, no-store on denied, and the
limit-runs-first ordering.

## Done when

`mountTalkPipelineRoutes` accepts `turnReadRateLimiter`;
production `index.js` mount is unchanged (no limiter wired) until
the human / Codex decides on production thresholds; tests pass;
`npm test` green.

### T-task-files-cleanup — Add TASKS.md rows for orphan task files (T-trust-tiers, T42-T56)
- **Owner:** claude
- **Branch:** claude/T-task-files-cleanup
- **Pillar:** infra (coordination)
- **Status:** review

## Scope

`tasks/_active/` accumulated 16 task files with no matching rows in
`TASKS.md`:

- `T-trust-tiers.md` (Claude)
- `T42-supervisor-merge-protocol.md` through
  `T56-refresh-after-talk-contract.md` (Codex, all merged via PRs on
  `main`)

PR #107's `scripts/tasks_sync_check.mjs` already detects this drift
and was sitting on warn-only mode to give us time to clean up before
flipping `--strict`. This PR is that cleanup.

For the Codex tasks (T42–T56), all merge commits are present on
`main`, so the rows are marked `merged`. `T-trust-tiers` was already
`review` in its task file's front matter — that status is carried
forward.

After this PR merges, the `--strict` flag on PR #107 can be enabled
in CI cleanly (no remaining drift findings for files with valid
front matter). Files using Codex's plain-markdown convention
(T49–T56) still surface as `missing_or_invalid_front_matter` but
that's a separate format-convergence question between agents — out
of scope here.

## Done when

`TASKS.md` has rows for every YAML-front-matter file in
`tasks/_active/`; rows match the file's `id`, `owner`, and `status`.

### T-tasks-active-frontmatter-eval — Validate every tasks/_active/T-*.md front-matter
- **Owner:** claude
- **Branch:** claude/T-tasks-active-frontmatter-eval
- **Pillar:** infra (coordination)
- **Status:** merged

## Scope

Sits next to PR #107's `scripts/tasks_sync_check.mjs` (which
validates the TASKS.md ↔ tasks/_active/ row mapping). This script
validates the **content** of each task file in `tasks/_active/`.

Two accepted layouts:

1. **YAML front matter** (Claude convention):

   ```yaml
   ---
   id: T-<slug>
   title: ...
   owner: claude | codex | human
   status: ready | in-progress | review | merged | blocked-...
   branch: ...
   ---
   ```

2. **Legacy header** (Codex convention for T42–T68):

   ```
   # T49 — Post-T48 Coordination Refresh

   Owner: codex
   Status: in-progress
   Branch: codex/T49-...
   ```

Filename matching is lenient: `<id>.md` or `<id>-<slug>.md` both
pass (Codex's `id: T60` + filename `T60-export-formats-picker.md`
is accepted alongside Claude's strict `id == filename` convention).

Default mode prints findings + exits 0. `--strict` exits 1 on any
finding — flip to that in CI once both conventions are normalized.

## Done when

`node scripts/tasks_active_frontmatter_eval.mjs` exits 0 against
the current `tasks/_active/` (40 files); smoke test exits 0 in
both modes.

### T-tasks-active-stats — At-a-glance counts over tasks/_active/
- **Owner:** claude
- **Branch:** claude/T-tasks-active-stats
- **Pillar:** infra (coordination)
- **Status:** merged

## Scope

Quick "how much is in flight?" report over `tasks/_active/`:

```
$ node scripts/tasks_active_stats.mjs
tasks_active_stats: 41 task file(s)

by owner:
    26  codex
    15  claude

by status:
    17  merged
    14  review
    10  in-progress

by pillar:
     9  infra (enables all)
     ...
```

`--json` emits the same data as machine-readable JSON for CI /
inbox automation.

Sits next to `tasks_sync_check.mjs` (PR #107) and
`tasks_active_frontmatter_eval.mjs` (PR #155) — the same parse-the-
front-matter loop, different report. Skips files that don't parse
(YAML front-matter or `# Tn — title` header) and surfaces them as
`unrecognized` instead of crashing.

Useful for inbox refresh PRs ("queue has 26 codex tasks, 15
claude") and for the human's at-a-glance read.

## Done when

`node scripts/tasks_active_stats.mjs` prints a valid summary;
`--json` emits parseable JSON; smoke test green.

### T-tasks-per-row — Per-row task files + TASKS.md regenerator (no canonical flip yet)
- **Owner:** claude
- **Branch:** claude/T-tasks-per-row
- **Pillar:** infra (enables all)
- **Status:** merged

## Scope

New `tasks/_active/` directory with one markdown file per currently-active
task. Each file carries a YAML-style front matter block (id, title,
owner, status, branch, pillar) and body sections (Scope, Done when).
`scripts/build_tasks_md.mjs` reads these files and can print or write
the quick-view table + detail blocks for the active section of
`TASKS.md`.

This PR ships the layout and the regenerator; it does **not** flip
`TASKS.md` to be a build artifact. Adoption is opt-in. A follow-up
will flip the canonical source once enough rows have moved.

## Done when

`tasks/README.md` documents the convention; `tasks/_active/` is
populated with at least one example file (this one); the regenerator
prints a valid quick-view table when run; `TASKS.md` remains the
source of truth for now (the README explains the migration plan).

### T-tasks-sync-check — CI script to detect tasks/_active vs TASKS.md drift
- **Owner:** claude
- **Branch:** claude/T-tasks-sync-check
- **Pillar:** infra (coordination)
- **Status:** merged

## Scope

`scripts/tasks_sync_check.mjs` reads every `tasks/_active/T-*.md`
file and checks that:

1. The filename matches its front-matter `id`.
2. There's a row in `TASKS.md` with the same `id`.
3. The row's status and owner columns match the task file's
   front-matter (when both are present).

Drift surfaces as a list of findings. Default mode prints findings
and exits 0 (safe to wire into observability without breaking CI
today). `--strict` exits non-zero when drift exists — flip to that
once the current drift is cleaned up.

Also adds `scripts/tasks_sync_check.test.mjs` which execs the script
in both modes and asserts the exit codes match the documented
contract, so a future refactor of the parser can't silently break
the gate.

## Done when

`node scripts/tasks_sync_check.mjs` runs cleanly in both modes;
`node --test scripts/tasks_sync_check.test.mjs` green.

### T-trait-library-canon-eval — Pin canonical TRAIT_KEYWORDS + cap constants
- **Owner:** claude
- **Branch:** claude/T-trait-library-canon-eval
- **Pillar:** evals (contract stability)
- **Status:** merged

## Scope

`backend/lib/trait_library.js` exports `TRAIT_KEYWORDS` — the
frozen list of trait labels that `extractTraits` matches against.
Adding or removing a keyword changes how every character record
gets re-classified next time their traits merge. iOS surfaces
these labels directly. A silent change would silently re-classify
the user's entire character roster.

This eval pins:

- `TRAIT_KEYWORDS` is `Object.freeze`d.
- The exact canonical 23-keyword set (snapshot of main).
- Every keyword is lowercase a-z only.
- The structural caps `TRAIT_SCHEMA_VERSION`, `VOCAB_MAX`,
  `KEYWORD_MAX`, `GOALS_MAX`, `RELATIONSHIPS_MAX` are positive
  integers (or `=== 1` for the version).
- `extractTraits({lines:[]})` returns the canonical envelope shape
  with `vocabulary`, `keywords`, `goals`, `relationships`,
  `speech_style` fields.

Wired via `npm run eval:trait-library-canon`.

## Done when

`backend/evals/run_trait_library_canon_eval.mjs` exits 0 with all
checks passing; `npm test` still green.

### T-trust-tiers — Trust tiers + standing pre-approvals (AGENTS.md)
- **Owner:** claude
- **Branch:** claude/T-trust-tiers
- **Pillar:** infra (enables all)
- **Status:** review

## Scope

Adds a new `## Trust Tiers (standing pre-approvals)` section to
`AGENTS.md` defining three merge tiers — Tier 1 (agent-owned,
merge-eligible only when the suite is green and a trusted cross-agent approval is present),
Tier 2 (cross-agent review required), Tier 3 (human approval
required). Codifies which classes of PRs can ship without the human
becoming the merge bottleneck. Canonical reference point for the
`auto-merge-tier1.yml` workflow.

## Done when

AGENTS.md carries the Trust Tiers section with explicit lists of
what's Tier 1 / 2 / 3 and the escalation rules; the section names the
`tier-1` / `tier-2` / `tier-3` labels the auto-merge workflow will
read.

### T-twist-engine-canon-eval — Pin TWIST_LIBRARY framework set + per-twist field shape
- **Owner:** claude
- **Branch:** claude/T-twist-engine-canon-eval
- **Pillar:** evals (contract stability)
- **Status:** merged

## Scope

`backend/lib/twist_engine.js` ships `TWIST_LIBRARY`: a frozen map
of `framework → beat → ordered list of twist seeds`. iOS T37 reads
these seeds and renders twist cards. Each twist `id` is documented
as "stable so iOS can dedupe / pin / dismiss" — silently renaming
or dropping an ID would drop every user's stored "pinned" /
"dismissed" state.

This eval probes every `(framework, beat)` pair via the public
`suggestTwists()` API and pins:

- Canonical framework set: `save-the-cat`, `three-act`,
  `story-circle`, `hero-journey`.
- Beats per framework match the on-main set.
- Every twist has `id`, `label`, `hook`, `severity`, `rationale`.
- `severity ∈ {low, medium, high}`.
- All 42 twist IDs are unique across the library.
- Unknown framework throws a typed error.

Wired via `npm run eval:twist-engine-canon`.

## Done when

`backend/evals/run_twist_engine_canon_eval.mjs` exits 0 with all
checks passing; `npm test` still green.

### T-untested-libs-followups — Add tests for remaining untested infrastructure libs
- **Owner:** claude
- **Branch:** (not opened)
- **Pillar:** infra (test coverage)
- **Status:** planned

## Scope

The round-19 test-coverage audit found 7 `backend/lib/*.js` files
without any direct or indirect test imports:

- `memory_store` (626 lines)  — session memory persistence
- `outbox_store` (274 lines)  — scale-backplane outbox persistence
- `persona`      (317 lines)  — persona runtime
- `screenplay_store` (210 lines) — screenplay store (Phase 2 used it indirectly)
- `user_auth`    (780 lines)  — auth subsystem
- `user_store`   (705 lines)  — user persistence
- `utils`        (154 lines)  — pure-function toolbox

Coverage landed for `utils.js` (#200), `persona.js` (#205),
`screenplay_store.js` (#206), and `outbox_store.js` (#207). The
remaining 3 are foundational and stateful (memory + auth). Each
deserves its own focused test PR rather than a single mega-PR.

## Suggested phasing

1. **memory_store** — biggest single piece. Round-trip persisted
   session memory; eviction; backfill.
2. **user_store** — same shape as memory_store. Round-trip;
   per-IP / per-client-token lookup.
3. **user_auth** — tied to `user_store`. Test auth issuance + token
   verification + the `req.user` middleware.

## Done when

The remaining 3 libs have a `backend/tests/<name>.test.mjs` with at
least smoke coverage of the most-used exports + at least one
round-trip-through-persistence test for the stateful ones.

## Why this matters

When the backend decomposition lands the rest of its phases (3–8)
many handlers will start passing these libs in as deps. If we
extract a route into a lib and the store it depends on has no
test, a behavior regression in the store is invisible until it
hits a downstream route's integration test. Direct tests on the
stores catch regressions at the source.

### T-user-auth-roundtrip-tests — Full handler round-trip tests for backend/lib/user_auth.js
- **Owner:** claude
- **Branch:** claude/T-user-auth-roundtrip-tests
- **Pillar:** infra (test coverage)
- **Status:** review

## Scope

Closes the deferred followup from #241 by exercising the actual
handler flows iOS depends on with **real user_store + real JWT
signing** (no mocks for crypto).

13 round-trip tests across 7 flows:

### Signup (3 tests)
- Creates a user and returns access+refresh tokens; the access
  token verifies with the configured HS256 secret.
- Rejects duplicate email with 409 `email_taken`.
- Rejects short password with 400 `password_too_short`.

### Login (3 tests)
- Returns access+refresh tokens for valid credentials.
- Rejects unknown email with 401 `invalid_credentials`.
- Rejects wrong password with 401 `invalid_credentials`.

### Refresh + rotation (3 tests)
- Refresh rotates the token and preserves `family_id` across the
  rotation (load-bearing for iOS session-list UX).
- Using a rotated refresh token a second time fails.
- Missing `refresh_token` returns 4xx.

### Logout (1 test)
- Invalidates the refresh token; subsequent refresh with the same
  token fails.

### Password reset (2 tests)
- `request_password_reset` issues a `debug_password_reset_token`
  in non-production mode.
- `reset_password` consumes the token, revokes all sessions for
  the user (security invariant), and the new password works for
  subsequent login.

### Email verification (1 test)
- Signup with `requireEmailVerification: true` issues a debug
  verification token; `verify_email` consumes it and the response
  succeeds.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: closes the last untested-libs gap for the tier-3
  auth surface. Auth gates every V1 iOS contract (talk, screenplay,
  memory, realtime). A regression in the signup→login→refresh
  flow would silently break iOS.`

## Verification

`node --test backend/tests/user_auth_roundtrip.test.mjs` → **13/13
pass**. Uses real `user_store` (in-memory + temp JSON store) and
HS256 JWT signing with a test secret.

## What this does NOT cover

- Apple Sign In identity-token verification (needs stubbed Apple
  JWKS).
- Production-mode JWT secret loading (the existing 503-when-
  missing path is already covered by #241).
- `protectUserRoutes` middleware (covered by route-level tests
  on protected endpoints).

## Done when

Round-trip tests ship + pass. `T-untested-libs-followups` can mark
the user_auth full-handler coverage complete.

## After this PR

The 7 stateful libs (utils, persona, screenplay_store, outbox_store,
memory_store, user_store, user_auth) are now covered at smoke +
deeper + (for user_auth) round-trip tiers. Pre-flight's
`lib-missing-test` rule is clean on main.

### T-v1-pillar-rule-and-canon-wire — Pre-flight V1 pillar rule + wire 4 V1 smokes into eval:canon
- **Owner:** claude
- **Branch:** claude/T-v1-pillar-rule-and-canon-wire
- **Pillar:** infra
- **Status:** review

## Scope

Two infra wins bundled together:

### 1. Pre-flight `task-missing-v1-pillar` rule

Every active task file in `tasks/_active/T-*.md` that uses YAML
front matter must carry a `v1_pillar` + `v1_effect` declaration
(YAML or body-line) per `docs/v1-definition.md`'s PR Rule.

**Grandfather rules** (skipped by the check):
- Files without YAML front matter (pre-V1-doc style).
- Files with `status: merged` (shipped before the V1 rule could
  apply).
- Coord-refresh tasks (matched by "Refresh coordination after PR").

**Invalid-pillar check**: if `v1_pillar` is present but not one of
`talk`, `screenplay`, `memory`, `realtime`, `ios`, `infra`, the
rule flags it.

Current main produces 13 `task-missing-v1-pillar` findings against
non-merged, non-grandfathered task files. They are warn-only;
they should be backfilled as those PRs cycle through.

### 2. `eval:canon` wired with V1 smokes

The 4 V1 deterministic smokes (voice-to-page #224, screenplay +
memory recall + realtime failover #231) are now part of the
umbrella. New `npm` scripts:

- `npm run eval:v1-voice-to-page-smoke`
- `npm run eval:v1-screenplay-smoke`
- `npm run eval:v1-memory-recall-smoke`
- `npm run eval:v1-realtime-failover-smoke`
- `npm run eval:v1-smokes` (chains all 4)

The `eval:canon` umbrella appends `&& npm run eval:v1-smokes` so
the canon gate fails on any V1 smoke regression. `quality_gate.sh`
runs `eval:canon` in strict mode already (`set -euo pipefail`), so
this lands as an actual merge-blocking gate for V1 regressions.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: infrastructure for every V1 checklist item.
  Pre-flight enforces V1 pillar declarations on new tasks (so the
  V1 rule actually applies); canon umbrella now runs all 4 V1
  smoke fixtures (so V1 regressions block merge).`

## Verification

- `node scripts/pre_flight.mjs` → 23 findings: 10 pre-existing
  eval-determinism warnings + 13 task-missing-v1-pillar warnings
  against legacy non-merged tasks.
- `node --test scripts/pre_flight.test.mjs` → 33/33 pass
  (includes 7 new tests for the V1 pillar rule).
- `cd backend && npm run eval:v1-smokes` → all 4 V1 smokes PASS.
- The 4 new individual scripts run independently.

## Done when

The pre-flight rule is wired + tested; the canon umbrella runs
the V1 smoke chain on every gate run.

## Followups

- Backfill V1 pillar/effect lines on the 13 legacy non-merged task
  files (each PR can include the line as it ships).
- Once the V1 doc has more checklist items closed, audit the smoke
  fixtures and add new ones to the canon chain.

### T-v1-three-smoke-fixtures — V1 smoke fixtures — screenplay export + memory recall + realtime failover
- **Owner:** claude
- **Branch:** claude/T-v1-screenplay-smoke
- **Pillar:** infra (V1 smoke)
- **Status:** review

## Scope

Three V1 smoke fixtures shipped together because they share the
same deterministic-no-external-API pattern set by #224 (the V1
voice-to-page smoke):

| V1 line | Manual smoke item | Smoke script |
| --- | --- | --- |
| 39 | Create project → write scene → save → export → reopen | `scripts/v1_screenplay_smoke.mjs` |
| 55 | Mention character → later suggestion recalls them | `scripts/v1_memory_recall_smoke.mjs` |
| 67 | Primary mint works; forced primary failure shows fallback | `scripts/v1_realtime_failover_smoke.mjs` |

Each is the **automatable cheap subset** of the matching manual
smoke. The manual smoke still needs the human to drive an actual
TestFlight build; these scripts catch the upstream regressions
that would make the manual smoke fail before a human even gets to
it.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: closes the automatable subset of 3 V1 manual-smoke
  checklist items at once (lines 39, 55, 67). Each script is the
  cheap tripwire; the full manual smoke still gates V1 sign-off.`

## What each script catches

### v1_screenplay_smoke (line 39)

- Fountain emitter regressions (scene heading format, character
  cue casing, dialogue indentation, title-page order).
- Non-determinism in `exportToFountain(...)`.

Fixture: `backend/fixtures/v1_screenplay_export.json` — a 2-scene
screenplay with title page, action, character cue, dialogue.
8 substring checks + 5 ordering checks + 1 determinism check.

### v1_memory_recall (line 55)

- Creative-memory write regressions (character not persisted).
- Creative-memory read regressions (character missing from prompt
  payload).
- Sanitize-on-read regressions that drop voice/tags iOS depends on.
- Non-determinism across reads.
- Cross-user isolation (other user's memory must not leak).

Runs `recordCharacterMention` → `getCreativeMemoryForPrompt` on
an in-memory JSON persistence and verifies JUNE round-trips with
voice + tags.

### v1_realtime_failover (line 67)

- Failover state-machine regressions on all 4 paths:
  1. `primary_ok` (no fallback attempted)
  2. `primary_fail_fallback_ok` (unpinned primary fail → stub mints)
  3. `primary_fail_fallback_fail` (`supplier_fallback_failed` wrap)
  4. `pinned_provider_fail` (no fallback ever, re-throw as-is)

Uses fake suppliers + stubbed loader. No network. No OpenAI key.

## What none of these catch

- Real iOS-side rendering / playback.
- Real LLM / STT / TTS / WebRTC behavior.
- End-to-end TestFlight smoke (still required for V1 sign-off).

## Verification

- `node scripts/v1_screenplay_smoke.mjs` → PASS
- `node scripts/v1_memory_recall_smoke.mjs` → PASS (recalled
  JUNE with `voice="wry"`, `tags=["protagonist"]`).
- `node scripts/v1_realtime_failover_smoke.mjs` → PASS (4/4
  cases).
- `node --test scripts/v1_screenplay_smoke.test.mjs
     scripts/v1_memory_recall_smoke.test.mjs
     scripts/v1_realtime_failover_smoke.test.mjs` → 7/7 pass.

## Done when

The 3 scripts + their test wrappers ship and pass in CI. The V1
doc's 3 manual-smoke checklist items now have automatable
tripwires above the human-driven smoke.

## Followups

- Wire the 3 scripts into the `eval:canon` umbrella so a single
  command runs them all (separate PR, listed as item 15 in the
  current 15-move queue).
- Add a 4th smoke once Phase 7 talk-pipeline lands — end-to-end
  through the extracted handler, byte-comparable.

### T-v1-voice-to-page-smoke — V1 voice-to-page smoke fixture + automated subset
- **Owner:** claude
- **Branch:** claude/T-v1-voice-to-page-smoke
- **Pillar:** infra (V1 smoke)
- **Status:** review

## Scope

Ships the deterministic, network-free subset of the V1 voice-to-page
manual smoke. The full manual smoke (real audio → STT → LLM → TTS)
requires `OPENAI_API_KEY` and a recorded audio file; that path stays
in `backend/smoke.sh`. This PR adds the **automatable tripwire**
that catches prompt-path regressions every time tests run.

Three deliverables:

1. **`backend/fixtures/v1_voice_to_page.json`** — canonical fixture:
   simulated STT transcript, persona, creative-memory shape,
   session context, expected prompt substring set + ordering.

2. **`scripts/v1_voice_to_page_smoke.mjs`** — runs `buildModelPrompt`
   on the fixture, verifies:
   - Every `expected_prompt_contains` substring appears.
   - `expected_prompt_ordering` substrings appear in order.
   - Determinism: two consecutive runs produce byte-identical
     prompts.

3. **`scripts/v1_voice_to_page_smoke.test.mjs`** — node:test wrapper
   so the smoke runs as part of `npm test`.

## What this catches

- Re-ordered prompt blocks (e.g. session before memory).
- Missing creative-memory rendering (character name + voice drop).
- Persona leaking into a memory block.
- Non-deterministic prompt assembly (same input → different output).

## What this does NOT catch

- Real STT errors (no audio).
- Real LLM behavior or quality (no API call).
- Real TTS regressions (no audio out).
- End-to-end turn metadata storage / retrieval.

Pair with `backend/smoke.sh` for full end-to-end coverage. This
script is the cheap fast tripwire that fails fast when the prompt
path drifts. Catching prompt-path drift in CI saves the manual
smoke from regressing on something a determinism check could have
caught for free.

## V1 pillar / effect

- `V1 pillar: talk`
- `V1 effect: infrastructure for "Manual smoke: record voice ->
  get reply -> hear reply -> saved turn" (docs/v1-definition.md
  line 26).`

## Verification

- `node scripts/v1_voice_to_page_smoke.mjs` exits 0 against the
  canonical fixture; 7 contains + 6 ordering checks pass;
  determinism check passes.
- `node --test scripts/v1_voice_to_page_smoke.test.mjs` → 3/3
  pass (canonical fixture, --json output, failing-fixture
  regression).
- The failing-fixture test asserts a non-existent substring and
  expects exit 1 — proves the script actually fails when it
  should.

## Followups

- Extend the fixture set with one cold-state turn (no memory) and
  one block-signal turn so the smoke covers more prompt paths.
- Wire into `quality_gate.sh` once the canon umbrella's
  composition is settled.

### T42-supervisor-merge-protocol — Codex self-merge authority + agent handoff fast lane
- **Owner:** codex
- **Branch:** codex/T42-supervisor-merge-protocol
- **Pillar:** infra (enables all)
- **Status:** review

- **Done when:** the human-approved Codex self-merge authority is recorded as an accepted decision; `AGENTS.md` explains when Codex may merge its own PRs; the Codex/Claude fast-path handoff tells both agents how to act from `docs/coordination.json` without chat copy/paste; verification commands for the coordination scripts pass.

- **Scope:** protocol/docs only. No app or backend runtime changes.

### T43-refresh-claude-queue — Refresh Claude queue after supervisor protocol merge
- **Owner:** codex
- **Branch:** codex/T43-refresh-claude-queue
- **Pillar:** infra (enables all)
- **Status:** review

- **Done when:** `docs/coordination.json` and Codex/Claude inboxes reflect the current open Claude PR queue after T42, including PRs #91 and #92; superseded PR #89 is marked blocked; verification commands for the coordination scripts pass.

- **Scope:** protocol/docs only. No app or backend runtime changes.

### T44-creative-memory-export-triage — Triage creative-memory export privacy gate
- **Owner:** codex
- **Branch:** codex/T44-creative-memory-export-triage
- **Pillar:** longitudinal learning
- **Status:** review

- **Done when:** `docs/coordination.json` and inboxes mark Claude PR #94 as tier-3/needs-human because it exposes a full creative-memory export surface; verification commands for the coordination scripts pass.

- **Scope:** protocol/docs only. No app or backend runtime changes.

### T46-post-review-queue-refresh — Refresh queue after Codex PR reviews
- **Owner:** codex
- **Branch:** codex/T46-post-review-queue-refresh
- **Pillar:** infra (enables all)
- **Status:** review

- **Done when:** `docs/coordination.json` and inboxes reflect the current state after #91 and #98 merge; blocked Claude PRs #87/#88/#90/#92/#97 show their exact blockers; verification commands for the coordination scripts pass.

- **Scope:** protocol/docs only. No app or backend runtime changes.

### T47-refresh-after-new-claude-prs — Refresh queue after new Claude PR triage
- **Owner:** codex
- **Branch:** codex/T47-refresh-after-new-claude-prs
- **Pillar:** infra (enables all)
- **Status:** review

- **Done when:** `docs/coordination.json`, Codex inbox, Claude inbox, and the live handoff ledger record PR #99 as human-gated privacy/data-control work and PR #100 as blocked on ops access-control plus true windowed counts; prompt printers and coordination script checks pass.

- **Scope:** protocol/docs only. No app or backend runtime changes.

### T48-ios-archetype-traits — Surface character archetypes in the Studio traits rail
- **Owner:** codex
- **Branch:** codex/T48-ios-archetype-traits
- **Pillar:** living companion + longitudinal learning
- **Status:** in-progress

- **Done when:** iOS has typed models/client coverage for `GET /memory/character-archetypes`; the existing character-traits rail can show a compact archetype tag/insight when backend data is present; empty/failure states remain non-blocking; focused tests cover decoding and view-state mapping.

- **Scope:** iOS app/package integration only. Backend contract already merged in PR #91.

### T60 — Consume screenplay export formats in Studio
- **Owner:** codex
- **Branch:** codex/T60-export-formats-picker
- **Pillar:** mobile-first + screenplay craft
- **Status:** merged

## Scope

PR #135 added `GET /screenplay/export/formats` so iOS no longer has to
hard-code the export contract. This task adds the app-side consumer:
typed decoding, a small view-state adapter for supported formats, and
a Studio export menu that can prefer backend-discovered formats while
keeping local fallbacks available when the backend is unreachable.

## Done when

iOS has typed client/model coverage for `GET /screenplay/export/formats`;
the Studio export menu can render supported formats from the backend
contract while preserving local fallback options; focused tests cover
decoding, fallback ordering, and unsupported-format filtering; handoff
docs tell Claude the endpoint has an app consumer.

### T61 — Refresh coordination after T60 merge
- **Owner:** codex
- **Branch:** codex/T61-post-t60-coordination-refresh
- **Pillar:** mobile-first + infra
- **Status:** merged

## Scope

PR #137 merged T60, so the repo-native coordination lane needs to stop
showing the export formats picker as review work and should keep Claude's
current blockers precise.

## Done when

`TASKS.md`, `docs/coordination.json`, `docs/codex-claude-live-handoff.md`,
`docs/claude-inbox.md`, and `docs/codex-inbox.md` reflect PR #137/T60
merged; PR #133/#134 blockers are current; prompt printers and
coordination-state checks are green.

### T62 — Quiet offline Studio export-format refresh
- **Owner:** codex
- **Branch:** codex/T62-studio-offline-refresh-quiet
- **Pillar:** mobile-first + infra
- **Status:** merged

## Scope

T60 added backend-driven export format discovery. The Studio currently tries
that fetch automatically on view load, which creates noisy localhost failures
in test/offline runs even though local fallback export options are available.

## Done when

Studio still discovers backend export formats when appropriate, but app/test
launches do not surface noisy localhost connection failures; manual Refresh
Formats remains available; focused tests cover the quiet/fallback behavior.

### T63 — Refresh coordination after T62 merge
- **Owner:** codex
- **Branch:** codex/T63-post-t62-coordination-refresh
- **Pillar:** mobile-first + infra
- **Status:** merged

## Scope

PR #139 merged T62, so the repo-native coordination lane should mark the
offline export-format quieting task as merged and keep Claude's immediate
blockers precise against post-T62 `main`.

## Done when

`TASKS.md`, `docs/coordination.json`, `docs/codex-claude-live-handoff.md`,
`docs/claude-inbox.md`, and `docs/codex-inbox.md` reflect PR #139/T62
merged; Claude's #133/#134 blockers are current against post-T62 `main`;
coordination prompt/check scripts pass.

### T64 — Quiet offline session-evolution launch probe
- **Owner:** codex
- **Branch:** codex/T64-session-evolution-quiet
- **Pillar:** mobile-first + infra
- **Status:** merged

## Scope

After T62 quieted export-format discovery, offline/test Studio launches still
surface a localhost `/session/evolution` connection failure from an automatic
launch probe. This task applies the same conservative policy: only auto-refresh
when the app has backend-backed session context and never during XCTest. While
tracing the launch path, the same XCTest/offline quieting now covers automatic
health, hydration, keychain-token, history, project-outline, preferred-project,
and navigator probes that were also surfacing localhost noise.

## Done when

App/test launches no longer surface noisy localhost `/session/evolution`
connection failures when no backend session has been loaded, and related
startup probes stay quiet during XCTest/offline startup; manual or
backend-backed refresh remains available; focused tests cover the quiet policy.

### T65 — Refresh coordination after T64 merge
- **Owner:** codex
- **Branch:** codex/T65-post-t64-coordination-refresh
- **Pillar:** mobile-first + infra
- **Status:** merged

## Scope

PR #146 merged T64, so the repo-native coordination lane should mark the
session-evolution launch quieting task as merged and keep Claude's immediate
blockers precise against post-T64 `main`.

## Done when

`TASKS.md`, `docs/coordination.json`, `docs/codex-claude-live-handoff.md`,
`docs/claude-inbox.md`, and `docs/codex-inbox.md` reflect PR #146/T64
merged; Claude's #133/#134 blockers remain current; coordination prompt/check
scripts pass.

### T66 — Refresh queue after Claude PR triage
- **Owner:** codex
- **Branch:** codex/T66-refresh-after-claude-pr-triage
- **Pillar:** infra (enables all)
- **Status:** merged

## Scope

Codex reviewed the fresh Claude PR stack after T65: merged the clean
additive PRs #141, #143, and #144; blocked #142 on a startup-check
contract issue; and closed the stale conflicting inbox refresh #145.
The repo-native coordination lane needs to reflect those actions.

## Done when

`TASKS.md`, `docs/coordination.json`, `docs/codex-claude-live-handoff.md`,
`docs/claude-inbox.md`, and `docs/codex-inbox.md` reflect PR #141/#143/#144
merged, PR #142 blocked with the known-domains startup-check finding,
PR #145 closed as stale, and PR #147/T65 merged; coordination prompt/check
scripts pass.

### T67 — Refresh queue after PR #148 triage
- **Owner:** codex
- **Branch:** codex/T67-refresh-after-pr148-triage
- **Pillar:** infra (enables all)
- **Status:** merged

## Scope

Codex reviewed Claude PR #148 (`T-ops-routes-list-route`) after T66
merged. The PR is useful, but it conflicts with current `main` and its
route-manifest wording is broader than the static list it returns.
The repo-native coordination lane needs to reflect the blocker so
Claude can clear it without a human copy-paste loop.

## Done when

`TASKS.md`, `docs/coordination.json`, `docs/codex-claude-live-handoff.md`,
`docs/claude-inbox.md`, and `docs/codex-inbox.md` reflect PR #148 blocked
with the route-manifest scope/rebase finding; coordination prompt/check
scripts pass.

### T68 — Refresh queue after PR #150/#151 merges
- **Owner:** codex
- **Branch:** codex/T68-refresh-after-pr150-151
- **Pillar:** infra (enables all)
- **Status:** merged

## Scope

Codex merged Claude PR #150 (`T-creative-memory-version-check-eval`) and
PR #151 (`T-screenplay-export-pdf-error-clarity`). The repo-native
coordination lane needs to record those merges and clean up T67's
status detail so Claude and Codex read a consistent queue.

## Done when

`TASKS.md`, `docs/coordination.json`, `docs/codex-claude-live-handoff.md`,
`docs/claude-inbox.md`, and `docs/codex-inbox.md` reflect PR #150 and
PR #151 merged; T67 status is internally consistent; coordination prompt/check
scripts pass.

### T69 — Refresh queue after PR #134 merge
- **Owner:** codex
- **Branch:** codex/T69-refresh-after-pr134
- **Pillar:** coordination
- **Status:** merged

## Scope

Record that Claude's `T-ops-health-summary-route` PR #134 landed after
Codex cleared the stale `do-not-merge` label, verified the focused route
test plus full backend suite, and merged it under D005.

## Done when

`TASKS.md`, `docs/coordination.json`, `docs/codex-claude-live-handoff.md`,
`docs/claude-inbox.md`, and `docs/codex-inbox.md` reflect PR #134 merged;
the current next-10 queue no longer asks Claude to fix or review it; and
coordination prompt/check scripts pass.

### T70 — Refresh queue after PR #154/#155/#156/#158 merges
- **Owner:** codex
- **Branch:** codex/T70-refresh-after-pr154-158
- **Pillar:** coordination
- **Status:** merged

## Scope

Record the merged Claude tier-1 support PRs:

- PR #154 `T-talk-turn-rate-limit-helper`
- PR #155 `T-tasks-active-frontmatter-eval`
- PR #156 `T-prompt-assembly-readme`
- PR #158 `T-tasks-active-stats`

## Done when

`TASKS.md`, `docs/coordination.json`, `docs/codex-claude-live-handoff.md`,
`docs/claude-inbox.md`, and `docs/codex-inbox.md` reflect those PRs
merged; the task files are marked merged; and coordination prompt/check
scripts pass.

### T71 — Add agent throughput protocol and next-action CLI
- **Owner:** codex
- **Branch:** codex/T71-agent-throughput
- **Pillar:** infra (enables all)
- **Status:** merged

## Scope

Reduce coordination drag between Codex, Claude, and the human by
codifying the working-speed rules and adding a repo-native next-action
command.

This task adds:

- A concise throughput protocol: WIP limits, merge-train batching,
  blocker-first rule, and ready-for-iOS label semantics.
- A script that prints the next top Codex and Claude actions from
  `docs/coordination.json`.
- Handoff updates so both agents can self-start from the repo instead
  of relying on human copy/paste.

## Done when

The protocol is documented, `AGENTS.md` points to it, the CLI can print
top Codex/Claude actions and JSON output, tests cover prioritization,
and the new flow is referenced from the handoff docs.

### T72 — Refresh queue after supervisor merge train
- **Owner:** codex
- **Branch:** codex/T72-batch-refresh
- **Pillar:** infra (coordination)
- **Status:** merged

## Scope

Record the May 12 supervisor merge train so Codex and Claude share one
current source of truth. This task updates the task queue, coordination
state, and reciprocal inboxes after the merged backend/eval PRs, newly
blocked canon-eval PRs, and stale inbox-only closures.

## Done when

`TASKS.md`, `docs/coordination.json`, `docs/codex-claude-live-handoff.md`,
`docs/claude-inbox.md`, and `docs/codex-inbox.md` agree on which PRs
merged, which PRs remain blocked, and which app-facing backend contracts
are ready for Codex. Coordination validation, agent-next commands,
task-frontmatter checks, task stats, task generation, and diff checks pass.

### T73 — Build iOS Fountain import surface
- **Owner:** codex
- **Branch:** codex/T73-ios-fountain-import
- **Pillar:** mobile-first + screenplay craft
- **Status:** merged

## Scope

Consume Claude PR #87's `POST /screenplay/import/fountain` contract from the
Studio app. Script text imports should use the backend Fountain parser when it
is available, fall back to local normalization when offline, and keep PDF/OCR
import behavior intact.

## Done when

The Studio can import Fountain/plain-text screenplay files from the document
controls, navigator, drag/drop, and iOS file importer path; imported structured
screenplays are projected back to editable Fountain text; focused backend
client tests cover the request and projection; and the repo handoff no longer
marks PR #87 as awaiting an iOS consumer.

### T74 — Surface ops route manifest in diagnostics
- **Owner:** codex
- **Branch:** codex/T74-ops-routes-diagnostics
- **Pillar:** mobile-first + infra
- **Status:** merged

## Scope

Consume Claude PR #148's `GET /ops/routes` manifest from the app without
making it a noisy user-facing surface. The Studio/debug support path should be
able to tell which optional backend routes this deployment advertises.

## Done when

iOS has typed client/model coverage for `GET /ops/routes`; the app support
diagnostics/debug bundle includes route-manifest counts and groups when the
backend provides them; offline or older backends remain quiet; and the repo
handoff no longer marks PR #148 as awaiting an iOS consumer.

### T75 — Surface talk-turn rate-limit retry affordance
- **Owner:** codex
- **Branch:** codex/T75-talk-turn-rate-limit-retry
- **Pillar:** mobile-first + infra
- **Status:** merged

## Scope

Consume Claude PR #170's optional `GET /talk/turn/:turnId` `429 rate_limited`
contract from the app. Turn-meta enrichment is secondary to the main talk
response, so the UI should keep the response and show a friendly retry interval
instead of surfacing raw HTTP JSON.

## Done when

The app parses `error=rate_limited` plus `retry_after_ms`/`Retry-After` from
talk-turn metadata reads; `BackendTalkResult` carries a typed retry notice; the
root experience shows a transient human-readable retry banner when metadata is
rate-limited; focused tests cover parsing and banner copy; and the repo handoff
no longer marks PR #170 as awaiting an iOS consumer.

### T76 — Refresh coordination after efficiency merge train
- **Owner:** codex
- **Branch:** codex/T76-efficiency-merge-refresh
- **Pillar:** infra (coordination)
- **Status:** merged

## Scope

Record the May 12 efficiency merge train after T75 landed, Claude's live
agent-event lane merged, Claude's pre-flight self-check merged, and stale
coordination PR #173 was closed. Keep the repo-native handoff lane current so
Codex and Claude can coordinate through files instead of human copy/paste.

## Done when

`TASKS.md`, `docs/coordination.json`, `docs/codex-claude-live-handoff.md`,
`docs/claude-inbox.md`, and `docs/codex-inbox.md` agree that PR #175 and
PR #177 are merged, PR #173 is closed as stale, T75 consumed PR #170, and the
next-agent queue points Claude at the remaining blockers. Coordination,
agent-next, task-frontmatter, task-stats, task-generation, and diff checks pass.

### T77 — Refresh coordination after PR #180/#181
- **Owner:** codex
- **Branch:** codex/T77-post-efficiency-prs-refresh
- **Pillar:** infra (coordination)
- **Status:** merged

## Scope

Record the post-T76 efficiency follow-ups: Claude PR #180 cleaned the
outbox `console.log` pre-flight findings, and Claude PR #181 landed the
backend-index decomposition spec with Codex's phasing decisions.

## Done when

Task files and `TASKS.md` mark #180/#181 work merged; the live handoff,
Codex inbox, Claude inbox, coordination JSON, and agent-events lane record
the merges; and coordination, agent-next, task-frontmatter, task-stats,
task-generation, agent-event, and diff checks pass.

### T78 — Refresh coordination after PR #183
- **Owner:** codex
- **Branch:** codex/T78-refresh-after-pr183
- **Pillar:** infra (coordination)
- **Status:** merged

## Scope

Record the supervised merge of Claude PR #183, the Phase 0 backend-index
decomposition extraction for `GET /health` and `GET /bridge`.

## Done when

Task files and `TASKS.md` mark PR #183 merged; the live handoff, Codex
inbox, Claude inbox, coordination JSON, and agent-events lane record the
merge and the current queue guidance; and coordination, agent-next,
task-frontmatter, task-stats, task-generation, agent-event, and diff checks
pass.

### T79 — Codify second-pass agent efficiency protocol
- **Owner:** codex
- **Branch:** codex/T79-second-pass-efficiency
- **Pillar:** infra (coordination)
- **Status:** merged

## Scope

Turn Claude's second-pass efficiency proposal into durable repo behavior
without weakening D005, strict auto-merge, human-only policy gates, or the
no-direct-push-to-main rule.

## Done when

`docs/agent-throughput-protocol.md` records the adopt/modify/decline
matrix for the ten proposals; the protocol defines fast/heavy lanes,
spec-first parallel iOS/backend tracks, clearing-mode WIP, merge-train
cadence, and scratchpad boundaries; `agent_next` surfaces recent live events
from `docs/agent-events-*.jsonl`; optional structured blocker metadata is
documented and validated; and coordination/script tests pass.

### T80 — Refresh coordination after PR #191/#192
- **Owner:** codex
- **Branch:** codex/T80-refresh-after-pr192
- **Pillar:** infra (coordination)
- **Status:** merged

## Scope

Record the post-round-17 cleanup after Codex closed stale Claude
coordination PR #191 and merged Claude PR #192, the Phase 2a
backend-index decomposition for read-only `/screenplay/projects/*`
routes.

## Done when

`docs/coordination.json`, `docs/codex-inbox.md`, the agent-event lane,
and `TASKS.md` agree that #191 is closed, #192 is merged, and the only
remaining open Claude PRs are human-gated (#33, #63, #94, #99).
Coordination validation, agent-next, task generation, event tail, and
diff checks pass.

### T81 — Refresh coordination after PR #193/#194
- **Owner:** codex
- **Branch:** codex/T81-refresh-after-pr193-194
- **Pillar:** infra (coordination)
- **Status:** review

## Scope

Record that Claude PR #193 merged the route-local parser cleanup,
Claude PR #194 merged the backend-index decomposition spec update, and
Claude PR #195 was closed as a stale duplicate coordination refresh.

## Done when

`docs/coordination.json`, `docs/codex-inbox.md`, the agent-event lane,
and `TASKS.md` agree that #193/#194 are merged, #195 is closed, and
the only remaining open Claude PRs are human-gated (#33, #63, #94,
#99). Coordination validation, agent-next, task generation, event tail,
and diff checks pass.

### T82 — Refresh coordination after PR #204/#205/#206/#207
- **Owner:** codex
- **Branch:** codex/T82-refresh-after-pr204-207
- **Pillar:** infra (coordination)
- **Status:** review

## Scope

Record the post-round-20 merge train:

- #204 `T-decompose-phase3-screenplay-companion`
- #205 `T-persona-smoke-test`
- #206 `T-screenplay-store-smoke-test`
- #207 `T-outbox-store-smoke-test`

Refresh `docs/coordination.json`, `docs/codex-inbox.md`,
`docs/agent-events-2026-W20.jsonl`, and generated `TASKS.md` so Claude
can continue from repo state without human copy/paste.

## Done when

`node scripts/coordination_state.mjs validate` passes; `agent_next`
shows no reviewable Claude PRs; the inbox says only human-gated PRs
remain and names the next safe backend coverage targets.

### T83 — Define V1 and product-state handoff loop
- **Owner:** codex
- **Branch:** codex/T83-v1-product-operating-system
- **Pillar:** infra (product execution)
- **Status:** review

## Scope

Convert the Codex/Claude efficiency feedback into durable repo behavior:

- Add the operative V1 definition and binary checklist.
- Make `docs/claude-inbox.md` an iOS-driven backend queue instead of a stale
  historical log.
- Update the throughput protocol so every PR links to a V1 pillar/effect,
  Codex owns coordination state, Claude uses event-lane updates, and product
  state is reported asynchronously.

## Done when

The repo contains a short V1 definition, a current Claude inbox with the next
backend priorities Codex actually wants, and protocol text that prevents
coordination refresh churn from replacing product progress.

## Verification

Passed:

- `node scripts/build_tasks_md.mjs --write` (existing filename/id warnings)
- `node scripts/coordination_state.mjs validate`
- `node scripts/agent_next.mjs --role=codex --limit=10`
- `git diff --check`

Not run: iOS build or backend tests; this is docs/protocol only.

### T84 — Surface talk health and error diagnostics in iOS
- **Owner:** codex
- **Branch:** codex/T84-talk-health-diagnostics
- **Pillar:** talk + ios
- **Status:** review

## Scope

Consume the safe-public `/talk/stats` and `/talk/errors` endpoints in iOS and
show the result from the support/reporting flow. Include the same summaries in
problem reports/debug bundles so V1 voice-to-scene QA can see whether the core
talk path is healthy without searching backend logs.

## V1 effect

Closes the V1 talk checklist item: "iOS shows talk health, stats, and error
state without log spelunking."

## Done when

Typed Swift clients decode both endpoints, focused tests cover request paths
and diagnostic summaries, and the app has a Talk Diagnostics support sheet.

## Verification

- `xcodebuild test -project them.xcodeproj -scheme them -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO -only-testing:themTests/BackendTalkDiagnosticsTests`
- `xcodebuild test -project them.xcodeproj -scheme them -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO -only-testing:themTests/DesignSystemGuardTests/testNewSwiftFilesDoNotBypassDesignSystemTokens -only-testing:themTests/BackendTalkDiagnosticsTests`
- `xcodebuild test -project them.xcodeproj -scheme them -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO`
- `xcodebuild build -project them.xcodeproj -scheme them -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO`
- `git diff --check`

### T85 — Round 22 coordination refresh after supervisor merge train
- **Owner:** codex
- **Branch:** codex/T85-round22-coordination-refresh
- **Pillar:** infra
- **Status:** review

## Scope

Refresh the repo-native coordination lane after the round-22 merge train:

- #214, #215, #216, #217, #218, #220, #221, and #222 merged.
- #212 remains blocked/tier-3 pending auth-route review against the merged
  design note.
- #33, #63, #94, and #99 remain human-gated.

## Done when

`docs/coordination.json`, `docs/codex-inbox.md`, the weekly
`docs/agent-events-*.jsonl`, and `TASKS.md` reflect the current queue.

## Verification

- `node scripts/build_tasks_md.mjs --write`
- `node scripts/coordination_state.mjs validate`
- `node scripts/agent_next.mjs --role=codex`
- `node scripts/agent_event.mjs tail --n=12`

### T86 — Round 22b coordination refresh after design-note mini-train
- **Owner:** codex
- **Branch:** codex/T86-round22b-coordination-refresh
- **Pillar:** infra
- **Status:** review

## Scope

Refresh the repo-native coordination lane after the follow-up mini-train:

- #223 talk-pipeline Phase 7 design note merged.
- #224 deterministic V1 voice-to-page smoke merged.
- #226 schema docs scaffold merged after a Codex README correction.
- #227 realtime Phase 5b design note merged.

## Done when

`docs/coordination.json`, `docs/codex-inbox.md`, the weekly event lane, and
`TASKS.md` reflect the current queue.

## Verification

- `node scripts/build_tasks_md.mjs --write`
- `node scripts/coordination_state.mjs validate`
- `node scripts/agent_next.mjs --role=codex`
- `node scripts/agent_event.mjs tail --n=12`
- `git diff --check`

### T87 — Round 22c coordination refresh after memory and long-tail design notes
- **Owner:** codex
- **Branch:** codex/T87-round22c-coordination-refresh
- **Pillar:** infra
- **Status:** review

## Scope

Refresh the repo-native coordination lane after the late round-22 design-note
merges:

- #228 Phase 6 memories design note merged.
- #229 Phase 6.1 long-tail design note merged.

## Done when

`docs/coordination.json`, `docs/codex-inbox.md`, the weekly event lane, and
`TASKS.md` reflect the current queue and make the next Claude action clear.

## Verification

- `node scripts/build_tasks_md.mjs --write`
- `node scripts/coordination_state.mjs validate`
- `node scripts/agent_next.mjs --role=codex`
- `node scripts/agent_event.mjs tail --n=12`
- `git diff --check`

### T88 — Round 22d coordination refresh after V1 smoke fixture pack
- **Owner:** codex
- **Branch:** codex/T88-round22d-coordination-refresh
- **Pillar:** infra
- **Status:** review

## Scope

Refresh the repo-native coordination lane after #231 merged:

- #231 V1 smoke fixture pack for screenplay export, memory recall, and
  realtime failover.

## Done when

`docs/coordination.json`, `docs/codex-inbox.md`, the weekly event lane, and
`TASKS.md` reflect the current queue and smoke coverage.

## Verification

- `node scripts/build_tasks_md.mjs --write`
- `node scripts/coordination_state.mjs validate`
- `node scripts/agent_next.mjs --role=codex`
- `node scripts/agent_event.mjs tail --n=12`
- `git diff --check`

### T89 — Round 22e coordination refresh after schema docs batch 2
- **Owner:** codex
- **Branch:** codex/T89-round22e-coordination-refresh
- **Pillar:** infra
- **Status:** review

## Scope

Refresh the repo-native coordination lane after #233 merged:

- #233 schema docs batch 2 for talk, screenplay, realtime, ops, memory, and
  block-signal envelopes.

## Done when

`docs/coordination.json`, `docs/codex-inbox.md`, the weekly event lane, and
`TASKS.md` reflect the current queue and schema coverage.

## Verification

- `node scripts/build_tasks_md.mjs --write`
- `node scripts/coordination_state.mjs validate`
- `node scripts/agent_next.mjs --role=codex`
- `node scripts/agent_event.mjs tail --n=12`
- `git diff --check`

### T90 — V1 memory and realtime diagnostics in iOS
- **Owner:** codex
- **Branch:** codex/T90-v1-memory-realtime-diagnostics
- **Pillar:** ios
- **Status:** review

## Scope

- Correct the `/memory/stats` schema doc to match the live backend envelope.
- Decode `/memory/stats` in iOS.
- Surface a compact memory-shape summary and realtime supplier controls in Data
  Controls.
- Preserve realtime fallback metadata from `/realtime/client_secret` in the
  app model and tests.

## Done when

Data Controls can refresh memory stats, realtime fallback metadata decodes, and
focused tests cover the new contracts.

## Verification

- `xcodebuild test -project them.xcodeproj -scheme them -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO`
  - Passed, 98 tests.
- `xcodebuild build -project them.xcodeproj -scheme them -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO`
  - Passed.
- `git diff --check`
  - Passed.

### T91 — Round 22f coordination refresh
- **Owner:** codex
- **Branch:** codex/T91-round22f-coordination-refresh
- **Pillar:** infra
- **Status:** review

## Scope

- Record PR #235 and PR #240 as merged.
- Record PR #63 as closed/superseded by accepted D005/D006 policy.
- Preserve blockers for PR #212, #94, #99, and #33.
- Update Codex inbox/coordination state and append live events.

## Done when

The coordination files route Claude toward rebase/action work without reopening
settled policy, and the generated task index is current.

## Verification

- `node scripts/coordination_state.mjs validate`
  - Passed.
- `node scripts/decisions_queue_lint.mjs`
  - Passed.

### T92 — Round 22g coordination refresh
- **Owner:** codex
- **Branch:** codex/T92-round22g-coordination-refresh
- **Pillar:** infra
- **Status:** review

## Scope

- Record PR #242 as merged.
- Record PR #243 as blocked until wrapped checklist continuation lines are
  parsed correctly.
- Append live events and refresh generated task state.

## Done when

Claude's next action is visible from `agent_next` without human copy/paste.

## Verification

- `node scripts/coordination_state.mjs validate`
  - Passed.
- `node scripts/decisions_queue_lint.mjs`
  - Passed.

### T93 — Round 22h coordination refresh
- **Owner:** codex
- **Branch:** codex/T93-round22h-coordination-refresh
- **Pillar:** infra
- **Status:** review

## Scope

- Record PR #245 as blocked because the new outbox schema doc does not match
  the live `backend/lib/outbox_store.js` record shape.
- Append the live review-blocker event and refresh generated task state.

## Done when

`agent_next` points Claude at the schema-doc drift fix alongside #238/#243.

## Verification

- `node scripts/coordination_state.mjs validate`
  - Passed.
- `node scripts/decisions_queue_lint.mjs`
  - Passed.

### T94 — Claude supervisor note handoff
- **Owner:** codex
- **Branch:** codex/T94-claude-supervisor-note
- **Pillar:** infra
- **Status:** in-progress

## Scope

- Record that Codex sent Claude the supervisor note on PR #238.
- Keep the repo-native event lane aligned with the direct GitHub comment.

## Done when

Claude can see the directive from both GitHub and `agent_next`.

## Verification

- Not run yet.

<!-- END AUTOGEN active-tasks -->
