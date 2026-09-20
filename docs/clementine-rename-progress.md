# Clementine runtime rename — verification status

Branch: codex/T-clementine-runtime-rename, base main 647e01fc.
Identity decision: #630. No deployment or phone acceptance claimed.
See clementine-runtime-compatibility.md for scope, migration and rollback limits.

## Current proof

- Full backend: 2,747 passed, 0 failed, 2 skipped (2,749 total), 47.24 seconds.
  Log: /tmp/them-rename-final-backend.log.
- Signed iOS, erased dedicated simulator: 619 passed, 0 failed.
  Log: /tmp/them-clementine-rename-ios-full.log.
- Focused signed canonical/legacy header test: 1 passed.
  Log: /tmp/them-clementine-header-ios-async.log.
- Real authenticated restart test verifies legacy history, compatibility baseline,
  simulated legacy-only write, anonymous access denial, and separate same-ID
  projects under different owners. Log: /tmp/them-presence-write-isolation.log.
- Diff check and D009 pass; index.js shrank by 60 lines.
- Mac Scaffold Release build is in progress; no result yet.
- #620 hosted gate cannot start: GitHub account billing lock. No merges.

## Findings resolved during verification

- Real persistence test initially exposed history discarded by the production
  normalizer. Extracted it with all original dependencies and preserved presence.
- Two brittle tests required an exact index.js line count. They now enforce
  the existing ceiling; the dedicated D009 gate is unchanged.
- The initial synchronous Swift parser test crashed in BackendClient deinit
  through Swift TaskLocal cleanup. Matching existing async XCTest usage resolved
  this test execution failure; no general production crash fix is claimed.
- One earlier full backend run failed in an unchanged realtime probe with
  UND_ERR_SOCKET. Isolated rerun and two subsequent full runs passed.
- Cross-owner POST returns 201 by existing owner-scoped creation contract, not
  404. The strengthened test checks persisted isolation rather than assuming
  a different API contract.

## Remaining

Publish for review; complete visible THEM branding separately; retain the
preservation fix in any rollback release. Live provider quality, PostgreSQL
restart, physical-phone speech/reply/saved screenplay and deployment remain
unverified. Never treat simulator unit results as those acceptance results.
