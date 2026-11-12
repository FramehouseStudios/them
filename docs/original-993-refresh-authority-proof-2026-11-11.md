# Original #993 — refresh authority proof, 2026-11-11

## Scope and history

Original #993 head `033910f9ace6bbeded1282ae1bd9251fae8572e2` remains an ancestor.
Preserving merge `20c95b78cf97249c3ee389e9cf7083f52ad03648` brings in verified
parent #992 at `c7ccafaa07a4c93b65ef54b590468dea075a6b90` without conflicts.
Runtime fix: `be609c2d030f2eb3dcb208e2c869ae918fa05757`.
The original accessible Files-picker Cancel correction and four original refresh
regressions remain intact. No squash, replacement PR, main merge or history rewrite.

## Reproduced cause and fix

VERIFIED with the actual ScreenplayStudioViewModel, not a replicated policy:
identical unversioned text erased a known save base; an unversioned observation
of dirty text also marked it clean; an empty-version project payload blanked a
loaded page; blank whitespace bypassed the prior whitespace-difference helper.

The before bundle has 9 test cases: 4 passed, 5 failed, 0 skipped. XCTest's text
log reports 8 failed assertions across those 5 cases. The after bundle passes
all 9 without changing their assertions.

The canonical ScreenplayRemoteDraftConflictPolicy now preserves a known page
when a background observation has no version, and protects blank whitespace
under ambiguous version authority. The view model keeps its existing
same-loaded-project and non-explicit-overwrite boundary. Existing dirty/conflict
protection runs first. Initial/project-switch hydration, explicit overwrite,
known distinct-version adoption and acquisition of a known base from identical
bytes still work. No new store, framework, retry or backend contract is added.

Zora reviewed the source and compatibility matrix read-only. This is an agent
review, not independent human GitHub approval. Luna read original #994 and its
follow-ups to identify the next boundary; it has not been integrated here.

## Exact-source verification

Xcode 26.3 (17C529); erased task-owned iPhone 17 Pro, iOS 26.2 (23C54),
UDID `81F0FF38-9DAD-4011-907B-357DFADD094C`; normal signing enabled for tests.

| Check | Result |
| --- | --- |
| Actual-model refresh regression before fix | 4 passed / 5 failed / 0 skipped |
| Same regressions after fix | 9 passed / 0 failed / 0 skipped |
| Full signed themTests at runtime fix | 1,512 passed / 0 failed / 0 skipped |
| Authenticated writer/create/save/export/relaunch UI | 1 passed / 0 failed / 0 skipped |
| Authenticated conflict/relaunch/Keep Mine UI | 1 passed / 0 failed / 0 skipped |
| macOS scaffold build at runtime fix | Passed |
| D009 against actual parent #992 | Passed; all five monitored deltas zero |
| git diff --check | Passed |

UI fixtures use authenticated local storage with synthetic providers, hosted by
Node 26.7.0. The writer case made one mocked chat request; it is not live speech
or model-quality proof. The macOS check is a build, not macOS interaction proof.

INHERITED UNCHANGED: backend tree `2c40a5c3d1022c583462ad71014c0e173fed1ee8`
is byte-identical to #992. Its Node 20.20.2 full run passed 3,042 / 0 / 5,
confirmed by hosted #992 run43146212318. No unchanged local backend rerun here.
Four skips need dedicated PostgreSQL configuration and one live page-sync case
remains disabled without fresh paid-call approval.

## Retained local artifacts

- `/private/tmp/them-t1379-refresh-before.log` and `.xcresult`
- `/private/tmp/them-t1379-refresh-before-summary.json`
- `/private/tmp/them-t1379-refresh-after.log` and `.xcresult`
- `/private/tmp/them-t1379-refresh-after-summary.json`
- `/private/tmp/them-t1379-units.log` and `.xcresult`
- `/private/tmp/them-t1379-units-summary.json`
- `/private/tmp/them-t1379-writer.log` and `.xcresult`
- `/private/tmp/them-t1379-conflict.log` and `/private/tmp/them-t1379-conflict-summary.json`
- `/private/tmp/them-t1379-recovery/them-save-recovery-3IZRXu/recovery-ios.xcresult`
- `/private/tmp/them-t1379-mac.log`

The task dependency symlink `backend/node_modules` is untracked and unmodified;
it is not part of the commit or a product artifact.

## Not covered and next action

Fresh required hosted checks and independent human review remain required after
publication. This is not integrated-main, production, physical-iPhone,
microphone or live-provider proof. No paid call or deployment was made.
Production remains held. The historical main-only typing failure is separate;
this Swift refresh fix does not claim its input-delivery cause is resolved.

Next original boundary: #994 `codex/T-1314-recovery-ack-race`, current head
`6c60783b9b1888b0425cfd1070bc90d650b2e60e`. Preserve its recovery ownership,
warning and displaced-page corrections; stop at the first new failure.
