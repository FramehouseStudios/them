# Original #996 — scoped recovery journal and page continuity proof

## Preserved boundary

Original #996 head: `91fd4eeb0908a8d1c947c9c23df101ece9124a41`.
Actual parent is original #994, now `a45824a2b14eab7b33c3cf7cf3d2783db38f3dbe`.
Preserving merges `ddc75c21` and `782afdc5` retain both histories. Journal
follow-up `e051bcf2` and upstream ordinary-copy fix `7911a5e3` remain ancestors.
Current runtime checkpoint: `782afdc5`.

Retained original features: verified backend isolation, explicitly unverified
legacy copies, protected journal fallback when earlier slots are occupied,
exact displaced-copy selection before live replacement, and verified initial
project receipt origin. No original work was squashed or replaced.

## Root cause and smallest correction

VERIFIED: a journal edit lease for page A survived either a remote hydrated page
B or restoration of independent page B. Subsequent native typing of B-prime
could advance A's journal lease and remove A. These real app replacement paths
retain document identity, so document identity alone cannot establish continuity.
The fresh-store reproducer checked original record identity and exact bytes.

The canonical draft boundary now ends only the in-memory journal permission on
changed hydration/restoration or a mismatch with the previous draft/base. It
leaves stored pages untouched. Contiguous native typing retains its own lease.
The independently proven upstream ordinary-copy guard is also retained.
Existing account/session, project, document and backend checks remain in place.
No parallel store, architecture or relaxed durability requirement was added.

## Failure and fixture record

- Initial journal reproducer attempt did not compile because it supplied a
  nonexistent test-helper argument. It executed no test bodies and is not
  runtime failure evidence.
- Corrected before matrix: 1 passed / 2 failed / 0 skipped. The continuous-edit
  control passed; both independent replacement cases lost the earlier record.
- First combined focused pass after the journal guard: 277 passed / 1 failed /
  0 skipped. Both new regressions passed. The remaining queued-restore fixture
  expected a verified ordinary slot while seeding an unverified legacy copy.
- That fixture now covers two real contracts: verified-origin ordinary recovery
  and untouched unverified legacy recovery with the new manual words retained
  in a scoped journal. Fresh-store checks before and after the existing debounce
  retain exact bytes, scope, base and queued request identity. The original
  safety assertions were not removed.
- Final selected cases before the latest upstream merge: 5/0/0. These are an
  earlier checkpoint, not a substitute for the current full suite below.
- Negative export-warning cases explicitly fail journal protection as well as
  overflow writes. This is an injected protection failure, not measured disk
  exhaustion. Successful journal fallback remains covered independently.
- The inherited ordinary-copy regression now seeds verified-origin A and B;
  legacy behavior remains covered separately. All original copy assertions stay.

- The first writer UI command stopped before app/test launch: the fresh worktree
  had no backend dependencies (`express` was missing). Its log is retained and
  it provides zero UI proof. Matching package and lockfile hashes were checked
  against the existing task dependency cache before adding an untracked local
  symlink. The corrected run uses separate log and result paths.

## Current-source verification

Xcode26.3 (17C529), erased task-owned iPhone17 Pro/iOS26.2 (23C54), simulator
`81F0FF38-9DAD-4011-907B-357DFADD094C`. Normal signing enabled for tests.

| Check | Result |
| --- | --- |
| Full signed themTests | 1,559 passed / 0 failed / 0 skipped |
| Authenticated writer/create/save/export/relaunch UI | 1 passed / 0 failed / 0 skipped |
| Authenticated custody save/lost-ack/reopen UI | 1 passed / 0 failed / 0 skipped |
| Authenticated superseded custody/relaunch/new-choice UI | 1 passed / 0 failed / 0 skipped |
| Authenticated queued conflict/relaunch/resolution UI | 1 passed / 0 failed / 0 skipped |
| macOS scaffold compile | Passed |
| D009 against actual parent #994 at a45824a2 | Passed; Studio -3 lines, other four zero |
| git diff --check | Passed |

Backend tree `2c40a5c3d1022c583462ad71014c0e173fed1ee8` matches #994/#993/#992.
The unchanged Node20.20.2 full result is inherited: 3,042 passed / 0 failed /
5 skipped; not rerun locally. Four cases require dedicated PostgreSQL setup;
one live case requires fresh paid-call approval.

UI fixtures use authenticated local persistence and synthetic providers. They
cannot establish live speech, model quality, physical-iPhone behavior or the
intended shipping backend. macOS proof is compilation only. No paid calls.

## Retained artifacts

- `/private/tmp/them-t1381-conflicts-preserved-0q3c1hsb` — first merge working
  files and all three index stages, preserved before reconciliation.
- `/private/tmp/them-t1381-upstream-994-preserved-vsew_gfl` — later merge file
  backups, hashes, unresolved ViewModel and all three conflict stages.
- `/private/tmp/them-t1381-lineage-before.log` and `.xcresult` — build-only error.
- `/private/tmp/them-t1381-lineage-before2.log` and `.xcresult` — runtime red.
- `/private/tmp/them-t1381-focused.log` and `.xcresult` — 277/1/0 checkpoint.
- `/private/tmp/them-t1381-final-focused.log` and `.xcresult` — earlier 5/0/0.
- `/private/tmp/them-t1381-combined-units.log` and `.xcresult`.
- `/private/tmp/them-t1381-combined-units-summary.json` — 1,559/0/0.
- `/private/tmp/them-t1381-combined-writer.log` — dependency setup failure,
  before any UI test; no result bundle.
- `/private/tmp/them-t1381-combined-writer-after-deps.log` and `.xcresult`.
- `/private/tmp/them-t1381-combined-custody-ui.log` and `/private/tmp/them-t1381-combined-custody-summary.json`.
- `/private/tmp/them-t1381-combined-custody/them-save-recovery-1rR2YU/recovery-ios.xcresult`.
- `/private/tmp/them-t1381-combined-superseded-ui.log` and `/private/tmp/them-t1381-combined-superseded-summary.json`.
- `/private/tmp/them-t1381-combined-superseded/them-save-recovery-QTLjZ4/recovery-ios.xcresult`.
- `/private/tmp/them-t1381-combined-conflict-ui.log` and `/private/tmp/them-t1381-combined-conflict-summary.json`.
- `/private/tmp/them-t1381-combined-conflict/them-save-recovery-bBGGRH/recovery-ios.xcresult`.
- `/private/tmp/them-t1381-combined-mac.log`.

## Limits and next boundary

Zora performed a bounded read-only source review of both continuity guards and
scope boundaries; no additional data-critical blocker found. This is not an
independent human review. Howard identified synchronous journal I/O in the edit
callback; no latency was measured and no typing stall is claimed. Do not trade
away durability for a speculative performance fix.

Fresh required hosted checks and independent human review remain required on
publication. Main is unchanged; #964's human review is deferred. Production
remains held. No deployment, main merge, live-provider or physical-phone proof.
Actual next boundary is #995, preserving its original session-isolation work.
