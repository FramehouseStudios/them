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

## Keep Mine failure and acknowledgement safeguard

The conflict decision now stays visible if a Keep Mine request cannot start,
is still in flight, fails or queues for later. A live conflict-resolution
response must provide exact request/owner/project/document/backend/version and
writer-byte confirmation before its save row can be marked successful; a bare
version ID is insufficient. Explicit conflict resolution is not automatically
satisfied by the weaker empty-base same-text readback. The DEBUG UI fixture
still simulates its own successful path; it is not evidence of a live save.

Signed ScreenplayStudioDraftRecoveryTests with the in-progress copy UI also
present: 78 passed, 0 failed, 0 skipped; regression verifies that an
unavailable project leaves the conflict and exact page intact. Result:
/private/tmp/them-t1204-confirm-choice-20261028.xcresult. The exact-ack
negative path has not yet received handler-level fault injection. The old
parked conflict is deliberately not retired by this change; durable
supersession, atomic retirement, relaunch and real UI proof remain required.

## T-1205 Keep Mine integration in progress

The local worktree codex/T-1205-keep-mine has an uncommitted preserving merge
of Zora's lineage commits through 36c41bf and VM integration. The first signed
queue build failed before running tests due to async calls inside XCTest
assertion autoclosures; those were corrected. The subsequent focused outbox
suite passed 48/48, 0 failed, 0 skipped:
/private/tmp/them-t1205-lineage-fixed-20261028.xcresult. Later VM changes
bind reconstructed conflicts only to exact owner/project/document/page matches,
block ordinary Save/Snapshot during conflict, and preserve snapshot labels.
Focused recovery suite after these VM changes: 79/79, 0 failed, 0 skipped:
/private/tmp/them-t1205-conflict-guard-20261028.xcresult.

Do not publish or call this integration complete: raw Swift metadata equality
can reject legitimate backend-normalized nil/empty values. Zora is preparing a
canonical comparison, including UTF-16 truncation boundaries. The exact linked
VM/backend UI flow, crash and relaunch, earlier unrelated queued-row recovery,
unknown-origin copies, and old-client rollback remain unproven. The separate
T-1204 recovery UI remains uncommitted. No main or GitHub change was made.

## T-1205 local conflict workflow checkpoint

An authenticated local-backend iPhone workflow first failed 0/1 after Keep
Mine: the UI cleared its conflict but two saves remained parked. The exact
mechanism of that original failure is unconfirmed. Backend-normalized metadata
comparison was added using Zora's local commits 00e13f0, 4c7ee7c and 140b142;
the signed metadata suite passed 10/10. The same local iPhone workflow then
passed 1/1, 0 failed, 0 skipped: it restores a stale conflict after relaunch,
chooses Keep Mine, verifies the queue clears, and reads one saved version from
the authenticated local backend. Result:
/var/folders/27/kqhcss0n7t1dh_fj2wn98ynm0000gn/T/them-save-recovery-Sehjvv/recovery-ios.xcresult.

Background reads now preserve an unresolved conflict even if their text equals
the page. Its focused signed regression passed 1/1. The same local iPhone
workflow passed again 1/1 after this change:
/var/folders/27/kqhcss0n7t1dh_fj2wn98ynm0000gn/T/them-save-recovery-m8u2yE/recovery-ios.xcresult.
The local backend used a test provider fixture; no paid model call occurred.
These tests do not establish real microphone, live model, physical iPhone,
all conflict edge cases or production readiness. Old-client rollback may drop
the additive lineage field and remains unsafe until explicitly solved. The
separate T-1204 copy UI is still uncommitted. Unknown-origin conflict recovery,
Load Server, queue blockers, security/release proof and integrated main remain
open.

## Exact conflict identity and rollback review

A signed reproduction showed that Swift canonical String equality accepted a
request whose note had different UTF-8 bytes as the same stored conflict
(0/1, 1 failure, 0 skips):
/private/tmp/them-t1205-conflict-byte-red-20261028.xcresult. Conflict identity
now uses the existing exact immutable request digest, which covers origin,
authority, draft bytes, metadata and lineage and excludes delivery state.
The focused signed outbox suite passed 49/49, 0 failed, 0 skipped:
/private/tmp/them-t1205-conflict-byte-green-20261028.xcresult. God-file gate
and git diff --check passed. Same-ID enqueue/coalescing identity needs a
separate audit; this fix covers conflict selection/retention/completion.

Zora verified that an old array-only app can strip unresolved lineage on a
queue rewrite, leaving it stranded after re-upgrade and potentially allowing
a repeat version. A conditional fail-closed manifest envelope is being built
in her separate lane. It has not been integrated or tested. Older-client
rollback, full relaunch UI, Load Server and physical-phone proof remain open.

## Exact same-ID admission and coalescing

Same-ID admission previously checked writer text but ignored byte-distinct
metadata; coalescing used Swift canonical String/model equality. Admission now
compares the complete stored writing target and exact source/notes bytes,
while allowing the durable row's causal base to remain authoritative on a
retry. Coalescing compares exact UTF-8 strings and deterministic encoded
metadata, preserving distinct writer intents. Signed outbox suite passed
51/51, 0 failed, 0 skipped on the erased simulator:
/private/tmp/them-t1205-queue-exact-20261028.xcresult. The test includes
same-ID byte-distinct notes, different-ID byte-distinct title, and durable-base
retry. God-file gate and git diff --check passed. This does not prove the
entire app, production or the rollback envelope under development.


## Rollback fence and first-read validation

The local preserving merge adds a schema-v2 envelope only while unresolved
Keep Mine lineage exists; old array-only clients cannot decode or rewrite it.
New clients accept validated legacy arrays and the protected envelope. A
confirmed atomic resolution returns to the old array shape once no lineage
remains. This is fail-closed storage protection, not a guarantee that every
old app shows a clear warning. Old releases must not be deployed as a rollback
for devices that may have protected queues; use a compatible recovery build.

Signed focused outbox suite before the first-read fix: 55/55. Authenticated
local iPhone Keep Mine workflow with that staged fence: 1/1, provider fixture
only, result:
/var/folders/27/kqhcss0n7t1dh_fj2wn98ynm0000gn/T/them-save-recovery-3Z6cZt/recovery-ios.xcresult.
After review identified a first durable-read migration/validation gap, the
read now loads and validates first, then re-reads the persisted file. The
signed outbox suite passed 57/57, 0 failures, 0 skips, result:
/private/tmp/them-t1205-envelope-readback-20261028.xcresult. This final
readback change has not been rerun through the local iPhone workflow. No
physical-phone, live provider, production or integrated-main claim is made.

## Final rollback-workflow check and unreadable status

The signed iPhone Keep Mine workflow passed 1/1, 0 failures and 0 skips
against the authenticated local backend after the final durable-readback fix:
/var/folders/27/kqhcss0n7t1dh_fj2wn98ynm0000gn/T/them-save-recovery-qoovvc/recovery-ios.xcresult.
The provider was intercepted; this is not live model or physical-phone proof.

Current-app queue snapshots now distinguish unreadable storage from ordinary
per-row error text. Status refresh shows the existing safe-recovery warning
when storage cannot be read while retaining the current page and original
file. A focused signed simulator test passed 1/1, 0 failures, 0 skips:
/private/tmp/them-t1205-queue-status-20261028.xcresult. This change was made
after the local iPhone workflow above and cannot retrofit older released apps.
The successful test is not a complete UI or release gate.
