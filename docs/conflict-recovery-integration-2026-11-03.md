# Conflict recovery integration checkpoint — 2026-11-03

Local merge `c609215` preserves original editor recovery parent `39ca7c3` and save-slot foundation parent `909f9e9`. It retains parked conflict authority, rolls back in-memory queue changes when persistence fails, scopes saved baselines by account and project, and uses exact UTF-8 comparisons for recovery and save coalescing.

Proof on the merge tree before this documentation-only commit:

- Signed `themTests` on erased task-owned iPhone simulator: 716 passed, 0 failed, 0 skipped. Result: `/private/tmp/them-t1259-full-units-20261103.xcresult`.
- Signed seeded conflict-choice UI tests: 2 passed, 0 failed, 0 skipped. Result: `/private/tmp/them-t1259-conflict-ui-20261103.xcresult`.
- `node scripts/check_god_files.mjs` and both staged and unstaged `git diff --check`: passed.

Not covered: physical-device behavior, production backend, live model output, or a real network conflict in the two seeded UI checks. The earlier `ScreenplayCommittedDraftAdoptionPolicy` on this branch still normalizes draft text and can misclassify a whitespace-only edit. Original PR #982 at `94b9d0a` changes this to exact UTF-8 comparisons. Integrate and verify that original history at the correct boundary after its hosted gate completes; do not call this checkpoint complete custody protection.
