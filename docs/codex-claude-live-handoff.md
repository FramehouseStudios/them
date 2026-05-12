# Codex to Claude Live Handoff

Status source for Claude: this file is the repo-visible Codex supervisor
ledger. `docs/coordination.json` is the fast machine-readable queue. Codex
updates both when a Codex-owned task is completed, materially advanced, or when
Codex reviews/merges/conflict-resolves Claude work.

## Fast Path

Claude should read these files in order before starting or resuming backend
work:

1. `AGENTS.md`
2. `TASKS.md`
3. `DECISIONS.md`
4. `docs/codex-claude-live-handoff.md`
5. `docs/coordination.json`
6. `docs/claude-inbox.md`

Human shortcut (Claude direction):

```text
Read AGENTS.md, TASKS.md, DECISIONS.md, docs/codex-claude-live-handoff.md,
docs/coordination.json, then docs/claude-inbox.md. Follow the Current Command
exactly, and update docs/coordination.json plus PR comments when status changes.
```

Human shortcut (Codex direction — Claude maintains the reciprocal inbox at
`docs/codex-inbox.md`, so the human no longer copy/pastes Claude→Codex
handoffs after each Claude PR):

```text
Read AGENTS.md, TASKS.md, DECISIONS.md, docs/codex-claude-live-handoff.md,
docs/coordination.json, then docs/codex-inbox.md. Pick the next Codex action
from the open Claude PRs section and the coordination queue.
```

To print the same compact handoff prompts from the repo:

```bash
node scripts/agent_next.mjs --role=claude # top Claude actions
node scripts/agent_next.mjs --role=codex  # top Codex actions
node scripts/print_claude_prompt.mjs   # what to tell Claude
node scripts/print_codex_prompt.mjs    # what to tell Codex
node scripts/coordination_state.mjs read
```

Throughput rules live in `docs/agent-throughput-protocol.md`. Claude should
clear blockers before opening net-new backend PRs when over the WIP limit;
Codex should batch routine green tier-1 PRs into merge trains and refresh the
handoff lane once per batch.

## Update Contract

Codex must update this ledger and `docs/coordination.json` before the final
response for any completed Codex task or conflict-resolution pass.

Each update should include:

- Task or PR number.
- Branch.
- Current status.
- What changed.
- What verification ran.
- What Claude should do next, if anything.

Codex PR descriptions should link back to this file. If a Codex change directly
unblocks, affects, or diagnoses a Claude-owned PR, Codex must also leave a short
GitHub PR comment on that Claude PR with the relevant status.

## Current Supervisor State

| Item | Branch / PR | Status | Verification | Claude action |
| --- | --- | --- | --- | --- |
| T31 coordination status cleanup | `codex/T31-coordination-status-cleanup` / PR #52 | merged | PR #52 merged | Use `TASKS.md` + this ledger as the current queue. |
| T32 reply-side mention flag enablement | `codex/T32-enable-reply-mentions` / PR #56 | merged | Focused `StudioThreadViewStateSupportTests` passed 8/8 before merge | T30 endpoint is live; keep the receipt contract stable. |
| T-logline-distiller | `claude/T-logline-distiller` / PR #48 | merged | Syntax checks; focused backend tests 67/67 before merge | T34 consumes the logline endpoints on iOS. |
| T-block-detector | `claude/T-block-detector` / PR #53 | merged | Syntax checks; focused backend tests 42/42 before merge | iOS block-signal nudge surface is now a Codex follow-up. |
| T-trait-library | `claude/T-trait-library` / PR #55 | merged | Syntax checks; focused backend tests 63/63; full backend `npm test` 261 pass / 1 skipped before merge | iOS character-traits side rail is now a Codex follow-up. |
| T-twist-engine | `claude/T-twist-engine` / PR #57 | merged | Syntax checks; focused backend tests 104/104; full backend `npm test` 279 pass / 1 skipped before merge | iOS twist-card consumer is now a Codex follow-up. |
| T-accepted-twist-log | `claude/T-accepted-twist-log` / PR #59 | merged | Syntax checks; focused accepted-twist backend tests 17/17; full backend `npm test` 296 pass / 1 skipped before merge | PR #71 consumes the accepted-twist Keep/Dismiss/Reload endpoints on iOS. |
| T33 Claude command center | `codex/T33-claude-command-center` | merged | `node scripts/print_claude_prompt.mjs` passed | Claude should use `docs/claude-inbox.md` as the compact current command. |
| T-codex-inbox | `claude/T-codex-inbox` / PR #60 | merged | `node --check scripts/print_codex_prompt.mjs`; `node scripts/print_codex_prompt.mjs`; `git diff --check` | Use `docs/codex-inbox.md` and `node scripts/print_codex_prompt.mjs` for Claude→Codex handoffs. |
| T-coordination-state | `claude/T-coordination-state` / PR #65 | merged | `node --check scripts/coordination_state.mjs`; `node scripts/coordination_state.mjs read`; `git diff --check` | Use `docs/coordination.json` and `node scripts/coordination_state.mjs read` as the fast machine-readable queue. |
| T-auto-merge-tier1 | `claude/T-auto-merge-tier1` / PR #64 | merged | `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/auto-merge-tier1.yml")'`; `git diff --check`; GitHub `auto-merge-tier1 / evaluate` passed | Tier 1 auto-merge is live; supervisor approval comments only count from trusted repo author associations. |
| T-decisions-queue | `claude/T-decisions-queue` / PR #66 | merged | Docs inspected; `git diff --check` | Use `docs/decisions-queue.md` as the one human-needed-question queue. |
| T-strict-auto-merge | `claude/T-strict-auto-merge` / PR #72 | merged | `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/auto-merge-tier1.yml")'`; `git diff --check` | Tier 1 auto-merge now requires explicit trusted approval; no quiet-time fallback. |
| T-tasks-per-row | `claude/T-tasks-per-row` / PR #67 | merged | `node --check scripts/build_tasks_md.mjs`; `node scripts/build_tasks_md.mjs`; `git diff --check`; GitHub `auto-merge-tier1 / evaluate` passed | Use `tasks/_active/` for optional per-row task seeds; `TASKS.md` remains source of truth until a later canonical flip. |
| T34 iOS logline rail consumer | `codex/T34-ios-logline-rail` / PR #61 | merged | `swift test --package-path Packages/ScreenplayStudio`; focused logline Xcode tests; full macOS `themTests`; generic iOS build all passed | T35 consumes the block-signal endpoint next. |
| T35 iOS block-signal nudge surface | `codex/T35-block-signal-nudge` / PR #62 | merged | Focused block-signal Xcode tests passed 3/3; full macOS `themTests` passed 65/65; generic iOS build passed; `git diff --check` passed | Next iOS consumer is the character-traits side rail; Claude PR #63 is clean but policy-gated. |
| T36 iOS character-traits side-rail consumer | `codex/T36-ios-character-traits` / PR #68 | merged | Focused character-traits Xcode tests passed 3/3; full macOS `themTests` passed 68/68; generic iOS build passed; `git diff --check` passed | Next iOS consumer is the twist-card surface; Claude PR #63 is clean but policy-gated. |
| T37 iOS twist-card consumer | `codex/T37-ios-twist-cards` / PR #69 | merged | `swift test --package-path Packages/ScreenplayStudio` passed; focused twist Xcode tests passed 3/3; full macOS `themTests` passed 71/71; generic iOS build passed; `git diff --check` passed | T12 is merged; Claude PR #63 remains policy-gated; PR #67 is merged. |
| T12 perceived-speed primitives | `codex/T12-perceived-speed` / PR #70 | merged | Focused perceived-speed Xcode tests passed 2/2; full macOS `themTests` passed 73/73; generic iOS build passed; `git diff --check` passed | PR #63 remains policy-gated; PR #67 is merged. |
| T38 accepted twist-card actions | `codex/T38-accepted-twist-ios` / PR #71 | merged | `swift test --package-path Packages/ScreenplayStudio`; focused accepted-twist Xcode tests passed 2/2; full macOS `themTests` passed 75/75; generic iOS build passed; `git diff --check` passed; GitHub evaluate passed | PR #59 is merged; accepted-twist Keep/Dismiss/Reload is wired on iOS. |
| T39 Studio SF Symbol warning fix | `codex/T39-symbol-warning` / PR #73 | merged | Focused design-system guard passed 1/1; full macOS `themTests` passed 76/76; generic iOS build passed; `git diff --check` passed; GitHub evaluate passed | No Claude action. |
| T40 app UserDefaults suite warning fix | `codex/T40-userdefaults-suite-warning` / PR #75 | merged | Focused guard passed 1/1; full macOS `themTests` passed 77/77; generic iOS build passed; `git diff --check` passed; GitHub evaluate passed | No Claude action. |
| T41 Studio debug lifecycle publish deferral | `codex/T41-defer-studio-debug-publish` / PR #78 | merged | Rebased after PRs #71/#73/#75; macOS `themTests` passed 77/77; generic iOS build passed; `git diff --check` passed; GitHub evaluate passed | No Claude action. |
| T42 supervisor merge protocol | `codex/T42-supervisor-merge-protocol` / PR #93 | merged | Coordination script checks, prompt printers, task generator, `git diff --check`, and GitHub evaluate passed | Claude should treat D005, `docs/coordination.json`, and the prompt printers as the lower-friction coordination lane. |
| T43 Claude queue refresh | `codex/T43-refresh-claude-queue` / PR #95 | merged | Coordination script checks, prompt printers, `git diff --check`, and GitHub evaluate passed | Claude should pause net-new feature PRs and clear existing `do-not-merge` blockers before adding more backend surface area. |
| T44 creative-memory export triage | `codex/T44-creative-memory-export-triage` / PR #96 | merged | Coordination script checks, prompt printers, `git diff --check`, and GitHub evaluate passed | Claude PR #94 is human-gated because full memory export touches privacy/data-control. |
| T-archetype-engine | `claude/T-archetype-engine` / PR #91 | merged | GitHub evaluate passed; Codex supervisor review comment left because GitHub cannot self-approve same-account PRs | T48 consumes `GET /memory/character-archetypes` in the iOS character-traits rail. |
| T45 Craft route JSON parser | `codex/T45-craft-route-json-parser` / PR #98 | merged | Syntax checks; focused Craft parser test; full backend `npm test` passed 319 pass / 1 skipped; `git diff --check`; GitHub evaluate passed | Rebase PRs #88 and #92 onto current `main`; Craft routes now parse JSON in production via `mountCraftRoutes(app)`. |
| T46 post-review queue refresh | `codex/T46-post-review-queue-refresh` / PR #101 | merged | Coordination script checks, prompt printers, `git diff --check`, and GitHub evaluate passed | Claude should clear `do-not-merge` blockers on #87/#88/#90/#92/#97 before opening more backend feature branches. |
| PR #99 privacy triage | `claude/T-creative-memory-delete-endpoint` / PR #99 | blocked | Codex review only; labeled tier-3/needs-human/do-not-merge | Memory deletion is privacy/data-control work. Needs human approval before merge, including scope of project-scoped artifacts. |
| PR #100 ops triage | `claude/T-talk-error-rate-tracker` / PR #100 | blocked | Codex review only; labeled tier-1/do-not-merge | Add `/talk/errors` access-control proof or safe-public policy and fix true `sinceMs` window counts. |
| T47 new Claude PR queue refresh | `codex/T47-refresh-after-new-claude-prs` / PR #102 | merged | Coordination script checks, prompt printers, `git diff --check`, and GitHub evaluate passed | Claude should see #99/#100 blockers through `docs/coordination.json` and prompt printers. |
| T48 iOS archetype traits rail | `codex/T48-ios-archetype-traits` / PR #108 | merged | `swift test --package-path Packages/ScreenplayStudio`; focused archetype Xcode tests passed 3/3; full macOS `themTests` passed 80/80; generic iOS build passed; `git diff --check` passed; GitHub evaluate passed | No backend action. T48 consumes merged PR #91 `GET /memory/character-archetypes` as a non-blocking character-traits rail enrichment. |
| T49 post-T48 coordination refresh | `codex/T49-post-t48-coordination-refresh` / PR #109 | merged | Coordination script checks, prompt printers, `git diff --check`, and GitHub evaluate passed | Claude should read this ledger plus `docs/coordination.json`; the archetype endpoint is no longer waiting for an iOS consumer. |
| T-block-signal-history-tracking | `claude/T-block-signal-history-tracking` / PR #103 | merged | Codex diff review; GitHub evaluate passed; Claude reported focused tests 9/9 and backend `npm test` 328 pass / 1 skipped | No Claude action. The block-signal route now stores debounced `habits.block_signal_history` samples. |
| T-block-signal-history-route | `claude/T-block-signal-history-route` / PR #114 | merged | Codex diff review; GitHub evaluate passed; Claude reported focused route tests 9/9 and backend `npm test` 337 pass / 1 skipped | No Claude action. `GET /memory/block-signal/history` is ready for a Codex iOS history sparkline/stuck-this-week consumer. |
| T-decisions-queue-route | `claude/T-decisions-queue-route` / PR #104 | blocked | Codex diff review passed before merge attempt; now DIRTY after PR #103 | Rebase on current `main`, keep route/tests intact, rerun focused decisions-queue test plus `npm test`, then remove `do-not-merge`. |
| T-memory-quality-eval | `claude/T-memory-quality-eval` / PR #105 | blocked | Codex diff review passed before PR #103; now DIRTY after PR #103 | Rebase on current `main`, rerun the direct eval, `npm run eval:memory-quality`, and `npm test`, then remove `do-not-merge`. |
| T-codex-inbox-refresh-round8 | `claude/T-codex-inbox-refresh-round8` / PR #106 | closed | Supervisor close; handoff-only content superseded by current main coordination docs | No Claude action. |
| T-tasks-sync-check | `claude/T-tasks-sync-check` / PR #107 | blocked | Codex diff review passed before PR #103; now DIRTY after PR #103 | Rebase on current `main`, rerun default/strict script checks and script tests, then remove `do-not-merge`. |
| T50 post-PR103 queue refresh | `codex/T50-refresh-after-pr103-merge` / PR #113 | merged | Coordination script checks, prompt printers, `git diff --check`, and GitHub evaluate passed | Claude should use the refreshed queue: #103 merged; #104/#105/#107 need rebase; #106 is stale. |
| T-prompt-size-eval | `claude/T-prompt-size-eval` / PR #110 | blocked | Codex triage only; labeled `tier-1` + `do-not-merge` | Rebase on current `main`, rerun prompt-size eval commands plus `npm test`, then remove `do-not-merge`. |
| T-creative-memory-stats-route | `claude/T-creative-memory-stats-route` / PR #111 | blocked | Codex triage only; labeled `tier-1` + `do-not-merge` | Rebase on current `main`, keep no-leakage assertion, rerun focused route test plus `npm test`, then remove `do-not-merge`. |
| T-prompt-assembly-snapshot-eval | `claude/T-prompt-assembly-snapshot-eval` / PR #112 | blocked | Codex triage only; labeled `tier-1` + `do-not-merge` | Rebase on current `main`, rerun prompt snapshot eval commands plus `npm test`, then remove `do-not-merge`. |
| T51 new eval PR queue refresh | `codex/T51-refresh-after-new-eval-prs` / PR #116 | merged | Coordination script checks, prompt printers, `git diff --check`, and GitHub evaluate passed | Claude should use the refreshed queue: #110/#111/#112 are blocked until rebased after #103. |
| T-known-domains-runtime-check | `claude/T-known-domains-runtime-check` / PR #115 | blocked | Codex triage only; labeled `tier-1` + `do-not-merge` | Rebase on current `main` after PR #114, rerun `node --test tests/known_domains_invariants.test.mjs` plus `npm test`, then remove `do-not-merge`. |
| T-coordination-state-eval | `claude/T-coordination-state-eval` / PR #117 | blocked | Codex triage only; labeled `tier-1` + `do-not-merge` | Rebase on current `main` after PR #114, rerun `node scripts/coordination_state_schema_check.mjs` and `node --test scripts/coordination_state_schema_check.test.mjs`, then remove `do-not-merge`. |
| T52 post-PR114 queue refresh | `codex/T52-refresh-after-pr114-merge` / PR #118 | merged | Coordination script checks, prompt printers, `git diff --check`, and GitHub evaluate passed | Claude should see PR #114 as merged, PRs #115/#117 as blocked, and `GET /memory/block-signal/history` as ready for iOS consumption. |
| T53 iOS block-signal history surface | `codex/T53-ios-block-signal-history` / PR #122 | merged | Package tests, focused block-signal history tests, full macOS `themTests` 83/83, generic iOS build, `git diff --check`, coordination checks, and GitHub evaluate passed | No Claude action. PR #114's `GET /memory/block-signal/history` endpoint is consumed in the Studio Momentum rail. |
| T-block-signal-history-bounds-eval | `claude/T-block-signal-history-bounds-eval` / PR #120 | merged | Codex diff review; GitHub evaluate passed; Claude reported bounds eval, npm script, and backend `npm test` 337 pass / 1 skipped | No Claude action. Follow-up is tracked in PR #124. |
| T-screenplay-export-markdown | `claude/T-screenplay-export-markdown` / PR #119 | merged | Codex diff review; route-level Markdown coverage added; GitHub evaluate passed; Claude reported Markdown unit/route tests and backend `npm test` 361 pass / 1 skipped | T59 consumes `POST /screenplay/export` `format=md` on iOS. |
| T59 iOS Markdown export | `codex/T59-ios-markdown-export` / PR #136 | merged | Package tests, focused Markdown export Xcode tests 4/4, full macOS Xcode tests 85/85, generic iOS build, coordination checks, `git diff --check`, and GitHub evaluate passed | No Claude action. The Markdown screenplay export endpoint is no longer waiting for an iOS consumer. |
| T-screenplay-export-formats-list-route | `claude/T-screenplay-export-formats-list-route` / PR #135 | merged | Codex diff review; focused route test 7/7; syntax and whitespace checks; GitHub evaluate passed; Claude reported backend `npm test` 368 pass / 1 skipped | T60 consumes `GET /screenplay/export/formats` in the Studio export menu. |
| T-build-tasks-md-anchors | `claude/T-build-tasks-md-anchors` / PR #133 | blocked | Rechecked after PR #149 as still carrying `do-not-merge` and needing a fresh idempotency proof | Update over post-#149 `main`, commit generated `TASKS.md`, verify a second generator write is clean, then remove `do-not-merge`. |
| T-ops-health-summary-route | `claude/T-ops-health-summary-route` / PR #134 | merged | Codex cleared the stale `do-not-merge` after Claude's rebase note; focused route test 11/11 and backend `npm test` 379 pass / 1 skipped passed locally; GitHub evaluate passed | No Claude action. Codex can consume `GET /ops/health-summary` in a lightweight diagnostics surface. |
| T60 export formats picker | `codex/T60-export-formats-picker` / PR #137 | merged | Package tests, focused export-format Xcode tests 4/4, full macOS Xcode tests 88/88, generic iOS build, coordination checks, `git diff --check`, and GitHub evaluate passed | No Claude action. The export formats discovery endpoint has an app consumer. |
| T61 post-T60 coordination refresh | `codex/T61-post-t60-coordination-refresh` / PR #138 | merged | Coordination state read/write checks, prompt printers, build-task script check/render, `git diff --check`, and GitHub evaluate passed | No Claude action. The refreshed queue is on `main`; #133/#134 remain blocked. |
| T62 offline export-format refresh quieting | `codex/T62-studio-offline-refresh-quiet` / PR #139 | merged | Package tests, focused export refresh/menu Xcode tests 3/3, full macOS Xcode tests 89/89, generic iOS build, coordination checks, `git diff --check`, and GitHub evaluate passed | No Claude action. This keeps T60's backend format discovery, but auto-refresh is quiet during XCTest/offline launches and manual Refresh Formats still reports errors. |
| T63 post-T62 coordination refresh | `codex/T63-post-t62-coordination-refresh` / PR #140 | merged | PR #133/#134 status recheck, coordination state read, prompt printers, build-task script check/render, and `git diff --check` passed | Claude should use the refreshed post-T62 blockers: #133 still needs generator idempotency; #134 still conflicts. |
| T64 session-evolution launch quieting | `codex/T64-session-evolution-quiet` / PR #146 | merged | Package tests, focused policy/export Xcode tests 3/3, full macOS Xcode tests 90/90, and generic iOS build passed; GitHub evaluate passed | No Claude action. This extends offline/XCTest quieting beyond export-format discovery to automatic session evolution, health/hydration, auth-token, history, project-outline, and navigator launch probes. |
| T65 post-T64 coordination refresh | `codex/T65-post-t64-coordination-refresh` / PR #147 | merged | PR #133/#134 status recheck, coordination state read, prompt printers, build-task script check/render, `git diff --check`, and GitHub evaluate passed | Claude should use the refreshed post-T64 blockers: #133 still needs generator idempotency; #134 still carries `do-not-merge`. |
| T-prompt-assembly-block-signal-cap-eval | `claude/T-prompt-assembly-block-signal-cap-eval` / PR #141 | merged | Codex diff review; GitHub evaluate passed; Claude reported direct eval 11/11 and backend `npm test` 368 pass / 1 skipped | No Claude action. The block-signal prompt-size eval is merged. |
| T-known-domains-startup-check | `claude/T-known-domains-startup-check` / PR #142 | blocked | Codex review found the default warn-and-continue path can still throw on a non-array `KNOWN_DOMAINS` because iteration is not guarded | Guard iteration with `Array.isArray` or inject domains for testing, add non-array / duplicate / non-snake-case regressions, rerun focused test plus `npm test`, then remove `do-not-merge`. |
| T-decisions-queue-fixture-template | `claude/T-decisions-queue-fixture-template` / PR #143 | merged | Codex diff review; GitHub evaluate passed | No Claude action. Decisions queue template is merged. |
| T-coordination-state-cli-validate | `claude/T-coordination-state-cli-validate` / PR #144 | merged | Codex diff review; GitHub evaluate passed; Claude reported validate command and node test pass | No Claude action. Coordination state now has a `validate` subcommand. |
| T-codex-inbox-refresh-round11 | `claude/T-codex-inbox-refresh-round11` / PR #145 | closed | Supervisor close; conflicting inbox-only refresh superseded by current coordination docs | No Claude action. |
| T66 Claude PR triage refresh | `codex/T66-refresh-after-claude-pr-triage` / PR #149 | merged | PR #141/#143/#144 merges, PR #142 block, PR #145 close, coordination state validate/read, prompt printers, task generator, `git diff --check`, and GitHub evaluate passed | Claude should follow the refreshed blockers in `docs/coordination.json`. |
| T-ops-routes-list-route | `claude/T-ops-routes-list-route` / PR #148 | blocked | Codex review found PR #148 conflicts after PR #149/T66 and its route-manifest contract is broader than the static list it returns | Rebase over post-#149 `main`, then either narrow/document the response as a curated subset with explicit scope or include the full intended optional route set with regression coverage; rerun focused route test plus `npm test`. |
| T67 post-#148 triage refresh | `codex/T67-refresh-after-pr148-triage` / PR #152 | merged | PR #148 block recorded in TASKS, coordination state, inboxes, prompt printers, `git diff --check`, and GitHub evaluate passed | Claude should follow the refreshed #148 blocker in `docs/coordination.json`. |
| T-creative-memory-version-check-eval | `claude/T-creative-memory-version-check-eval` / PR #150 | merged | Codex diff review; GitHub evaluate passed; Claude reported direct eval 7/7 and backend `npm test` 368 pass / 1 skipped | No Claude action. The creative-memory snapshot version contract is pinned. |
| T-screenplay-export-pdf-error-clarity | `claude/T-screenplay-export-pdf-error-clarity` / PR #151 | merged | Codex diff review; GitHub evaluate passed; Claude reported focused PDF rejection test 4/4 and backend `npm test` 372 pass / 1 skipped | Codex can consume `message`, `alternative_formats`, and `docs_path` in the Studio export UI. |
| T68 post-#150/#151 refresh | `codex/T68-refresh-after-pr150-151` / PR #153 | merged | PR #150/#151 merges, T67 status cleanup, coordination state validate/read, prompt printers, task generator, `git diff --check`, and GitHub evaluate passed | Claude should follow the refreshed queue in `docs/coordination.json`. |
| T69 post-#134 refresh | `codex/T69-refresh-after-pr134` / PR #157 | merged | PR #134 merge recorded in TASKS, task files, coordination state, and inboxes; coordination checks, prompt printers, `git diff --check`, and GitHub evaluate passed | Claude should treat #134 as landed and continue with #148/#142/#133 blockers. |
| T-talk-turn-rate-limit-helper | `claude/T-talk-turn-rate-limit-helper` / PR #154 | merged | Codex diff review; focused rate-limit unit test 11/11 passed locally; GitHub evaluate passed; Claude reported backend `npm test` 379 pass / 1 skipped | Follow-up can mount the pure limiter on `GET /talk/turn/:turnId`. |
| T-tasks-active-frontmatter-eval | `claude/T-tasks-active-frontmatter-eval` / PR #155 | merged | Codex diff review; default/strict scripts and script test 2/2 passed locally; GitHub evaluate passed | No Claude action. This gives both agents a front-matter/content validator. |
| T-prompt-assembly-readme | `claude/T-prompt-assembly-readme` / PR #156 | merged | Codex diff review; docs-only; GitHub evaluate passed | No Claude action. The canonical prompt layout is documented beside the source. |
| T-tasks-active-stats | `claude/T-tasks-active-stats` / PR #158 | merged | Codex diff review; text/JSON scripts and script test 2/2 passed locally; GitHub evaluate passed | No Claude action. Agents can use `node scripts/tasks_active_stats.mjs --json` for queue summaries. |
| T70 post-#154/#155/#156/#158 refresh | `codex/T70-refresh-after-pr154-158` / PR #162 | merged | PR #154/#155/#156/#158 merges recorded in task files, coordination state, and inboxes; task-frontmatter/stats scripts, coordination checks, prompt printers, `git diff --check`, and GitHub evaluate passed | Claude should keep clearing existing blockers before opening more support PRs. |
| T71 agent throughput protocol | `codex/T71-agent-throughput` / PR #167 | review | `agent_next` script/tests, throughput protocol docs, prompt updates, and ready-for-iOS labels added; GitHub evaluate pending | Claude should use `node scripts/agent_next.mjs --role=claude` as the first next-action command and stop opening net-new backend work while over the WIP limit. |
| T-codex-inbox-refresh-round9 | `claude/T-codex-inbox-refresh-round9` / PR #121 | closed | Supervisor close; handoff-only content superseded by current main coordination docs | No Claude action. |
| T-talk-turn-meta-contract-snapshot | `claude/T-talk-pipeline-error-class-snapshot` / PR #125 | merged | Codex diff review; GitHub evaluate passed; Claude reported focused contract test 6/6 and backend `npm test` 343 pass / 1 skipped | No Claude action. This pins the iOS-visible `GET /talk/turn/:turnId` response contract. |
| T-block-signal-atms-zero-fix | `claude/T-block-signal-atms-zero-fix` / PR #124 | blocked | Codex review only; labeled `tier-1` + `do-not-merge` | Preserve explicit `atMs=0` without treating `null` or blank string as zero. Add regressions for `atMs: null` and empty string fallback to positive `nowMs()`, update over current `main` after PR #125, then rerun focused test plus `npm test`. |
| T-decisions-queue-md-lint | `claude/T-decisions-queue-md-lint` / PR #127 | blocked | Codex triage only; labeled `tier-1` + `do-not-merge` | Rebase/update on current `main`, rerun `node scripts/decisions_queue_lint.mjs` and `node --test scripts/decisions_queue_lint.test.mjs`, then remove `do-not-merge` for full review. |
| T-codex-inbox-refresh-round10 | `claude/T-codex-inbox-refresh-round10` / PR #128 | closed | Supervisor close; handoff-only content superseded by current main coordination docs | No Claude action. |
| T-task-files-cleanup | `claude/T-task-files-cleanup` / PR #131 | merged | Codex diff review; GitHub evaluate passed | No Claude action. TASKS.md now has rows for the orphan YAML-front-matter task files surfaced by the task sync checker. |



## Claude Watch List

| Claude item | Current Codex note |
| --- | --- |
| PR #33, T07 eval gate | Open and red for the expected human-owned blocker: repository Actions secret `OPENAI_API_KEY` is malformed or not the literal OpenAI key value. Do not weaken eval gates. |
| T07-cutover | Remains blocked until PR #33 is truly green against Postgres. |
| Blocked Claude PRs | Use `docs/coordination.json` for the current blocked/open PR list. Any `do-not-merge`, `needs-human`, or tier-3 item stays unmerged until its blocker is cleared. Current fresh blockers: #87 413 handling, #88 rebase after #98, #90 route parser, #92 payoff dedupe plus rebase, #97 dirty branch/access-control proof, #99 privacy approval, #100 ops access-control/window counts, #104/#105/#107 rebase after #103, #110/#111/#112 rebase after #103, #115/#117 rebase after #114, #124 null/blank timestamp fallback, and #127 rebase/checks. |

## Completed Codex Context

| Item | Current note |
| --- | --- |
| T04 canonical name | `io.them` is the canonical user-visible product name per D001. |
| T10 design system | App-facing UI should use `IOThemColors`, `IOThemTypography`, and `IOThemSpacing`. |
| T11 magic-moment onboarding | Merged; T12 perceived-speed primitives are merged. Real iPhone <=60s validation remains product acceptance. |
| T13-client realtime supplier selection | Merged; future supplier work should preserve the merged request/response contract. |
| T14 G3 snapshot triage | Merged; use `docs/T14-g3-snapshot-triage.md`, not the legacy dirty branch, as the handoff source. |
| T24 prompt builder consolidation | Merged; backend prompt changes should keep `/screenplay/prompt/build` compatible. |
| T25 frameworks | Story Circle and Hero Journey framework data are available on `main`. |
| T26 Craft tab polish | Merged; preserve framework, report, override, and format-lint endpoint shapes. |
| T27 live handoff ledger | Merged; this file is the durable supervisor record. |
| T28 format lint cards | Merged; format warnings surface as non-blocking Studio cards with page/line anchors. |
| T29 reply-side character mentions | Merged; T32 enables the flag by default. |
| T30 character mention endpoint | Merged; endpoint persists through `creativeMemoryStore.recordCharacterMention(...)`. |

## Recurring Codex Rule

When Codex finishes a task, this file and `docs/coordination.json` get updated
before the PR is opened or before the final response if no PR is needed. When
Codex touches a Claude-owned PR, Codex also comments on that PR in real time.
That gives Claude both the live notification and the durable repo-visible
history without relying on chat memory.
