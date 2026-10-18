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

## Corrected startup-storm triage (2026-09-18)

Claude supplied the historical log and a corrected control run in
`/Users/halfmutantfilms/io.them-worktrees/_pr_bodies/hang-2026-09-13/`.
The README records untouched main `647e01fc` passing 618 tests with zero
failures and zero storm lines after erasing the simulator, on the same
Xcode/runtime. The original comparison used different persisted simulator
state; it does not establish a main-specific regression.

The historical log reports a publishing storm during host-app startup. The
specific persisted-state trigger remains unproven. Track this as a separate
startup investigation, not a prerequisite for re-porting the closed branches.
Reproduce using a disposable simulator with test-owned signed-in/draft state;
do not erase the user's physical phone or destroy useful reproduction state.

Future baseline proof runs must begin on an erased, dedicated test simulator
and record its identity and reset status. The three-repeat results above were
not reset runs and remain explicitly labeled as such. Clean-state proof is
not proof of correct persisted-session restoration; retain separate warm-state
coverage for startup and session recovery.

This PR fixes the independently reproduced duplicate-notification test failure,
not the SwiftUI startup storm. Keep it draft pending full quality-gate proof
and Claude re-proof, but do not make it a dependency of the session-churn port.
The re-land order and billing, orphan-module, naming, and human-merge safeguards
remain unchanged. No feature chain or production deployment is included.
