# Backend Backlog

This is a project-owned backlog reference for backend and launch-hardening work. The filename is retained for compatibility with existing scripts, but the file is not a live instruction to wait for or invoke another assistant lane.

Codex may use this file when it needs a compact list of backend tasks that remain useful to the app. New work should be ported into a fresh `codex/` branch, verified there, and reviewed as project-owned work.

## Current Command

Focus on the live app first:

1. Fix user-visible broken UI, disconnected buttons, auth/session confusion, and release blockers before opening broad backend work.
2. Preserve already-merged security fixes on `main`, especially request-log redaction and account/project isolation.
3. Do not merge stale helper branches wholesale. Port only the smallest useful implementation slices into a new branch.
4. Keep release-only secrets and signing material out of git.

## Landed This Week (2026-09-05)

- #417 sprint security rescue: craft route enumeration, prompt-wire twist scoping, outbox per-user rows, timing-safe app token.
- #416, #418, #421: live typing between devices with two-device smoke and resilience fixes.
- #419: Quality Gate writer-loop de-flake.
- #424 (open, human merge): boot-level IAP fail-closed, `knowledge_cards.json` shipped in the image (production had run RAG on the 30 fallback cards), `MUSE_MODEL` test isolation and Render knob.

Priority 2 below still stands for provider retry, migration-runner safety, spend caps, and realtime metering. The migration runner and Render predeploy landed via #414.

## Backend Work Codex Actually Wants Next

These are ordered by app-visible V1 impact, not backend curiosity.

| Priority | Request | Why it matters | Expected shape |
| --- | --- | --- | --- |
| 1 | Manual smoke blockers | The app cannot ship until Talk, Studio, Memory, Realtime, auth, and release readiness are usable from the real app path. | Reproduce the exact failure, fix the smallest root cause, and rerun the focused smoke/build/test. |
| 2 | Launch-safety hardening | Remaining useful unmerged ideas are provider retry, migration-runner safety, durable provider spend caps, and realtime usage metering. | Port one safety slice at a time into a `codex/` branch; rebase on current `main`; run focused backend tests plus `npm test`; do not carry stale branch metadata. |
| 3 | Auto-merge and CI safety | GitHub automation must not merge risky Docker, auth, signing, release, or workflow changes as routine Tier 1 work. | Add/verify precise risky-path guards and tests before enabling or trusting auto-merge. |

## Porting rules

- One branch per task.
- One risk class per PR.
- No direct `main` pushes.
- No production secrets in repo files, screenshots, logs, or test fixtures.
- Auth, privacy, deletion, export, signing, and production deployment changes need explicit human clearance.
- Every visible user action must either work, explain why it is unavailable, or be removed.
