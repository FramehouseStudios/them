# TASKS.md — io.them Active Work

> **Rule:** Every task has one owner, one branch, one scope, and one definition of done. Every task must serve at least one north-star pillar — **mobile-first**, **voice→scene**, **living companion**, **longitudinal learning**. See `AGENTS.md`.

## Status vocabulary
`ready` → `ready-for-support` → `in-progress` → `review` → `merged`

## Branch conventions
- `codex/<task-id>-<short-name>`
- `support/backend-<short-name>`

---

## Active work — quick view

| ID   | Title                                              | Owner  | Status            |
|------|----------------------------------------------------|--------|-------------------|
| T01  | Triage 409-file uncommitted snapshot               | human  | ready             |
| T04  | Apply canonical product name `io.them` end-to-end  | codex  | merged            |
| T05  | Add `first_page_written` client telemetry event    | codex  | merged            |
| T07  | Promote backend persistence to Postgres canonical  | support | merged            |
| T07a | Wire `outbox_store` diagnostic snapshots           | support | merged            |
| T07-eval-gate | Verify eval gate against Postgres          | support | merged            |
| T07-cutover | Drop dual-write JSON paths after Postgres soak | support | blocked-T07-eval |
| T08  | Centralize prompt assembly + first memory tier (backend) | support | merged            |
| T08w-triggers | Fire creative-memory write triggers from `/talk` | support | merged            |
| T08-postgres | Move creative memory store to persistence adapter | support | merged            |
| T10  | Codify single design system (color/typo/spacing)   | codex  | merged            |
| T11  | 60-second magic-moment onboarding                  | codex  | merged            |
| T12  | Adopt perceived-speed primitives system-wide       | codex  | merged            |
| T13  | Add second realtime supplier behind interface      | support | merged            |
| T13-client | Add iOS realtime supplier selection            | codex  | merged            |
| T29  | Hook iOS reply-side character mentions             | codex  | merged            |
| T14  | Triage G3 backend feature snapshot                 | codex  | merged            |
| T23  | Add craft completeness RC release gate             | support | merged            |
| T24  | Consolidate iOS ScreenplayPromptBuilder path      | codex  | merged            |
| T25  | Add Story Circle + Hero's Journey craft frameworks | codex  | merged            |
| T26  | Polish Craft tab framework and drift UX            | codex  | merged            |
| T-format-linter | Hollywood format linter (rules v1)        | support | merged            |
| T27  | Add Codex-to-support agent live handoff ledger            | codex  | merged            |
| T28  | Surface format lint cards in iOS Studio            | codex  | merged            |
| T30  | Backend `/memory/record-character-mention` endpoint | support | merged            |
| T-logline-distiller | Distill, persist, and drift-score loglines | support | merged            |
| T-block-detector | Detect writer-block patterns from talk telemetry | support | merged            |
| T-trait-library | Build per-character trait and voice inventory | support | merged            |
| T-twist-engine | Beat-aware reversal suggestion engine         | support | merged            |
| T31  | Refresh coordination statuses after merge stack    | codex  | merged            |
| T32  | Enable reply-side character mention memory flag | codex  | merged            |
| T33  | Add support agent command center and prompt printer      | codex  | merged            |
| T-codex-inbox | Add Codex inbox + prompt printer (support agent→Codex)    | support | merged         |
| T34  | Build iOS logline rail consumer                   | codex  | merged            |
| T35  | Build iOS block-signal nudge surface              | codex  | merged            |
| T36  | Build iOS character-traits side-rail consumer      | codex  | merged            |
| T37  | Build iOS twist-card consumer                     | codex  | merged            |
| T-accepted-twist-log | Persist accepted twist cards for prompt context | support | merged         |
| T-coordination-state | Fast-path coordination.json + CLI helper        | support | merged         |
| T-auto-merge-tier1 | Auto-merge workflow for Tier 1 PRs              | support | merged         |
| T-decisions-queue | One-file queue for human decisions               | support | merged         |
| T-strict-auto-merge | Require explicit Codex approval; drop 4h quiet path | support | merged |
| T-tasks-per-row | Per-row task files + TASKS.md regenerator        | support | merged    |
| T-build-tasks-md-anchors | Add AUTOGEN anchors to TASKS.md + harden anchor matcher | support | merged |
| T-archetype-engine | Character archetype classifier (hero/mentor/shadow/etc) | support | merged |
| T-archetype-engine-canon-eval | Pin canonical archetype set + per-entry shape | support | merged |
| T-screenplay-import-fountain | POST /screenplay/import/fountain (parser)        | support | merged |
| T-coverage-simulator | What-a-reader-sees coverage report + endpoint           | support | merged |
| T-fdx-export-endpoint | POST /screenplay/export/fdx (Final Draft XML)   | support | merged |
| T-payoff-tracker | Setup → payoff detection + endpoint                          | support | merged |
| T-talk-turn-meta-stats | GET /talk/stats — aggregate /talk health (safe-public)   | support | merged |
| T-talk-error-rate-tracker | In-memory error counter + GET /talk/errors (safe-public) | support | merged |
| T-realtime-supplier-health | Supplier shape + live probe + /realtime/health   | support | merged |
| T-block-signal-clears-on-completion | Behavioral tests lock block-signal recovery | support | merged |
| T-craft-frameworks-eval | Eval that runs analyzer against all frameworks   | support | merged     |
| T-fountain-export-endpoint | POST /screenplay/export/fountain (Fountain text) | support | merged |
| T-backend-surface-smoke | Whole-surface smoke eval for every iOS-facing route | support | merged |
| T-genre-classifier | Deterministic genre + tone classifier + endpoint | support | merged |
| T-realtime-supplier-failover | Transparent stub fallback when primary mint fails | support | merged |
| T-block-signal-system-prompt | Inject coaching block when writer is stuck    | support | merged     |
| T-block-signal-history-tracking | Persist block-signal samples to creative memory habits | support | merged |
| T-block-signal-history-route | GET /memory/block-signal/history read endpoint        | support | merged |
| T-block-signal-history-bounds-eval | Pathological-input guard on the BS history buffer | support | merged |
| T-prompt-assembly-block-signal-cap-eval | Cap on `<block_signal>` block size under pathological inputs | support | merged |
| T-talk-turn-meta-contract-snapshot | Pin /talk/turn/:turnId response key set + error codes  | support | merged |
| T-talk-turn-rate-limit-route | Optional rate-limit middleware on talk-turn reads | support | merged |
| T-screenplay-export-markdown | POST /screenplay/export format=md|markdown            | support | merged |
| T-decisions-queue-fixture-template | docs/decisions-queue-template.md entry skeleton | support | merged |
| T-coordination-state-cli-validate | Add validate subcommand to coordination_state.mjs | support | merged |
| T-coordination-state-mutate-eval | Round-trip eval over coordination_state.mjs mutators | support | merged |
| T-creative-memory-version-check-eval | Pin creative-memory snapshot version field | support | merged |
| T-creative-memory-store-eviction-eval | Guard creative-memory character roster growth | support | merged |
| T-known-domains-startup-check | Validate KNOWN_DOMAINS at backend startup | support | merged |
| T-screenplay-export-pdf-error-clarity | Add helpful PDF rejection payload | support | merged |
| T-ops-routes-list-route | GET /ops/routes curated manifest of optional surfaces    | support | merged |
| T-decisions-queue-md-lint | Lint docs/decisions-queue.md format                       | support | merged |
| T-block-signal-atms-zero-fix | Honor atMs=0 in recordBlockSignalSample (falsy-coerce bug)    | support | merged |
| T-known-domains-runtime-check | KNOWN_DOMAINS invariants (frozen, snake_case, roundtrip) | support | merged |
| T-prompt-assembly-snapshot-eval | Pin canonical buildModelPrompt block order            | support | merged |
| T-prompt-size-eval | Char-budget guard on assembled model prompts             | support | merged |
| T-memory-quality-eval | Multi-turn creative-memory recall eval                   | support | merged |
| T-tasks-sync-check | CI script to detect tasks/_active vs TASKS.md drift      | support | merged |
| T-decisions-queue-route | GET /coordination/decisions-queue as JSON                | support | merged |
| T-creative-memory-stats-route | GET /memory/stats content-free summary                  | support | merged |
| T-coordination-state-eval | Schema check on docs/coordination.json                | support | merged |
| T38  | Wire iOS accepted twist-card actions              | codex  | merged            |
| T39  | Fix missing Studio SF Symbol warning              | codex  | merged            |
| T40  | Fix app UserDefaults suite warning                | codex  | merged            |
| T41  | Defer Studio debug-state publishing               | codex  | merged            |
| T-trust-tiers | Trust tiers + standing pre-approvals (AGENTS.md)              | support | review            |
| T42-supervisor-merge-protocol | Codex self-merge authority + agent handoff fast lane | codex | merged |
| T43-refresh-support-queue | Refresh support agent queue after supervisor protocol merge      | codex | merged |
| T44-creative-memory-export-triage | Triage creative-memory export privacy gate       | codex | merged |
| T45-craft-route-json-parser | Parse Craft route JSON in production                   | codex | merged |
| T46-post-review-queue-refresh | Refresh queue after Codex PR reviews                  | codex | merged |
| T47-refresh-after-new-support-prs | Refresh queue after new support agent PR triage           | codex | merged |
| T48-ios-archetype-traits | Surface character archetypes in the Studio traits rail   | codex | merged |
| T49-post-t48-coordination-refresh | Post-T48 coordination refresh                     | codex | merged |
| T50-refresh-after-pr103-merge | Refresh coordination after PR #103 merge              | codex | merged |
| T51-refresh-after-new-eval-prs | Refresh queue for eval PR blockers                   | codex | merged |
| T52-refresh-after-pr114-merge | Refresh coordination after PR #114 merge              | codex | merged |
| T53-ios-block-signal-history | Add iOS block-signal history surface                   | codex | merged |
| T54-refresh-after-block-history-merge | Refresh queue after block-history eval merge | codex | merged |
| T55-close-stale-handoff-prs | Close stale handoff PRs                                | codex | merged |
| T56-refresh-after-talk-contract | Refresh queue after talk contract merge            | codex | merged |
| T-task-files-cleanup | Add TASKS.md rows for orphan task files                     | support | merged |
| T60  | Consume screenplay export formats in Studio       | codex  | merged            |
| T61  | Refresh coordination after T60 merge              | codex  | merged            |
| T62  | Quiet offline Studio export-format refresh        | codex  | merged            |
| T63  | Refresh coordination after T62 merge              | codex  | merged            |
| T64  | Quiet offline session-evolution launch probe      | codex  | merged            |
| T65  | Refresh coordination after T64 merge              | codex  | merged            |
| T66  | Refresh queue after support agent PR triage              | codex  | merged            |
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
| T-decompose-phase0-health-route | Extract `/health` + `/bridge` from backend index | support | merged |
| T78  | Refresh coordination after PR #183                | codex  | merged            |
| T79  | Codify second-pass agent efficiency protocol      | codex  | merged            |
| T80  | Refresh coordination after PR #191/#192           | codex  | merged            |
| T81  | Refresh coordination after PR #193/#194           | codex  | review            |
| T-decompose-phase1-ops-routes | Extract `/ops/metrics` + `/ops/alerts` from backend index | support | merged |
| T-decompose-phase2a-screenplay-projects-reads | Extract 5 `/screenplay/projects/*` GET routes from backend index | support | merged |
| T-decompose-phase2b-screenplay-projects-writes | Extract 7 `/screenplay/projects/*` write routes from backend index | support | merged |
| T-decompose-phase3-screenplay-companion | Extract `/screenplay/companion/state` + `/paginate` + `/revision-colors` from backend index | support | merged |
| T-decompose-phase5a-realtime-reads | Extract 2 read-only `/realtime/*` routes from backend index | support | review |
| T-logline-drift-alert | Structured drift alert (level + recommendation)  | support | review      |
| T-first-page-telemetry-sink | Server-side magic-moment SLA event sink         | support | merged     |
| T-prompt-wire-traits-and-twists | Prompt-assembly consumes traits + accepted twists | support | merged |

---

## Current next-10 checklist (2026-05-13 after round-17 merge train)

1. Current: PR #33 is merged; the Postgres eval gate passed in GitHub Actions on 2026-05-17.
2. Historical: PR #63 was closed instead of shipping trust-policy changes beyond D005.
3. Historical: PR #94 merged as V1 core-only memory export after the unsafe project-scoped expansion was removed.
4. Historical: PR #99 was closed/out of V1; destructive memory delete needs a post-V1 product decision.
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
- **Done when:** the snapshot on `codex-save-primary-folder-20260420` is split into ≤6 intent-grouped branches, each open as a PR; no orphan changes remain on the source branch; stale `support/*` branches with no merged work are deleted.

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
- **Owner:** support
- **Branch:** `support/T07-postgres-canonical`
- **Pillar:** longitudinal learning
- **Status:** merged
- **Scope (this PR — foundation):** adapter interface + JSON impl + Postgres impl + initial schema for all four store domains + forward and reverse migration scripts + adapter contract tests. Outbox is the proof-wired store.
- **Scope (follow-up rows, claimed by support agent after this PR merges):** wire `memory_store` (T07a), `screenplay_store` (T07b), and the knowledge embeddings cache (T07c) onto the adapter. Each is a focused PR.
- **Done when (this PR):** adapter contract tests green; both backends pass the same contract; `scripts/migrate_stores_to_postgres.mjs` and `scripts/dump_stores_to_json.mjs` round-trip a sample dataset; outbox_store reads/writes via the adapter when `DATABASE_URL` is set, falls back to JSON when unset; `docs/T07-persistence-canonical.md` documents the architecture and the migration runbook.
- **Done when (overall T07):** all four `*_store.json` paths at backend root deprecated; backend reads/writes only via the adapter (Postgres in CI/prod, JSON in local dev as the explicit fallback); `npm run eval:gate` green with `DATABASE_URL` set.

### T07a — Wire `outbox_store` to persistence adapter
- **Owner:** support
- **Branch:** `support/T07a-outbox-snapshots`
- **Pillar:** longitudinal learning + infra (enables all)
- **Status:** merged
- **Architectural call:** the outbox is a queue with worker semantics, not domain KV data. `scaleBackplane` is its canonical operational layer (in-memory + Redis stream + Postgres `outbox` table when `SCALE_POSTGRES_URL` is set). The T07 persistence adapter is for KV-style domain data (memory, screenplay, embeddings, craft, creative_memory). Forcing the queue onto the adapter would erase scaleBackplane's queue semantics. **Decision proposed in `docs/T07a-outbox-architecture.md`:** the queue stays on `scaleBackplane`; T07a contributes diagnostic/recovery-grade *snapshots* of outbox state into the adapter under the `outbox` domain, so backend operators have a Postgres-visible record of outbox health without changing the queue path.
- **Done when:** `OutboxSnapshotter` writes periodic JSON snapshots into the persistence adapter; backend wires the snapshotter at startup; tests assert snapshot shape + that the snapshotter does not interfere with scaleBackplane; `docs/T07a-outbox-architecture.md` documents the architecture and proposes the formal decision (D-something, human authors).

### T07-eval-gate — Verify eval gate against Postgres
- **Owner:** support
- **Branch:** `support/T07-eval-gate-postgres`
- **Pillar:** longitudinal learning + infra (enables all)
- **Status:** merged
- **Done when:** CI runs the full `npm run eval:gate` path against a live Postgres instance and passes; the result is recorded in `docs/T07-persistence-canonical.md`.

### T07-cutover — Drop dual-write JSON paths after Postgres soak
- **Owner:** support
- **Branch:** —
- **Pillar:** longitudinal learning + infra (enables all)
- **Status:** blocked-T07-eval
- **Done when:** with `DATABASE_URL` set in CI for more than seven days and no adapter errors logged, legacy `*_store.json` write paths in screenplay, memory, and embeddings are removed; loads become adapter-only.

### T08 — Centralize prompt assembly + first memory tier (backend)
- **Owner:** support
- **Branch:** `support/backend-T08-memory-tier`
- **Pillar:** living companion + longitudinal learning
- **Status:** merged
- **Scope (narrowed):** backend memory tier + backend-side prompt assembly. The original done-when referenced `ScreenplayPromptBuilder` (iOS) which is out of support agent's scope and not yet on `main`. iOS prompt-path consolidation is a sibling Codex follow-up — Codex to add a row when the dirty iOS state lands.
- **Done when (backend portion):** A creative-companion memory record (style, characters, tone, habits) persists per user; a single `buildModelPrompt(...)` is the only path used by `handleTalkRequest`; every model-bound prompt carries the memory context when present and degrades cleanly when absent; new eval `run_creative_memory_eval.mjs` covers both states and is wired into `eval:gate`; design and final state documented in `docs/T08-prompt-centralization-and-memory-tier.md`.
- **Design doc:** [docs/T08-prompt-centralization-and-memory-tier.md](docs/T08-prompt-centralization-and-memory-tier.md)

### T08w-triggers — Fire creative-memory write triggers from `/talk`
- **Owner:** support
- **Branch:** `support/T08w-triggers`
- **Pillar:** living companion + longitudinal learning
- **Status:** merged
- **Done when:** character mentions, scene completions, and tone signals detected in `/talk` exchanges trigger the corresponding `recordXxx` calls on `creativeMemoryStore`; `run_creative_memory_eval.mjs` covers at least one trigger-fired case.

### T08-postgres — Move creative memory store to persistence adapter
- **Owner:** support
- **Branch:** `support/T08-postgres`
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
- **Owner:** support
- **Branch:** `support/T13-realtime-supplier-interface`
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
- **Dependency:** support agent/backend still needs to ship `/memory/record-character-mention`; Codex will leave the call site guarded until that endpoint exists.


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
- **Done when:** the G3 backend feature work is split into intent-grouped commits or explicitly routed to support agent with context; no G3 backend changes remain orphaned in the dirty tree.
- **Decision:** Option A from the handoff brief. Codex will own the snapshot triage because the work appears to have been authored before the protocol existed; support agent should run backend eval gates before merge.

### T23 — Add craft completeness RC release gate
- **Owner:** support
- **Branch:** `support/T23-craft-completeness-gate`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Done when:** new `scripts/check_craft_completeness.mjs` reads a craft report (file path or `craft_reports` adapter key), exits 0 when `coverage.complete === true` (including overrides), exits 1 with actionable diagnostics otherwise; `scripts/quality_gate.sh` runs it under `RUN_CRAFT_COMPLETENESS_GATE=1`; the release-preflight workflow flips the env var on by default for `rc-*` runs; tests assert pass on `report_complete.json` + `report_with_override.json` and fail on `report_with_drift.json`.

### T24 — Consolidate iOS ScreenplayPromptBuilder path
- **Owner:** codex
- **Branch:** `codex/T24-prompt-builder-consolidation`
- **Pillar:** living companion + longitudinal learning
- **Status:** merged
- **Done when:** every model-bound prompt request from iOS is produced through one Swift `ScreenplayPromptBuilder` entry point; legacy prompt-construction sites are replaced; the builder routes screenplay requests through the backend endpoint that runs canonical `buildModelPrompt(...)`; tests cover the single-path contract.

### T27 — Add Codex-to-support agent live handoff ledger
- **Owner:** codex
- **Branch:** `codex/T27-support-live-handoff`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Done when:** a repo-visible Codex-maintained handoff ledger exists, records each completed Codex task/PR with verification and support agent action items, and PR descriptions point support agent to the ledger as the real-time supervisor status source.

### T26 — Polish Craft tab framework and drift UX
- **Owner:** codex
- **Branch:** `codex/T26-craft-tab-polish`
- **Pillar:** voice→scene + living companion
- **Status:** merged
- **Done when:** the Craft tab has a live-framework switcher, a user-facing override creation flow, and a major-turn timeline that visualizes drift from expected page bands; fixtures support SwiftUI previews; macOS tests and generic iOS build remain green.

### T-format-linter — Hollywood format linter (rules v1)
- **Owner:** support
- **Branch:** `support/T-format-linter`
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
- **Owner:** support
- **Branch:** `support/T30-record-character-mention-endpoint`
- **Pillar:** living companion + longitudinal learning
- **Status:** merged
- **Scope:** unblocks Codex PR #50 (T29). Adds `POST /memory/record-character-mention` that persists rendered screenplay character cues through `creativeMemoryStore.recordCharacterMention(...)` — the canonical creative-memory path, not ad hoc JSON. Accepts both `character_name` (snake_case) and `characterName` (camelCase). Threads `source`, `tags`, `write_id`, `line`, and `metadata.{screenplay_write_id, screenplay_project_id, screenplay_version_id}` onto the character record so reply-side mentions are distinguishable from user-input mentions. Missing optional metadata never fails the request. Returns the typed receipt iOS expects: `{ ok, action, characterName, source }`.
- **Done when:** the endpoint is mounted in `backend/index.js`, persists through `creativeMemoryStore`, validates/sanitizes name and source, accepts snake_case+camelCase, returns the typed receipt; ≥5 endpoint integration tests cover (1) snake_case payload, (2) camelCase payload, (3) metadata + write_id + line preservation, (4) invalid/empty character_name rejection, (5) idempotent-ish repeated mentions; the full backend suite stays green. Codex can enable `memory.reply_character_mentions_enabled` once this merges.

### T-logline-distiller — Distill, persist, and drift-score loglines
- **Owner:** support
- **Branch:** `support/T-logline-distiller`
- **Pillar:** living companion + longitudinal learning
- **Status:** merged
- **Done when:** backend exposes `POST /craft/logline/distill`, `GET /craft/logline/drift`, and `GET /craft/logline/history`; loglines persist in the `craft_loglines` domain with migration coverage; deterministic mode is default, optional LLM mode uses the existing classifier interface; drift scoring is tested; full backend suite is green.

### T-block-detector — Detect writer-block patterns from talk telemetry
- **Owner:** support
- **Branch:** `support/T-block-detector`
- **Pillar:** living companion + longitudinal learning
- **Status:** merged
- **Done when:** backend derives structured writer-block signals from `/talk` telemetry, scene-attempt gaps, repeated stalled drafts, and retry loops; exposes a typed endpoint or prompt-context block for iOS companion nudges; tests cover no-signal, soft-signal, and high-confidence block states; docs explain thresholds and privacy behavior.

### T-trait-library — Build per-character trait and voice inventory
- **Owner:** support
- **Branch:** `support/T-trait-library`
- **Pillar:** living companion + longitudinal learning
- **Status:** merged
- **Done when:** backend maintains a persistence-backed per-character trait/voice inventory from creative memory and screenplay dialogue; traits are deduped, source-tagged, and retrievable for prompt assembly; tests cover merge, decay/update, and empty-state behavior; docs explain how iOS should consume it.

### T-twist-engine — Beat-aware reversal suggestion engine
- **Owner:** support
- **Branch:** `support/T-twist-engine`
- **Pillar:** voice→scene + living companion
- **Status:** merged
- **Done when:** backend produces deterministic beat-aware reversal/twist suggestions using craft framework and classification data; optional LLM mode is isolated behind existing provider patterns; suggestions cite the beat/turn they operate on; tests cover deterministic output, missing craft context, and malformed input.

### T31 — Refresh coordination statuses after merge stack
- **Owner:** codex
- **Branch:** `codex/T31-coordination-status-cleanup`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Done when:** `TASKS.md` and `docs/codex-support-live-handoff.md` accurately reflect the merged PR stack, current support agent blockers, and next Codex/support agent handoff state; no stale review/in-progress rows remain for already-merged tasks; support agent has GitHub supervisor comments on active support agent PRs.

---

## Completed (last 30 days)

### T09 — Modularize `DraftStudio` and `ScreenplayStudio` into SwiftPM packages
- **Owner:** codex
- **Branch:** `codex/T09-studio-modularization`
- **Merged:** 2026-05-09 via PR #24.
- **Note:** Added local SwiftPM packages, wired them into app and tests, reduced `ContentView.swift` to 7 LOC, and verified macOS tests plus iOS generic build.

### T21 — Add craft-aware prompts and beat classification
- **Owner:** support
- **Branch:** `support/T21-craft-prompts-classification`
- **Merged:** 2026-05-09 via PR #23.
- **Note:** Added craft prompt blocks and deterministic/LLM beat classification; merged after resolving the T22 persistence overlap.

### T22 — Persist craft snapshots and turn overrides
- **Owner:** support
- **Branch:** `support/T22-craft-snapshots-persistence`
- **Merged:** 2026-05-09 via PR #20.
- **Note:** Persisted craft reports and overrides through the T07 adapter, including restart-safe override IDs.

### T02 — Resolve `archive/` vs `Archive/` case collision
- **Owner:** codex
- **Branch:** `codex/T02-archive-case-collision`
- **Merged:** 2026-05-09 via PR #21.
- **Note:** Git already tracked lowercase `archive/...`; the local worktree directory was normalized from `Archive/` to `archive/`, and D004 records lowercase `archive/` as the proposed canonical casing.

### T06 — Flip `RUN_QUALITY_GATE=1` default in release CI
- **Owner:** support
- **Branch:** `support/T06-quality-gate-default`
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
- **Owner:** support
- **Branch:** `support/T18-craft-schemas-analysis`
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
- **Done when:** the iOS reply-side character mention hook defaults on now that T30 is merged; explicit user/debug defaults can still disable it; focused tests cover default-on, explicit-off, and request-shape behavior; the handoff ledger records the completion for support agent.

---

### T33 — Add support agent command center and prompt printer
- **Owner:** codex
- **Branch:** `codex/T33-support-command-center`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Done when:** a short repo-visible support agent inbox exists with current assignment, blockers, and Codex supervisor status; a script prints the exact prompt/brief to send support agent; `docs/codex-support-live-handoff.md` points agents to the new inbox so the human no longer has to copy/paste long checklists.

### T-codex-inbox — Add Codex inbox + prompt printer (support agent→Codex)
- **Owner:** support
- **Branch:** `support/T-codex-inbox`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Scope:** symmetric reverse of T33. Adds `docs/codex-inbox.md` (support agent-maintained — current open support agent PRs awaiting Codex action, endpoint contracts ready to consume, blockers, decisions support agent needs from Codex) and `scripts/print_codex_prompt.mjs` (mirrors `print_support_prompt.mjs` for the Codex direction). Updates `docs/codex-support-live-handoff.md` so Codex standard read includes the inbox, and `docs/support-inbox.md` so the human sees both ends of the contract. Removes the need to copy/paste a support agent→Codex handoff after each support agent PR.
- **Done when:** `docs/codex-inbox.md` exists with current open support agent PRs, endpoint contracts, blockers, and decisions support agent needs from Codex; `scripts/print_codex_prompt.mjs` extracts the same sections and renders a compact prompt; `docs/codex-support-live-handoff.md` Fast Path lists the new inbox; `docs/support-inbox.md` notes that support agent maintains the reciprocal channel.

---

### T-accepted-twist-log — Persist accepted twist cards for prompt context
- **Owner:** support
- **Branch:** `support/T-accepted-twist-log`
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
- **Done when:** iOS has typed client/models for `POST /craft/logline/distill`, `GET /craft/logline/drift`, and `GET /craft/logline/history`; the Studio rail surfaces current logline, drift, and recent history without blocking writing; focused tests cover decoding and view-state mapping; handoff docs name the next support agent/Codex follow-up.

---

### T35 — Build iOS block-signal nudge surface
- **Owner:** codex
- **Branch:** `codex/T35-block-signal-nudge`
- **Pillar:** living companion + longitudinal learning
- **Status:** merged
- **Done when:** iOS has typed client/models for `GET /memory/block-signal`; the Studio companion or craft rail renders a non-blocking block-signal nudge gated by backend `level`; focused tests cover decoding and view-state mapping; handoff docs name the next support agent/Codex follow-up.

### T-coordination-state — Fast-path coordination.json + CLI helper
- **Owner:** support
- **Branch:** `support/T-coordination-state`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Scope:** new `docs/coordination.json` is a tiny shared state file (open PRs by tier, blockers by owner, decisions pending, endpoints awaiting iOS consumers). `scripts/coordination_state.mjs` is a dependency-free CLI for read/open-prs/blockers/decisions/add-pr/close-pr/set-pr/add-blocker/clear-blocker/add-decision/clear-decision. Agents stamp `updatedAt` + `updatedBy` automatically. Replaces "re-read three ledgers to see what's open" with one fast read.
- **Done when:** the JSON file exists with the current open support agent PRs seeded; the CLI reads + mutates it correctly; `node scripts/coordination_state.mjs read` returns a useful summary; both agents can call it without breaking the existing inbox/handoff docs.

---

### T-auto-merge-tier1 — Auto-merge workflow for Tier 1 PRs
- **Owner:** support
- **Branch:** `support/T-auto-merge-tier1`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Scope:** new GitHub Actions workflow `.github/workflows/auto-merge-tier1.yml`. Activates on PRs (open/sync/label/comment) and on completion of the `quality-gate` workflow. For PRs carrying the `tier-1` label (and not `tier-2`/`tier-3`/`needs-human`/`do-not-merge`), the workflow verifies the merge state is `CLEAN`, then checks for explicit approval through a trusted formal review or trusted `Codex supervisor update: approved` / `support agent supervisor update: approved` comment. There is no quiet-time fallback. If all gates pass, it squash-merges and deletes the branch. Tier 3 PRs are never auto-merged. Companion to T-trust-tiers (PR #63).
- **Done when:** workflow file lands; PR description names the exact gates the workflow checks; the `tier-1` label can be created in the repo (workflow tolerates the label not existing by simply skipping).

---

### T36 — Build iOS character-traits side-rail consumer
- **Owner:** codex
- **Branch:** `codex/T36-ios-character-traits`
- **Pillar:** living companion + longitudinal learning
- **Status:** merged
- **Done when:** iOS has typed client/models for `GET /memory/character-traits`; the Studio side rail surfaces character voice/trait cards with loading, empty, and retry states; focused tests cover decoding and view-state mapping; handoff docs name the next support agent/Codex follow-up.

---

### T37 — Build iOS twist-card consumer
- **Owner:** codex
- **Branch:** `codex/T37-ios-twist-cards`
- **Pillar:** living companion + screenplay craft
- **Status:** merged
- **Done when:** iOS has typed client/models for `POST /craft/twist/suggest`; the Studio craft or companion rail can request beat-aware reversal cards from the merged twist engine with loading, empty, and retry states; focused tests cover request shape, decoding, and view-state mapping; handoff docs name the next support agent/Codex follow-up.

---

### T-decisions-queue — One-file queue for human decisions
- **Owner:** support
- **Branch:** `support/T-decisions-queue`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Scope:** `docs/decisions-queue.md` is the single place either agent posts "needs human" questions, with a one-line question per entry, the reason it matters, and a safe default. AGENTS.md `Decisions` section gains a one-paragraph pointer so the convention is durable. Open entries follow a stamped shape (`D-<slug>`, `Asked by`, `Asked at`, `Why it matters`, `Question`, `Default if no answer`). Resolved entries move to the bottom with the human's answer. Replaces decisions hidden inside PR bodies and chat memory.
- **Done when:** the file exists with the documented template and no open entries; AGENTS.md's `Decisions` section names the queue as the canonical channel.

---

### T-strict-auto-merge — Require explicit Codex approval
- **Owner:** support
- **Branch:** `support/T-strict-auto-merge`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Scope:** tighten `.github/workflows/auto-merge-tier1.yml` by removing the four-hour quiet-time fallback and requiring an explicit trusted cross-agent approval signal before any Tier 1 PR can auto-merge.
- **Done when:** the workflow has no quiet-time merge path; approval still requires a trusted OWNER/MEMBER/COLLABORATOR review or supervisor approval comment; the PR verifies with the workflow evaluate check.

---

### T-tasks-per-row — Per-row task files + TASKS.md regenerator
- **Owner:** support
- **Branch:** `support/T-tasks-per-row`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Scope:** new `tasks/_active/` directory holds one markdown file per active task (YAML-style front matter + Scope/Done-when body). `scripts/build_tasks_md.mjs` reads these files and renders both the quick-view table and the per-task detail blocks. `--write` mode looks for `<!-- BEGIN AUTOGEN active-tasks -->` / `<!-- END AUTOGEN active-tasks -->` anchors in TASKS.md and overwrites between them; the anchors do not exist yet, so `--write` is a no-op until a follow-up adds them. Removes the recurring “two agents touch line 42 of TASKS.md” merge-conflict class without breaking the current flow.
- **Done when:** `tasks/README.md` documents the layout; `tasks/_active/` is seeded with at least the per-row files for this PR + T-trust-tiers; `node scripts/build_tasks_md.mjs` prints a valid rendered section; TASKS.md remains the source of truth until a follow-up flips the anchors on.

### T-logline-drift-alert — Structured drift alert (level + recommendation)
- **Owner:** support
- **Branch:** `support/T-logline-drift-alert`
- **Pillar:** living companion + voice→scene
- **Status:** in-progress
- **Scope:** the drift score from `computeDrift({ ... })` is currently a number + a sentence summary. iOS surfaces (T-twist-engine consumers, future logline rail) need a structured signal to decide whether to render a nudge card. This PR adds an additive `alert: { level, actionable, recommendation }` field on the response and the underlying `computeDrift` return. `level` maps from score by the same thresholds the summary already uses; `actionable` flips true at `level >= "firm"`; `recommendation` is a one-liner the iOS card can show verbatim. Additive only — existing decoders ignore the new field.
- **Done when:** `computeDrift(...)` returns an `alert` field on every code path (including the empty-history case); `GET /craft/logline/drift` echoes it; ≥4 unit tests for the threshold bands + a "no history" baseline + an endpoint integration test; full backend suite stays green.

### T-prompt-wire-traits-and-twists — Prompt-assembly consumes traits + accepted twists
- **Owner:** support
- **Branch:** `support/T-prompt-wire-traits-and-twists`
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
- **Done when:** iOS has typed client/model coverage for `GET /screenplay/export/formats`; the Studio export menu can render supported formats from the backend contract while preserving local fallback options; focused tests cover decoding, fallback ordering, and unsupported-format filtering; handoff docs tell support agent the endpoint has an app consumer.

---

### T61 — Refresh coordination after T60 merge
- **Owner:** codex
- **Branch:** `codex/T61-post-t60-coordination-refresh`
- **Pillar:** mobile-first + infra
- **Status:** merged
- **Done when:** `TASKS.md`, `docs/coordination.json`, `docs/codex-support-live-handoff.md`, `docs/support-inbox.md`, and `docs/codex-inbox.md` reflect PR #137/T60 merged; PR #133/#134 blockers are current; prompt printers and coordination-state checks are green.

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
- **Done when:** `TASKS.md`, `docs/coordination.json`, `docs/codex-support-live-handoff.md`, `docs/support-inbox.md`, and `docs/codex-inbox.md` reflect PR #139/T62 merged; support agent's #133/#134 blockers are current against post-T62 `main`; coordination prompt/check scripts pass.

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
- **Done when:** `TASKS.md`, `docs/coordination.json`, `docs/codex-support-live-handoff.md`, `docs/support-inbox.md`, and `docs/codex-inbox.md` reflect PR #146/T64 merged; support agent's #133/#134 blockers remain current; coordination prompt/check scripts pass.

---

### T66 — Refresh queue after support agent PR triage
- **Owner:** codex
- **Branch:** `codex/T66-refresh-after-support-pr-triage`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Done when:** `TASKS.md`, `docs/coordination.json`, `docs/codex-support-live-handoff.md`, `docs/support-inbox.md`, and `docs/codex-inbox.md` reflect PR #141/#143/#144 merged, PR #142 blocked with a precise review finding, PR #145 closed as stale, and PR #147/T65 merged; coordination prompt/check scripts pass.

---

### T67 — Refresh queue after PR #148 triage
- **Owner:** codex
- **Branch:** `codex/T67-refresh-after-pr148-triage`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Done when:** `TASKS.md`, `docs/coordination.json`, `docs/codex-support-live-handoff.md`, `docs/support-inbox.md`, and `docs/codex-inbox.md` reflect PR #148 blocked with the route-manifest scope/rebase finding; coordination prompt/check scripts pass.

---

### T68 — Refresh queue after PR #150/#151 merges
- **Owner:** codex
- **Branch:** `codex/T68-refresh-after-pr150-151`
- **Pillar:** infra (enables all)
- **Status:** merged
- **Done when:** `TASKS.md`, `docs/coordination.json`, `docs/codex-support-live-handoff.md`, `docs/support-inbox.md`, and `docs/codex-inbox.md` reflect PR #150 and PR #151 merged; T67 status is internally consistent; coordination prompt/check scripts pass.

---

## Notes

- Claim a row by editing it to `Owner=<you>, Status=in-progress` **as the first commit on your new branch**. If two agents try to claim the same row, the merge conflict on this file is the correct signal — do not work around it; resolve the intent.
- New rows must include a one-line "done when" before they go to `ready` or `ready-for-support`. A row without a definition of done does not belong in this file.
- When a row reaches `merged`, move it to "Completed" with the merge date. Prune rows older than 30 days.

---

<!-- BEGIN AUTOGEN active-tasks -->

## Active work — quick view (auto-generated from tasks/_active/)

| ID                                   | Title                                                                         | Owner   | Status  |
|--------------------------------------|-------------------------------------------------------------------------------|---------|---------|
| T-archive-legacy-json-stores         | Move backend/*_store.json into backend/data/_legacy/                          | support | ready   |
| T-auth-demo-keychain-login           | Add local demo login and Keychain remembered credentials                      | codex   | review  |
| T-auth-session-durability            | Make auth sessions durable before success responses                           | codex   | review  |
| T-backend-openai-cost-cap            | OpenAI per-day / per-user / per-hour budget cap                               | support | ready   |
| T-backend-pg-pool-tuning             | Production-tune the Postgres connection pool                                  | support | ready   |
| T-decompose-root-experience-view     | Decompose them/RootExperienceView.swift (529 KB) into per-concern modules     | codex   | ready   |
| T-decompose-screenplay-studio-screen | Decompose them/ScreenplayStudioScreen.swift (1.1 MB) into per-concern modules | codex   | ready   |
| T-ios-keychain-token-migration       | Migrate iOS auth tokens from UserDefaults to Keychain                         | codex   | review  |
| T-ios-offline-outbox                 | iOS client outbox for offline-tolerant talk turns                             | codex   | ready   |
| T-macos-posture-cleanup              | Gate macOS scaffolding off the V1 iOS scheme                                  | codex   | ready   |
| T-trust-tiers                        | Trust tiers + standing pre-approvals (AGENTS.md)                              | support | review  |
| T-untested-libs-followups            | Add tests for remaining untested infrastructure libs                          | support | planned |
| T43-refresh-support-queue            | Refresh support agent queue after supervisor protocol merge                   | codex   | review  |
| T47-refresh-after-new-support-prs    | Refresh queue after new support agent PR triage                               | codex   | review  |

## Active work — full detail (auto-generated)

### T-archive-legacy-json-stores — Move backend/*_store.json into backend/data/_legacy/
- **Owner:** support
- **Branch:** -
- **Pillar:** infra (enables all)
- **Status:** ready

## Scope

Spec: `docs/specs/T-archive-legacy-json-stores.md`.

Move `screenplay_store.json` (3.6 MB), `user_memory_store.json`
(296 KB), `outbox_store.json`, `knowledge_cards.json` into
`backend/data/_legacy/`. Update `persistence_json.js` default root.
Add `.gitignore` for the new path. One-time fallback warning if
only the old path exists.

## Done when

- The four legacy JSON files no longer sit at `backend/<filename>.json`.
- `npm test` and dev `npm start` work against the new path.
- `du -sh backend/` decreases by ~4 MB.
- Deprecation warning fires once if only the old path exists.

### T-auth-demo-keychain-login — Add local demo login and Keychain remembered credentials
- **Owner:** codex
- **Branch:** codex/T-auth-demo-keychain-login
- **Pillar:** mobile-first
- **Status:** review

## Scope

- Add a debug-and-loopback-only fake email account through the existing email
  signup/login routes.
- Add explicit remembered-email and remembered-password controls to Profile.
- Store the opted-in password only in Apple Keychain and clear it immediately
  when the user disables remembrance.
- Preserve refresh-token session restoration and keep Sign in with Apple on
  the Apple-issued identity-token path.
- Normalize backend millisecond session timestamps before rendering account
  activity so a valid current session never appears tens of thousands of years
  in the future.
- Keep authenticated Data Controls responsive by caching its recovery-owner
  scope outside SwiftUI rendering and deferring legacy token cleanup until the
  auth session read has released its queue.
- Do not add a backend demo endpoint, production credential, or auth bypass.

## Done when

- The documented demo credential can create or reuse a local account and sign
  in through normal auth.
- Remembered credentials repopulate after sign-out/relaunch, while disabling
  the option removes them.
- Release or non-loopback configurations cannot surface or invoke demo login.
- Current-session activity displays the real calendar date for both legacy
  second timestamps and backend millisecond timestamps.
- Data Controls opens and remains interactive for a remembered signed-in
  account while backend identity and memory refreshes run concurrently.
- Focused credential/auth tests, iPhone and macOS builds, local backend smoke,
  strict pre-flight, and `git diff --check` pass.

## Verification

- Focused credential and authentication policy tests: 61 passed, 0 failed.
- Remembered-login/session-date policy tests after the live smoke repair: 26
  passed, 0 failed.
- Focused account deletion, password reset, session bootstrap, and auth-race tests: 15 passed, 0 failed.
- Signed Profile UI tests for demo separation and Keychain relaunch restoration: 2 passed, 0 failed.
- Focused remembered-login and recovery-owner partition tests: 29 passed, 0
  failed, 0 skipped.
- Full `themTests` target: 497 passed, 0 failed, 0 skipped.
- Exact replay of the formerly deadlocked first-page telemetry test: 1 passed, 0 failed.
- Backend auth/account contracts: 37 passed, 0 failed.
- iOS Simulator Release, macOS Scaffold Debug, and macOS Scaffold Release builds passed.
- Rebuilt macOS Scaffold Debug app relaunched into the same authenticated local
  account and rendered the active session as `Aug 27, 2026` instead of year
  `58625`.
- Process sampling reproduced the Data Controls freeze as a main-thread/auth
  session queue lock inversion. The rebuilt app then opened Data Controls,
  refreshed memory shape, opened Launch Doctor, exported its report, returned
  home, and reopened Account without a freeze.
- Launch Doctor records Screenplay Studio passed with a cold-reopened clean
  operator-provided Fountain draft outside the repository (the local path and document are not tracked);
  the JSON and Markdown reports were exported to Downloads.
- Release-app scan found none of the demo email, password, or UI label.
- Isolated local-backend smoke passed signup, refresh rotation, logout, repeat login, persistence, process restart, and repeat login.
- `node scripts/pre_flight.mjs --strict`, active-task front-matter evaluation, and `git diff --check` passed.
- Global strict task sync still reports repository-wide legacy/orphan debt; this task's row, owner, and status are synchronized and produce no finding.

### T-auth-session-durability — Make auth sessions durable before success responses
- **Owner:** codex
- **Branch:** codex/T-auth-session-durability
- **Pillar:** longitudinal learning
- **Status:** review

## Scope

- Await the existing user-store persistence queue before any mutating auth
  handler returns success.
- Return a stable failure instead of claiming success when canonical auth
  persistence fails, and only mark it retryable after durable compensation.
- Serialize auth mutations, restore the pre-request checkpoint on persistence
  failure, and keep bearer reads from observing transient rotation state.
- Verify Apple identity before entering the mutation lock and bound JWKS
  discovery so an identity-provider stall cannot block every authenticated
  request.
- Fail production startup closed when canonical auth records cannot be read;
  never authenticate from a stale local snapshot during a database outage.
- Treat an initialized-but-empty canonical auth store as authoritative so a
  stale legacy JSON mirror cannot resurrect deleted users or sessions.
- Hydrate and prune every canonical auth page so records beyond the adapter's
  10,000-row page cap cannot disappear from revocation or later reappear.
- Validate the canonical marker and stage the complete auth identity graph
  before swapping it live, rejecting malformed rows, key mismatches, orphaned
  credentials, duplicate identities, and incomplete login mechanisms without
  clearing the last known-good in-memory state.
- Accept Apple account creation/linking only from a token-verified email claim;
  never substitute the request body's email for missing identity data.
- Require production Apple audience validation so tokens issued for another
  app cannot authenticate here.
- Revoke account sessions durably before scheduling deletion, so no failed
  compensation can leave an unacknowledged hard deletion queued.
- Commit lifecycle state and its audit record atomically so an audit failure
  cannot leave an unacknowledged deletion or cancellation behind.
- Keep legacy-import dry runs read-only, validate the entire legacy auth
  snapshot before any database operation, and replace all four auth tables
  plus the canonical marker in one rollback-safe Postgres transaction.
- Require an explicit destructive opt-in for an authoritative empty auth
  replacement; schema-only must neither clear auth data nor silently authorize
  an empty database, and production must reject uninitialized canonical auth.
- Reject contradictory email-verification state and password records whose
  digest encoding or PBKDF2 work factor could bypass comparison or block login.
- Preserve existing access/refresh token contracts and iOS Keychain restore.
- Do not create, commit, log, or expose account credentials.

## Done when

- Signup, login, refresh, logout, session revocation, reset, and verification
  handlers settle their queued persistence writes before a success response.
- A delayed adapter proves signup does not answer early; adapter failures
  produce `503 auth_persistence_failed` without leaking tokens, and the
  `retryable` flag truthfully reflects whether rollback became durable.
- Slow Apple JWKS discovery does not block bearer auth or unrelated signup,
  and a real production boot exits when Postgres is unavailable.
- An Apple token without a verified email cannot take over a password account
  by supplying its email in the request body; known Apple subjects can still
  sign in when later tokens omit email.
- Empty canonical state survives restart without legacy resurrection; all
  auth pages hydrate and prune; failed durable revocation restores both live
  and canonical sessions without first scheduling deletion.
- Invalid canonical metadata or identity rows fail closed while preserving
  live state; exact-snapshot imports remove omitted stale credentials only at
  commit and restore the complete prior snapshot on rollback.
- Deletion scheduling and cancellation each use one atomic Postgres statement;
  an audit-write failure leaves the prior lifecycle state unchanged.
- Production rejects missing or mismatched Apple audiences, and failed or
  dry-run legacy imports cannot publish partial authoritative auth state.
- Empty imports fail closed without explicit authorization, and corrupted
  verification/password records fail before database writes or live hydration.
- Schema-only setup leaves an empty auth database uninitialized; production
  fails closed until a validated exact import publishes its canonical marker.
- The V1 single-instance constraint is explicit until auth snapshot writes are
  replaced by row-scoped transactions and refresh-token compare-and-swap.
- Focused auth/persistence tests, iOS session-restore tests, strict pre-flight,
  and `git diff --check` pass.

## Verification

- `npm test` in `backend/`: 2,238 passed, 1 skipped, 0 failed.
- Focused Apple/auth/account/persistence/migration suite: 222 passed, 0
  failed.
- Focused iOS account/session restore and workspace-auth policy: 20 passed, 0
  failed on iPhone 17 Pro (iOS 26.2 simulator).
- Canon/V1 deterministic quality gate, including the learned-answer realtime
  voice smoke and craft completeness: passed. The live regression/provider
  gate remains external because this environment has no valid live provider
  credential.
- Strict pre-flight, task front matter, syntax checks, and `git diff --check`:
  passed.
- Repository-wide task sync still reports only the pre-existing legacy/orphan
  task debt; this task's row and status are synchronized.

### T-backend-openai-cost-cap — OpenAI per-day / per-user / per-hour budget cap
- **Owner:** support
- **Branch:** -
- **Pillar:** infra (enables all)
- **Status:** ready

## Scope

Spec: `docs/specs/T-backend-openai-cost-cap.md`.

In-memory cost meter keyed by `(YYYY-MM-DD, route_class, user_id)`,
env-driven caps, `/ops/cost` endpoint, 402 response on cap breach.

## Done when

- 5 successive talk calls within a minute that estimate above the
  per-hour cap return 402 instead of calling OpenAI.
- `/ops/cost` returns the current-day spend per route_class.
- Unit tests cover meter math, rollover, refund-on-failure.

### T-backend-pg-pool-tuning — Production-tune the Postgres connection pool
- **Owner:** support
- **Branch:** -
- **Pillar:** infra (enables all)
- **Status:** ready

## Scope

Spec: `docs/specs/T-backend-pg-pool-tuning.md`.

Tuned `new Pool(...)` config in `lib/persistence_postgres.js`
(max, idleTimeoutMillis, connectionTimeoutMillis, statement_timeout,
application_name), a `pool.on('error')` handler, and `/ops/pg-pool`
status endpoint. New env vars documented in `.env.example` + DEPLOY.md.

## Done when

- `pg_stat_activity.application_name` shows `them-backend@<build>`.
- A 30s blocking query elsewhere does not stall our requests beyond
  `PG_STATEMENT_TIMEOUT_MS`.
- `/ops/pg-pool` returns pool stats JSON.

### T-decompose-root-experience-view — Decompose them/RootExperienceView.swift (529 KB) into per-concern modules
- **Owner:** codex
- **Branch:** -
- **Pillar:** ios
- **Status:** ready

## Scope

Spec: `docs/specs/T-decompose-root-experience-view.md`.

Phased, byte-identical extraction following the backend Phase 0–N
pattern. Six phases planned: viewmodel, onboarding, companion
presence, screenplay shell, modal sheets, residual.

## Done when

- `RootExperienceView.swift` is < 100 KB.
- Each phase landed as its own PR, byte-identical, with a
  pre/post view-hierarchy screenshot pair.
- No regression in `themTests` or V1 manual smoke.

### T-decompose-screenplay-studio-screen — Decompose them/ScreenplayStudioScreen.swift (1.1 MB) into per-concern modules
- **Owner:** codex
- **Branch:** -
- **Pillar:** ios
- **Status:** ready

## Scope

Spec: `docs/specs/T-decompose-screenplay-studio-screen.md`.

Seven phased extractions: viewmodel, paper canvas, command palette,
inline editor, voice overlay, inspector tabs, fixer queue + toast.
Each phase gated by `npm run eval:studio` (39-step gauntlet).

## Done when

- `ScreenplayStudioScreen.swift` is < 250 KB.
- `npm run eval:studio` green at every phase.
- `T-ios-xcuitest-v1-smoke` (once landed) continues to pass.

### T-ios-keychain-token-migration — Migrate iOS auth tokens from UserDefaults to Keychain
- **Owner:** codex
- **Branch:** codex/T-ios-keychain-token-migration
- **Pillar:** ios
- **Status:** review

## Scope

Spec: `docs/specs/T-ios-keychain-token-migration.md`. Decision:
`D-token-keychain-migration` in `docs/decisions-queue.md`
(resolved 2026-05-14).

Finish the existing partial credential migration by making Keychain the source
of truth before any legacy defaults read, routing every app-token consumer
through that migration, and preventing failed new secure writes from falling
back to plaintext defaults. Keep the existing public client surface unchanged.

## Done when

- Keychain values are the source of truth on a fresh install and after the
  one-shot upgrade reconciliation completes.
- Existing UserDefaults entries are cleared after migration.
- `themTests` covers fresh-install, upgrade, keychain-fail branches.
- Manual smoke: install previous build, sign in, install this build
  over the top — sign-in survives.

## Local verification

- `BackendCredentialMigrationTests` pass 38/38 on an iPhone 17 Pro simulator,
  including transient-read and old-build conflict regression cases.
- The complete iOS `themTests` target passes 516/516.
- The focused suite performs real Security-framework create, read, update, and
  delete operations against an isolated Keychain service.
- A real `app_token` upgrade fixture migrates through the production helper into
  a unique test Keychain service, clears the legacy value, and remains
  idempotent without touching an app user's credential namespace.

## Human clearance remaining

- Install a previous signed build on a physical iPhone, sign in, install the
  new signed build over it, and confirm the remembered session survives. This
  cannot be reproduced by an unsigned local simulator build.

### T-ios-offline-outbox — iOS client outbox for offline-tolerant talk turns
- **Owner:** codex
- **Branch:** -
- **Pillar:** talk
- **Status:** ready

## Scope

Spec: `docs/specs/T-ios-offline-outbox.md`.

Durable client-side outbox actor that queues failed `/talk` POSTs and
retries them on app foreground + `NWPathMonitor` recovery. Visible UI
state for queued turns. Backend already exposes `/outbox` and
`/outbox/retry`; this is the missing client piece.

## Done when

- Airplane-mode → record turn → reconnect → turn lands without
  user intervention.
- Kill app while queue non-empty → relaunch → queue intact and drains.
- 4xx (non-retryable) → entry transitions to `parked` and is
  user-visible / user-deletable.
- Unit tests cover the state machine + backoff schedule.

### T-macos-posture-cleanup — Gate macOS scaffolding off the V1 iOS scheme
- **Owner:** codex
- **Branch:** -
- **Pillar:** ios
- **Status:** ready

## Scope

Spec: `docs/specs/T-macos-posture-cleanup.md`. Decision:
`D-desktop-posture-v1` in `docs/decisions-queue.md` (resolved
2026-05-14: no desktop app for V1).

Inventory every `#if os(macOS)` branch in `them/`; for each either
(a) keep with a one-line "reason" comment, (b) wrap in a dormant
`THEM_MAC_SHELL` compile flag, or (c) delete. Remove macOS from the
active V1 TestFlight scheme. Leave the project-wide `macosx` flag in
`SUPPORTED_PLATFORMS` so a future Mac shell isn't re-plumbed from
scratch.

## Done when

- `grep -rn "#if os(macOS)" them/` shows every branch annotated or
  gated.
- V1 TestFlight scheme excludes macOS as a destination.
- macOS scheme still compiles (dormant), no warning regressions.
- iOS scheme `themTests` green.

### T-trust-tiers — Trust tiers + standing pre-approvals (AGENTS.md)
- **Owner:** support
- **Branch:** support/T-trust-tiers
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
- **Owner:** support
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

### T43-refresh-support-queue — Refresh support agent queue after supervisor protocol merge
- **Owner:** codex
- **Branch:** codex/T43-refresh-support-queue
- **Pillar:** infra (enables all)
- **Status:** review

- **Done when:** `docs/coordination.json` and Codex/support agent inboxes reflect the current open support agent PR queue after T42, including PRs #91 and #92; superseded PR #89 is marked blocked; verification commands for the coordination scripts pass.

- **Scope:** protocol/docs only. No app or backend runtime changes.

### T47-refresh-after-new-support-prs — Refresh queue after new support agent PR triage
- **Owner:** codex
- **Branch:** codex/T47-refresh-after-new-support-prs
- **Pillar:** infra (enables all)
- **Status:** review

- **Done when:** `docs/coordination.json`, Codex inbox, support agent inbox, and the live handoff ledger record PR #99 as human-gated privacy/data-control work and PR #100 as blocked on ops access-control plus true windowed counts; prompt printers and coordination script checks pass.

- **Scope:** protocol/docs only. No app or backend runtime changes.

<!-- END AUTOGEN active-tasks -->
