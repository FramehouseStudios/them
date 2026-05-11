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
node scripts/print_claude_prompt.mjs   # what to tell Claude
node scripts/print_codex_prompt.mjs    # what to tell Codex
node scripts/coordination_state.mjs read
```

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
| T44 creative-memory export triage | `codex/T44-creative-memory-export-triage` | in-progress | Coordination script checks pending | Claude PR #94 is human-gated because full memory export touches privacy/data-control. |



## Claude Watch List

| Claude item | Current Codex note |
| --- | --- |
| PR #33, T07 eval gate | Open and red for the expected human-owned blocker: repository Actions secret `OPENAI_API_KEY` is malformed or not the literal OpenAI key value. Do not weaken eval gates. |
| T07-cutover | Remains blocked until PR #33 is truly green against Postgres. |
| Blocked Claude PRs | Use `docs/coordination.json` for the current blocked/open PR list. Any `do-not-merge`, `needs-human`, or tier-3 item stays unmerged until its blocker is cleared. |

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
