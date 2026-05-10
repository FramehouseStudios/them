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
unblocks or affects a Claude-owned PR, Codex should also leave a short GitHub PR
comment on that Claude PR with the relevant ledger entry.

Claude should read this file before starting or resuming backend work. For the
latest status, run `git fetch origin` and read the version on `main` plus any
open Codex PR branch that is relevant to the handoff.

## Current Codex Supervisor State

| Item | Branch / PR | Status | Verification | Claude action |
| --- | --- | --- | --- | --- |
| T04 canonical io.them name | `codex/T04-io-them-canonical-name` / PR #38 | merged on `main`; `TASKS.md` still needs ledger cleanup from a follow-up | PR #38 merged; no new action in this ledger PR | Treat `io.them` as the canonical user-visible name per D001. |
| T10 design system | `codex/T10-design-system` / PR #37 | open, merge conflict reported by GitHub | PR body reports Swift package tests, macOS tests, and generic iOS build | Wait for Codex conflict-resolution pass before building on top of these token files. |
| T14 G3 snapshot triage | `codex/T14-g3-snapshot-triage` / PR #43 | open and mergeable | Generic iOS build passed; macOS `themTests` passed 45/45 | Use `docs/T14-g3-snapshot-triage.md`; do not mine `codex-save-primary-folder-20260420` directly. |
| T24 iOS prompt builder consolidation | `codex/T24-prompt-builder-consolidation` / PR #40 | open, merge conflict reported by GitHub | PR body reports iOS build and macOS tests | Wait for Codex conflict-resolution pass before assuming the iOS prompt path is on main. |
| T25 additional craft frameworks | `codex/T25-additional-craft-frameworks` / PR #41 | open and mergeable | PR body reports backend and app verification | Claude can rely on Story Circle and Hero's Journey framework data after this merges. |
| T26 Craft tab polish | `codex/T26-craft-tab-polish` / PR #42 | open and mergeable | Generic iOS build passed; macOS `themTests` passed 45/45 | Backend endpoints already consumed; no Claude action unless endpoint shape changes. |
| T27 live handoff ledger | `codex/T27-claude-live-handoff` / PR #44 | ready for review | `git diff --check`, generic iOS build, and macOS `themTests` 45/45 passed | After merge, read this file as the standing Codex completion feed. |

## Claude Watch List

| Claude PR | Current Codex note |
| --- | --- |
| PR #26, T08w triggers | Still merge-conflicted. T11 remains blocked until the T08 memory/prompt path is settled. |
| PR #31, T23 craft completeness gate | Still merge-conflicted. Codex Craft UI PRs should not assume RC gate behavior until this lands. |
| PR #32, T07a outbox snapshots | Still merge-conflicted. Persistence follow-ups should coordinate through T07 docs. |
| PR #33, T07 eval gate | Reported unstable by GitHub. Claude owns the secret-backed gate path. |

## Recurring Codex Rule

When Codex finishes a task, this file gets a new row before the PR is opened or
before the final response if no PR is needed. That makes the status visible to
Claude in GitHub and in local worktrees without relying on chat history.
