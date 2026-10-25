# T-1141 — Exact hosted recovery-export failure

## Authoritative state

Published original974 head `8d519bd6284dccebd5058274e8724c63b9efe949`;
run40170181825 is terminal failure, not an observation timeout. The failed step
is the required broad V1 UI smoke, at line2219 in
`test_talk_recovery_exports_current_owner_and_confirms_exact_deletion`.

Retained hosted bundles prove:

- signed units959 pass/0 fail/0 skip;
- required integrated writer1/0/0;
- broad V135 pass/1 fail/22 skip;
- backend2964 pass/0 fail/4 skip and D009 jobs succeed; counts read from the
  exact completed backend job121099259067, not inferred from an older branch;
- later offline-save recovery and voice-fault/macOS steps were skipped, not green.

Artifact12591670512 (`quality-gate-failure-logs`) is retained locally under
`/private/tmp/them-974-ci-40170181825.VGD9WK/`. Failure log:
`/private/tmp/them-974-40170181825-failed.log`. Exported test-only attachments
include the29.37-second original recording and the26-second frame
`recovery-export-attachments/after-export.png`. The generic only-failures export
had no matching attachment; explicit test-id export recovered the recording.

## Diagnosis boundary

VERIFIED: the event log shows Review, Cancel, then a single Export tap. The
recording shows a blank white panel afterward; no Browse/filename UI was detected
before failure. This is not merely the already-corrected filename-ID assumption.

The exact unchanged test passes locally1/0/0 on Xcode26.3/iOS26.2, on the erased
task-owned91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A. Its existing fixture points to
loopback port9, signs out and disables authenticated/provider transport. No live
model, paid request or real user's queued turn is involved.

ASSUMPTION / experiment: hosted DocumentUI readiness may exceed the raw five-
second wait. The failure record does not establish whether it would eventually
load or whether a runtime presentation fault persists. Do not rewrite runtime
or call this root cause confirmed from one platform difference.

VERIFIED source mismatch: Studio's Files paths already use writerLoopWait,
whose documented hosted default scale is8; these recovery paths used raw5/8
seconds. The candidate applies the existing bounded readiness policy and adds
real Save-button hittability, not an injected success or a repeated tap. A
permanently blank picker still fails. Timeout screenshots/hierarchy are retained.
All owner, Cancel, actual Save, exact deletion and legacy-row assertions remain.

## Local proof and pending hosted requirement

Baseline: `/private/tmp/them-1141-export-before.xcresult`,1/0/0.
The first two-case invocation incorrectly used one comma-separated ONLY_TESTING;
the wrapper does not split it. Result unknown/0 tests despite exit0. It was
rejected as proof and retained in `them-1141-export-fixed.xcresult`.
Corrected invocation supplies the first selector via ONLY_TESTING and the second
as a separate xcodebuild `-only-testing:` argument. Corrected result is exactly
**2 pass/0 fail/0 skip**, exit0, and the summary was positively asserted to have
two executed passes, not merely a successful xcodebuild exit. Bundle
`/private/tmp/them-1141-export-two-paths.xcresult`.

Actual corrected command:

```sh
ONLY_TESTING='themUITests/V1SmokeUITests/test_talk_recovery_exports_current_owner_and_confirms_exact_deletion' \
IOS_SIMULATOR_DESTINATION='platform=iOS Simulator,id=91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A' \
  bash scripts/run_v1_ui_smoke.sh -quiet \
  -derivedDataPath /private/tmp/them-1141-ios-dd \
  -resultBundlePath /private/tmp/them-1141-export-two-paths.xcresult \
  '-only-testing:themUITests/V1SmokeUITests/test_received_talk_reply_is_held_across_relaunch_and_exported_without_resend'
```

Runtime/backend/scripts/Packages/workflow byte equality to8d519bd was checked;
`git diff --check` passes. Existing Swift6 warnings remain. No hosted26.5
success, external-app preview, phone or production claim follows from2/0/0.

Permanent local evidence archive:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1141-20261025.kgt8c1/`.
Keep hosted failure, local baseline, rejected zero-selector and corrected
results separately. No earlier red artifact is removed or relabeled green.

Exact files changed: `themUITests/V1SmokeUITests.swift`, `TASKS.md`,
`docs/recovery-export-readiness-2026-10-25.md`.

No runtime/backend/scripts/Packages/workflow file is changed. No unchanged full
backend/unit/macOS rerun is warranted for this UI-test-only readiness candidate.
Their exact-head inherited successes are separate from fresh hosted confirmation.
The previous run's skips are not replaced by inherited local passes.

Only a normal preserving original974 advance is permitted, with this uncertainty
stated and fresh required checks. No unchanged CI retry, main merge, force-push,
replacement PR, review bypass or original975 advance while its parent is red.
