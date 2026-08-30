# Project Live Handoff

This is the current repo-facing handoff for io.them. Historical helper-lane logs have been collapsed into project-owned status so future work starts from the real app, the current repository state, and the active GitHub queue.

## Current State

- Default branch: `main` at `4a5b9a2` during the 2026-08-30 cleanup audit.
- Active cleanup branch: `codex/T-project-ownership-cleanup`.
- Open GitHub PRs found during the read-only audit:
  - #374 `codex/T-v1-human-clearance` — GitHub reports the PR clean and checks green, but the local V1 human-clearance worktree still contains additional uncommitted UI fixes and two focused UI failures.
  - #370 `codex/T-agent-operating-system-v1` — dirty and should not be merged as-is without a fresh scope decision.
- Literal cleanup target: no assistant-branded filenames or contents should remain in the working tree after this branch’s verification pass.

## Useful Preserved Work

- Request-log redaction is already on `main` through the current merged security line.
- Account and screenplay-project isolation is already on `main`.
- The V1 continuity/auth stack is represented by the current V1 human-clearance branch line rather than by older standalone branches.
- Remaining launch-safety hardening ideas are backlog only: provider retry, migration-runner safety, durable provider spend caps, and realtime usage metering.

## Current Rules

1. New implementation work uses `codex/<task-id>-<short-name>` branches.
2. Do not merge stale assistant-branded branches wholesale.
3. Port useful old work as small, reviewed, project-owned slices.
4. Keep direct `main` pushes off-limits during normal work.
5. Keep release secrets, signing material, provider keys, app tokens, and production URLs out of git.
6. Do not delete remote branches, close many PRs, change repo settings, or rewrite history without explicit human clearance.

## GitHub Front Door

The cleanup branch now carries a recruiter-quality README with:

- a fast product and engineering overview;
- a system architecture diagram and technology map;
- specific reliability, identity, privacy, and AI-evaluation evidence;
- real local setup and verification commands;
- an honest release-candidate boundary.

The GitHub repository metadata was updated on 2026-08-30 to:

> Voice-first AI screenplay studio for iOS and macOS, built with SwiftUI, Node.js, PostgreSQL, and realtime AI.

Topics now cover AI, screenwriting, filmmaking, Swift/SwiftUI, iOS, macOS, Node.js, PostgreSQL, realtime systems, and creative tools. The homepage remains blank until a verified public product URL exists.

## Human Clearance Needed

Before GitHub cleanup can be completed, a human must approve:

1. The cleanup branch/PR.
2. The exact retired remote branch deletion list.
3. Release credentials and production configuration values.
4. Manual device smoke clearance for Talk, Studio, Memory, Realtime, auth, export, and Launch Doctor.

## Next Project-Owned Work

1. Finish and review this ownership cleanup branch.
2. Return to the V1 human-clearance worktree and fix the remaining focused UI failures.
3. Port launch-safety hardening one slice at a time only after V1 UI and release blockers are not masking the core product path.
