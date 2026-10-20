# T-1025 — Durable on-device replay results

## Root and implementation

VERIFIED by source: successful OfflineTalkOutbox replay discarded returned
audio/body and removed the original request. History refresh was connected by
T-1019, but a recoverable complete local response did not exist.

Extend the existing outbox's protected storage, not a second queue/framework:
write the response bytes and allow-listed result metadata before removing
the queue entry. Retain the original request blob with it. A response JSON
commit is atomic; queue acknowledgement follows. Failure leaves the original
request parked, not silently removed. On relaunch a saved response matching
the owned entry ID and original request key reconciles an interrupted queue
ack locally without another network send.

Data Controls exposes dated recovered results and a review sheet containing
saved transcript/reply, full screenplay text when present, a project ID
explicitly labeled as reported by the service, native text/file sharing and
confirmed deletion. No automatic screenplay insertion or playback. Zero-byte
response files are not offered for sharing. A missing full page result is
marked as preview-only. The existing Home banner announces an increase in
recovered results, without re-announcing the same count on every health poll.

The response header reader is extracted into one owner used by BackendClient
and recovery. Its percent-decoding/trimming behavior is preserved. Full page
JSON text remains verbatim. Response-header names are allow-listed; arbitrary
cookies/internal headers are not retained. Session commit identifiers remain
private in protected local metadata and are never included in text/file-share
payloads. File shares expose only the response body, not the private receipt
or original request headers.

## Identity, retention and failure boundaries

- Visible rows/counts and file/delete actions use current canonical credential
  ownership. Identity changes dismiss the review and clear its presentation.
- Stale owner actions fail; a response arriving after an account switch is
  retained under its original request owner, not shown to the new writer.
- Deletion first reconciles matching queued acknowledgement, then removes the
  receipt and its two owned blobs. Failed cleanup reports possible residual
  local files rather than claiming complete erasure.
- Malformed/unreadable receipt metadata fails closed before queue replay.
- These local recovery copies persist until explicit deletion. UI states that
  clearing server history does not remove them. Release privacy/retention copy
  remains human-owned; this is not an App Store/privacy readiness claim.
- A saved response prevents re-sending that known-successful local request;
  this is not a durable server idempotency guarantee for unknown outcomes.

## Actual verification

Initial signed outbox run: 22 passed / 0 failed / 0 skipped, exit 0;
`/tmp/them-1025-recovered-results/v1-ui-smoke-local-1-70845.xcresult`.

Then connected the Home result notice, suppressed empty shared files and
extended the canonical account-switch test to cover recovered results.
VERIFIED final signed outbox run: 22/0/0, exit 0, erased task-owned
iPhone 17 Pro `11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, iOS 26.2 (23C54):
`/tmp/them-1025-recovered-final/v1-ui-smoke-local-1-71460.xcresult`.
Log: `/tmp/them-1025-recovered-final.log`.

Command: `IOS_SIMULATOR_DESTINATION='platform=iOS Simulator,id=11CF5EFB-D8C3-4F19-8062-28AF37F27D93' ONLY_TESTING=themTests/OfflineTalkOutboxTests ARTIFACT_DIR=/tmp/them-1025-recovered-final XCODEBUILD=/tmp/them-994-xcodebuild scripts/run_v1_ui_smoke.sh`

The new filesystem checks prove exact response bytes/full page header text,
request bytes/key retention, relaunch, no network send after a saved response
plus failed manifest ack, header allow-list, owner-checked deletion and stale
account refusal. The existing owner fixture now proves completed results and
counts disappear for another writer/sign-out, stale file/delete actions fail,
and the original account can recover its text-only result without an empty
share file. Synthetic audio bytes are not playback proof. No paid model call.

VERIFIED: D009 against `92a1329a` passes, all five guarded files unchanged;
whitespace check passes. No new full backend/unit/UI suite or macOS proof.
Backend source is unchanged from T-1023's Node 20 result (2,992/0/2).
Both signed bundles/logs retained in
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1025-20261019.WuNe0d/`.

## Remaining completion work

The review UI compiles but has not been interacted with or visually inspected
in this pass. Native share destination opening, real audio playback and the
shipping-backend/physical-phone journey remain unproven. Full page headers
are size-limited server-side; missing page metadata must be fetched through
the owned turn endpoint rather than treating a preview as a complete page.
The original project/revision/write identity needs immutable request-context
capture and comparison with the current editor before any application.

Original #962 at `527c58d6`: hosted backend, D009, signed units, writer loop and
V1 UI steps passed; required offline-save recovery was running when checked.
No original head replacement, main merge, review bypass or production change.

## Files changed

`them/BackendClient.swift`, `them/OfflineTalkOutbox.swift`,
`them/RecoveredTalkReply.swift`, `them/RecoveredTalkReplyReview.swift`,
`them/DataControlsScreen.swift`, `them/RootExperienceView.swift`,
`themTests/OfflineTalkOutboxTests.swift`, `TASKS.md`, this proof document.
