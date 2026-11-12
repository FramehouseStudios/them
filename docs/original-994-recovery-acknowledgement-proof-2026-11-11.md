# Original #994 — recovery ownership and acknowledgement proof, 2026-11-11

## Latest follow-up: ordinary recovery page continuity

Runtime source: `7911a5e38401310ae753ec3ce6d623db5eb921b0`, a descendant
of publication `a3b172c6`. Original #994 and all prior heads remain preserved.

VERIFIED: reviewing ordinary A, restoring preserved B at the same base, then
editing B could overwrite A. The in-memory permission to advance A survived
the page replacement. The before actual-model/fresh-store case failed 0/1/0
(two assertions). No server save or explicit discard authorized replacing A.

The canonical draft boundary now clears ordinary overwrite authority on changed
hydration/queued restoration or when the remembered draft/base does not match
the previous editor page/base. It does not delete stored data. Both contiguous
typing controls still advance their own current snapshot. The newer page is
retained separately, and the reviewed original and preserved copy remain exact.

PR #994 is the earliest owner of this bug. #996's separate active-journal lease
issue is being fixed locally and will receive this upstream correction by a
preserving merge. It is not included in this PR's proof or claimed shipped.

### Current-source verification

Xcode 26.3 (17C529), erased task-owned iPhone17 Pro/iOS26.2 (23C54),
UDID `81F0FF38-9DAD-4011-907B-357DFADD094C`, normal signing enabled for tests.

| Check | Result |
| --- | --- |
| Ordinary replacement regression before fix | 0 passed / 1 failed / 0 skipped |
| Same regression plus both continuous-typing controls after fix | 3 passed / 0 failed / 0 skipped |
| Full signed themTests | 1,530 passed / 0 failed / 0 skipped |
| Authenticated writer/create/save/export/relaunch UI | 1 passed / 0 failed / 0 skipped |
| Authenticated custody save/lost-ack/reopen UI | 1 passed / 0 failed / 0 skipped |
| Authenticated superseded custody/relaunch/new-choice UI | 1 passed / 0 failed / 0 skipped |
| macOS scaffold compile | Passed |
| D009 against actual parent #993 at5287e587; diff check | Passed; five zero deltas |

Backend tree remains `2c40a5c3d1022c583462ad71014c0e173fed1ee8`. The
unchanged Node20.20.2 full result 3,042/0/5 is inherited, not rerun locally.
Four skips need dedicated PostgreSQL setup; one live case needs fresh paid-call
approval. Local UI uses authenticated persistence and synthetic providers.
No live model, physical phone, integrated-main or production proof is claimed.

Artifacts for this follow-up:

- `/private/tmp/them-t1380-ordinary-lineage-before.log` and `.xcresult`
- `/private/tmp/them-t1380-ordinary-lineage-before-summary.json`
- `/private/tmp/them-t1380-ordinary-lineage-after.log` and `.xcresult`
- `/private/tmp/them-t1380-ordinary-lineage-after-summary.json`
- `/private/tmp/them-t1380-ordinary-units.log` and `.xcresult`
- `/private/tmp/them-t1380-ordinary-units-summary.json`
- `/private/tmp/them-t1380-ordinary-mac.log`
- `/private/tmp/them-t1380-ordinary-writer.log` and `.xcresult`
- `/private/tmp/them-t1380-ordinary-custody-ui.log`
- `/private/tmp/them-t1380-ordinary-superseded-ui.log`

Fresh hosted checks and independent review remain required on the new head.
Main remains unchanged. Production remains held; no paid model calls occurred.

## Earlier acknowledgement checkpoint — runtime7ab85895, publicationa3b172c6

The following record applies to the earlier source and preserves its original
failure classifications. Its 1,529 unit count is not the current-source result.

# Original #994 — recovery acknowledgement proof, 2026-11-11

## Scope and preserved history

Original #994: `6c60783b9b1888b0425cfd1070bc90d650b2e60e`.
Preserving merge: `58bd4be8bf9c1c5003fc5da968a0ff321cf1aae8`, with updated
#993 parent `5287e587f4e48641e392ab2c8898d31d47f45499`.
Runtime fix: `7ab858957556acd8370444f0ed85a450a39b475c`.

Both original heads remain ancestors. Two fixture conflicts were reconciled by
retaining originOverride, the saved API instance and projectSelectionAPI injection.
The unresolved file and all three index stages were hash-preserved first at
`/private/tmp/them-t1380-merge-preserved-p0jn2l7h`.
No original feature work was squashed, replaced or discarded.

Original recovery-copy ownership, continued offline typing, parked/pending retry
messages, clock-independent acknowledgement protection and live-sync recovery
changes remain intact. The root follow-up changes three existing files: the
recovery presentation policy, view model and save-completion tests.

## Reproduced root issue

VERIFIED with actual ScreenplayStudioViewModel and its URLSession save flow:
while a selected held copy was being saved, all three local recovery slots were
occupied by independent copies. Newer visible words could not be secured and
had an export warning. The older copy's confirmed receipt kept the current page
dirty, but replaced its warning with a success message. The warning disappeared
without proof that the current page was secured.

The existing presentation policy now owns exact recognition of the two recovery
warnings. All five receipt paths reconcile them after authority checks: ordinary
success, empty-base canonical readback, passive conflict readback, selected-copy
success and superseded selected-copy acknowledgement. Dirty-page warnings survive;
recognized stale warnings clear for a clean acknowledged current page. Unrelated
custody errors retain their existing semantics. No storage authority, retry,
recovery store or suspension was added.

Retention is conservative presentation, not new durability proof. A receipt for
another copy cannot establish that the newest visible page is safe.

## Failure evidence and fixture corrections

- Initial one-case run: 0 passed / 1 failed / 0 skipped, with two failed assertions.
  One established the lost export warning. The other assumed errorText was empty;
  the fixture deliberately seeds an unrelated status. That assumption was removed;
  the before/after warning and exact-page/source-copy assertions remain.
- Expanded before matrix: 1 passed / 2 failed / 0 skipped. Current-page cleanup
  passed; ordinary selected-copy warning retention failed. The superseded case
  initially reused a deliberately incomplete ID-only response and correctly failed
  receipt acceptance, so it is not evidence of warning loss in that branch.
- A separate positive full-request superseded receipt fixture was added. The
  original incomplete-response mock and rejection coverage remain unchanged.
  Typed metadata is encoded with the existing JSON conversion pattern.
- Intermediate three-case after matrix passed 3/0/0. Final focused proof below
  additionally covers both readback paths on the final runtime source.

## Earlier-source proof (7ab85895)

Xcode 26.3 (17C529), erased task-owned iPhone 17 Pro/iOS 26.2 (23C54),
UDID `81F0FF38-9DAD-4011-907B-357DFADD094C`; normal signing enabled for tests.

| Check | Result |
| --- | --- |
| Save ownership + live-sync focused suites | 82 passed / 0 failed / 0 skipped |
| Full signed themTests | 1,529 passed / 0 failed / 0 skipped |
| Authenticated writer/create/save/export/relaunch UI | 1 passed / 0 failed / 0 skipped |
| Authenticated custody save/lost-ack/reopen UI | 1 passed / 0 failed / 0 skipped |
| Authenticated superseded custody/rechoice UI | 1 passed / 0 failed / 0 skipped |
| macOS scaffold build | Passed |
| D009 against actual #993 parent | Passed; all five monitored deltas zero |
| git diff --check | Passed |

UI fixtures use real authenticated local storage with synthetic providers, fixture
host Node 26.7.0. The writer made one mocked chat request. These runs are not live
microphone, model-quality or physical-device proof. The macOS result is compilation.

INHERITED UNCHANGED: backend tree `2c40a5c3d1022c583462ad71014c0e173fed1ee8`
matches #993/#992 exactly. Node 20.20.2 full result: 3,042 passed / 0 failed /
5 skipped, confirmed by hosted #992; hosted #993 Backend tests also passed.
No unchanged local backend rerun. Four skips need dedicated PostgreSQL setup;
one live page-sync test remains disabled without fresh paid-call approval.

## Retained local artifacts

- `/private/tmp/them-t1380-custody-warning-before.log` and `.xcresult`
- `/private/tmp/them-t1380-custody-warning-initial-test.swift`
- `/private/tmp/them-t1380-custody-matrix-before.log` and `.xcresult`
- `/private/tmp/them-t1380-custody-matrix-before-summary.json`
- `/private/tmp/them-t1380-custody-matrix-after.log` and `.xcresult`
- `/private/tmp/them-t1380-custody-matrix-after-summary.json`
- `/private/tmp/them-t1380-focused.log` and `.xcresult`
- `/private/tmp/them-t1380-focused-summary.json`
- `/private/tmp/them-t1380-units.log` and `.xcresult`
- `/private/tmp/them-t1380-units-summary.json`
- `/private/tmp/them-t1380-writer.log` and `.xcresult`
- `/private/tmp/them-t1380-custody-ui.log` and `/private/tmp/them-t1380-custody-ui-summary.json`
- `/private/tmp/them-t1380-custody/them-save-recovery-nFBhXV/recovery-ios.xcresult`
- `/private/tmp/them-t1380-superseded-ui.log` and `/private/tmp/them-t1380-superseded-ui-summary.json`
- `/private/tmp/them-t1380-superseded/them-save-recovery-GkYIIl/recovery-ios.xcresult`
- `/private/tmp/them-t1380-mac.log`

The task dependency symlink backend/node_modules is untracked and not committed.
Zora reviewed receipt authority/presentation read-only. Luna reviewed the actual
base graph and preserved merge seams. Neither is independent human approval.

## Remaining gates and next boundary

Fresh required hosted checks and independent human review remain required after
publication. Main is unchanged; #964 still awaits the human's deferred review.
Security #979 remains held on its recorded launch-acknowledgement failure and
invalid erased/tested device chain. No unchanged retry or timeout relaxation.

No integrated-main, production, physical-iPhone, microphone or live-provider proof
is claimed. No paid model call or deployment was made; production remains held.

Actual next boundary is #996 (`91fd4eeb0908a8d1c947c9c23df101ece9124a41`),
then #995. #996 preserves scoped journal fallback and the exact displaced-copy
selection follow-up `7280cd6c`; those were not reimplemented here. When integrating
journal fallback, retain successful exact-byte recovery proof, and inject a real
journal-write failure in negative warning cases rather than removing assertions.
