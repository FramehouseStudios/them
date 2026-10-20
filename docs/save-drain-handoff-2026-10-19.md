# T-1014 — Investigate the first red integration boundary

## Authoritative inputs

Original #962 is ee7e27f26a698cd8875fe20f7500fb26d1e3e962. Hosted run
39336874458/job118348463784 is terminal FAILURE, not a live wait. Download
completed exit0 into `/tmp/them-962-hosted.lipI85/`; completed recovery bundle:
`Users/runner/work/_temp/them-save-recovery-537IPu/recovery-ios.xcresult`.
Actual summary:3 pass/2 fail/0 skip on iPhone17Pro/iOS26.5(23F77).
Blank snapshot did not queue; after conflict relaunch metadata/parked count
were absent. Conflict marker text was still present. A separate signal-term
diagnostic is retained; do not call this total text loss or a harmless flake.
Raw log: `/tmp/them-962-hosted-failure.log`.

## Verified root and smallest correction

Background resume owns isDraftSaveInFlight while awaiting its queued version
POST. Another explicit save fills pendingDraftSaveRequest and returns; only
the manual-save serialization loop consumes that pending slot. Test this
with the existing suspended transport and actual outbox: enqueue earlier
words, start resume, wait for the POST, deliberately blank the draft and ask
for a snapshot, release the response. Require two actual POSTs, pending save
rebased on the acknowledged earlier version, no dirty text or label silently
left unsaved, and an empty queue only after success. No arbitrary delay is
used to create the interleaving. The new regression reproduced the dropped
save: before correction, signed tests were5 pass/1 fail/0 skip; the version
transport received one POST instead of the required two.

The background drain now releases its lease and dispatches its captured
pending request through the same canonical dispatcher as explicit saves.
Only same-project/same-authority requests following a successful drain are
rebased onto its acknowledged version. Stale authority remains retained
behind conflict; newer authority (including Keep Mine) keeps its captured
base. Existing queue ordering and explicit-blank policy remain enforced.

Signed focused result after correction:6 pass/0 fail/0 skip, terminal exit0,
erased task-owned iPhone17Pro11CF5EFB/iOS26.2, signing enabled. Actual summary
read from `/tmp/them-1014-focused/v1-ui-smoke-local-1-42627.xcresult`.
Before bundle: `/tmp/them-1014-before/v1-ui-smoke-local-1-39948.xcresult`.
This proves the save-drain interleaving, not that both hosted failures share
this root. Conflict-relaunch UI investigation remains open.

## Connected conflict check and self-review

The isolated authenticated local-backend conflict workflow completed exit0:
1 pass/0 fail/0 skip, signed and erased task-owned Pro/iOS26.2. Actual bundle:
`/tmp/them-1014-conflict/them-save-recovery-3dvNQG/recovery-ios.xcresult`.
It checks queued offline words, an actual competing server version, expired
app-auth recovery, stale-save rejection, a second relaunch retaining the
parked copy and conflict, then explicit Keep Mine committing the exact full
draft once. No paid provider call is needed or authorized by that fixture.
The historical hosted iOS26.5 conflict failure is not reproduced locally;
do not declare it fixed based on this one local pass.

Self-review: the new dispatcher still owns normalized/intentional-blank
admission, current auth and conflict authority, active-queue ordering and
the existing serial save loop. A conflict change increments authority;
pending stale requests are retained rather than sent. A newer Keep Mine
request is not rebased by the earlier drain. No early function return or
throw after the background lease is acquired bypasses its release.
Existing five focused conflict-choice tests remain green, but background
auth/project changes are not newly exercised here. No broader security or
physical-phone claim follows from these checks.

All five D009 files have actual delta0 versus the exact original parent
`origin/codex/T-980-exact-draft-retention` at ee7e27f2. Diff whitespace check
passes. Completed before/focused bundles were cloned and byte-compared in
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1014-20261019.gowQ3i/`.

## Constraints

The affected blank-snapshot UI workflow also completed exit0:1 pass/0 fail/
0 skip. Bundle `/tmp/them-1014-blank/them-save-recovery-zO4Yml/recovery-ios.xcresult`.
It verifies blank intent queued offline, preserved through offline relaunch,
exactly one blank version committed on reconnect with snapshot notes,
online relaunch restoring that blank version, and loading the older snapshot.
No UI assertions, timeouts or sleeps were changed. Both specific hosted-red
paths now pass locally on iOS26.2; only the new suspended-transport regression
has failing-first evidence of this fix. Hosted iOS26.5 remains unproven.

Runtime scope is one22-line net addition to the existing ViewModel dispatcher,
plus one33-line regression. Full backend/unit/remaining UI/macOS gate is
deferred to the integration boundary, not claimed by these focused results.
The local dependency symlink was temporary harness setup, not product code.

Isolated home branch directly off the failed original head. Runtime edits
are saved as a scoped correction pending broader proof; no original-head update, main merge,
force, squash or replacement PR. Original #963 and mentor boundary stay held.
T1013 checks finished before these signed runs. Serialize Xcode/owned-device
work. The human confirmed the local key and API access returned200 after a
top-up; that separate evaluation was stopped on their request to reduce
paid testing. Continue local save/conflict fixes without paid calls.
Production remains held. Full signed/backend/UI/god-file proof and a fresh
exact-head hosted gate are still required before advancing this boundary.
