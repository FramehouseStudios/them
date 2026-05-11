# Codex to Claude Live Handoff

Status source for Claude: this file is the repo-visible Codex supervisor
ledger. Codex updates it when a Codex-owned task is completed, materially
advanced, or when Codex reviews/merges/conflict-resolves Claude work.

## Fast Path

Claude should read these files in order before starting or resuming backend
work:

1. `AGENTS.md`
2. `TASKS.md`
3. `DECISIONS.md`
4. `docs/codex-claude-live-handoff.md`
5. `docs/claude-inbox.md`

Human shortcut:

```text
Read AGENTS.md, TASKS.md, DECISIONS.md, docs/codex-claude-live-handoff.md,
then docs/claude-inbox.md. Follow the Current Command exactly.
```

To print the same compact handoff prompt from the repo:

```bash
node scripts/print_claude_prompt.mjs
```

## Update Contract

Codex must update this ledger before the final response for any completed
Codex task or conflict-resolution pass.

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
| T33 Claude command center | `codex/T33-claude-command-center` | merged | `node scripts/print_claude_prompt.mjs` passed | Claude should use `docs/claude-inbox.md` as the compact current command. |
| T34 iOS logline rail consumer | `codex/T34-ios-logline-rail` / PR #61 | merged | `swift test --package-path Packages/ScreenplayStudio`; focused logline Xcode tests; full macOS `themTests`; generic iOS build all passed | T35 consumes the block-signal endpoint next. |
| T35 iOS block-signal nudge surface | `codex/T35-block-signal-nudge` / PR #62 | merged | Focused block-signal Xcode tests passed 3/3; full macOS `themTests` passed 65/65; generic iOS build passed; `git diff --check` passed | Next iOS consumer is the character-traits side rail; Claude PRs #59 and #60 need rebase after T34/T35. |
| T36 iOS character-traits side-rail consumer | `codex/T36-ios-character-traits` / PR #68 | merged | Focused character-traits Xcode tests passed 3/3; full macOS `themTests` passed 68/68; generic iOS build passed; `git diff --check` passed | Next iOS consumer is the twist-card surface; Claude PRs #59 and #60 remain conflict-blocked until rebased over T34/T35/T36. |
| T37 iOS twist-card consumer | `codex/T37-ios-twist-cards` / PR #69 | merged | `swift test --package-path Packages/ScreenplayStudio` passed; focused twist Xcode tests passed 3/3; full macOS `themTests` passed 71/71; generic iOS build passed; `git diff --check` passed | T12 is merged; Claude PRs remain conflict-blocked until rebased over current main. |
| T12 perceived-speed primitives | `codex/T12-perceived-speed` / PR #70 | merged | Focused perceived-speed Xcode tests passed 2/2; full macOS `themTests` passed 73/73; generic iOS build passed; `git diff --check` passed | Rebase conflict-blocked Claude PRs #59, #60, #63, #64, #65, #66, and #67; PR #64 also needs the failing `auto-merge-tier1 / evaluate` check fixed without weakening gates. |

## Claude Watch List

| Claude item | Current Codex note |
| --- | --- |
| PR #33, T07 eval gate | Open and red for the expected human-owned blocker: repository Actions secret `OPENAI_API_KEY` is malformed or not the literal OpenAI key value. Do not weaken eval gates. |
| T07-cutover | Remains blocked until PR #33 is truly green against Postgres. |
| Conflict-blocked Claude PRs | PRs #59, #60, #63, #64, #65, #66, and #67 are currently conflicting against main. Rebase before new backend work; PR #64 also has a failing `auto-merge-tier1 / evaluate` check. |

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

When Codex finishes a task, this file gets a new row before the PR is opened or
before the final response if no PR is needed. When Codex touches a Claude-owned
PR, Codex also comments on that PR in real time. That gives Claude both the live
notification and the durable repo-visible history without relying on chat memory.
