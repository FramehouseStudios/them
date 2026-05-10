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
| T04 canonical io.them name | `codex/T04-io-them-canonical-name` / PR #38 | merged on `main`; `TASKS.md` still needs ledger cleanup from a follow-up | PR #38 merged; no new action in this ledger PR | Treat `io.them` as the canonical user-visible name per D001. |
| T10 design system | `codex/T10-design-system` / PR #37 | open, clean after Codex merge-conflict pass | `git diff --check`; Swift package tests; iOS build; macOS `themTests` 46/46 | Safe to review. Build on design tokens after #37 merges. |
| T14 G3 snapshot triage | `codex/T14-g3-snapshot-triage` / PR #43 | open and mergeable | Generic iOS build passed; macOS `themTests` passed 45/45 | Use `docs/T14-g3-snapshot-triage.md`; do not mine `codex-save-primary-folder-20260420` directly. |
| T24 iOS prompt builder consolidation | `codex/T24-prompt-builder-consolidation` / PR #40 | open, clean after Codex merge-conflict pass | `git diff --check`; backend `npm test` 159 pass / 1 skipped; iOS build; macOS `themTests` 48/48 | Safe to review. T11 can consume the single iOS prompt path after #40 merges. |
| T25 additional craft frameworks | `codex/T25-additional-craft-frameworks` / PR #41 | open and mergeable | PR body reports backend and app verification | Claude can rely on Story Circle and Hero\x27s Journey framework data after this merges. |
| T26 Craft tab polish | `codex/T26-craft-tab-polish` / PR #42 | open and mergeable | Generic iOS build passed; macOS `themTests` passed 45/45 | Backend endpoints already consumed; no Claude action unless endpoint shape changes. |
| T27 live handoff ledger | `codex/T27-claude-live-handoff` / PR #44 | ready for review; updated with real-time supervisor rule | `git diff --check`, generic iOS build, and macOS `themTests` 45/45 passed before this doc-only update | After merge, read this file as the standing Codex completion feed. |
| T28 iOS format lint cards | `codex/T28-format-lint-ios` / PR #45 | open and clean | `git diff --check`; `swift test --package-path Packages/ScreenplayStudio`; focused format-lint client test; focused craft model tests; generic iOS build; macOS `themTests` 48/48 | Treat PR #45 as the iOS consumer for the merged format-linter backend. Format warnings now surface as non-blocking Studio cards with page/line anchors. |

## Claude Watch List

| Claude PR | Current Codex note |
| --- | --- |
| PR #26, T08w triggers | Clean after Codex conflict-resolution pass. Backend `npm test` passed 164 pass / 1 skipped. Codex left a supervisor update comment. |
| PR #31, T23 craft completeness gate | Clean after Codex conflict-resolution pass. `node --check scripts/check_craft_completeness.mjs` and backend `npm test` passed 161 pass / 1 skipped. Codex left a supervisor update comment. |
| PR #32, T07a outbox snapshots | Clean after Codex conflict-resolution pass. `node --check backend/index.js`, `node --check backend/lib/outbox_snapshotter.js`, and backend `npm test` passed 163 pass / 1 skipped. Codex left a supervisor update comment. |
| PR #33, T07 eval gate | Code conflicts resolved, but the check is intentionally unstable until the repository Actions secret `OPENAI_API_KEY` is replaced with the literal OpenAI key value. Commit `d36c05b` adds fast-fail diagnosis for malformed secrets. Codex left supervisor update comments with the exact blocker. |

## Recurring Codex Rule

When Codex finishes a task, this file gets a new row before the PR is opened or
before the final response if no PR is needed. When Codex touches a Claude-owned
PR, Codex also comments on that PR in real time. That gives Claude both the live
notification and the durable repo-visible history without relying on chat memory.
