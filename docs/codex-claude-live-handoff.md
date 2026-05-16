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
exactly, and append event-lane updates when status changes. Codex owns
docs/coordination.json refreshes unless explicitly assigned.
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
node scripts/v1_launch_room.mjs --role=claude # Claude's launch-room task
node scripts/v1_launch_room.mjs --role=codex  # Codex supervisor options
node scripts/v1_launch_room.mjs --role=human  # human decisions/smokes
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
| T139 V1 release smoke clearance | `codex/T139-v1-release-smoke-clearance` / PR #341 | review | Release audit found no `DEVELOPMENT_TEAM_ID`, no release `BACKEND_URL`, no `APP_TOKEN`, and `0 valid identities found`; macOS build passed, macOS `themTests` passed 108/108, generic unsigned iOS build passed, `scripts/appstore_preflight.sh` failed with `fail=3 warn=1`, and `docs/v1-launch-doctor.latest.json` now exists as a blocked `not_started` report. | Stay in V1 smoke-failure support mode. Do not open net-new backend work. If Codex or the human posts a concrete Talk/Studio/Memory/Realtime Launch Doctor failure after real release config is present, fix that exact failure first. |
| T138 launch proof queue refresh | `codex/T138-refresh-after-launch-proof-prs` / PR #340 | merged | GitHub `evaluate` passed; merged under D005 on 2026-05-16 after PR #338 and PR #339 landed. | Superseded by T139; no backend action. |
| T137 deterministic V1 smoke proof refresh | `codex/T137-post-phase7b-v1-smoke-proof` / PR #339 | merged | `cd backend && npm run eval:v1-smokes` passed after Phase 7b and Launch Doctor CLI recorder landed; coordination validation, strict pre-flight, and `git diff --check` passed. | No backend action. Deterministic smokes are green; full human/TestFlight app smoke remains the V1 release gate. |
| T136 Launch Doctor CLI proof recorder | `codex/T136-v1-launch-doctor-cli` / PR #338 | merged | Adds `scripts/v1_launch_doctor_report.mjs` so explicit flow flags or a pasted manual QA result block can produce the same Launch Doctor JSON/Markdown schema the in-app recorder exports. Verification: script syntax check passed; Launch Doctor recorder tests passed 4/4; launch-room tests passed 5/5; manual QA checklist tests passed 4/4; coordination validation passed; strict pre-flight passed; `git diff --check` passed. | No backend action. Stay in V1 smoke-failure support mode; if Codex posts a specific Talk/Studio/Realtime backend failure, fix that failure only. |
| PR #335 Phase 7b talk handler | `claude/T-decompose-phase7b-talk-handler` / PR #335 | merged | Codex rebased the branch, preserved T132's acorn/acorn-walk decision, removed stale iterative-convergence wording, and merged under D005. Verification: `node scripts/pre_flight.mjs --strict` passed; `node --test backend/tests/talk_*.test.mjs` passed 121/121; `cd backend && npm test` passed 1171 / skipped 1 / failed 0; `git diff --check` passed; GitHub `evaluate` passed; live local backend `/talk` dispatch smoke returned 200 with 123264 bytes of fixture audio. | Phase 7b is done. Full human/TestFlight Talk Pipeline app smoke remains a V1 release-readiness gate and was not claimed here. Do not reopen Phase 7b. |
| T134 Phase 7b blocker refresh | `codex/T134-phase7b-blocker-refresh` / PR #336 | merged | GitHub `evaluate` passed and PR #336 merged before Codex repaired/merged #335. | Superseded by the PR #335 merge. |
| T133 post-T132 refresh | `codex/T133-refresh-after-t132` / PR #334 | merged | GitHub `evaluate` passed; D005 merge verified remotely; branch deleted after local cleanup hit the known `main` worktree collision. | No backend action. T132 is merged; PR #335 is now the active Phase 7b lane. |
| T132 Phase 7b scope-tool handoff | `codex/T132-phase7b-scope-tool-handoff` / PR #333 | merged | `node scripts/v1_launch_room.mjs --role=claude`; `node scripts/agent_next.mjs --role=claude --limit=3 --no-events`; `node scripts/coordination_state.mjs validate`; `node scripts/agent_event.mjs tail --n=4`; `node scripts/pre_flight.mjs --strict`; `git diff --check` passed locally; GitHub `evaluate` passed before D005 merge | Proceed with Phase 7b. Use `acorn` + `acorn-walk` as backend devDependencies for deterministic dependency-closure verification. No human-in-loop dependency convergence; Codex is not taking over unless this focused tooling path still blocks. |
| T130 release preflight clearance | `codex/T130-release-preflight-clearance` / PR #331 | merged | `bash -n scripts/appstore_preflight.sh`; expected-red `scripts/appstore_preflight.sh` now reports `fail=3 warn=1`; `node --check scripts/v1_launch_room.mjs`; `node --test scripts/v1_launch_room.test.mjs` 5/5; `node scripts/v1_launch_room.mjs --role=human`; `node scripts/pre_flight.mjs --strict`; `node scripts/coordination_state.mjs validate`; `git diff --check`; unsigned Release macOS build; macOS `themTests` 108/108; generic iOS build all passed locally; GitHub `evaluate` passed before D005 merge | No backend action. Claude stays on Phase 7b talk handler implementation. Release preflight now has only real human/deploy blockers: Apple Team ID, hosted backend URL, and production app token. |
| T128 V1 Launch Doctor | `codex/T128-v1-launch-doctor` / PR #329 | merged | `node --check scripts/v1_launch_room.mjs`; `node --test scripts/v1_launch_room.test.mjs` 5/5; focused Launch Doctor tests 5/5; design-system guard 1/1; macOS `themTests` 108/108; generic iOS build; `node scripts/coordination_state.mjs validate`; `node scripts/pre_flight.mjs --strict`; `git diff --check` all passed locally | Stay on Phase 7b talk handler implementation. This is app-side smoke instrumentation only; no backend contract change. |
| T127 V1 launch room | `codex/T127-v1-launch-room` / PR #328 | merged | `node --check scripts/v1_launch_room.mjs`, `node --test scripts/v1_launch_room.test.mjs` 4/4, `node scripts/v1_launch_room.mjs --role=claude`, `node scripts/v1_launch_room.mjs --role=human`, `node scripts/coordination_state.mjs validate`, `node scripts/pre_flight.mjs --strict`, and `git diff --check` passed locally | Use `node scripts/v1_launch_room.mjs --role=claude` first, then do Phase 7b only. |
| T126 release preflight proof | `codex/T126-release-preflight-proof` / PR #327 | merged | `scripts/appstore_preflight.sh` failed with 6 release configuration/signing blockers and 0 warnings; `node scripts/coordination_state.mjs validate`, `node scripts/pre_flight.mjs --strict`, and `git diff --check` passed before merge | No backend action. Claude remains on Phase 7b talk handler implementation; human/Codex must clear release signing/configuration before TestFlight. |
| T125 deterministic V1 smoke proof | `codex/T125-deterministic-v1-smoke-proof` / PR #326 | merged | `cd backend && npm run eval:v1-smokes`, `node scripts/coordination_state.mjs validate`, `node scripts/pre_flight.mjs --strict`, and `git diff --check` passed before merge | No backend action. Claude remains on Phase 7b talk handler implementation; human manual smoke still required. |
| T124 post-smoke-prompt refresh | `codex/T124-refresh-after-v1-smoke-prompt` / PR #325 | merged | `node scripts/coordination_state.mjs validate`, `node scripts/agent_next.mjs --role=claude --no-events`, `node scripts/pre_flight.mjs --strict`, and `git diff --check` passed before merge | No backend action. Claude remains on Phase 7b talk handler implementation. |
| T123 V1 smoke prompt | `codex/T123-v1-smoke-prompt` / PR #324 | merged | `node --check scripts/v1_manual_qa_checklist.mjs`, `node --test scripts/v1_manual_qa_checklist.test.mjs` 4/4, `node scripts/v1_manual_qa_checklist.mjs --prompt`, `node scripts/coordination_state.mjs validate`, `node scripts/pre_flight.mjs --strict`, and `git diff --check` passed before merge | No backend action. Human can run `node scripts/v1_manual_qa_checklist.mjs --prompt` for the remaining manual V1 pass/fail handoff. |
| T122 current app test proof | `codex/T122-current-app-test-proof` / PR #323 | merged | macOS app build passed; macOS `themTests` passed 103/103; `npm run v1:status` reported 19/25; `node scripts/coordination_state.mjs validate`, `node scripts/pre_flight.mjs --strict`, and `git diff --check` passed before merge | No backend action. This refreshed the release-readiness proof after PR #320's app-visible export UX change. |
| T121 post V1 progress refresh | `codex/T121-post-v1-progress-refresh` / PR #322 | merged | `node scripts/coordination_state.mjs validate`, `node scripts/agent_next.mjs --role=claude --no-events`, `node scripts/pre_flight.mjs --strict`, and `git diff --check` passed before merge | Phase 7b talk handler implementation remains the next backend action. Do not open coord-refresh PRs or side-lane schema-only PRs. |
| T120 memory privacy decision packet | `codex/T120-memory-privacy-decision-packet` / PR #321 | merged | `node scripts/pre_flight.mjs --strict` and `git diff --check` passed before merge | Keep #94/#99 parked until the human answers the decision packet in `docs/memory-export-delete-decision-packet.md`; do not rebase them as busywork. |
| T119 Screenplay Studio export UX | `codex/T119-screenplay-export-ux` / PR #320 | merged | Focused Xcode export tests passed 10/10; `npm run v1:status` reported 19/25; `node scripts/pre_flight.mjs --strict` and `git diff --check` passed | No backend action. The V1 Screenplay Studio export UX gap is closed; remaining screenplay item is human manual smoke. |
| T118 build/test readiness proof | `codex/T118-v1-build-test-readiness-proof` / PR #319 | merged | macOS app build passed; macOS `themTests` passed 99/99; V1 status was 18/25 before T119 and is now superseded by 19/25 after PR #320 | No backend action. Codex should re-run full build/tests after app-visible changes before TestFlight handoff. |
| T105 Phase 6 merge refresh | `codex/T105-phase6-merge-refresh` | in-progress | PR #296 merged after Codex patched logging semantics; local `node --test backend/tests/memories_route.test.mjs` 18/18, `node --check backend/index.js`, `node scripts/pre_flight.mjs`, `git diff --check`, and backend `npm test` 1114 pass / 1 skipped / 0 fail; #298/#299 closed as out-of-lane | Open Phase 7a talk-state guard extraction from merged #293; no Phase 7b, schema-only, or coordination PRs before Phase 7a lands. |
| T104 schema-only cleanup refresh | `codex/T104-schema-pr-cleanup-refresh` / PR #297 | merged | Closed #287/#289/#291/#292/#294 as out-of-lane schema-doc-only PRs; merged #293 after patching its Phase 7a design drift; open PRs were only human/tier-3 gated | Superseded by T105; Phase 6 merged in #296. |
| T103 realtime Phase 5b.4 refresh | `codex/T103-phase5b4-merge-refresh` / PR #295 | merged | PR #288 merged after Codex patch; `node --test backend/tests/realtime_call_route.test.mjs` 18/18, `node --test scripts/pre_flight.test.mjs` 44/44, `node scripts/pre_flight.mjs`, `node --check backend/index.js`, `git diff --check`, and backend `npm test` 1096 pass / 1 skipped / 0 fail | Superseded by T104; Phase 5b is complete. |
| T102 schema-contract merge train | `codex/T102-supervisor-schema-refresh` / PR #290 | merged | Codex reviewed, patched, and merged PRs #276/#278/#281/#282/#283/#284/#285/#286 for schema accuracy; merged #277/#279 coordination tooling and #280 realtime-route tests; local `pre_flight`, focused tests, and `git diff --check` were run as applicable | Superseded by T103; Phase 5b.4 completed in PR #288. |
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
| T-build-tasks-md-anchors | `claude/T-build-tasks-md-anchors` / PR #133 | merged | `node --check scripts/build_tasks_md.mjs`; `node scripts/tasks_active_frontmatter_eval.mjs`; `git diff --check`; generator idempotency proof passed | No Claude action. AUTOGEN anchors are live. |
| T-ops-health-summary-route | `claude/T-ops-health-summary-route` / PR #134 | merged | Codex cleared the stale `do-not-merge` after Claude's rebase note; focused route test 11/11 and backend `npm test` 379 pass / 1 skipped passed locally; GitHub evaluate passed | No Claude action. Codex can consume `GET /ops/health-summary` in a lightweight diagnostics surface. |
| T60 export formats picker | `codex/T60-export-formats-picker` / PR #137 | merged | Package tests, focused export-format Xcode tests 4/4, full macOS Xcode tests 88/88, generic iOS build, coordination checks, `git diff --check`, and GitHub evaluate passed | No Claude action. The export formats discovery endpoint has an app consumer. |
| T61 post-T60 coordination refresh | `codex/T61-post-t60-coordination-refresh` / PR #138 | merged | Coordination state read/write checks, prompt printers, build-task script check/render, `git diff --check`, and GitHub evaluate passed | Historical refresh; use the current rows below for #133/#134. |
| T62 offline export-format refresh quieting | `codex/T62-studio-offline-refresh-quiet` / PR #139 | merged | Package tests, focused export refresh/menu Xcode tests 3/3, full macOS Xcode tests 89/89, generic iOS build, coordination checks, `git diff --check`, and GitHub evaluate passed | No Claude action. This keeps T60's backend format discovery, but auto-refresh is quiet during XCTest/offline launches and manual Refresh Formats still reports errors. |
| T63 post-T62 coordination refresh | `codex/T63-post-t62-coordination-refresh` / PR #140 | merged | PR #133/#134 status recheck, coordination state read, prompt printers, build-task script check/render, and `git diff --check` passed | Historical refresh; use the current rows below for #133/#134. |
| T64 session-evolution launch quieting | `codex/T64-session-evolution-quiet` / PR #146 | merged | Package tests, focused policy/export Xcode tests 3/3, full macOS Xcode tests 90/90, and generic iOS build passed; GitHub evaluate passed | No Claude action. This extends offline/XCTest quieting beyond export-format discovery to automatic session evolution, health/hydration, auth-token, history, project-outline, and navigator launch probes. |
| T65 post-T64 coordination refresh | `codex/T65-post-t64-coordination-refresh` / PR #147 | merged | PR #133/#134 status recheck, coordination state read, prompt printers, build-task script check/render, `git diff --check`, and GitHub evaluate passed | Historical refresh; use the current rows below for #133/#134. |
| T-prompt-assembly-block-signal-cap-eval | `claude/T-prompt-assembly-block-signal-cap-eval` / PR #141 | merged | Codex diff review; GitHub evaluate passed; Claude reported direct eval 11/11 and backend `npm test` 368 pass / 1 skipped | No Claude action. The block-signal prompt-size eval is merged. |
| T-known-domains-startup-check | `claude/T-known-domains-startup-check` / PR #142 | merged | `node --test backend/tests/known_domains_startup_check.test.mjs` passed | No Claude action. |
| T-decisions-queue-fixture-template | `claude/T-decisions-queue-fixture-template` / PR #143 | merged | Codex diff review; GitHub evaluate passed | No Claude action. Decisions queue template is merged. |
| T-coordination-state-cli-validate | `claude/T-coordination-state-cli-validate` / PR #144 | merged | Codex diff review; GitHub evaluate passed; Claude reported validate command and node test pass | No Claude action. Coordination state now has a `validate` subcommand. |
| T-codex-inbox-refresh-round11 | `claude/T-codex-inbox-refresh-round11` / PR #145 | closed | Supervisor close; conflicting inbox-only refresh superseded by current coordination docs | No Claude action. |
| T66 Claude PR triage refresh | `codex/T66-refresh-after-claude-pr-triage` / PR #149 | merged | PR #141/#143/#144 merges, PR #142 block, PR #145 close, coordination state validate/read, prompt printers, task generator, `git diff --check`, and GitHub evaluate passed | Claude should follow the refreshed blockers in `docs/coordination.json`. |
| T-ops-routes-list-route | `claude/T-ops-routes-list-route` / PR #148 | merged | `node --test backend/tests/ops_routes_list_route.test.mjs` passed | No Claude action. `GET /ops/routes` is ready for Codex diagnostics work. |
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
| T71 agent throughput protocol | `codex/T71-agent-throughput` / PR #167 | merged | `agent_next` script/tests, throughput protocol docs, prompt updates, coordination-state validation, and GitHub evaluate passed | Claude should use `node scripts/agent_next.mjs --role=claude` as the first next-action command and stop opening net-new backend work while over the WIP limit. |
| T72 supervisor merge-train refresh | `codex/T72-batch-refresh` / PR #174 | merged | Coordination validation, `agent_next` commands, task-frontmatter checks, task stats, task generation, `agent_next` tests, and `git diff --check` passed | Claude should run `node scripts/agent_next.mjs --role=claude --limit=10` and clear #163/#164/#161/#166/#159/#171 first. |
| T-screenplay-import-fountain | `claude/T-screenplay-import-fountain` / PR #87 | merged | Focused Fountain import tests and backend `npm test` passed | Consumed by T73 Studio Import Script surface. |
| T73 iOS Fountain import | `codex/T73-ios-fountain-import` / PR #176 | merged | Focused backend-client Xcode import test passed; broader app verification recorded in the PR | No Claude action. PR #87 is no longer awaiting iOS consumption. |
| T74 ops route diagnostics | `codex/T74-ops-routes-diagnostics` / PR #178 | merged | Typed `/ops/routes` client, support-summary/debug-bundle route manifest diagnostics, focused Xcode tests, full macOS tests, and generic iOS build passed | No Claude action. PR #148 is no longer awaiting iOS consumption. |
| T75 talk-turn rate-limit retry | `codex/T75-talk-turn-rate-limit-retry` / PR #179 | merged | Typed iOS rate-limit notice, transient saved-response retry banner, focused Xcode tests, full macOS tests, ScreenplayStudio package tests, and generic iOS build passed | No Claude action. PR #170 is no longer awaiting iOS consumption. |
| T-agent-events-jsonl-live-lane | `claude/T-agent-events-jsonl-live-lane` / PR #175 | merged | Codex supervisor comment; GitHub evaluate passed; local `node --test scripts/agent_event.test.mjs`, tail smoke, and task-frontmatter eval passed | Agents should read `node scripts/agent_event.mjs tail --n=20` after `agent_next` and append transition events as they work. |
| T-pre-flight-self-check-script | `claude/T-pre-flight-self-check-script` / PR #177 | merged | Codex supervisor comment; GitHub evaluate passed; local `node --test scripts/pre_flight.test.mjs`, warn-mode real-repo run, and task-frontmatter eval passed | Claude should run `node scripts/pre_flight.mjs` before opening backend/script PRs; current findings are warn-only. |
| T-coord-refresh-clear-148-142-133-87-90 | `claude/T-coord-refresh-clear-148-142-133-87-90` / PR #173 | closed | Closed by Codex as stale after newer merge-train state landed | No Claude action; avoid reopening stale inbox-only refreshes. |
| T76 efficiency merge refresh | `codex/T76-efficiency-merge-refresh` / PR #182 | merged | Coordination validation, `agent_next`, task-frontmatter/stats, task generation, agent-event tail/stats, and diff check passed | No Claude action except use `agent_next`, `agent_event tail`, and `pre_flight` before new work. |
| T-pre-flight-outbox-console-cleanup | `claude/T-pre-flight-outbox-console-cleanup` / PR #180 | merged | Codex supervisor comment; GitHub evaluate passed; outbox tests 7/7 passed; merge-result `pre_flight` dropped console-log findings from 6 to 0 | Remaining pre-flight findings are the two route-parser items. |
| T-decompose-backend-index | `claude/T-decompose-backend-index` / PR #181 | merged | Codex supervisor spec approval; GitHub evaluate passed; task-frontmatter/build-tasks/diff checks passed after merge-result verification | Spec approved with Codex decisions. Phase 0 #183 landed as a one-off exception; no further decomposition phases until Codex assigns them. |
| T77 post-efficiency refresh | `codex/T77-post-efficiency-prs-refresh` / PR #184 | merged | Coordination validation, `agent_next`, task-frontmatter/stats, task generation, agent-event tail/stats, and diff check passed | No Claude action; keep blocker-first queue. |
| T-decompose-phase0-health-route | `claude/T-decompose-phase0-health-route` / PR #183 | merged | Codex supervisor review; GitHub evaluate passed; local focused health route tests passed 9/9; backend `npm test` passed 452 pass / 1 skipped; task-frontmatter and diff checks passed | No further decomposition phases until Codex assigns them; return to clearing #163/#164/#161/#166/#159/#171. |
| T78 PR #183 refresh | `codex/T78-refresh-after-pr183` / PR #185 | merged | Coordination validation, `agent_next`, task-frontmatter/stats, task generation, agent-event tail/stats, and diff check passed | No Claude action; use `agent_next` and clear blockers before more decomposition work. |
| T79 second-pass efficiency protocol | `codex/T79-second-pass-efficiency` / PR #186 | merged | `agent_next`, `coordination_state`, and `pre_flight` script tests passed; coordination validation passed; task-frontmatter/stats/generator and diff checks passed | Claude should use `agent_next` for recent events, run `pre_flight` before PRs, use structured blocker metadata, and spec multi-PR features before implementation. |
| T-archetype-engine-canon-eval | `claude/T-archetype-engine-canon-eval` / PR #160 | merged | `npm run eval:archetype-canon` passed | No Claude action. |
| T-creative-memory-store-eviction-eval | `claude/T-creative-memory-store-eviction-eval` / PR #168 | merged | `npm run eval:creative-memory-eviction` passed | No Claude action. |
| T-coordination-state-mutate-eval | `claude/T-coordination-state-mutate-eval` / PR #169 | merged | `node scripts/coordination_state_mutate_eval.mjs`; `node --test scripts/coordination_state_mutate_eval.test.mjs` passed | No Claude action. |
| T-talk-turn-rate-limit-route | `claude/T-talk-turn-rate-limit-route` / PR #170 | merged | Focused route tests and backend `npm test` passed | Consumed by T75 iOS retry affordance. |
| T-ops-health-summary-eval | `claude/T-ops-health-summary-eval` / PR #159 | blocked | Codex review found the eval injects local expected features instead of reading the production-mounted feature source | Refactor the proof or narrow the contract, then rerun eval/backend tests. |
| T-trait-library-canon-eval | `claude/T-trait-library-canon-eval` / PR #161 | blocked | Codex review found duplicate canonical trait labels can pass | Add duplicate/length assertions and fix any underlying duplicate. |
| T-twist-engine-canon-eval | `claude/T-twist-engine-canon-eval` / PR #163 | blocked | Conflicting after PR #160 merged | Rebase on current `main`, keep behavior, rerun focused eval/backend tests. |
| T-block-detector-canon-eval | `claude/T-block-detector-canon-eval` / PR #164 | blocked | Conflicting after PR #160 merged | Rebase on current `main`, keep behavior, rerun focused eval/backend tests. |
| T-format-linter-rules-canon-eval | `claude/T-format-linter-rules-canon-eval` / PR #166 | blocked | Codex review found the eval only exercises part of the canonical 8-rule set | Add a registry/export assertion or fixtures covering all 8 rules. |
| T-eval-gate-add-canon-evals | `claude/T-eval-gate-add-canon-evals` / PR #171 | blocked | Umbrella eval list is stale while canon eval PRs are still landing | Update after the canon-eval stack settles. |
| Stale inbox refreshes | PR #165 / PR #172 | closed | Supervisor closed both stale inbox-only refresh PRs | No Claude action. T72 supersedes them. |
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
| Blocked Claude PRs | Use `docs/coordination.json` for the current blocked/open PR list. Any `do-not-merge`, `needs-human`, or tier-3 item stays unmerged until its blocker is cleared. Current fresh blockers: #159 production-source eval proof, #161 duplicate canonical trait labels, #163/#164 rebase after #160, #166 full 8-rule format-linter proof, #171 stale eval umbrella, plus the older #88/#90/#92/#97/#99/#100/#104/#105/#107/#110/#111/#112/#115/#117/#124/#127 queue. |

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
