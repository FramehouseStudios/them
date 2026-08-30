# Codex Inbox

This file is a compact project-owned status screen for Codex. It is not an instruction to wait for another assistant lane.

## Current Snapshot

- Default branch: `main` at `4a5b9a2` during the 2026-08-30 cleanup audit.
- Active cleanup branch: `codex/T-project-ownership-cleanup`.
- Open GitHub PRs found during the read-only audit:
  - #374 `codex/T-v1-human-clearance` — clean and CI-green on GitHub as of 2026-08-29, with additional local UI fixes still pending in its worktree.
  - #370 `codex/T-agent-operating-system-v1` — dirty and likely superseded by this cleanup direction unless intentionally rebased and narrowed.
- Current cleanup rule: keep useful shipped work, port useful unmerged ideas into clean `codex/` branches, and delete stale assistant-specific process once humans clear the exact destructive GitHub actions.

## Current Open Legacy Helper PRs

| PR | Task | Tier | Status | Codex action |
| --- | --- | --- | --- | --- |
| none | none | — | — | Keep historical helper-lane rows as archived context only. Port useful work into fresh `codex/` branches. |

## Endpoint Contracts Ready to Consume

- Use `docs/schemas/` for backend request/response contracts.
- Do not treat historical ownership metadata as a live assignment.
- Recheck the backend tests and smoke scripts before wiring app UI to any route that was not already covered by current `main`.

## Blockers Affecting Codex

- Release readiness still needs human-owned Apple Team ID/signing, production backend URL, production app token, provider credentials, and privacy/App Store answers.
- Manual V1 smoke and Launch Doctor clearance still need human/device sign-off.
- Retired remote branch cleanup needs human clearance after the exact branch list is accepted.
- Unmerged launch-safety ideas from old PR #364 should be ported one slice at a time; do not merge stale branch history wholesale.

## External Decisions Needed

- none.

## Current Command

Finish this cleanup branch, open a focused PR, and then request human clearance for destructive remote-branch cleanup and GitHub settings updates.
