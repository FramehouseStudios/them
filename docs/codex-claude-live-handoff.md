# Codex to Claude Live Handoff

Status source for Claude: this file is the repo-visible Codex supervisor ledger.
Codex updates it when a Codex-owned task is completed, materially advanced, or
opened as a PR.

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
GitHub PR comment on that Claude PR with the relevant status. Until this ledger
is merged to `main`, those PR comments are the real-time channel and this branch
is the durable audit trail.

Claude should read this file before starting or resuming backend work. For the
latest status, run `git fetch origin` and read the version on `main` plus any
open Codex PR branch that is relevant to the handoff.

## Real-Time Supervisor Signal

Codex uses two live channels for Claude-facing status:

1. The durable ledger row in this file for completed or materially advanced work.
2. A GitHub PR comment beginning with `Codex supervisor update` on every
   Claude-owned PR that Codex touches, unblocks, or diagnoses.

If a task is blocked by repository configuration or an external service, Codex
must name the exact blocker, the last verification run, and the next required
human or Claude action. Codex should not paper over secret, quota, or environment
failures by weakening the gate.

## Current Codex Supervisor State

| Item | Branch / PR | Status | Verification | Claude action |
| --- | --- | --- | --- | --- |
| T04 canonical io.them name | `codex/T04-io-them-canonical-name` / PR #38 | merged on `main` | PR #38 merged | Treat `io.them` as canonical user-visible name per D001. |
| T10 design system | `codex/T10-design-system` / PR #37 | merged on `main` | PR #37 merged; prior iOS build and tests green | Use `IOThemColors`, `IOThemTypography`, and `IOThemSpacing` for app-facing UI assumptions. |
| T11 magic-moment onboarding | `codex/T11-magic-moment-onboarding` / PR #47 | merged on `main` | iOS simulator build passed; iOS simulator `themTests` passed 50/50 before merge | T12 is unblocked; real iPhone <=60s human validation remains product acceptance. |
| T12 perceived-speed primitives | `codex/T12-perceived-speed` | ready for Codex | Not started in this cleanup PR | No Claude action. |
| T13-client realtime supplier selection | `codex/T13-realtime-supplier-client` / PR #49 | merged on `main` | realtime supplier backend tests 16/16; focused iOS client tests 8/8 | Future supplier work should preserve the merged request/response contract. |
| T14 G3 snapshot triage | `codex/T14-g3-snapshot-triage` / PR #43 | merged on `main` | Generic iOS build passed before merge | Use `docs/T14-g3-snapshot-triage.md`; do not mine `codex-save-primary-folder-20260420` directly. |
| T24 iOS prompt builder consolidation | `codex/T24-prompt-builder-consolidation` / PR #40 | merged on `main` | backend `npm test`, iOS build, and `themTests` were green in PR verification | Backend prompt changes should keep `/screenplay/prompt/build` compatible. |
| T25 additional craft frameworks | `codex/T25-additional-craft-frameworks` / PR #41 | merged on `main` | backend craft tests 41/41; backend `npm test` 183 pass / 1 skipped; iOS craft tests 5/5 before merge | Story Circle and Hero's Journey framework data are available on `main`. |
| T26 Craft tab polish | `codex/T26-craft-tab-polish` / PR #42 | merged on `main` | backend craft/schema tests 36/36; focused iOS craft tests 13/13 after simulator retry | Backend endpoints already consumed; preserve shape for framework, report, override, and format-lint endpoints. |
| T27 live handoff ledger | `codex/T27-claude-live-handoff` / PR #44 | merged on `main` | PR #44 merged | Read this file before resuming backend work; Codex updates it for completed/materially advanced tasks. |
| T28 iOS format lint cards | `codex/T28-format-lint-ios` / PR #45 | merged on `main` | Swift package and app tests were green in PR verification | Format warnings surface as non-blocking Studio cards with page/line anchors. |
| T29 iOS reply-side character mentions | `codex/T-ios-reply-character-mentions` / PR #50 | merged on `main` | Swift parse; focused `StudioThreadViewStateSupportTests` 7/7; full iOS `themTests` 53/53 before merge | T30 is merged, so Codex can enable `memory.reply_character_mentions_enabled` in a follow-up. |
| T30 `/memory/record-character-mention` endpoint | `claude/T30-record-character-mention-endpoint` / PR #51 | merged on `main` | backend `npm test` passed 195 pass / 1 skipped after Codex merge pass | No further Claude action; endpoint unblocks iOS flag enablement. |
| T31 coordination status cleanup | `codex/T31-coordination-status-cleanup` | review | Markdown checks pass; PR ready. | Claude has been notified on PR #48 and PR #33. |

## Claude Watch List

| Claude PR | Current Codex note |
| --- | --- |
| PR #48, T-logline-distiller | Open and currently CONFLICTING against latest `main`. Codex left a supervisor update requesting Claude refresh `claude/T-logline-distiller`, resolve conflicts, rerun `cd backend && npm test`, and push it back to review-ready. This is the highest-priority Claude all-day task because it unlocks the iOS logline rail. |
| PR #33, T07 eval gate | Open and currently CONFLICTING. Still intentionally blocked until the repository Actions secret `OPENAI_API_KEY` is replaced with the literal OpenAI key value. Claude should resolve conflicts/document the blocker only; do not weaken eval gates. |
| T-block-detector | Ready for Claude once PR #48 is refreshed or blocked: add a TASKS claim, backend-only branch, tests, and docs for writer-block signals from `/talk` telemetry and scene-attempt gaps. |
| T-trait-library | Ready for Claude after block detector: persistence-backed per-character trait/voice inventory for prompt assembly and future iOS surfaces. |
| T-twist-engine | Ready for Claude after trait library: beat-aware reversal suggestions using craft classifications/framework data. |

## Claude Supervisor Updates

| Claude PR | Status |
| --- | --- |
| T30, `/memory/record-character-mention` endpoint / PR #51 | Merged on `main` as PR #51. Codex merge pass verified `node --check backend/index.js`, `node --check backend/lib/memory_character_mention_route.js`, targeted memory tests 20/20, and full backend `npm test` 195 pass / 1 skipped. Endpoint persists rendered screenplay character cues through `creativeMemoryStore.recordCharacterMention(...)` and matches the iOS receipt contract. |
| T-logline-distiller / PR #48 | Open and conflicting. Claude should refresh with latest `main`, preserve the three logline endpoints and `craft_loglines` persistence domain, rerun backend tests, and report back when review-ready. |
| T07 eval gate / PR #33 | Open and conflicting. The remaining functional blocker is still human-owned: malformed GitHub Actions `OPENAI_API_KEY` secret. Claude should not weaken the gate. |

## Recurring Codex Rule

When Codex finishes a task, this file gets a new row before the PR is opened or
before the final response if no PR is needed. When Codex touches a Claude-owned
PR, Codex also comments on that PR in real time. That gives Claude both the live
notification and the durable repo-visible history without relying on chat memory.
