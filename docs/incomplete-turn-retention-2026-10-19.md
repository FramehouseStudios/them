# T-1024 — Incomplete spoken-turn replay is not a completed write

## Root cause

VERIFIED by source inspection: OfflineTalkOutbox removed every 2xx request.
The production talk handler explicitly returns 204 for `continue_listening`,
200 audio for `asked_repeat`, and 200 for `error_recovered`. These responses
do not mean the requested writing was completed. Deleting the original
queued input hid the failure behind "Retained turn sent."

## Fix

Before acknowledging a successful `/talk` replay, inspect its existing
case-insensitive response headers. Retain as parked when status is 204,
`x-turn-status` is `continue_listening`, `asked_repeat` or `error_recovered`,
or `x-continue-listening` is `1`/`true`. Persist the reason and original request;
do not automatically resend it. Existing explicit Data Controls retry still
uses the same body and request key. Show retained reasons without a two-line
cap so the recovery instruction is readable on a narrow phone.

This policy only applies to `/talk`; 204 remains a valid acknowledgement for
the separate queued question-resolution endpoint. Legacy successful talk
responses without these explicit markers retain their existing behavior.
The success-commit event remains behind durable queue removal, so a parked
incomplete turn cannot enter that path. No new endpoint/store/framework.

## Focused proof

One signed check:
`OfflineTalkOutboxTests/testIncompleteSuccessfulTalkResponseRetainsOriginalAndNeverAutomaticallyReplaysIt`.
Six incomplete response forms, including mixed-case header names, whitespace,
204 with no headers, and a separate question-resolution 204 control.
Each talk form must remain parked across next-day relaunch, never auto-send,
and explicitly retry with the original UTF-8/CRLF bytes and request key.
An ordinary `responded` retry must clear the retained request.

The first signed run passed 1/0/0, exit 0, actual bundle:
`/tmp/them-1024-incomplete-turn/v1-ui-smoke-local-1-69344.xcresult`.
Its copy said "recording". I corrected it to "request" because this queue also
contains typed turns. File/log timestamps showed that edit happened three
seconds after the first run ended; that result is not proof of the final copy.
VERIFIED: the final focused run rebuilt and checked the corrected source:
1 passed, 0 failed, 0 skipped, exit 0. Signed Debug on erased task-owned
iPhone 17 Pro, iOS 26.2 (23C54). Actual bundle:
`/tmp/them-1024-incomplete-final/v1-ui-smoke-local-1-69891.xcresult`.
Logs: `/tmp/them-1024-incomplete-final.log` and
`/tmp/them-1024-incomplete-turn.log`.
Both bundles/logs retained in
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1024-20261019.EWhYty/`.
No broad local suite or paid model call.

Command: `IOS_SIMULATOR_DESTINATION='platform=iOS Simulator,id=11CF5EFB-D8C3-4F19-8062-28AF37F27D93' ONLY_TESTING=themTests/OfflineTalkOutboxTests/testIncompleteSuccessfulTalkResponseRetainsOriginalAndNeverAutomaticallyReplaysIt ARTIFACT_DIR=/tmp/them-1024-incomplete-final XCODEBUILD=/tmp/them-994-xcodebuild scripts/run_v1_ui_smoke.sh`

VERIFIED: D009 vs parent `0ad5a47e` passes, all five protected files unchanged;
whitespace check passes. Backend is unchanged from T-1023's Node 20 full
2,992/0/2 result; no new backend-suite claim for this Swift change.

## Still incomplete

This preserves an incomplete request; it does not turn it into generated pages.
The check uses synthetic response transport, not the phone microphone, paid
models, server generation or interactive Data Controls. Ordinary successful
response/audio retention, original-project screenplay application and the full
shipping-backend/physical-phone journey remain open. Manual retry can still
duplicate an already-processed request beyond the server's cache lifetime.
No original PR head/main/deployment/protection changes.
