# Page interruption policy extraction

Scope: one D009 I2 capability from ScreenplayLiveDraftBridge, not a broad rewrite.
The bridge still owns cancellation ordering, published state and editor requests.
ScreenplayStreamCancellationPolicy owns queued-mode classification, pending
insertion disposition, and writer-take-back reasons. ClementinePageInterruptService
uses the same reason policy instead of maintaining a second switch.

Behavior retained:

- Manual typing preserves the current draft and clears queued generated inserts.
- Rollback cancellation queues streamInsertCancel when streaming/synced work existed.
- Ordinary queued insertions are retained when cancelling an idle stream.
- Manual typing, barge-in and explicit cancel notify the backend even when local
  streaming is already idle. Other reasons do not notify.
- Cancellation happens before editor state changes; no networking moved into UI.

Tests enumerate all insertion modes and all 16 rollback/stream/sync/queue states,
plus reason routing. Existing service tests exercise injected backend cancellation.
Extraction-only signed simulator verification passed: 621 tests, zero failures
(/tmp/them-page-interruption-policy-ios-full.log). Final race-fix signed suite
passed on an erased simulator: 623 tests, zero failures, xcodebuild exit 0
(/tmp/them-page-cancel-race-green-full.log). No phone acceptance is claimed.
Diff/D009 pass: live-draft bridge shrinks by five lines. Extracting this decision
boundary matters more than that count: future cancellation behavior can now be
tested independently without initializing the application-wide bridge singleton.

## Reproduced race and fix

A successful delayed cancellation response unconditionally cleared the current
reservation, even if a new Page reservation had been installed. The controlled
regression failed against the original implementation: only old-reservation was
sent; new-reservation was never cancelled. Evidence:
/tmp/them-page-cancel-race-red.log (one failure, xcodebuild exit 65).

The service now versions local Page tracking. New Page starts and changed
reservation headers advance that identity. Cancellation completion can clear
tracking only when it still belongs to that identity and the task is not cancelled.
Deduplication is scoped to the identity, allowing a new headerless Page turn to
be cancelled immediately. Beginning a new turn drops the previous reservation ID.
requestPageCancel returns its task (discardable) so controlled tests can await
the exact completion without sleeps or exposing mutable internal state.

Limits: an already-sent session-wide cancellation request still needs backend
turn correlation to distinguish a subsequently started turn. The existing Bool
in-flight callback also does not identify which overlapping request completed.
These wider transport-contract issues are not resolved by the local identity fix.

Backend's first run in this worktree failed to load dependencies; stopped it and
linked the existing installed dependency directory after confirming lockfiles match.
The backend rerun completed with 2,738 passes, one failure and two skips: the
unchanged markdown-export fixture had a null attachment header. Its isolated
six-test suite passed. The complete repeat passed: 2,739 passed, zero failed,
two skipped (2,741 total). The first failure remains recorded, not waived.
Logs: /tmp/them-page-interruption-backend-ready.log and
/tmp/them-interrupt-markdown-isolated.log.
Green repeat: /tmp/them-page-interruption-backend-repeat.log.
Mac Scaffold Release build is running; no result claimed yet.
