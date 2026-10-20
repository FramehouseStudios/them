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

## Integration-boundary proof on frozen runtime50d04ae5

- Signed full units completed exit0:867 pass/0 fail/0 skip on the erased
  owned Pro/iOS26.2. Actual summary read; completed bundle cloned and compared
  as `full-units.xcresult` in the private T1014 evidence directory.
- Pinned Node20.20.2, network disabled, completed exit0: scripts231/0/0;
  backend2897 pass/0 fail/2 skip. Log `/tmp/them-1014-node20-valid.log`.
- Initial container setup failures are retained, not attributed to app code:
  `/tmp/them-1014-node20.log` scripts227/4/0, backend not reached, because the
  copied worktree Git pointer was inaccessible. The disposable container
  needed its own Git snapshot to exercise HEAD/check-ignore scripts.
  `/tmp/them-1014-node20-corrected.log` passed scripts231/0/0 but used `/deps`
  instead of a node_modules path, breaking Express transitive resolution;
  stopped that exact invalid container. `/tmp/them-1014-node20-final.log`
  stopped during preflight because the require check ran at the repo root.
  Corrected harness mounts dependencies at `/opt/node_modules` and validates
  the direct module path. No application/test assertion was changed.
- Connected writer/save/native-export/relaunch completed exit0:1/0/0;
  actual summary read from `/tmp/them-1014-writer/them-studio-ios-writer-loop/run-sFMr0u/writer-loop.xcresult`,
  then cloned and compared. Its provider reply is deterministic fixture data,
  not a new live-model or physical-phone claim. Same serialized process71746
  then completed exit0: voice-fault1/0/0 (actual summary read, bundle retained
  and compared) and macOS scaffold BUILD SUCCEEDED. Existing warnings remain.
  Voice bundle `/tmp/them-1014-voice/voice-network-fault-local-1-46218-ios.xcresult`.
- Full V1 remains required on the new hosted head; avoid duplicating it
  locally after the focused affected stories and signed integration checks.
  No hosted retry was dispatched on the unchanged failing source.

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
not implied by the focused results; actual boundary results are listed above.
The local dependency symlink was temporary harness setup, not product code.

## Constraints and remaining work

Isolated home branch directly off the failed original head. Runtime edits
are saved as a scoped correction pending broader proof; no original-head update, main merge,
force, squash or replacement PR. Original #963 and mentor boundary stay held.
T1013 checks finished before these signed runs. Serialize Xcode/owned-device
work. The human confirmed the local key and API access returned200 after a
top-up; that separate evaluation was stopped on their request to reduce
paid testing. Continue local save/conflict fixes without paid calls.
Production remains held. Local integration proof above is complete at the
selected scope; full hosted V1/all-five recovery/lost-creation-reply checks
and independent review remain required. Do not advance the next original
boundary until the updated original #962 head has a green hosted gate.

## Original-head append

The last re-read original #962 head was ee7e27f2, base
`codex/T-979-mentor-ending-integration`, draft/open; its prior Quality Gate
remains failed and retained. The correction is a descendant of that head,
not a replacement/rebase/squash. Append by a normal non-force fast-forward
push, preserving the original parent/base and all history. Add this newer
evidence to the PR without deleting its historical body. No main merge or
deployment is authorized by these results. Full hosted results pending.
