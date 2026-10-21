# Studio recovery ownership — T-1109 follow-through, 2026-10-21

## Implemented

VERIFIED reproductions on parent `587f589c`: four focused signed tests failed
(0 passed / 4 failed / 0 skipped). Question and realtime writes continued after
an account changed during bootstrap; a rendered-character batch continued into
another account; one idempotency key collapsed three account/destination-scoped
payloads into one durable entry. These are intercepted production-client and
real local-filesystem reproductions, not observed production-account incidents.

The same canonical caller/login-intent rule now covers the remaining Studio
question, character-memory, realtime/history annotation and first-page paths,
plus pagination, revision colors, coverage, import and export. Together with the
previous checkpoint this is 27 public methods and the private FDX delegation.
Batch ownership spans the entire loop, not a new capture for each character.
Request paths, bodies, validation and domain error handling remain unchanged.
No new automatic retries of non-idempotent mutations were added.

The existing URLSession/redirect handling has a shared owned-response helper;
there is no second HTTP client or credential store. The existing notification
capability moved to `BackendNotifications.swift`, with unchanged notification
names and always-asynchronous delivery. Owned sync, turn and question events
check the same initiating login again when the main queue actually delivers
them. Normal token rotation is allowed; a different user or same-user new login
is not. Legacy identity notifications retain their existing unowned behavior.

Shared bootstrap/read-cache state now records its login context and invalidates
the old cache/sync state before reuse by another login. Token rotation alone
does not clear it. Studio and Memories pending-question refreshes also check
ownership after their awaits; Studio additionally checks the selected project.
This is not a claim that every memory/history request and caller is now scoped.

Offline question enqueue checks ownership before queueing, at outbox actor
admission, and before applying its returned state. Superseded/cancelled work
does not become a new owner's queued action. If an account changes after queue
admission, pinned old-owner bytes can remain durable; they are not deleted to
make a cancellation check pass. Existing replay account checks are retained.

Outbox deduplication now compares request destination, method and owner as well
as the idempotency key. Same-user bearer rotation still deduplicates; anonymous
requests additionally compare their client scope (or authorization fallback).
Pending-question suppression IDs are filtered to the current account, while
the underlying other-owner entries remain intact. No manifest migration or
provider credentials were added.

## Proof

- RED: four focused signed regressions, 0/4/0, erased owned simulator.
  `/tmp/them-1109-follow-red-native/` and matching `.log`.
- Ownership-stage full signed iOS units: **884/0/0**, erased owned
  `7F1A14C1-B379-4417-AFE9-331810CD9CD3`, iPhone17Pro/iOS26.2, signing on.
  `/tmp/them-1109-follow-final-native/` and matching `.log`.
- New cases include the four reproductions; valid conversation/batch token
  rotation; superseded offline question rejection without queue changes;
  cache reset on owner change but not token rotation; bootstrap and late-reply
  checks across ten derived/conversation paths; outbox relaunch scope, actor
  admission and same-owner deduplication; and three main-queue delivery tests.
  Delivery tests use a FIFO sentinel, not a sleep/retry. Existing tests retain
  outline body/409/replay/Retry-After, exact text, refresh and cancellation checks.
- Ownership-stage macOS scaffold: **build passed**, `/tmp/them-1109-follow-final-macos.log`.
- Actual auth-required local-backend recovery UI: **3/0/0**. Offline exact
  save/relaunch, conflict choice/relaunch/resolve, and real rejected save ->
  auth refresh -> changed-bearer successful retry -> exact restoration passed.
  `/tmp/them-1109-follow-recovery-ui/them-save-recovery-xlv7mH/recovery-ios.xcresult`.
- Raw-audio Home -> Studio exposed another actual failure, fixed below; do not
  count the ownership-stage884/3 results as proof that this voice journey passed.
- D009: MemoryAPI10592 -> 10553 (-39) versus actual parent `587f589c`;
  index33557, Studio17337, Root14961 and bridge12934 unchanged. Gate also passes
  against origin/main. `git diff --check` passes.
- Backend runtime/tests unchanged; no repeated full Node suite is claimed.
  Prior Node20 backend proof remains T-1104's2900/0/2, not a new run here.
- Public source: `/tmp/them-1109-follow-final-source.VNzGZs/source`.
  No private environment/signing files copied; provider keys removed from runs.
- Retained proof: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1109-follow-20261021.QcUWX4/`.
- No paid calls, deployment, live-model, physical-microphone or phone proof.

## Observed voice-to-save failure and connected fix

The raw-audio workflow failed **0/1/0** despite STT1/chat2/TTS1 intercepted
provider calls and a page on screen. It stayed unbound with "Create project to
save." A diagnostic-only rerun also failed **0/1/0** with unchanged assertions
and timeouts: draft1064, committed1064, byte match=true, streaming0, voice idle,
no pending insertion. There was a finished authoritative page, not merely a
partial preview or an insufficient timeout.

The existing Root trigger watched only the committed write's UUID, while exact
editor binding could settle separately. Its single early attempt could fail
the correct byte-identity guard and never be revisited. No parent raw-audio
control was run; this report does not assign historical introduction/blame.

The connected fix observes the full committed value and rechecks after actual
editor publication. It retains the same canonical promotion capability and
exact-document checks. The existing committed-write value now records its
login context, so a later editor event cannot promote an old account's write.
This value moved to `ScreenplayCommittedWrite.swift`; there is no second model
or persisted-data migration. Placeholder and already-bound writes are rejected.
Bound projects exit before expensive byte comparisons on each keystroke.

The editor hook uses its existing Published stream and defers past willSet,
rather than relying on Swift String equality. Installed Combine probe:
canonically equal composed/decomposed strings still emitted an event with
different UTF8 bytes. Unit cases retain this distinction and reject changed
login, manual edits, placeholders and bound writes. No polling/sleep or longer
UI timeout was added. First positive workflow after the fix passed **1/0/0**;
the stronger one-project assertion also passed **1/0/0**, with one saved project
and restored text. Held real-create response + changed page passed **1/0/0**
before the final byte-safe publisher refinement.

Final exact production source: `/tmp/them-1109-published-source.q2pAzZ/source`.
Full signed units **887/0/0**, macOS build pass. Final voice **1/0/0** and
held-response **1/0/0**, both on the exact q2pAzZ production source, pass.
`/tmp/them-1109-published-native/`, `/tmp/them-1109-published-macos.log`,
`/tmp/them-1109-published-voice-ui.xcresult`,
`/tmp/them-1109-published-held-ui.xcresult`. The final native voice test also
asserts there is exactly one project, not merely a selected project/version.
Earlier ownership/recovery3 proof precedes this Root fix and is not relabeled
as a fresh final-source run.

D009 versus parent587f589c: MemoryAPI10592 -> 10553 (-39), Root14961 ->14959
(-2), bridge12934 ->12872 (-62); index33557 and Studio17337 unchanged.
No writer text is logged by the new read-only lifecycle diagnostic.

Evidence/tool limits: xcresult console export reported no console log, so it
was not used as evidence. One source-capture command was launched from a frozen
non-Git directory and failed; `/tmp/them-1109-voice-binding-final-source.Su3zTu`
is not a valid snapshot. The already-running native test still used the
explicit actual app root. Capture was corrected in the real Git worktree;
`/tmp/them-1109-voice-binding-captured-source.YXykND` matched actual Root/model
hashes. Final q2pAzZ supersedes those intermediate captures. No proof was
restarted merely because source capture or observation was quiet/failed.

## Adversarial result and next root fix

Answered for the listed paths: owner change at bootstrap/response, batch
continuation, ordinary token rotation, cancelled/superseded enqueue admission,
cross-owner/destination queue-key collisions, same-owner retry, cache reuse and
deferred main-queue delivery. Same-account requests already committed by a
server cannot be rolled back by a client ownership rejection. Notifications
from unrelated unconverted paths are not globally proven isolated.

VERIFIED source finding, still OPEN: `OfflineTalkOutbox.allEntries()` and its
summary expose device-wide entries to Data Controls, and `deleteParkedEntries()`
removes parked entries without an owner predicate. Its replay path does reject
another signed-in user, but that does not protect recovery presentation or
destructive cleanup. Do not mistake the narrower pending-question ID filter
for a complete outbox owner partition. T-1111 must fix this BEFORE T-1108 or
original #648; preserve other owners' bytes and legacy/unattributed records.

Also audit same-owner reuse of a request key with different bytes: current
deduplication retains the first body without a body-identity check. Do not
silently discard/relabel either intent or treat a different answer as a retry.
Check origin/credential binding during replay and late Data Controls callbacks
in the same capability, not with another queue implementation.

T-1111 success: with account A's durable parked work present, account B cannot
present, replay or delete it; signing back into A restores the exact bytes.
Same-owner ordinary retries remain idempotent. Different-payload key reuse must
not report a false successful queueing. Retain a real local-backend/owned-sim
recovery check; never reset the human's Mac app or erase another simulator.

The observed voice binding gap is fixed within T-1108's initial-creation seam;
its separate metadata-create + version-write crash/orphan/idempotency problem
remains OPEN. Happy-path one-project proof does not settle interrupted creation.
After T-1111 resume that crash-safe creation work, followed by preserved original
#648. Production/real-phone/main-integration proof and independent review are
still outstanding. Production remains held under the existing human decision.

## Files and Git

Runtime files: `them/BackendMemoryAPI.swift`, `them/BackendNotifications.swift`,
`them/OfflineTalkOutbox.swift`, `them/MemoriesScreen.swift`,
`them/ScreenplayStudioViewModel.swift`,
`themTests/BackendProjectWriteOwnershipTests.swift`,
`themTests/BackendNotificationOwnershipTests.swift`,
`themTests/OfflineTalkOutboxTests.swift`. Documentation: `TASKS.md` and this report.
Voice-fix files: `them/RootExperienceView.swift`,
`them/ScreenplayLiveDraftBridge.swift`, `them/ScreenplayCommittedWrite.swift`,
`them/ScreenplayProjectPromotion.swift`,
`them/ScreenplayProjectPromotionDiagnostics.swift`,
`themTests/ScreenplayProjectPromotionTests.swift`, `themUITests/V1SmokeUITests.swift`.

Branch: `codex/T-1109-owned-screenplay-transport`; original heads/history
preserved. Normal backup goes only to the existing integration backup branch.
No direct main push, merge, force push, replacement PR or protection change.
The overall working-product goal remains active, not complete.
Ownership runtime commit: `ac817187c119fd3c3df58b42e59e86b467e41de2`.
Voice-promotion runtime commit: `7b6b29896eaec20051f47e26824631abede4ef5b`.

Copy/paste briefing: On `codex/T-1109-owned-screenplay-transport`, ac817187
extends canonical login ownership through the remaining Studio requests,
character batches, offline question enqueue, cache reuse and deferred main-queue
delivery; account/destination collisions no longer collapse queue entries.
The voice journey then exposed an existing UUID-only promotion trigger missing
settled editor text. 7b6b298 fixes that with exact-byte/owner-qualified commit
and editor publication, without promoting previews or bound/foreign pages.
Final signed887/0/0, macOS/D009/diff, voice save/one-project/relaunch1/0/0 and
held-create/changed-page1/0/0 pass. Earlier ownership-stage recovery3/0/0 is
retained separately. Providers were intercepted, never paid/live; backend
production code is unchanged. Next is T-1111: Data Controls/parked cleanup and
same-key changed-payload recovery must be owner-safe. Then close the remaining
T-1108 interrupted-create/idempotency boundary and resume original #648 after
checking its actual base/head. No main merge, phone, shipping or completion claim.
