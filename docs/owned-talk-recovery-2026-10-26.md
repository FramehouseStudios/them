# T-1166 — Account-bound queued-turn recovery

October 26, 2026. Branch `codex/T-1166-owned-talk-recovery`.
Parent `31b90b90f4b232729040001dde39821e472d1c03`.
Reproduction `7f0dc45`; runtime `95399ffbda55807322b5f79888f79715de586a6f`.
The product goal remains active. This is a saved integration checkpoint, not
main, production, physical-phone or live-model proof.

## 1. Completed and root causes

VERIFIED seven current client/filesystem regressions failed before the fix:
question resolution, realtime commit and a character-memory batch followed a
changed login; queue deduplication collapsed different owners/destinations;
changed bytes received an earlier payload's queue acknowledgement; foreign
parked work appeared in the current account and could be removed; an inactive
backend consumed retry state without a valid send.

Reuse preserved canonical `ac81718` and `aa913df` through the existing request
identity, Studio auth context, queue, recovery slot and notification dispatcher.
No second authentication, HTTP or queue framework. Capture initiating login
before suspension, retain it across a complete character batch and validate
again before publication. Invalidate shared read caches when the login changes.
Extract the existing notification declarations/dispatcher into a capability
file; asynchronous delivery rechecks ownership at delivery, avoiding auth-lock
reentrancy and stale queued notifications. Remaining direct Memory API calls
reuse the existing redirect guard; no new origin policy is introduced.

Queue identity now includes owner and destination, and an accepted retry must
have identical body bytes. A different body is retained separately, parked and
reported as a conflict instead of falsely acknowledged or automatically sent.
Recovery presentation, replay, export and confirmed cleanup are account/backend
bound. Unknown-owner legacy entries stay unassigned. Replay uses current auth
for the initiating login and the original durable request key/body; a changed
account/backend does not consume unrelated retry state. Manifest persistence
precedes acknowledged-body cleanup or confirmed deletion. Corrupt/ambiguous
manifests fail closed and remain available for repair.

Data Controls captures the confirmation's account, backend and exact entry IDs.
Cancel leaves work untouched; later entries and other accounts are excluded.
Recovery export contains a versioned exact base64 body and metadata, without
credential headers. Its contents are still private writer data.

## 2. Verification ledger

- Actual signed red: **0 passed / 7 failed / 0 skipped**, 18 assertions, at
  `7f0dc45`. Retained client interception and real temporary-disk evidence;
  these are not assertions against a fake implementation of the fix.
- Final full signed native units at `95399ff`: **850 / 0 / 0**. Normal signing,
  erased task-owned simulator `91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A`, iPhone
  17 Pro, iOS 26.2 (23C54), Xcode 26.3 (17C529).
- Actual authenticated Data Controls recovery UI: **1 / 0 / 0**. Foreign row
  hidden, unassigned warning retained, Files export cancellation, deletion
  cancellation, native Files Save and exact confirmed deletion. Intercepted
  ASR/chat/TTS counts **0 / 0 / 0**. The strict dedicated runner requires a
  real pass, not a skipped test without its backend.
- After the human unlocked the Mac, manually opened the actual saved JSON in
  native iOS Files Quick Look outside THEM. Independently decoded its body and
  compared original CRLF/tab/trailing whitespace exactly. Export **306 bytes**,
  SHA256 `3619ad54b2ba2acf6044e45ab93324f6f3b57007b1f51dabd1d887da7721b159`.
  Remaining manifest has exactly foreign and unassigned entries, both parked,
  original bodies **29** and **28** bytes respectively, with hashes in the
  independent byte-check artifact. The confirmed owned entry/body is absent.
  This is a synthetic queued-turn JSON export, not screenplay PDF/MD export.
- Final authenticated screenplay recovery UI: **3 / 0 / 0**. Exact offline
  bytes survive termination/reconnect; conflict choice/resolution stays once;
  actual local save401 -> refresh200 -> returned-bearer save201 occurs exactly
  once and survives another relaunch. Terminal xcresult elapsed 73.086 seconds
  for all three tests; this is suite time, not an app-response latency claim.
- Raw-audio Home -> formatted page -> one project/save -> restored draft:
  **1 / 0 / 0**, intercepted ASR/chat/TTS **1 / 2 / 1**. No actual microphone,
  audible/model relevance or paid-provider claim.
- macOS desktop scaffold: **BUILD SUCCEEDED**, exit 0. Existing compiler and
  concurrency warnings remain; no macOS UI or warning-free claim.
- D009 versus the actual saved parent: Memory API **10,592 -> 10,553 (-39)**;
  index **33,557**, Studio **17,345**, Root **14,953**, bridge **12,864**, all
  other deltas zero. No count padding or gate exception. Diff check and Node
  syntax check pass.
- Backend runtime/tests/dependencies unchanged in this pass; only the existing
  Home UI runner's allowlist gains the dedicated recovery case at its end.
  Default first two cases remain unchanged. No repeated full backend run is
  invented: reuse T-1158's source-equivalent Node20 **2869 / 0 / 2**, with
  T-1163's 15 focused checks separate. Local UI fixture servers use pinned
  Node20.20.2, isolated data, required auth, a fake key and intercepted providers.

The current prefix lacked the native Files helper needed by the preserved UI
case. Reuse only `2369367`'s bounded picker detection/dismissal helper; do not
import its later product/export ancestry or substitute an optimistic status
label for actual Files observation. Baseline regression tests were adapted to
the explicit ownership/confirmation API without weakening retained-byte checks.

## 3. Adversarial disposition and remaining boundaries

Answered for the exercised boundary: login changes during bootstrap/batch/
deferred notification; current-token rotation; owner/origin filtering; exact
retry versus changed payload; stale confirmations; later parked entries;
malformed/duplicate/shared-reference manifests; failed manifest-before-delete;
one refresh/replay with original bytes and request ID; actual native export.

Not covered by this checkpoint: atomic body/index enqueue, orphan reconciliation,
settlement after failed unlink, physical microphone/audible/model relevance,
real Postgres/collaborator authorization, shipping backend, physical iPhone,
screenplay export, or power-loss/fsync guarantees. The queue's live transport
still needs the existing redirect guard; preserved `c1e9255` includes that wire
alongside the interrupted-enqueue correction. Do not advance original647 or
describe its complete safety chain as ready before these are integrated.

Highest-value next repairs: preserved T-1108 server/client atomic first creation
(`370fd41`, `2b51d72`) and T-1112 interrupted queue recovery (`c1e9255`). This
pass does not make separate metadata/first-version requests crash-safe.

## 4. Exact files changed

- `TASKS.md` and this report: ownership, results and next boundary.
- `backend/evals/run_home_voice_handoff_ui_smoke.mjs`: dedicated case allowlist.
- `them/BackendClient.swift`: preserve queue admission/conflict errors.
- `them/BackendMemoryAPI.swift`: remaining request/batch/cache ownership and
  existing redirect delegation; extracted notification declarations.
- `them/BackendNotifications.swift`: canonical deferred notification delivery.
- `them/DataControlsScreen.swift`: scoped recovery, export and confirmations.
- `them/MemoriesScreen.swift`, `them/ScreenplayStudioViewModel.swift`: reject
  stale pending-question results.
- `them/OfflineTalkOutbox.swift`, `them/OfflineTalkRecovery.swift`: one existing
  queue with scoped exact-byte recovery/replay/export/deletion contracts.
- `them/RootExperienceView.swift`: account/backend-aware queue notification UI.
- `themTests/BackendNotificationOwnershipTests.swift`.
- `themTests/BackendProjectWriteBoundaryRegressionTests.swift`.
- `themTests/BackendProjectWriteOwnershipTests.swift`.
- `themTests/OfflineTalkOutboxTests.swift`.
- `themTests/OfflineTalkRecoveryBoundaryRegressionTests.swift`.
- `themTests/OfflineTalkRecoveryOwnershipTests.swift`.
- `themUITests/V1SmokeUITests.swift`: actual authenticated recovery UI and
  canonical native Files helper.

## 5. GitHub and evidence retention

Fresh remote refs: main `78b8c94f43b4a11f18c2e61df556b9cd7370e735`;
original647 `848e59d040dc935d082beaeb7dc21c51faee4222`; lower646
`acfe2d8f58df4871eb226baee67890b188b60dec`. No original head, main, review,
protection, deployment, DNS, secret or accepted decision changed. Preserve all
history with a normal scoped backup push only; no force/squash/replacement PR.

Permanent evidence:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1166-20261026.WjxRTs/`.
VERIFIED 3,098 retained files SHA256-readback matched, including the exact
runtime public-source archive, red/final bundles, logs and independent export
byte check. GitHub publication is recorded separately in that folder; a scoped
backup push is not evidence of hosted CI or a main merge. No human account or
files were deleted; destructive assertions use disposable synthetic fixtures.

## 6. Next active task

Integrate the existing atomic first-save transaction and durable client intent,
then interrupted enqueue reconciliation, reproducing those current boundaries
before claiming them fixed. Preserve the original PR chain and continue toward
observed phone proof. No new feature expansion or paid model run.

## 7. Continue status

READY FOR CONTINUE. Overall goal incomplete; independent review, intended
shipping-backend readiness and real-phone journey remain distinct requirements.

