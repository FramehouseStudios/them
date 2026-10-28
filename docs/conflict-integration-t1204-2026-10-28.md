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
