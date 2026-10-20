# T-1021 — Foreground ambiguous turn retention

## Root and change

VERIFIED by source inspection: BackendClient retried transport timeouts and
connection loss immediately, then enqueued final failures as pending work.
T-1020 parked ambiguous *outbox* failures but did not protect this initial
request path. A missing response is not proof that a write did not happen.

Move the existing ambiguity classification and explanatory message to one
nonisolated owner on OfflineTalkOutbox. Both the queue and BackendClient reuse
it. The foreground `/talk` transport skips automatic retries for these errors;
its existing recovery store retains the original request as parked, not
pending. Clearly offline errors retain the normal retry path. No new store,
auth flow, provider call or dependency. Metadata-fetch retry is unchanged.

## Focused proof plan and actual command correction

The existing loopback HTTP fixture gains an interrupted-reply mode: receive
the complete multipart request, send HTTP 200 with a declared 4,096-byte audio
body, send only one byte, then close. The real URLSession delegate must surface
the failure, retain one parked request, and avoid another `/talk` or `/session`
request. Relaunch must not automatically replay it; explicit retry must keep
its original request key and story text. This is a local transport proof,
not real speech, provider writing, real server persistence or playback.

The first command incorrectly combined two XCTest selectors with a comma.
I identified the malformed selector, verified the owned xcodebuild process
(PID 65881), interrupted it before any test ran, and observed runner exit 75.
That interrupted run is not a pass or a product failure; its log remains
`/tmp/them-1021-foreground-recovery.log`.

Corrected command (uses two separate Xcode selector arguments):

`IOS_SIMULATOR_DESTINATION='platform=iOS Simulator,id=11CF5EFB-D8C3-4F19-8062-28AF37F27D93' ONLY_TESTING=themTests/BackendClientCraftAPITests/testInterruptedTalkReplyRetainsOriginalWithoutAutomaticForegroundOrBackgroundRetry ARTIFACT_DIR=/tmp/them-1021-foreground-recovery-corrected XCODEBUILD=/tmp/them-994-xcodebuild scripts/run_v1_ui_smoke.sh -only-testing:themTests/OfflineTalkOutboxTests/testAmbiguousTransportRetainsOriginalWithoutAutomaticReplayAfterRelaunch`

VERIFIED: 2 passed, 0 failed, 0 skipped; runner exit 0, signed Debug on erased
task-owned iPhone 17 Pro, iOS 26.2 (23C54). The actual interrupted-response
case passed and observed one `/talk` and one `/session`, parked retention
across relaunch, no automatic replay and successful explicit retry retaining
the key and story text. Actual bundle:
`/tmp/them-1021-foreground-recovery-corrected/v1-ui-smoke-local-1-66002.xcresult`.
Log: `/tmp/them-1021-foreground-recovery-corrected.log`.
Evidence preserved in
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1021-20261019.FCEcGt/`.
The second selected check
covers four ambiguous error types plus an offline control through the shared
policy, exact-body/key explicit retry and next-day relaunch behavior.
No broad local suite or paid model call. D009 against exact parent `7975df9b`
passes with all five guarded files unchanged. `git diff --check` passes.

## Remaining boundaries

HTTP status retry semantics are unchanged. User-approved manual retry can
still duplicate an already-processed request without durable server receipts.
Automatic History refresh is connected by T-1019, but foreground recovered
reply/audio and project-specific screenplay application remain unproven.
No physical-device or intended-shipping-backend proof; production remains held.
Original PRs are preserved and main is untouched.
