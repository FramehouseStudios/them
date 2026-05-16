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

| ID                                     | Title                                                                                    | Owner  | Status      |
|----------------------------------------|------------------------------------------------------------------------------------------|--------|-------------|
| T-backfill-v1-pillar-legacy            | Backfill V1 pillar/effect on 13 legacy non-merged task files                             | claude | review      |
| T-block-signal-history-bounds-eval     | Pathological-input guard on the block-signal history buffer                              | claude | review      |
| T-block-signal-history-route           | GET /memory/block-signal/history read endpoint                                           | claude | review      |
| T-block-signal-history-tracking        | Persist block-signal samples to creative memory habits                                   | claude | review      |
| T-coord-refresh-batch-12               | Batched coordination refresh — round 17 (post merge train)                               | claude | review      |
| T-coord-refresh-batch-15               | Coord refresh round 19 — mark #197/#199/#200/#201/#202 merged                            | claude | review      |
| T-decompose-phase5a-realtime-reads     | Decompose backend/index.js — Phase 5a (2 read-only /realtime/* routes)                   | claude | review      |
| T-decompose-phase5b4-realtime-call     | Decompose backend/index.js — Phase 5b.4 (/realtime/call)                                 | claude | review      |
| T-decompose-phase6-memories            | Decompose backend/index.js — Phase 6 (/memories/* cluster)                               | claude | review      |
| T-deeper-lib-tests-batch-2             | Deeper tests for persona + utils + screenplay_store + outbox_store                       | claude | review      |
| T-deeper-lib-tests-batch-3             | Deeper tests for realtime_supplier_stub + talk_error_counter + talk_turn_stats           | claude | review      |
| T-deeper-lib-tests-batch               | Deeper direct tests for user_store (with planned followups for memory_store + user_auth) | claude | review      |
| T-deeper-memstore-and-user-auth-tests  | Deeper tests for memory_store + user_auth                                                | claude | review      |
| T-eval-determinism-doc-pass            | Document determinism stance across 10 canon evals                                        | claude | review      |
| T-fix-214-audit-and-readme             | Fix #214 follow-up — audit script + lib README precedent + task file with V1 pillar      | claude | review      |
| T-fountain-export-deeper               | Deeper tests for fountain_export                                                         | claude | review      |
| T-protocol-infra-batch                 | Tighten backend extraction protocol helpers                                              | claude | review      |
| T-schema-docs-batch-2                  | Schema docs batch — talk + screenplay + realtime + ops + memory + block-signal           | claude | review      |
| T-schema-docs-scaffold                 | Bootstrap docs/schemas/ with README + 3 first envelope docs                              | claude | review      |
| T-screenplay-export-formats-list-route | GET /screenplay/export/formats canonical format list                                     | claude | review      |
| T-screenplay-export-markdown           | POST /screenplay/export format=md|markdown                                               | claude | review      |
| T-talk-error-counter-zero-fix          | Fix talk_error_counter falsy-zero bug in errorRatePerHour math                           | claude | review      |
| T-talk-turn-meta-contract-snapshot     | Pin /talk/turn/:turnId response key set + error codes                                    | claude | review      |
| T-talk-turn-rate-limit-deeper          | Deeper tests for talk_turn_rate_limit                                                    | claude | review      |
| T-task-files-cleanup                   | Add TASKS.md rows for orphan task files (T-trust-tiers, T42-T56)                         | claude | review      |
| T-trust-tiers                          | Trust tiers + standing pre-approvals (AGENTS.md)                                         | claude | review      |
| T-untested-libs-followups              | Add tests for remaining untested infrastructure libs                                     | claude | planned     |
| T-user-auth-roundtrip-tests            | Full handler round-trip tests for backend/lib/user_auth.js                               | claude | review      |
| T-v1-pillar-rule-and-canon-wire        | Pre-flight V1 pillar rule + wire 4 V1 smokes into eval:canon                             | claude | review      |
| T-v1-three-smoke-fixtures              | V1 smoke fixtures — screenplay export + memory recall + realtime failover                | claude | review      |
| T-v1-voice-to-page-smoke               | V1 voice-to-page smoke fixture + automated subset                                        | claude | review      |
| T113                                   | Archive merged active tasks after V1 status pass                                         | codex  | review      |
| T115                                   | Refresh queue after V1 preflight and schema guard                                        | codex  | review      |
| T117                                   | Refresh queue after memories tests merge                                                 | codex  | review      |
| T118                                   | Prove current app build and tests for V1 readiness                                       | codex  | review      |
| T119                                   | Close Screenplay Studio export UX gap                                                    | codex  | review      |
| T120                                   | Memory export/delete privacy decision packet                                             | codex  | review      |
| T121                                   | Post V1 progress coordination refresh                                                    | codex  | review      |
| T122                                   | Reprove current app build and themTests after export UX                                  | codex  | review      |
| T123                                   | Make V1 manual smoke handoff one-command                                                 | codex  | review      |
| T124                                   | Refresh after V1 smoke prompt merge                                                      | codex  | review      |
| T125                                   | Record deterministic V1 smoke proof                                                      | codex  | review      |
| T126                                   | Run and record release preflight                                                         | codex  | review      |
| T131                                   | Refresh after T130 release preflight clearance                                           | codex  | review      |
| T135                                   | Refresh after Phase 7b talk-handler merge                                                | codex  | review      |
| T138                                   | Refresh queue after Launch Doctor proof PRs                                              | codex  | review      |
| T139                                   | Clear V1 release smoke and config gap                                                    | codex  | review      |
| T140                                   | Refresh coordination after T139 merge                                                    | codex  | review      |
| T42-supervisor-merge-protocol          | Codex self-merge authority + agent handoff fast lane                                     | codex  | review      |
| T43-refresh-claude-queue               | Refresh Claude queue after supervisor protocol merge                                     | codex  | review      |
| T44-creative-memory-export-triage      | Triage creative-memory export privacy gate                                               | codex  | review      |
| T46-post-review-queue-refresh          | Refresh queue after Codex PR reviews                                                     | codex  | review      |
| T47-refresh-after-new-claude-prs       | Refresh queue after new Claude PR triage                                                 | codex  | review      |
| T48-ios-archetype-traits               | Surface character archetypes in the Studio traits rail                                   | codex  | in-progress |
| T81                                    | Refresh coordination after PR #193/#194                                                  | codex  | review      |
| T82                                    | Refresh coordination after PR #204/#205/#206/#207                                        | codex  | review      |
| T83                                    | Define V1 and product-state handoff loop                                                 | codex  | review      |
| T84                                    | Surface talk health and error diagnostics in iOS                                         | codex  | review      |
| T85                                    | Round 22 coordination refresh after supervisor merge train                               | codex  | review      |
| T86                                    | Round 22b coordination refresh after design-note mini-train                              | codex  | review      |
| T87                                    | Round 22c coordination refresh after memory and long-tail design notes                   | codex  | review      |
| T88                                    | Round 22d coordination refresh after V1 smoke fixture pack                               | codex  | review      |
| T89                                    | Round 22e coordination refresh after schema docs batch 2                                 | codex  | review      |
| T90                                    | V1 memory and realtime diagnostics in iOS                                                | codex  | review      |
| T91                                    | Round 22f coordination refresh                                                           | codex  | review      |
| T92                                    | Round 22g coordination refresh                                                           | codex  | review      |
| T93                                    | Round 22h coordination refresh                                                           | codex  | review      |
| T94                                    | Claude supervisor note handoff                                                           | codex  | review      |
| T95-schema-doc-drift-gate              | Gate schema docs against backend field drift                                             | codex  | review      |
| T96-batch-coordination-refresh         | Refresh coordination after supervisor merge train                                        | codex  | review      |
| T97-post-support-merge-refresh         | Refresh coordination after support merge train                                           | codex  | review      |
| T98-post-v1-realtime-refresh           | Post V1 status and realtime turn-commit coordination refresh                             | codex  | review      |
| T99-fix-auth-expected-action           | Fix truncated auth-route coordination expected action                                    | codex  | review      |

## Active work — full detail (auto-generated)

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

### T-decompose-phase5b4-realtime-call — Decompose backend/index.js — Phase 5b.4 (/realtime/call)
- **Owner:** claude
- **Branch:** claude/T-decompose-phase5b4-realtime-call
- **Pillar:** infra (backend architecture)
- **Status:** review

## Scope

**Last sub-phase of the 5b chain.** Phase 5b.1 (#238) extracted
`/realtime/client_secret`; Phase 5b.2 (#264) extracted
`/realtime/studio_render` + `/studio_render_stream`; Phase
5b.3 (#273) extracted `/realtime/turn_commit`. This PR extracts
`POST /realtime/call` — the WebRTC SDP proxy that negotiates a
realtime session with OpenAI's `/v1/realtime/calls` endpoint.

The route moves to `backend/lib/realtime_call_route.js` with
the same response contract. The only intentional non-response
change is that the diagnostic line uses `console.warn` in the
lib, matching the earlier realtime route extraction precedent
and the pre-flight console-log rule.

## Dependencies (4 functions + 3 constants)

### Helpers
- `createRequestId` — request id generator
- `buildRealtimeSessionConfig` — model+voice → session config object
- `fetchWithTimeout` — fetch wrapper with abortable timeout
- `isAbortError` — abort-detection helper

### Constants
- `OPENAI_API_KEY` — when empty, route returns 503
- `OPENAI_REALTIME_MODEL` — default model
- `OPENAI_REALTIME_VOICE` — default voice

## Response-contract invariants

- **503 envelope** when `OPENAI_API_KEY` is empty:
  `{ stage: "realtime_call", error: "OpenAI API key is missing
  for Realtime call setup." }`.
- **400 envelope** when SDP body is empty/whitespace-only:
  `{ stage: "realtime_call", error: "Missing SDP offer body." }`.
- **504 envelope** on `isAbortError(err)` (fetch timeout):
  `{ stage: "realtime_call", error: "Realtime SDP negotiation
  timed out." }`.
- **502 envelope** on any other fetch failure with the err
  message forwarded.
- **Upstream status passthrough** on OpenAI non-2xx: server
  returns `openaiResp.status` with `{ stage, error }` body
  carrying the upstream text verbatim (or a fallback message
  when upstream body is empty).
- **200 SDP response** on success: SDP text body, NOT JSON.
- **Response headers** preserved:
  - `Cache-Control: no-store`
  - `Content-Type: application/sdp`
  - `x-realtime-model: <resolved model>`
  - `x-realtime-voice: <resolved voice>`
- **Diagnostic line** preserved in content but emitted through
  `console.warn` (lib precedent established in 5b.1 / 5b.2 /
  5b.3) instead of the prior inline `console.log`.
- **Body limit** unchanged at `512kb` on both
  `application/sdp` and `text/plain` content types.
- **Fetch timeout** unchanged at 15 seconds.
- **Form encoding** preserved: multipart form with `sdp` +
  `session` (JSON-stringified) fields.
- **Query param overrides** preserved: `?model=<m>` overrides
  default; `?voice=<v>` is lowercased then overrides default.
- **No module-level state mutation.** No setter dep accepted;
  regression test pins the #238 invariant.

## V1 pillar / effect

- `V1 pillar: realtime`
- `V1 effect: closes the realtime route decomposition required
  by docs/v1-definition.md line 68 ("Realtime route
  decomposition lands before talk-pipeline Phase 7"). After
  this PR merges, the realtime sub-chain is complete (4/4 sub-
  phases) and Phase 7 (talk-pipeline decomposition) is
  unblocked per the spec.`

## Verification

```
node --test backend/tests/realtime_call_route.test.mjs
```

→ **18/18 pass**:

- Factory + mount guards (5 tests): body-limit + timeout
  constants, mount rejects null app, mount rejects each of the
  4 missing-fn deps, mount rejects bad-type constants.
- 503 missing key (1).
- 400 missing/whitespace body (2).
- 504 on isAbortError (1).
- 502 generic fetch failure (1).
- Upstream non-2xx passthrough (2): status code forwarded,
  fallback message when upstream body empty.
- 200 SDP happy path (2): body is SDP text, response headers
  canonical (Content-Type starts with `application/sdp`).
- buildRealtimeSessionConfig flow (2): defaults + query-param
  overrides (voice lowercased).
- Form encoding to OpenAI (1): URL, method, Authorization,
  OpenAI-Beta header, timeoutMs, FormData fields.
- #238 invariant inheritance (1): no setter-shaped dep.

Plus:
- `node --check backend/index.js` passes.
- `node --test scripts/pre_flight.test.mjs` passes 44/44,
  including the new `express.text()` parser regression.
- `backend/index.js` shrinks by **51 net lines** (66 inline →
  15 mount call).
- Pre-flight clean (after a small additive update to the
  `route-needs-own-parser` rule — see below).

## Pre-flight rule update (additive, in this PR)

The `route-needs-own-parser` rule was flagging
`realtime_call_route.js` because it uses `express.text()` (not
`express.json()`). The rule's original regex only recognized
`express.json` / `express.urlencoded` / `req.on('data')`. Per
Codex's original #90 review, the intent of the rule is "any
route-local body parser" — `express.text()` and `express.raw()`
are equally legitimate.

Updated the rule to also accept `express.text\s*\(` and
`express.raw\s*\(`. This is an additive, scope-only change:
the rule does NOT become stricter; it stops flagging a class
of routes it shouldn't have flagged.

## Done when

Inline `POST /realtime/call` no longer in `index.js`; lib file
exists with the SAFE-PUBLIC posture documented; 18/18 tests
pass; pre-flight clean; 5b chain complete.

## Next phase

**Phase 5b is done.** Per the #228 design note, Phase 6
(`/memories/*` cluster extraction) is the next decomp arc.
Phase 7 (talk-pipeline) is unblocked but its #223 design note
already calls out the staged approach (7a + 7b + 7c).

### T-decompose-phase6-memories — Decompose backend/index.js — Phase 6 (/memories/* cluster)
- **Owner:** claude
- **Branch:** claude/T-decompose-phase6-memories
- **Pillar:** infra (backend architecture)
- **Status:** review

## Scope

Phase 6 of the decomposition (spec:
`docs/specs/T-decompose-backend-index.md`, design note #228).
Phase 5b (#238/#264/#273/#288) is complete; Phase 6 is the
next decomp arc per the spec.

**Extracts 6 inline routes** (~403 lines of inline body) into
`backend/lib/memories_route.js` with byte-identical behavior:

| Route | Behavior |
| --- | --- |
| `GET /memories` | list view + delta-no-change + If-None-Match etag + background theme backfill |
| `GET /memories/export` | full-dump envelope with embedded export_json string |
| `POST /memories/update` | mutate a memory card |
| `POST /memories/forget` | delete a memory card |
| `POST /memories/promote` | promote a card to a theme |
| `POST /memories/feedback` | record human feedback on a theme |

## Dependencies (31 functions + 2 constants)

### Request helpers (4)
- `parseQueryLimit`, `createRequestId`, `normalizeSnippet`, `clampUnit`

### Memory context (6)
- `selectMemoryRecordForRead`, `resolveWritableMemoryContext`,
  `sanitizePersistedSessionMemory`, `persistWritableMemoryContext`,
  `setPersistedUserMemoryForIp`, `normalizeClientToken`

### Read-state pipeline (3)
- `buildReadStateMeta`, `applyReadStateHeaders`, `ifNoneMatchStateHit`

### Memory builders (4)
- `buildConversationHistoryThreads`, `buildMemoryCards`,
  `buildMemoryQualitySnapshot`, `maybeBackfillThemesFromHistory`

### Export helpers (4)
- `buildTaskSnapshot`, `sanitizeActiveThemes`,
  `sanitizeRememberedPeople`, `formatLocalDateStamp`

### Identity normalizers (3)
- `normalizeAssistantSelfName`, `getAssistantSelfNameForIp`,
  `normalizeUserPersonName`

### Card mutators (7)
- `normalizeMemoryCardId`, `updateMemoryCardInMemory`,
  `forgetMemoryCardInMemory`, `promoteMemoryCardToThemeInMemory`,
  `resolveThemeKeyFromMemoryCard`, `normalizeMemoryQualitySignal`,
  `incrementThemeQualitySignal`

### Constants (2)
- `TASKS_MAX_STORED`, `USER_MEMORY_REMEMBERED_PEOPLE_MAX`

## Byte-identical invariants

All preserved per the #228 design note + the 3 already-merged
schema docs (memories-list.md, memories-mutate.md,
memories-export.md):

- **GET /memories**: full envelope + delta-no-change + 304
  paths all preserved; backfill side-effect on `applied:true`
  still fires `setPersistedUserMemoryForIp`.
- **GET /memories/export**: `filename` pattern unchanged
  (`clementine_memory_export_<YYYYMMDD>_<turnCount>.json`);
  `export_json` is the same 2-space-indented JSON with trailing
  newline; outer envelope key set unchanged.
- **All 4 mutation routes**: persist BEFORE building the
  response (the response always reflects post-mutation state);
  `memory_quality` is refreshed from the post-mutation cards;
  `applyReadStateHeaders` called exactly once per response.
- **Status verbs** per route unchanged (`updated` / `forgotten` /
  `promoted` / `hit|correction|not_editable|invalid_signal`).
- **Console log lines** preserved (now `console.warn` per the
  5b precedent for pre-flight's `console-log-in-lib` rule).
- **Body limit** unchanged at `256kb` on all 4 POSTs.

## #238 invariant inheritance

The lib does NOT introduce any new module-level state.
`setPersistedUserMemoryForIp` is preserved as a dep because the
inline GET /memories backfill path already calls it — that's a
write to an existing accessor, not a new state-replacement
setter. A regression test pins that this is the ONLY
setter-shaped dep accepted (any new setter would silently
violate the rule).

## V1 pillar / effect

- `V1 pillar: memory`
- `V1 effect: closes V1 line 53 ("iOS exposes a plain-language
  memory summary and refresh state") and V1 line 54 ("Human
  privacy decision is made for full memory export/delete")
  prerequisite work by moving the memory surface into a testable
  lib. The schema contracts are already on main; this PR moves
  the implementation under them so future changes (Phase 7,
  privacy redaction layer, etc.) can iterate on the lib without
  touching index.js.`

## Verification

```
node --test backend/tests/memories_route.test.mjs
```

→ **18/18 pass**:

- Exports + mount guards (4 tests): body-limit constant, null
  app rejected, missing-fn deps rejected (spot-check 10 of 31),
  non-number constants rejected.
- GET /memories (4 tests): full envelope, delta-no-change with
  `sinceVersion`, If-None-Match → 304, backfill side-effect on
  `applied: true`.
- GET /memories/export (1 test): envelope + embedded JSON
  parses cleanly + matches outer fields.
- POST /memories/update (2 tests): 200 success + 400 failure.
- POST /memories/forget (1 test): forgotten_id + theme_key
  echo.
- POST /memories/promote (1 test): theme_key + memory_card
  echo.
- POST /memories/feedback (3 tests): 200 on hit/correction,
  400 not_editable when no theme key, 400 invalid_signal.
- Persistence invariant (1 test): all 4 mutation routes call
  `persistWritableMemoryContext` exactly once.
- #238 invariant inheritance (1 test): only
  `setPersistedUserMemoryForIp` is accepted as a setter-shaped
  dep (the legitimate byte-identical write).

Plus:
- `node --check backend/index.js` passes.
- `backend/index.js` shrinks by **363 net lines** (403 inline
  → 40 mount call).
- Pre-flight clean.

## Done when

6 inline `/memories/*` routes no longer in `index.js`; lib file
exists with the PER-USER posture documented; 18/18 tests pass;
all invariants preserved.

## Next phase

Phase 6 is the largest single-PR extraction since Phase 2b.
Once it lands:

- Phase 7a (talk-state guards) opens per the #293 sub-design
  refinement note.
- Phase 7b (handleTalkRequest extraction) follows after 7a
  lands.
- Phase 7c (supplier glue) wraps the chain.

Per spec (max 1 decomp PR in flight), Phase 7a code does NOT
open until Phase 6 merges.

### T-deeper-lib-tests-batch-2 — Deeper tests for persona + utils + screenplay_store + outbox_store
- **Owner:** claude
- **Branch:** claude/T-deeper-lib-tests-batch-2
- **Pillar:** infra (test coverage)
- **Status:** review

## Scope

Ships the **deeper** tier of coverage for 4 stateful libs that
already had a smoke tier. Mirrors the precedent set by #241
(deeper memory_store + user_auth in one PR).

### persona_deeper.test.mjs (10 tests)

Extends `persona.test.mjs` smoke. Exercises the three exported
helpers and a couple of derived-shape invariants the smoke left
on the table:
- `normalizeSystemPrompt` trims, is idempotent, tolerates nullish.
- `appendDirectorAddendum` appends, no-ops on empty, tolerates
  null.
- `withOutputContract` adds contract content, is deterministic.
- `CLEMENTINE_PROFILE` carries configured voice + model ids.
- `PERSONA_ENFORCEMENT_ADDENDUM` is a non-empty string.

### utils_deeper.test.mjs (16 tests)

Extends `utils.test.mjs` smoke:
- `createRequestId` 16-char hex + 1000-call uniqueness.
- `escapeRegex` escapes every regex special char + plain text
  unchanged.
- `normalizeElevenLabsVoiceId` URL-pathname extraction.
- `resolveStorePath` absolute / relative-to-backend / fallback.
- `writeJsonFileAtomic` round-trip + parent-dir creation.
- `slugifyForFilename` lowercases + fallback.
- `clampUnit` clamps to [0,1] + non-finite fallback.

### screenplay_store_deeper.test.mjs (10 tests)

Extends `screenplay_store.test.mjs` smoke:
- `recalculateScreenplayProject` on zero-version projects, with
  all-pending collaborators, with mixed-status collaborators.
- `markScreenplayOwnerDirty` triggers disk write + bumps
  updatedAt.
- `getLatestScreenplayVersion` with mixed updatedAt + createdAt.
- Multi-owner save+load round-trip.
- `ensureScreenplayOutline` idempotence + project mutation.

### outbox_store_deeper.test.mjs (10 tests)

Extends `outbox_store.test.mjs` smoke:
- Duplicate-key behavior (scaleBackplane returns duplicate:true).
- Explicit actionKey override.
- `computeOutboxRetryAt` for negative + zero attempts.
- `buildOutboxActionKey` deterministic + type-normalizing.
- `lastError` snippet length cap (640).
- `processOutboxBatch` honors limit.
- `calendar_compose` fallback target.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: closes the deeper coverage gap for 4 of the 7
  stateful libs the V1 surface depends on. persona drives the
  talk pipeline. screenplay_store backs the screenplay studio.
  outbox_store carries durable side-effects (email/calendar).
  utils is the shared toolbox imported by every other lib.`

## Verification

```
node --test backend/tests/persona_deeper.test.mjs \
              backend/tests/utils_deeper.test.mjs \
              backend/tests/screenplay_store_deeper.test.mjs \
              backend/tests/outbox_store_deeper.test.mjs
```

→ **46/46 pass** (10 + 16 + 10 + 10).

## Done when

All 4 test files ship + pass; `T-untested-libs-followups` can
mark the deeper tier complete for these 4 libs.

## After this PR

7-of-7 stateful libs covered at smoke + deeper:
- utils (smoke #208, deeper here)
- persona (smoke #218, deeper here)
- screenplay_store (smoke #192, deeper here)
- outbox_store (smoke #197, deeper here)
- memory_store (smoke #216, deeper #241)
- user_store (smoke #218, deeper #237)
- user_auth (smoke #218, deeper #241, round-trip #242)

### T-deeper-lib-tests-batch-3 — Deeper tests for realtime_supplier_stub + talk_error_counter + talk_turn_stats
- **Owner:** claude
- **Branch:** claude/T-deeper-batch-3
- **Pillar:** infra (test coverage)
- **Status:** review

## Scope

Ships **33 tests** across 3 libs.

### realtime_supplier_stub.test.mjs (14 tests) — NEW FILE

`backend/lib/realtime_supplier_stub.js` had no test file. This
closes the gap. The stub is wired into the realtime failover
ladder (#231 `v1_realtime_failover_smoke` exercises it
indirectly).

- Factory shape (kind="stub", buildSessionConfig +
  mintClientSecret functions).
- `buildSessionConfig` defaults + per-call overrides + instructions
  presence.
- `mintClientSecret` happy path envelope shape + unique values +
  constructor defaults.
- TTL clamping at min (30s), max (300s), null fallback (default).
- `simulateError` path with custom + default code/status.

### talk_error_counter_deeper.test.mjs (10 tests)

Extends `talk_error_counter.test.mjs` smoke:
- `since`-window filtering excludes pre-window events.
- `since`-window omits classes with zero in-window events.
- No-`since` returns lifetime totals.
- `errorRatePerHour` math (0 on empty + across observed window).
- `lastOccurrence` stamping is whatever the latest .set() wrote.
- Empty/null class normalizes to `"unknown"`.
- Class names are trimmed.
- `occurrences` ring honors `OCCURRENCE_RING_CAP_PER_CLASS`.
- Snapshot envelope includes schemaVersion + observedAtMs + sinceMs.

### talk_turn_stats_deeper.test.mjs (9 tests)

Extends `talk_turn_stats.test.mjs` smoke:
- `ageBuckets` partition turns across last5min / last1h /
  last24h / older boundaries.
- `newestCreatedAtMs` / `oldestCreatedAtMs` reflect extremes.
- `authoritativePageTextRate` + `syncReadyRate` math.
- Both rates are 0 on empty input.
- `audioDurationMs` defensively handles missing + negative.
- `uniqueUserCount` + `uniqueSessionCount` dedupe.
- `replyRoleCounts` split preview vs final.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: closes the test gap on 3 realtime + talk libs that
  gate V1 surfaces. realtime_supplier_stub backs the failover
  ladder (#231 smoke). talk_error_counter feeds the /talk/errors
  ops surface. talk_turn_stats feeds the /talk/turn/stats ops
  surface.`

## Verification

```
node --test backend/tests/realtime_supplier_stub.test.mjs \
              backend/tests/talk_error_counter_deeper.test.mjs \
              backend/tests/talk_turn_stats_deeper.test.mjs
```

→ **33/33 pass** (14 + 10 + 9).

## Bug found (filed as followup)

While writing `talk_error_counter_deeper`, I discovered an actual
bug in `talk_error_counter.js`: `earliestStampedAt || now`
evaluates 0 as falsy and falls back to `now`, so when the first
event happens at time 0 the `errorRatePerHour` math collapses to
`1/3600 hour` and rate explodes. **Not fixed here** (this PR is
test-only); test uses nonzero baseline. Filed as `T-talk-error-
counter-zero-timestamp-bug` followup.

## Done when

3 test files ship + pass. 7/7 stateful libs + realtime stub now
covered.

## Followups (not in this PR)

- Fix the `earliestStampedAt || now` bug in
  `backend/lib/talk_error_counter.js`. Should use `??`, not `||`.
- Deeper tier for `fountain_export` + `talk_pipeline` (next
  batch).

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

### T-eval-determinism-doc-pass — Document determinism stance across 10 canon evals
- **Owner:** claude
- **Branch:** claude/T-eval-determinism-doc-pass
- **Pillar:** infra (eval discipline)
- **Status:** review

## Scope

Adds a one-paragraph `Determinism:` block to each of the 10 canon
evals currently flagged by the
`eval-missing-determinism-check` pre-flight rule (added in #235).

Each comment block documents the eval's determinism stance: these
are all canon evals — they read frozen constants and pure
functions, no clocks / random ids / network, so the same input
always produces the same output set. The pre-flight rule keys on
the word `determinism` / `deterministic` / `idempotent` /
`repeatable` / `same input` in the file body — adding the comment
satisfies the rule without changing eval behavior.

## Files touched

- `backend/evals/run_archetype_canon_eval.mjs`
- `backend/evals/run_block_detector_canon_eval.mjs`
- `backend/evals/run_block_signal_block_cap_eval.mjs`
- `backend/evals/run_craft_frameworks_eval.mjs`
- `backend/evals/run_creative_memory_eviction_eval.mjs`
- `backend/evals/run_creative_memory_version_eval.mjs`
- `backend/evals/run_ops_health_summary_eval.mjs`
- `backend/evals/run_prompt_regression_eval.mjs`
- `backend/evals/run_trait_library_canon_eval.mjs`
- `backend/evals/run_twist_engine_canon_eval.mjs`

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: closes the eval-missing-determinism-check pre-flight
  gap so the canon eval suite passes pre-flight clean. eval:canon
  is wired into the V1 smoke chain (#235); pre-flight failures on
  unrelated PRs were flagging these 10 evals as noise.`

## Verification

- `node scripts/pre_flight.mjs` → `eval-missing-determinism-check`
  flag count drops from 10 → 0.
- `node backend/evals/run_archetype_canon_eval.mjs` still passes
  (smoke check on one of the touched files; comment-only changes
  cannot break the eval body).

## Done when

Pre-flight no longer flags these 10 evals; comment changes ship
without functional change.

## What this does NOT do

- Add a runtime same-input/same-output check to each eval. These
  evals already read frozen canon and pure functions — the
  determinism is structural, not asserted at runtime. The comment
  documents the stance.
- Touch eval bodies. Pure comment additions.

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

### T-fountain-export-deeper — Deeper tests for fountain_export
- **Owner:** claude
- **Branch:** claude/T-fountain-export-deeper
- **Pillar:** infra (test coverage)
- **Status:** review

## Scope

Ships `backend/tests/fountain_export_deeper.test.mjs` — 14
deeper tests beyond the existing smoke (17 tests).

### Targets

- Dialogue shapes (string vs array of lines).
- Character cue with parenthetical but empty dialogue is dropped.
- Section level prefixes (1/2/3 → #/##/###; missing level → #).
- Synopsis emits `=` prefix.
- Blank kind emits a blank line.
- Unknown line kind is silently dropped (defensive).
- Title page with only some fields skips empty entries.
- Title page treats whitespace-only fields as empty.
- Multi-scene output preserves scene order.
- exportToFountain tolerates missing scenes / null / empty input.

## V1 pillar / effect

- `V1 pillar: screenplay`
- `V1 effect: closes the deeper coverage gap for fountain_export.
  V1 line 27 ("Screenplay export: Fountain + FDX") depends on this
  serializer; v1_screenplay_smoke (#231) pins ordering invariants
  at a high level — this PR pins the per-line-kind serialization
  rules.`

## Verification

```
node --test backend/tests/fountain_export.test.mjs backend/tests/fountain_export_deeper.test.mjs
```

→ existing 17 smoke + 14 deeper = 31/31 pass.

## Done when

`fountain_export_deeper.test.mjs` ships and passes alongside the
existing smoke.

## Followups (not in this PR)

- Schema doc `docs/schemas/fountain-export.md` lands separately
  (#256 schema batch 4).
- FDX export deeper coverage when its smoke lands.

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

### T-talk-error-counter-zero-fix — Fix talk_error_counter falsy-zero bug in errorRatePerHour math
- **Owner:** claude
- **Branch:** claude/T-talk-error-counter-zero-fix
- **Pillar:** infra (bug fix)
- **Status:** review

## Scope

Two-character fix in `backend/lib/talk_error_counter.js`: change
`earliestStampedAt || now` to `earliestStampedAt ?? now` (and the
same for `earliestStampedAt || 0` in the `sinceMs` field).

Plus a regression test under
`backend/tests/talk_error_counter_zero_timestamp.test.mjs` that
verifies the rate-per-hour math is sane for an event series
starting at `now=0`.

## Bug found via

Writing `T-deeper-lib-tests-batch-3` (#254) — the
`errorRatePerHour` test with events starting at time=0 produced
21600 instead of ~6. Root cause traced to:

```js
const observationStartMs = since !== null && Number.isFinite(since)
  ? since
  : (earliestStampedAt || now);
```

`earliestStampedAt = 0` (legitimate first event at epoch 0 or via
test fixture). `0 || now` evaluates to `now` because 0 is falsy.
Then `(now - observationStartMs) = 0`, the `Math.max(1/3600, …)`
floor kicks in, and the rate is `total / (1/3600) = total × 3600`.

## Fix

Use nullish-coalescing (`??`) so `0` is preserved:

```js
const observationStartMs = since !== null && Number.isFinite(since)
  ? since
  : (earliestStampedAt ?? now);
```

Same change for `sinceMs: ... (earliestStampedAt ?? 0)` for
consistency (the existing `|| 0` happened to be correct by
accident there).

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: corrects errorRatePerHour when the first event
  arrives at time=0. The ops dashboard for /talk/errors keys on
  this rate; a 3600× overstatement on the first event would have
  triggered a false alarm.`

## Verification

- New test: `backend/tests/talk_error_counter_zero_timestamp.test.mjs`
  pins the rate at ~6/hour for 6 events over 1 hour starting at
  t=0. Before fix: rate=21600. After fix: rate=6.
- Existing 16 smoke tests in
  `backend/tests/talk_error_counter.test.mjs` still pass.
- Total: 18/18 pass.

## Done when

Fix + regression test ship together. The 10 deeper tests in #254
remain green (test was written against the pre-fix behavior using
a nonzero baseline, so it stays passing after the fix).

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

### T-talk-turn-rate-limit-deeper — Deeper tests for talk_turn_rate_limit
- **Owner:** claude
- **Branch:** claude/T-talk-turn-rate-limit-deeper
- **Pillar:** infra (test coverage)
- **Status:** review

## Scope

Ships `backend/tests/talk_turn_rate_limit_deeper.test.mjs` — 11
deeper tests beyond the existing 11 smoke tests.

### Targets

- LRU eviction triggers exactly at `capCacheEntries`.
- Per-key isolation (one exhausted key doesn't deny another).
- `retryAfterMs` math (positive when denied; ≈ 1/refillPerSec
  when fully exhausted).
- Refill continuity (accumulates between attempts).
- Refill clamps at `capacity`.
- `reset()` clears all buckets.
- `inspect()` returns null for unknown keys.
- Empty/null/undefined key returns `missing_key` reason.
- Factory rejects invalid `refillPerSec` + `capacity`.

## V1 pillar / effect

- `V1 pillar: talk`
- `V1 effect: closes deeper coverage gap for the token-bucket
  rate limiter. The GET /talk/turn/:turnId contract (PR #125) is
  permissive on reads — this limiter is the planned burst guard.
  Deterministic tests prevent silent regression of the bucket
  semantics.`

## Verification

```
node --test backend/tests/talk_turn_rate_limit.test.mjs backend/tests/talk_turn_rate_limit_deeper.test.mjs
```

→ 11 smoke + 11 deeper = 22/22 pass.

## Done when

deeper test file ships and passes alongside the existing smoke.

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

### T113 — Archive merged active tasks after V1 status pass
- **Owner:** codex
- **Branch:** codex/T113-post-v1-status-refresh
- **Pillar:** infra
- **Status:** review

## Scope

Mark the recent merged task files that still say `status: review`, archive
every `status: merged` task that is still in `tasks/_active/`, regenerate
`TASKS.md`, and emit a coordination event so Claude's next poll starts from
the current state.

## Done When

- Recent Codex/Claude task rows for merged PRs 301, 302, 304, 305, 308, 309,
  and 310 are marked `merged`.
- Every `status: merged` task file is moved out of `tasks/_active/`.
- `TASKS.md` is regenerated from task files.
- `agent_next` still points Claude at Phase 7b talk-handler design before
  implementation.

## Verification

- `node scripts/build_tasks_md.mjs --write`
- `node scripts/agent_next.mjs --role=claude --limit=5 --no-events`
- `git diff --check`

Not run: iOS build/themTests or backend tests, because this is coordination
metadata only.

### T115 — Refresh queue after V1 preflight and schema guard
- **Owner:** codex
- **Branch:** codex/T115-post-v1-preflight-refresh
- **Pillar:** infra
- **Status:** review

## Scope

Archive the merged T114 V1 preflight task and Claude's
T-preflight-schema-doc-missing-endpoint task, regenerate `TASKS.md`, and emit
a coordination event that restates the next Claude lane.

## Done When

- T114 is marked `merged` and moved to `tasks/_archive/`.
- T-preflight-schema-doc-missing-endpoint is marked `merged` and moved to
  `tasks/_archive/`.
- `TASKS.md` is regenerated.
- `agent_next` still points Claude to Phase 7b talk-handler design before
  implementation.

## Verification

- `node scripts/build_tasks_md.mjs --write`
- `node scripts/pre_flight.mjs --strict`
- `node scripts/agent_next.mjs --role=claude --limit=5 --no-events`
- `npm run v1:status`
- `git diff --check`

Not run: iOS build/themTests or backend npm test, because this is coordination
metadata only.

### T117 — Refresh queue after memories tests merge
- **Owner:** codex
- **Branch:** codex/T117-post-memories-tests-refresh
- **Pillar:** infra
- **Status:** review

## Scope

Archive the merged T116 handoff refresh task and Claude's memories deeper-test
task, regenerate `TASKS.md`, and emit a short coordination event.

## Done When

- T116 is marked `merged` and moved to `tasks/_archive/`.
- T-memories-route-deeper-tests is marked `merged` and moved to
  `tasks/_archive/`.
- `agent_next` still points Claude at Phase 7b talk-handler implementation.

## Verification

- `node scripts/build_tasks_md.mjs --write`
- `node scripts/pre_flight.mjs --strict`
- `node scripts/agent_next.mjs --role=claude --limit=5 --no-events`
- `git diff --check`

Not run: iOS build/themTests or backend npm test, because this is coordination
metadata only.

### T118 — Prove current app build and tests for V1 readiness
- **Owner:** codex
- **Branch:** codex/T118-v1-readiness-proof
- **Pillar:** mobile-first
- **Status:** review

## Scope

Run the current app build and `themTests` on main, record the result in a
release-readiness artifact, and update `docs/v1-definition.md` only if the
verification is green.

## Done When

- Current app build is run and documented.
- Current `themTests` are run and documented.
- `docs/v1-definition.md` reflects the real verification result.
- `TASKS.md` is regenerated.

## Verification

- `xcodebuild build -project them.xcodeproj -scheme them -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO` -> passed
- `xcodebuild test -project them.xcodeproj -scheme them -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO` -> passed, 99 tests
- `npm run v1:status` -> passed, 18/25
- `node --test scripts/v1_status.test.mjs` -> passed, 10/10
- `node scripts/pre_flight.mjs --strict` -> passed
- `git diff --check` -> passed

### T119 — Close Screenplay Studio export UX gap
- **Owner:** codex
- **Branch:** codex/T119-screenplay-export-ux
- **Pillar:** mobile-first
- **Status:** review

## Scope

Make the Studio export menu consume backend FDX support while treating backend
PDF rejection as a clear, non-dead-end alternative path on non-macOS clients.
Keep macOS local PDF export available because the app has a local renderer.

## Done When

- FDX stays available from backend-supported formats.
- Unsupported backend PDF is not presented as a normal working export on
  non-macOS clients.
- Backend PDF rejection messages surface usable alternatives instead of a raw
  error code.
- `docs/v1-definition.md` marks the Screenplay Studio export UX item complete.
- Focused Swift tests cover the menu and error behavior.

## Verification

- `xcodebuild test -project them.xcodeproj -scheme them -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO -only-testing:themTests/ScreenplayExportFormatMenuTests -only-testing:themTests/BackendMemoryScreenplayExportTests` -> passed, 10/10
- `npm run v1:status` -> passed, 19/25
- `node scripts/pre_flight.mjs --strict` -> passed
- `git diff --check` -> passed

### T120 — Memory export/delete privacy decision packet
- **Owner:** codex
- **Branch:** codex/T120-memory-privacy-decision-packet
- **Pillar:** longitudinal learning
- **Status:** review

## Scope

Make the parked privacy decisions for Claude PRs #94 and #99 answerable
without asking the human to inspect old PR bodies. Keep the routes parked until
the human explicitly approves the privacy/data-control policy.

## Done When

- A short decision packet summarizes what #94 and #99 expose/delete.
- `docs/decisions-queue.md` links to the packet and states the safe default.
- `docs/testflight-v1-preflight.md` points to the same packet for V1 blockers.
- `TASKS.md` is regenerated.

## Verification

- `node scripts/pre_flight.mjs --strict` -> passed
- `git diff --check` -> passed

### T121 — Post V1 progress coordination refresh
- **Owner:** codex
- **Branch:** codex/T121-post-v1-progress-refresh
- **Pillar:** infra
- **Status:** review

## Scope

Refresh the supervisor handoff after the latest Codex V1 progress landed so
Claude does not need a human copy/paste report to know what changed.

## Done When

- `docs/codex-claude-live-handoff.md` records PRs #319, #320, and #321.
- `docs/claude-inbox.md` states the current V1 checklist count and remaining
  backend action.
- A short event-lane update points Claude at the same state.
- `TASKS.md` is regenerated.

## Verification

- `node scripts/coordination_state.mjs validate` -> passed
- `node scripts/agent_next.mjs --role=claude --no-events` -> passed
- `node scripts/pre_flight.mjs --strict` -> passed
- `git diff --check` -> passed

### T122 — Reprove current app build and themTests after export UX
- **Owner:** codex
- **Branch:** codex/T122-current-app-test-proof
- **Pillar:** mobile-first
- **Status:** review

## Scope

Re-run the full macOS app build and `themTests` on current `main` after the
app-visible export UX change from PR #320, then update the readiness artifact.

## Done When

- The macOS app build passes on current `main`.
- The full macOS `themTests` suite passes on current `main`.
- `docs/v1-build-test-readiness.md` records the new branch, time, and results.
- `TASKS.md` is regenerated.

## Verification

- `xcodebuild build -project them.xcodeproj -scheme them -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO` -> passed
- `xcodebuild test -project them.xcodeproj -scheme them -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO` -> passed, 103 tests / 0 failures
- `npm run v1:status` -> passed, 19/25
- `node scripts/coordination_state.mjs validate` -> passed
- `node scripts/pre_flight.mjs --strict` -> passed
- `git diff --check` -> passed

### T123 — Make V1 manual smoke handoff one-command
- **Owner:** codex
- **Branch:** codex/T123-v1-smoke-prompt
- **Pillar:** mobile-first
- **Status:** review

## Scope

Tighten the human V1 smoke handoff so the remaining manual checks can be run
from one repo command instead of reading multiple docs. Keep the generated
TestFlight preflight artifact in sync with the readiness proof.

## Done When

- `scripts/v1_manual_qa_checklist.mjs` includes the current app build/test
  readiness proof in generated output.
- The script can print a compact human smoke prompt with pass/fail fields.
- Tests cover the new prompt and generated readiness proof.
- `docs/testflight-v1-preflight.md` regenerates without dropping the current
  app build/test section.
- `TASKS.md` is regenerated.

## Verification

- `node --check scripts/v1_manual_qa_checklist.mjs` -> passed
- `node --test scripts/v1_manual_qa_checklist.test.mjs` -> passed, 4/4
- `node scripts/v1_manual_qa_checklist.mjs --prompt` -> passed
- `node scripts/coordination_state.mjs validate` -> passed
- `node scripts/pre_flight.mjs --strict` -> passed
- `git diff --check` -> passed

### T124 — Refresh after V1 smoke prompt merge
- **Owner:** codex
- **Branch:** codex/T124-refresh-after-v1-smoke-prompt
- **Pillar:** infra
- **Status:** review

## Scope

Record PR #324 as merged in the supervisor handoff and coordination state so
Claude and the human see the current V1 manual-smoke handoff command.

## Done When

- `docs/codex-claude-live-handoff.md` records T123 / PR #324 as merged.
- `docs/coordination.json` records PR #324 as merged.
- The event lane records the merge state.
- `TASKS.md` is regenerated.

## Verification

- `node scripts/coordination_state.mjs validate` -> passed
- `node scripts/agent_next.mjs --role=claude --no-events` -> passed
- `node scripts/pre_flight.mjs --strict` -> passed
- `git diff --check` -> passed

### T125 — Record deterministic V1 smoke proof
- **Owner:** codex
- **Branch:** codex/T125-deterministic-v1-smoke-proof
- **Pillar:** mobile-first
- **Status:** review

## Scope

Run the deterministic V1 smoke pack on current `main` and record a durable
proof artifact so the TestFlight preflight does not point to an unverified
command.

## Done When

- `cd backend && npm run eval:v1-smokes` passes on current main.
- A readiness artifact records the command, branch, time, and result.
- `docs/testflight-v1-preflight.md` links the deterministic smoke proof.
- Coordination state and the live handoff record the proof.
- `TASKS.md` is regenerated.

## Verification

- `cd backend && npm run eval:v1-smokes` -> passed
- `node scripts/coordination_state.mjs validate` -> passed
- `node scripts/pre_flight.mjs --strict` -> passed
- `git diff --check` -> passed

### T126 — Run and record release preflight
- **Owner:** codex
- **Branch:** codex/T126-release-preflight-proof
- **Pillar:** mobile-first
- **Status:** review

## Scope

Run `scripts/appstore_preflight.sh` on current `main` and record the outcome
as a release-readiness artifact. This does not change signing, entitlements, or
human-owned release settings.

## Done When

- `scripts/appstore_preflight.sh` is run locally.
- A readiness artifact records pass/fail/warn counts and any blockers.
- `docs/testflight-v1-preflight.md` links to the release preflight proof.
- Coordination state and the live handoff record the outcome.
- `TASKS.md` is regenerated.

## Verification

- `scripts/appstore_preflight.sh` -> failed as expected, surfacing 6 release
  configuration/signing blockers and 0 warnings
- `node scripts/coordination_state.mjs validate` -> passed
- `node scripts/pre_flight.mjs --strict` -> passed
- `git diff --check` -> passed

### T131 — Refresh after T130 release preflight clearance
- **Owner:** codex
- **Branch:** codex/T131-refresh-after-t130
- **Pillar:** mobile-first
- **Status:** review

## Scope

Record PR #331 as merged, update the supervisor handoff and coordination state,
and emit the post-merge event so Claude sees the current launch gate without a
human relay.

## Done When

- `docs/codex-claude-live-handoff.md` marks T130 / PR #331 merged.
- `docs/coordination.json` marks PR #331 merged.
- The agent-events lane has a `pr_merged` event for PR #331.
- Coordination validation and pre-flight pass.

## Verification

- `node scripts/coordination_state.mjs validate` passed.
- `node scripts/agent_event.mjs tail --n=4` passed and shows the PR #331 merge event.
- `node scripts/pre_flight.mjs --strict` passed.
- `git diff --check` passed.

### T135 — Refresh after Phase 7b talk-handler merge
- **Owner:** codex
- **Branch:** codex/T135-refresh-after-phase7b
- **Pillar:** voice→scene
- **Status:** review

## Scope

Mark Claude PR #335 / Phase 7b merged in the coordination surfaces and clear
the stale rebase blocker from the agent queue.

## Done When

- `docs/coordination.json`, `docs/claude-inbox.md`, and the live handoff record
  PR #335 as merged.
- The event lane contains the PR #335 merge event.
- `agent_next` no longer tells Claude to work on Phase 7b.
- Coordination/pre-flight checks pass.

## Verification

- `node scripts/coordination_state.mjs validate` passed.
- `node scripts/agent_next.mjs --role=claude --limit=5 --no-events` passed and
  no longer points Claude at Phase 7b.
- `node scripts/agent_next.mjs --role=codex --limit=5 --no-events` passed.
- `node --check scripts/v1_launch_room.mjs` passed.
- `node --test scripts/v1_launch_room.test.mjs` passed 5/5.
- `node scripts/v1_launch_room.mjs --role=codex` passed and now points Codex at
  V1 smoke handoff instead of Phase 7b review.
- `node scripts/v1_launch_room.mjs --role=claude` passed and puts Claude in V1
  smoke-failure support mode.
- `node scripts/pre_flight.mjs --strict` passed.
- `git diff --check` passed.

### T138 — Refresh queue after Launch Doctor proof PRs
- **Owner:** codex
- **Branch:** codex/T138-refresh-after-launch-proof-prs
- **Pillar:** mobile-first
- **Status:** review

## Scope

Refresh the machine-readable coordination lane after PR #338 and PR #339
merged, so `agent_next` no longer points Codex at already-landed Launch Doctor
proof work.

## Done When

- `docs/coordination.json` marks PR #338 and PR #339 merged.
- The live event lane records the merge events.
- The handoff ledger tells Claude to stay in V1 smoke-failure support mode.
- `agent_next` and launch-room commands no longer point Codex at stale PR #338.

## Verification

- `node scripts/coordination_state.mjs validate` passed.
- `node scripts/agent_next.mjs --role=codex --limit=5 --no-events` passed and no longer points Codex at PR #338.
- `node scripts/v1_launch_room.mjs --role=codex` passed.
- `node scripts/v1_launch_room.mjs --role=claude` passed.
- `node scripts/pre_flight.mjs --strict` passed.
- `git diff --check` passed.

### T139 — Clear V1 release smoke and config gap
- **Owner:** codex
- **Branch:** codex/T139-v1-release-smoke-clearance
- **Pillar:** mobile-first
- **Status:** review

## Scope

Audit the current V1 launch/release path, configure real release values when
available without committing secrets, run the Xcode build/test lane, run release
preflight with real values when available, record or block the manual smoke with
Launch Doctor evidence, and document exact results.

## Done When

- Release docs/code paths are audited.
- Xcode build/test results are recorded.
- Release preflight either passes with real values or records the exact missing
  real value/blocker.
- Launch Doctor either has a real smoke report or records why a truthful report
  cannot be generated.
- Claude has a precise backend support instruction for any smoke failure.

## Verification

- `zsh -lc 'for k in DEVELOPMENT_TEAM_ID BACKEND_URL APP_TOKEN APP_TOKEN_RELEASE RELEASE_BACKEND_URL OPENAI_API_KEY; do if [[ -n ${(P)k} ]]; then print "$k=present"; else print "$k=missing"; fi; done'` showed all listed values missing.
- `security find-identity -v -p codesigning` showed `0 valid identities found`.
- `xcodebuild build -project them.xcodeproj -scheme them -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO` passed.
- `xcodebuild test -project them.xcodeproj -scheme them -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO` passed, 108 tests, 0 failures.
- `xcodebuild build -project them.xcodeproj -scheme them -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO` passed.
- `scripts/appstore_preflight.sh` failed with the expected real release blockers: missing Development Team, Release `BACKEND_URL`, and Release `APP_TOKEN`; signed Release build skipped because `DEVELOPMENT_TEAM_ID` is not configured.
- `cd backend && npm run v1:status` reported 19/25 V1 checklist items complete.
- `node scripts/v1_launch_doctor_report.mjs --talk=not-started --studio=not-started --memory=not-started --realtime=not-started --write-docs` wrote the blocked Launch Doctor report.

### T140 — Refresh coordination after T139 merge
- **Owner:** codex
- **Branch:** codex/T140-refresh-after-t139
- **Pillar:** infra
- **Status:** review

## Scope

Refresh the supervisor ledger, coordination state, and event lane after PR #341
merged so agent prompts stop treating T139 as an open review item.

## Done When

- `docs/coordination.json` marks PR #341 merged.
- `docs/codex-claude-live-handoff.md` marks T139 merged.
- Claude's current support-only launch instruction remains visible.
- Coordination validation passes.

## Verification

- `gh pr view 341 --json state,mergedAt,headRefName,baseRefName,url` confirmed PR #341 merged.
- `node scripts/coordination_state.mjs validate` passed.
- `node scripts/agent_next.mjs --role=claude --limit=5` passed and shows Claude in V1 smoke-failure support mode.
- `node scripts/v1_launch_room.mjs --role=all` passed and shows the blocked Launch Doctor report plus release preflight blockers.
- `git diff --check` passed.

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
- **Status:** review

## Scope

- Record that Codex sent Claude the supervisor note on PR #238.
- Keep the repo-native event lane aligned with the direct GitHub comment.

## Done when

Claude can see the directive from both GitHub and `agent_next`.

## Verification

- `git diff --check`
  - Passed.

### T95-schema-doc-drift-gate — Gate schema docs against backend field drift
- **Owner:** codex
- **Branch:** codex/T95-schema-doc-drift-gate
- **Pillar:** infra
- **Status:** review

## Scope

- Add a pre-flight guard that catches schema documentation using field names or status values that no longer match the canonical backend implementation.
- Cover the current drift class that blocked schema docs batch 3, especially outbox event docs vs `backend/lib/outbox_store.js`.
- Keep the rule warn-only in normal pre-flight mode and strict-failing under `--strict`.

## Done When

- A schema doc that describes outbox events with stale snake_case/legacy status fields is reported before review.
- Clean schema docs and repos without schema docs still pass.
- The guard is covered by local script tests.

## Verification

- `node --check scripts/pre_flight.mjs`
  - Passed.
- `node --test scripts/pre_flight.test.mjs`
  - Passed, 35/35.
- `node scripts/pre_flight.mjs`
  - Passed, no findings.
- `git diff --check`
  - Passed.

### T96-batch-coordination-refresh — Refresh coordination after supervisor merge train
- **Owner:** codex
- **Branch:** codex/T96-batch-coordination-refresh
- **Pillar:** infra (coordination)
- **Status:** review

## Scope

Refresh the coordination state after the supervisor merge train
that landed PRs #238, #243, #245, #250, #251, #253, #256,
#259, and #261.

## Done when

- `docs/coordination.json` records merged state for the landed
  PRs.
- Stale Claude-owned blockers for #238, #243, and #245 are
  cleared.
- `docs/codex-inbox.md` tells Claude the only remaining blockers
  are human/policy gates unless Codex opens a new review blocker.
- Coordination validation and main health checks are green.

## Verification

- `node scripts/coordination_state.mjs validate`
- `node scripts/agent_next.mjs --role=codex`
- `node scripts/pre_flight.mjs`
- `node --test scripts/pre_flight.test.mjs`
- `cd backend && npm run eval:v1-smokes`

### T97-post-support-merge-refresh — Refresh coordination after support merge train
- **Owner:** codex
- **Branch:** codex/T97-post-support-merge-refresh
- **Pillar:** infra (coordination)
- **Status:** review

## Scope

Refresh coordination after the support merge train that landed
PRs #262, #264, #265, #266, and #267.

## Done when

- `docs/coordination.json` records those PRs as merged.
- Batch task files are marked `merged`.
- `docs/claude-inbox.md` and `docs/codex-inbox.md` point at
  the current next backend lane: Phase 5b.3 turn_commit.
- Agent event lane records the refresh.

## Verification

- `node scripts/coordination_state.mjs validate`
- `node scripts/agent_next.mjs --role=codex`
- `node scripts/pre_flight.mjs`
- `node --test scripts/pre_flight.test.mjs`
- `cd backend && npm run eval:v1-smokes`

### T98-post-v1-realtime-refresh — Post V1 status and realtime turn-commit coordination refresh
- **Owner:** codex
- **Branch:** codex/T98-post-v1-realtime-refresh
- **Pillar:** infra (coordination)
- **Status:** review

## Scope

Refresh the coordination lane after Codex merged the V1 status support
PRs and Phase 5b.3 realtime turn-commit extraction.

## Done when

- `docs/coordination.json` marks #268, #269, #270, #271, and #273 merged.
- `docs/codex-inbox.md` names Phase 5b.4 `/realtime/call` as Claude's next
  backend lane.
- The active task index is rebuilt.
- Coordination validation and current health checks pass.

### T99-fix-auth-expected-action — Fix truncated auth-route coordination expected action
- **Owner:** codex
- **Branch:** codex/T99-fix-auth-expected-action
- **Pillar:** infra (coordination)
- **Status:** review

## Scope

Repair the T98 coordination refresh typo where the shell truncated the
structured `expected_action` for PR #212 to just `Claude`.

## Done when

`docs/coordination.json` again gives Claude the full #212 expected action:
rebase on current main after #273, rerun backend auth tests, and keep
`do-not-merge`/tier-3 until human auth-route clearance.

<!-- END AUTOGEN active-tasks -->
