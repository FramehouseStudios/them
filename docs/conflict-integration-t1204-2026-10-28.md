# T-1204 conflict integration — local, not published

Base: 58582c0 on codex/T-1202-required-writer-save. Local preserving merge
3a5710b incorporates Zora's exact selection/digest-marker history through
 e3c942a while retaining the existing beginNext persistence rollback.
Candidate is not connected to Load Server and is not a complete fix.

Native compile initially failed because marker JSON encoding omitted `try`;
no tests ran. The merge corrects this. On an erased task-owned simulator with
signing on, ScreenplayDraftSaveOutboxTests passed 38/38, 0 failed, 0 skipped:
/private/tmp/them-t1204-exact-fence-retry-20261028.xcresult.

New requests now mint an immutable UUID authority and preserve it through
materialization, rebasing and queue restoration; legacy nil authority remains
nil. Signed focused suite after this change: 38/38, 0 failed, 0 skipped:
/private/tmp/them-t1204-request-authority-20261028.xcresult. God-file gate
and git diff --check passed. These results do not establish full conflict UI,
backend or physical phone behavior.

Remaining: typed retired admission for all enqueue paths; exact conflict
request custody in the VM; durable recovery of legacy nil-origin rows; safe
handling of a distinct pending edit and already-accepted in-flight writes;
a fresh authenticated server head after the flight settles; revalidation of
identity and page bytes before applying the server choice; restore unresolved
conflicts after relaunch. Also account deletion does not currently purge the
existing outbox; do not claim local data deletion is complete. The button
remains guarded until these are connected and proven. No push, merge to main,
production deployment or paid model call occurred.

## Retired-request admission

The VM's two enqueue-only paths and its delivery path now use atomic
retirement-aware admission. A matching retired request returns no admission;
it is not represented as a queued/parked marker and the VM does not publish
an erroneous queued status from that branch. A reused ID with mismatched
identity still fails closed. The signed focused suite on the erased task-owned
simulator passed 38/38, 0 failed, 0 skipped:
/private/tmp/them-t1204-retired-admission-20261028.xcresult. This is queue
admission proof, not full UI or in-flight server-write proof. The guarded
Load Server action and all remaining boundaries above are still open.

Zora's nil-origin analysis: park only an exact already-durable row, never
invent its document/backend identity; preserve distinct parked copies through
relaunch and require a separately verified current origin before new delivery.
The current VM has not yet implemented this recovery flow.

## Exact conflict retention

Both VM conflict response paths now retain only the exact conflicting request,
not every row sharing its owner/project/origin, and carry the retained row in
conflict state for later explicit resolution. If the exact request was already
retired, the late conflict response does not recreate conflict UI. A nil-origin
request may be parked only when the exact immutable row is already durable; a
missing nil-origin row cannot be manufactured. This does not grant nil-origin
rows authority to be deleted or rebound to the current document.

Signed ScreenplayDraftSaveOutboxTests on the erased task-owned simulator:
39 passed, 0 failed, 0 skipped. Regression checks that a second nil-origin
row remains byte-exact and pending after relaunch and an absent row is not
created. Result: /private/tmp/them-t1204-exact-conflict-20261028.xcresult.
God-file gate and git diff --check passed. The full relaunch presentation,
Load Server action, in-flight writes and real phone journey remain unproven.

## Preserve parked conflicts after an unrelated acknowledgement

A successful save previously deleted older parked rows in the same owner,
project and origin and rebased newer parked rows, even when they contained
distinct writer words. Acknowledgement now removes only its own request and
never rebases parked rows; pending causal saves retain their existing rebase
behavior. A scoped listing returns separate parked conflict copies without
implying authority to mutate them. The signed outbox suite on the erased
simulator passed 41/41, 0 failed, 0 skipped; it includes older and newer
parked drafts surviving acknowledgement and relaunch with their bases intact.
Result: /private/tmp/them-t1204-parked-preserve-20261028.xcresult.
The test build also contained an uncommitted, preliminary copy-sharing UI;
that UI is not part of this commit and has not received interaction, visual,
or auth-change proof. Parked rows now remain until an explicit, verified
resolution exists, so users may still see a save needing attention. Full
conflict recovery and Load Server are not finished.

## In-progress parked-copy access

Uncommitted UI work adds a project-scoped list of parked conflict copies. It
only exposes copies whose owner, backend and document match the current editor;
a Copy text action re-reads the exact durable row and rechecks context before
using the local clipboard. It does not remove or replace the stored copy.
Unknown-origin rows stay unexposed rather than being attached to the wrong
document. This is an interim copy-out path, not full recovery or resolution.
Signed outbox suite compiled with this work: 41 passed, 0 failed, 0 skipped,
/private/tmp/them-t1204-copy-guard-20261028.xcresult. The suite does not
exercise the copy action, auth-change race or rendered UI; those remain
unverified, so the UI changes are deliberately uncommitted and unpublished.

The existing Keep Mine relaunch UI expects the parked count to reach zero;
with broad removal fixed, the selected parked row needs its own exact,
confirmed-acknowledgement retirement before this can work safely. Do not
restore the previous broad deletion to satisfy that test.
