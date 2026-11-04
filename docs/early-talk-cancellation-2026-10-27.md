# T1179 — Stop the waiting audio HTTP request without replaying it

## Contract and ownership

DECIDED: keep the existing URLSession transport, redirect policy, authentication,
retry and offline outbox owners. Jarvis owns implementation and proof; Zora
provided a bounded read-only source review. No provider calls, production changes,
original PR advances, main merge or replacement PR are authorized by this task.

Base: `d5a155e5011c80a2138bd38767c77d29b79230a6`, published T1178.
Branch: `codex/T-1179-early-talk-cancel` in
`/Users/halfmutantfilms/io.them-worktrees/codex-interrupted-talk-recovery`.

Success is limited to the client transport: cancelling before response headers
must stop the actual URLSession task, settle the await as cancellation, and avoid
retry/fallback/offline enqueue. Genuine offline failures and exact successful
stream bytes must retain their behavior. Server ASR cancellation and queued UI
consumer delivery are different boundaries, listed below.

## Reproduced failure and smallest correction

VERIFIED: the original delegate used a checked continuation without a Swift task
cancellation handler or retained URLSessionDataTask. `finishTasksAndInvalidate`
ran only after that continuation returned and allowed work to finish. A held
URLProtocol request reproduced Stop leaving the HTTP task and await running.
An already-cancelled operation also entered the network.

VERIFIED: the primary `performTalk` catch sent every transport error to the
offline outbox. Bridging network cancellation without fixing this catch would
allow an explicitly stopped story to be queued again.

The existing delegate now lives in `BackendTalkStreamingTransport.swift`; the
old nested implementation was removed. Its cancellation handler cancels the
real data task. One locked terminal result owns continuation attachment and
completion, including cancellation before attachment. A recursive lock permits
a consumer to cancel synchronously from a response callback and suppresses new
delegate callbacks after cancellation wins. Checks before retry, fallback,
result handling and offline enqueue normalize explicit cancellation without
changing genuine offline error classification. Fallback callbacks also recheck
cancellation after response delivery and before returning.

The ephemeral streaming session retains its original timeouts/cache policy and
redirect guard. It now honors the injected URLSession's `protocolClasses`, so
the actual client path can use a held test protocol without an alternate client,
authentication bypass, real provider, or test-only production branch.

## Proof ledger

All native runs use signing ON and erase only task-owned simulator
`91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A`, iPhone 17 Pro / iOS 26.2 (23C54).
Artifacts: `/private/tmp/them-1179-proof/`; permanent verified copy below.

- Initial characterization: **1 pass / 3 failures / 0 skips**, four cases.
  Two failures demonstrate product cancellation defects. The third was a test
  error: URLSession coalesced the two synthetic chunks into one callback.
  The corrected assertion compares concatenated callback bytes to exact final
  bytes and does not assume network chunk boundaries.
- Focused corrected native transport/client suite: **7 / 0 / 0**,
  `transport-fixed.xcresult`. Covers held pre-header cancellation, pre-cancelled
  entry, exact success bytes/chunks, synchronous cancellation from the response
  callback, Foundation cancellation normalization, genuine offline failure
  classification, and the actual `talkText` retry/outbox boundary.
  The actual-client case observed one `/talk` attempt, bounded cancellation,
  no queued error and unchanged recovery entry IDs.
- Full final signed unit checkpoint: **909 / 0 / 0**,
  `units-complete.xcresult`, including the seven cancellation/client cases.
- macOS scaffold build: **exit 0**, `macos-complete.log`.
- Initial unchanged Stop UI checkpoint: **0 / 1 / 0**, `stop-complete.xcresult`.
  Preserved activity timestamps show Stop tap began at 21:27:32.284Z, then
  XCTest waited for SpringBoard's “Ready for Apple Intelligence” setup banner.
  Actual synthesized tap was at 21:27:39.934Z; app playback/reveal had completed
  at 21:27:38Z. The active-write interruption window was missed. Zora's source
  review confirmed that completed reveal plans cannot be rolled back by that
  assertion. This run is **not evidence of a transport regression**.
  Added a targeted UI interruption monitor that swipes away only this observed
  OS setup notice. No rollback, capture, late-insert or authenticated server
  cancellation assertion was removed or relaxed. Corrected Stop proof:
  **1 / 0 / 0**, `stop-banner-handled.xcresult`; authenticated server cancellation
  **HTTP 200 / cancelled true / dropped 1 / byReservation true**. Empty baseline,
  capture off and no late insert/rearm assertions passed. Intercepted provider
  counts STT1/chat2/TTS23 establish transport, not microphone/model quality.
- Ordinary raw Home full-page/save/exact-relaunch checkpoint: **1 / 0 / 0**,
  `raw-complete.xcresult`. Complete synthetic scene, one project, matching saved
  version and exact restored page passed; this is not a claim of exactly one
  saved version. Intercepted STT1/chat2/TTS23, no paid calls.
- D009: pass against fetched exact `origin/codex/T-1178-wallet-page-owner`.
  All five monitored files are unchanged. The initial gate attempt could not
  compare because the remote-tracking ref was missing; fetching that published
  parent resolved the proof setup without changing the baseline.
- `git diff --check`: pass. Backend shipping files are unchanged; the full
  T1178 Node20 result **2996 / 0 / 5** is inherited, not a new T1179 run.

Canonical native command uses `scripts/run_v1_ui_smoke.sh -quiet`,
`ONLY_TESTING=themTests/BackendTalkStreamingTransportTests` (focused) or
`themTests` (checkpoint), the explicit simulator destination and the owned
`/private/tmp/them-1169.i0WAHZ/xcodebuild-owned` wrapper. Each run has its own
result bundle and log under the proof directory.

## Adversarial review and remaining boundaries

Zora independently source-reviewed the fix without editing or using native
resources. No lost-continuation or double-resume defect was found. Her fallback
callback finding was corrected before the full unit checkpoint. Her review is
an engineering audit, **not** a human GitHub approval or additional test result.

- Answered by runtime proof: Stop before headers cancels the URLSession task;
  actual client does not retry or enqueue it; ordinary stream bytes are exact;
  genuine offline errors remain offline errors. Cancellation from a response
  callback does not deliver later chunks or a successful result.
- Partially addressed: locked terminal ownership covers cancellation before
  continuation attachment in source. The pre-cancel case tests the entry guard;
  it does not deterministically force the narrow creation/attachment race.
- **Next bug — queued UI delivery:** BackendClient dispatches metadata, text and
  first audio onto the main queue; Root adds further Tasks. A callback queued
  before Stop can run afterward. The transport cannot retract an already-issued
  callback. Reuse the existing turn-current predicate at consumer execution;
  prove deferred delivery cannot restart playback or preview after Stop.
  This task does not claim that consumer boundary fixed.
- Not covered: server work before raw-audio classification/reservation headers,
  ASR provider abort, or cross-host cancellation. Do not equate a dropped TCP
  connection with explicit Stop: accepted paid responses must retain custody.
- Existing completed-response expiry, metadata size and legacy/unkeyed delivery
  limits remain. No indefinite delivery or refund guarantee is introduced.
- Production remains held; physical microphone, live model quality and the
  complete real-iPhone journey against a named shipping backend are unproven.

## GitHub and continuation

Original/main heads are preserved. Current review read on October 27 still
shows only a DISMISSED review on #964 and no reviews on #638. The human chose
to review later; no new approval was requested or submitted by an agent.
This local proof cannot substitute for exact updated-head hosted gates or
genuine independent approval. Preserve a scoped backup after final checks.

Next implementation target: queued consumer delivery after Stop, then remaining
delivery-expiry custody and original-stack integration. Full product goal stays
active and incomplete.

## Exact changed files

```text
TASKS.md
docs/early-talk-cancellation-2026-10-27.md
them/BackendClient.swift
them/BackendTalkStreamingTransport.swift
themTests/BackendTalkStreamingTransportTests.swift
themUITests/V1SmokeUITests.swift
```

## Preserved proof receipt

Runtime commit: `71c72f5e8831439a8976c63fa5684920625e2825`.
All native proof processes are terminal, and the task-created borrowed
dependency symlink was removed. Worktree was clean at that runtime commit.

Permanent local proof:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1179-20261027.aduxe7d0`.
The preserved runtime source, logs, six xcresult bundles and exported failure
evidence contain **5,689 hashed files / zero hash mismatches**.
`SHA256SUMS` SHA-256:
`94afb6fcfe7e202bfc5cb705b291c1eecc123c8ffa65810090d662c253bf3f1d`.
Publication documentation/receipt is supplementary and does not change that
fixed runtime proof manifest.

Remote read at 21:31Z still shows main
`78b8c94f43b4a11f18c2e61df556b9cd7370e735` and original #647
`848e59d040dc935d082beaeb7dc21c51faee4222`. Normal publication may update
only the scoped backup `codex/T-1179-early-talk-cancel`; it cannot establish
hosted proof on the untouched original PR or integrated main.

READY FOR CONTINUE. Next: queued UI consumer delivery after Stop. No paid
provider calls or complete-product claim.
