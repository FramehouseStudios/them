# T-1170 — Keep accepted offline replies until writer delivery

October 26, 2026. Branch `codex/T-1170-accepted-talk-replies`.
Parent `289e21fb56ef7c797224fabb75c3b5f66e6d201c`.
Signed red `5fca02d`; combined runtime `c839caa`.
Overall product goal remains active. Original647, main and production held.

## 1. Completed

VERIFIED: an HTTP200 removed the queued request and response before any writer
delivery. A real outbox/filesystem/relaunch regression failed **0/1/0** on the
current prefix. The same unchanged test passes in the final full unit run.

Reuse preserved `9ac8c30` and `4943017` through the existing queue. Commit the
original request, accepted response bytes, finite allowed product headers and
receipt integrity in its protected version2 body record before index changes.
Reconcile received records after an interrupted index write; keep them held,
not eligible for automatic generation. An exact receipt acknowledgement is
separate from transport success. Question-resolution success keeps its existing
non-talk settlement semantics. Legacy raw requests remain readable and migrate
with accepted results without changing their request/idempotency identity.

Data Controls identifies received replies, offers Read reply and real Files
export, and states that reading does not add text to the screenplay or confirm
delivery. Closing, cancelling export, saving an export and relaunching retain
the reply. Confirmed deletion warns that held replies are included. Reuse the
normal successful-response decoder with network lookup/bootstrap/retry disabled
for recovery; no second decoder, auth store, conversation store or provider call.

This checkpoint is response custody and read-only review. **It is not recovered
page insertion, spoken playback or saved screenplay delivery.** Do not settle a
receipt from merely opening it. Production page-delivery consumers are pending.

## 2. Exact files changed

- `TASKS.md`
- `backend/evals/run_home_voice_handoff_ui_smoke.mjs`
- `them/BackendClient.swift`
- `them/DataControlsScreen.swift`
- `them/OfflineTalkOutbox.swift`
- `them/OfflineTalkRecovery.swift`
- `them/OfflineTalkReplyReview.swift`
- `themTests/OfflineTalkAcceptedReplyBoundaryTests.swift`
- `themTests/OfflineTalkEnqueueRecoveryTests.swift`
- `themTests/OfflineTalkOutboxTests.swift`
- `themTests/OfflineTalkRecoveryOwnershipTests.swift`
- `themTests/OfflineTalkReplyDecodingTests.swift`
- `themTests/OfflineTalkReplyRetentionTests.swift`
- `themUITests/V1SmokeUITests.swift`
- `docs/accepted-talk-reply-recovery-2026-10-26.md`

The outbox, stored-record/scope and review-view files byte-match preserved
`4943017f01769a946f45284bfc21a8d222613995`. Keep the current authenticated UI
fixture and robust native Files picker helpers rather than copying its old
anonymous UI proof or filename-field assumption. Retain the newer shared
redirect guard and the accurate interrupted-request label.

## 3. Root issues and adversarial disposition

Answered for the exercised boundary: unseen accepted replies disappearing on
relaunch; accidental generation replay after successful local receipt storage;
changed payload reusing a request identity; old manifest after response commit;
late owner changes; wrong account/backend/login reading; wrong/stale receipt
acknowledgement; legacy request migration; corrupt response digest; credential
header export; invalid audio or referenced-but-missing page text being treated
as delivered. The canonical decoder refuses incomplete results and keeps them.

Partially addressed: local storage failure after server acceptance. The current
process holds the request, but complete disk failure cannot guarantee retaining
the response or a hold marker across a crash. Do not claim power-loss/fsync,
disk-full, downgrade recovery or unmeasured large-record IO guarantees.

Compatibility: current reader accepts version1 request records and version2
received records. Old builds do not understand received records. Before a
downgrade, export/retain them through this build and preserve their files; no
automatic downgrade conversion/import exists. Audio over32MiB is omitted with
an explicit retained-metadata warning. Headers and audio are not a guarantee of
full page text available only through volatile backend metadata.

## 4. Verification

All native runs serial, code frozen atc839caa, normal simulator signing, erased
task-owned `91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A` only, iPhone17Pro/iOS26.2.

- Current signed red **0/1/0** at5fca02d: recovery entries empty after HTTP200.
- Final full signed `themTests` **874 passed /0 failed /0 skipped**. Includes
  unchanged red, receipt retention/decoding, corruption, stale ack, no network
  on review, ownership, index failure and settlement cleanup regressions.
- Actual authenticated Read -> Close -> relaunch -> native Files Cancel ->
  Save UI **1/0/0**, intercepted STT/chat/TTS **0/0/0**. Held result remains.
- Raw-audio Home -> formatted page -> one project/save -> restored draft UI
  **1/0/0**, intercepted STT/chat/TTS **1/2/1**. Normal decoder path still works;
  this is not real microphone/model/audible relevance proof.
- Actual Files export **742 bytes**, SHA256
  `81e3546aaa46c16deffa72aa1220668ccb6ce9cfdd2535c665af51b7cc133960`.
  Independent read confirms original27byte CRLF/tab/trailing request, exact
  25byte response, only three allowlisted response headers, no session/cookie/
  auth header. Owned receipt remains received; foreign29byte and unassigned
  28byte requests and hashes remain intact. Opened this exact JSON in iOS
  Files Quick Look outside THEM about11:42 local. This is a synthetic recovery
  receipt, **not screenplay export**.
- Pinned isolated Node20.20.2 transport/provider contracts **5/0/0**, network
  disabled. No backend production/dependency change; parent T1168 full
  **2882/0/2** is explicitly inherited, not a fresh full backend run here.
- macOS scaffold **BUILD SUCCEEDED**, exit0. Existing concurrency/deprecation
  warnings remain; no macOS interactive or warning-free claim.
- D009 vs fetched actual289e21f: index33538, Studio17345, Root14933,
  bridge12852, MemoryAPI10463; all five deltas0. Syntax/diff checks pass.

No paid calls, production changes, private environment reads, broad cleanup or
human-data deletion. Result bundles, logs, immutable public source, exact export
and independent byte check retained under
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1170-20261026.aPBkTM/`.

## 5. GitHub status

Scoped normal backup push only, no replacement PR, force push, original647
advance or main merge. Preserve all original commits and keep original647 held.
Remote refs and issue-comment receipt are recorded with the local proof after
publication. Green local prerequisites do not establish integrated main.

## 6. Next active task

Before adding metadata GET recovery, reproduce and fix the current server's
owner-mismatch session/IP fallback using preserved `6b2d83d` and actual handler
tests. Current source still has that fallback; this checkpoint adds no metadata
lookup. Then reuse `f8db1d7` complete metadata custody and `3784636` confirmed
page save, including its empty-output review fallback. Original source work
and follow-up commits remain intact; do not substitute a new parallel pipeline.

Prove received scene -> intended project/document -> exact append -> saved
version -> relaunch -> settlement, including uncertain retry without a second
append and intervening writer edits. Retained initial setup, overlapping live
edit recovery `e31f351` and real iPhone screenplay export remain required before
original648. Existing writer export assertions use a DEBUG shortcut and cannot
prove backend/native screenplay export. Production/physical-phone/real-model/
Postgres/collaborator and integrated-main completion remain unproven.

## 7. Continue status

**READY FOR CONTINUE.** Goal active and incomplete. No need to wait on human
approval to fix the remaining local boundaries. Human non-author GitHub review,
shipping credentials/hold and real phone journey remain separate gates.
