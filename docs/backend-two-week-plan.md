# Backend Launch-Hardening Backlog

This file replaces the old two-week helper plan. It is no longer a schedule and no longer assigns work to a separate assistant lane.

## Current Priority

Fix app-visible V1 blockers first. Backend hardening should not distract from broken Talk, Studio, Memory, Realtime, auth, release, or manual-smoke flows.

## Useful Work To Preserve

Port these ideas only as small project-owned PRs, with fresh tests on current `main`:

1. Migration-runner safety for fresh Postgres and repeatable deploys.
2. Bounded provider retry that does not hide model/key/config failures.
3. Durable provider spend caps backed by storage, not process memory.
4. Realtime usage/metering that can support launch diagnostics and cost review.
5. IDOR/account-isolation coverage where routes expose user-owned records.

## Porting Rules

- One branch per safety slice.
- One risk class per PR.
- Rebase on current `main` before implementation.
- Run focused backend tests plus `npm test` from `backend/`.
- Update schema docs or release proof only when the behavior actually changes.
- Do not carry old branch ownership metadata into new commits.

## Not In Scope

- Bulk merging old helper branches.
- Reopening stale coordination-only PRs.
- Adding placeholder provider systems without launch evidence.
- Hiding provider/model errors behind silent fallbacks.
