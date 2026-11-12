# Creative Partner drawer visibility proof — 2026-11-12

## Exact boundary and retained failure

Original PR #422, head 69af6fab5dbc12abef7660c0858bb30293a1d9b6,
remains preserved. This follow-up changes only its UI-test reveal precondition
and records the evidence; it does not alter onboarding or companion runtime.

VERIFIED: hosted run 43183792644 / Quality Gate job 131065905590 failed:
- Backend: 2,744 passed, 0 failed, 2 skipped.
- Native signed units: 635 passed, 0 failed, 0 skipped.
- Integrated writer step passed.
- Native V1: 30 passed, 1 failed, 9 skipped.
- Later voice-fault/macOS step skipped after V1 failed.

The failing test is
V1SmokeUITests/test_creative_partner_mode_reuse_and_to_page_callbacks().
XCTest failed inside revealFullyInStudioDrawer/isFullyVisible at source line3516:
"Failed to determine hittability" for studio.them.mode.co_writer,
"Activation point invalid and no suggested hit points based on element frame."

The retained native hierarchy places that button at (72,1144,300,44), with
the drawer at (42,100,360,774). Its permitted vertical range was108–850.
The helper asked isHittable before checking those frame bounds, so XCTest
aborted before the existing scroll loop could reveal the offscreen control.
This is evidence of an invalid verification precondition; it does not show
that the companion's mode handler failed.

Private archive:
io.them-worktrees/_proof/T-1390-onboarding-hosted-v1-20261112/quality-gate-failure-logs.zip
139,906,426 bytes; SHA256
feaaa52883e27b63379bdb7cadc4aa998594fbaf0d10714f3e90382495a0944f.
The archive includes the full native unit/V1 bundles, video and UI hierarchy.

The old hosted name-based runner erased98A0BFA3-CEC3-4FD6-9916-5A2149774DBF;
both native bundles identify actual deviceFCC5F673-7BEC-4A7D-8F2A-4DC35E2668EC,
iPhone17 Pro/iOS26.5(23F77). Do not call that hosted run an erased-device proof
or claim this mismatch caused the separate offscreen activation failure.
Original #964 owns the exact-device runner repair.

## Smallest correction

Check existence, nonempty frame and the existing vertical containment
conditions before asking native hittability. Keep the same drawer viewport,
8/24-point margins, swipe limits, actions, mode-selection assertions,
summary assertions, Reuse/To Page callbacks and destructive fixture cleanup.
No extra input retry or longer timeout was introduced. The original mode
selection helper retains its prior single bounded retry unchanged.

The same query order exists in current #964 and the later centralized #996
helper. Their live runs are left intact; any follow-up must adapt their actual
owner rather than copying this older helper over newer viewport/pan behavior.

## Changed-source verification

VERIFIED: focused signed Creative Partner workflow: 1 passed, 0 failed,
0 skipped. Its retained native bundle identifies the exact erased root-owned
81F0FF38-9DAD-4011-907B-357DFADD094C, iPhone17 Pro/iOS26.2(23C54), Xcode26.3.
Normal "Sign to Run Locally" signing was enabled. The test body took39.925s;
this is local fixture timing, not physical-phone responsiveness evidence.

All three mode-selection and summary assertions, Reuse, To Page and the
existing thread/memory cleanup assertions passed. No later actions or
assertions were removed. Bundle: /private/tmp/them-t1390-creative-partner.xcresult.
Summary: /private/tmp/them-t1390-creative-partner-summary.json.
The verified external clean-simulator runner targets this exact project;
the original #422 runner is not silently replaced.

Swift parsing and diff checks pass. D009 passes against verified main78b8c94f:
Root -123, BackendMemoryAPI -81, other three unchanged. Those reductions
belong to the original feature; this test correction adds no extraction credit.
No unchanged full backend, unit or macOS rerun is claimed.

## Limits

Synthetic first-run/companion fixtures do not prove Apple sign-in, real
microphone/model behavior, physical iPhone responsiveness or integrated main.
No paid calls, main merge, production change, review substitution or history
rewrite. The production hold and deferred human review remain unchanged. The earlier
hosted writer step used the old Autosave helper; it does not establish an
observed Off transition under the stricter helper now owned by #964.
Issue #998's durable unfinished onboarding input is separate and unimplemented.
