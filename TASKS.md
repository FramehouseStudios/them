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
| T-block-signal-system-prompt | Inject coaching block when writer is stuck    | claude | review     |
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
| T-decisions-queue-md-lint | Lint docs/decisions-queue.md format                       | claude | review |
| T-block-signal-atms-zero-fix | Honor atMs=0 in recordBlockSignalSample (falsy-coerce bug)    | claude | review |
| T-known-domains-runtime-check | KNOWN_DOMAINS invariants (frozen, snake_case, roundtrip) | claude | review |
| T-prompt-assembly-snapshot-eval | Pin canonical buildModelPrompt block order            | claude | review |
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

---

## Current next-10 checklist (2026-05-12 after T77 post-efficiency refresh)

1. Have Claude rebase/fix PR #163 (`T-twist-engine-canon-eval`) after the PR #160 merge conflict.
2. Have Claude rebase/fix PR #164 (`T-block-detector-canon-eval`) after the PR #160 merge conflict.
3. Have Claude fix PR #161 (`T-trait-library-canon-eval`) so duplicate canonical trait labels cannot pass.
4. Have Claude fix PR #166 (`T-format-linter-rules-canon-eval`) so all 8 canonical format-linter rules are actually pinned.
5. Have Claude fix PR #159 (`T-ops-health-summary-eval`) so the eval reads the production-mounted feature source or narrows its contract.
6. Have Claude update PR #171 (`T-eval-gate-add-canon-evals`) after the canon-eval stack settles.
7. Review/merge PR #163 after it is rebased and its focused eval/backend tests are green.
8. Review/merge PR #164 after it is rebased and its focused eval/backend tests are green.
9. Review PR #90 after Claude confirms the route-local parser test is current against main.
10. Use the new `scripts/agent_event.mjs tail --n=20` lane at the start of every Codex/Claude session.

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

| ID                                      | Title                                                                | Owner  | Status      |
|-----------------------------------------|----------------------------------------------------------------------|--------|-------------|
| T-agent-events-jsonl-live-lane          | Append-only event lane (docs/agent-events.jsonl) + CLI               | claude | merged      |
| T-archetype-engine-canon-eval           | Pin canonical archetype set + per-entry shape                        | claude | merged      |
| T-block-signal-history-bounds-eval      | Pathological-input guard on the block-signal history buffer          | claude | review      |
| T-block-signal-history-route            | GET /memory/block-signal/history read endpoint                       | claude | review      |
| T-block-signal-history-tracking         | Persist block-signal samples to creative memory habits               | claude | review      |
| T-build-tasks-md-anchors                | Add AUTOGEN anchors to TASKS.md + harden anchor matcher              | claude | merged      |
| T-coordination-state-cli-validate       | Add `validate` subcommand to coordination_state.mjs                  | claude | merged      |
| T-coordination-state-mutate-eval        | Round-trip eval over coordination_state.mjs mutate subcommands       | claude | merged      |
| T-creative-memory-store-eviction-eval   | Pathological-input guard on creative-memory character roster         | claude | merged      |
| T-creative-memory-version-check-eval    | Pin the `version` field on creative-memory snapshots                 | claude | merged      |
| T-decisions-queue-fixture-template      | docs/decisions-queue-template.md (copy-paste entry template)         | claude | merged      |
| T-decompose-backend-index               | Decompose 33k-line backend/index.js into per-domain route libs       | claude | merged      |
| T-known-domains-startup-check           | Boot-time invariant check on KNOWN_DOMAINS                           | claude | merged      |
| T-ops-health-summary-route              | GET /ops/health-summary cheap uptime-dashboard endpoint              | claude | merged      |
| T-ops-routes-list-route                 | GET /ops/routes manifest of optional surfaces                        | claude | merged      |
| T-pre-flight-outbox-console-cleanup     | Convert outbox console.log → console.warn/error (pre-flight class 1) | claude | merged      |
| T-pre-flight-self-check-script          | scripts/pre_flight.mjs — catch recurring review feedback locally     | claude | merged      |
| T-prompt-assembly-block-signal-cap-eval | Cap on <block_signal> block size under pathological inputs           | claude | merged      |
| T-prompt-assembly-readme                | README for backend/lib/prompt_assembly.js                            | claude | merged      |
| T-screenplay-export-formats-list-route  | GET /screenplay/export/formats canonical format list                 | claude | review      |
| T-screenplay-export-markdown            | POST /screenplay/export format=md|markdown                           | claude | review      |
| T-screenplay-export-pdf-error-clarity   | Add human-readable help payload to PDF export rejection              | claude | merged      |
| T-talk-turn-meta-contract-snapshot      | Pin /talk/turn/:turnId response key set + error codes                | claude | review      |
| T-talk-turn-rate-limit-helper           | Pure token-bucket rate limiter for talk-turn reads                   | claude | merged      |
| T-talk-turn-rate-limit-route            | Optional rate-limit middleware on GET /talk/turn/:turnId             | claude | merged      |
| T-task-files-cleanup                    | Add TASKS.md rows for orphan task files (T-trust-tiers, T42-T56)     | claude | review      |
| T-tasks-active-frontmatter-eval         | Validate every tasks/_active/T-*.md front-matter                     | claude | merged      |
| T-tasks-active-stats                    | At-a-glance counts over tasks/_active/                               | claude | merged      |
| T-tasks-per-row                         | Per-row task files + TASKS.md regenerator (no canonical flip yet)    | claude | merged      |
| T-trust-tiers                           | Trust tiers + standing pre-approvals (AGENTS.md)                     | claude | review      |
| T42-supervisor-merge-protocol           | Codex self-merge authority + agent handoff fast lane                 | codex  | review      |
| T43-refresh-claude-queue                | Refresh Claude queue after supervisor protocol merge                 | codex  | review      |
| T44-creative-memory-export-triage       | Triage creative-memory export privacy gate                           | codex  | review      |
| T46-post-review-queue-refresh           | Refresh queue after Codex PR reviews                                 | codex  | review      |
| T47-refresh-after-new-claude-prs        | Refresh queue after new Claude PR triage                             | codex  | review      |
| T48-ios-archetype-traits                | Surface character archetypes in the Studio traits rail               | codex  | in-progress |
| T60                                     | Consume screenplay export formats in Studio                          | codex  | merged      |
| T61                                     | Refresh coordination after T60 merge                                 | codex  | merged      |
| T62                                     | Quiet offline Studio export-format refresh                           | codex  | merged      |
| T63                                     | Refresh coordination after T62 merge                                 | codex  | merged      |
| T64                                     | Quiet offline session-evolution launch probe                         | codex  | merged      |
| T65                                     | Refresh coordination after T64 merge                                 | codex  | merged      |
| T66                                     | Refresh queue after Claude PR triage                                 | codex  | merged      |
| T67                                     | Refresh queue after PR #148 triage                                   | codex  | merged      |
| T68                                     | Refresh queue after PR #150/#151 merges                              | codex  | merged      |
| T69                                     | Refresh queue after PR #134 merge                                    | codex  | merged      |
| T70                                     | Refresh queue after PR #154/#155/#156/#158 merges                    | codex  | merged      |
| T71                                     | Add agent throughput protocol and next-action CLI                    | codex  | merged      |
| T72                                     | Refresh queue after supervisor merge train                           | codex  | merged      |
| T73                                     | Build iOS Fountain import surface                                    | codex  | merged      |
| T74                                     | Surface ops route manifest in diagnostics                            | codex  | merged      |
| T75                                     | Surface talk-turn rate-limit retry affordance                        | codex  | merged      |
| T76                                     | Refresh coordination after efficiency merge train                    | codex  | merged      |
| T77                                     | Refresh coordination after PR #180/#181                              | codex  | merged      |

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

<!-- END AUTOGEN active-tasks -->
