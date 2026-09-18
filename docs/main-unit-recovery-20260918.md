# Main unit-bundle recovery evidence

Base: `647e01f` (origin/main). Xcode 26.3 (17C529), iPhone 17 Pro simulator,
iOS 26.2 (23C54). Normal simulator signing retained; no simulator reset.

## Reproduction

- Untouched main: `bash scripts/run_ios_unit_tests.sh` passed 618/618.
- Repeating every test three times with `test-without-building -test-iterations 3`
  failed (exit 65). The result bundle reports 1,853 passing executions and one
  failure: `BackendAccountDataControlsTests/testBackendLiveAuthDefaultsNotificationArrivesOnMain`.
- Failure: multiple calls to `XCTestExpectation.fulfill` for the live auth
  defaults notification caused `NSInternalInconsistencyException`.
- The final console suite summary hid this failure after the runner restarted;
  the xcresult summary, not that console tail, is authoritative.

## Change

The notification test observes process-wide defaults changes and filters by the
current value. That does not imply exactly one notification. Permit duplicate
fulfillment while asserting main-thread delivery on every matching notification.
Remove the shared mutable Boolean. Delivery timeout and persisted-value checks
remain. Production code, test selection, and gate thresholds are unchanged.

## Candidate verification

- Full signed unit bundle with `-test-iterations 3`: 1,854/1,854 executions
  passed, zero failures (618 unique tests).
- Full backend suite: 2,739 passed, zero failed, two skipped (2,741 total).
- `git diff --check`: passed.
- Default `RUN_QUALITY_GATE=1 bash scripts/quality_gate.sh`: exited 2 at missing
  `OPENAI_API_KEY`. Canon and page-craft stages ran before this blocker. The
  complete quality gate is **not green**; no checks were disabled.

Logs: `/tmp/them-main-unit-baseline-20260918.log`,
`/tmp/them-main-unit-repeat-20260918.log`,
`/tmp/them-main-unit-candidate-20260918.log`,
`/tmp/them-main-recovery-backend-tests.log`,
`/tmp/them-main-recovery-quality-gate.log`.

This fixes a reproduced failure in the reported suite, not a proven cause of
the separately reported SwiftUI publishing storm. That storm did not reproduce
here; the failing external xcresult/log and environment are requested. Keep the
PR draft pending that comparison, full quality-gate proof, and Claude re-proof.
The human merges. No feature chain or production deployment is included.
