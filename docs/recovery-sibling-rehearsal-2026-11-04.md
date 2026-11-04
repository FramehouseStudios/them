# Recovery sibling rehearsal — 2026-11-04

This local preserving merge combines cleared-page rehearsal `e4d228c` (including original #985) and insights rehearsal `a7ad352` (including original #983 and #984 histories). It does not merge any PR into main. The conflict resolution keeps exact-byte dirty tracking and retains both the cleared-page and authenticated save-fixture regressions; #984's dedicated draft-insights client remains the single implementation.

Proof on the combined tree:

- Signed `themTests` on an erased task-owned iPhone simulator: 1,456 passed, 0 failed, 0 skipped; `/private/tmp/them-t1265-full-20261104.xcresult`.
- Signed focused save-drain, outbox, origin and recovery checks: 321 passed, 0 failed; `/private/tmp/them-t1265-focused-20261104.xcresult`.
- Local authenticated fixture: cleared-page save/relaunch passed; `/private/tmp/them-t1265-clear-ui-20261104.log`.
- Local fixture: conflict choice survived relaunch and resolved; `/private/tmp/them-t1265-conflict-ui-20261104.log`.
- Backend files are byte-identical to `e4d228c`, whose Node 20 full suite passed 3,038, failed 0, skipped 5; this is attributed parent proof, not a new run.
- macOS scaffold unsigned build, D009 gate and staged `git diff --check` passed.

Not covered: hosted gate for this combined tree, independent review, live model, production, physical iPhone or outside-app export. Original PR ordering and review protections remain in force.
