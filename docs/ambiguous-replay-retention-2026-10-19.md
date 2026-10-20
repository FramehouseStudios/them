# T-1020 — Ambiguous replay transport failure

## Root cause and implementation

VERIFIED by source inspection: OfflineTalkOutbox treated every thrown
transport failure as retryable pending work. A timeout, dropped response or
cancellation can happen after the server processes the request. Automatically
replaying after its short-lived idempotency cache expires risks duplicates.

The queue now parks `URLError.timedOut`, `networkConnectionLost`, `cancelled`
and Swift `CancellationError`, preserving its original request bytes and key.
The existing Data Controls recovery UI exposes the reason and explicit retry.
No new persistence framework or automatic provider call is introduced.
The change does not claim exactly-once delivery: a human-approved retry can
still repeat already-processed work. A durable server reconciliation contract
is needed to resolve that uncertainty rather than merely warn about it.

## Verification scope

One focused signed test exercises the four ambiguous errors plus clearly
offline `notConnectedToInternet`. For ambiguous failures it checks parked
state, no automatic send after next-day relaunch, original request identity,
then exact-body/key explicit retry. The offline control must remain pending
and send normally when due. The transport is synthetic; this does not prove
physical-device networking or live provider behavior.

Command: `IOS_SIMULATOR_DESTINATION='platform=iOS Simulator,id=11CF5EFB-D8C3-4F19-8062-28AF37F27D93' ONLY_TESTING=themTests/OfflineTalkOutboxTests/testAmbiguousTransportRetainsOriginalWithoutAutomaticReplayAfterRelaunch ARTIFACT_DIR=/tmp/them-1020-ambiguous-replay XCODEBUILD=/tmp/them-994-xcodebuild scripts/run_v1_ui_smoke.sh`

VERIFIED: 1 passed, 0 failed, 0 skipped; runner exit 0, signed Debug on the
erased task-owned iPhone 17 Pro, iOS 26.2 (23C54). Actual result bundle:
`/tmp/them-1020-ambiguous-replay/v1-ui-smoke-local-1-64709.xcresult`.
Log: `/tmp/them-1020-ambiguous-replay.log`. Evidence copied to
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1020-20261019.UBGBZt/`.
No broad local suite or paid model call. D009 initially failed closed because the fresh parent tracking
ref was absent; fetching exact `origin/codex/T-1019-replay-conversation-sync`
(`056e3652`) restored the comparison and all five guarded files were unchanged.
Whitespace check passes.

## Not covered

- Initial BackendClient immediate attempts and its eventual enqueue policy.
- HTTP 408/5xx ambiguity, server process restart, or durable owned receipts.
- Full integrated main, recovered audio/page application or physical phone.
- Production deployment (still held by the human).

This candidate preserves the original integration PRs. It does not advance
#963, merge main, change review protection or replace an existing PR.
