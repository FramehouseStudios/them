# Original #904 — wait for actual load acknowledgement, 2026-11-12

## Completed and files changed

Repair the earliest explicit failure in original #904's exact-head hosted
recovery run. Base `ce89f996dea0200a386481dd50d4844fc8f24f26` and all original
history remain intact. Implementation changes only
`themUITests/V1SmokeUITests.swift`: add actual load-token equality to each
existing initial queued-state wait. This checkpoint also updates TASKS and
adds this report. No product/backend/provider/auth behavior changes.

## Root issue addressed

VERIFIED source: both waits accepted queued marker/count/dirty state while
load acknowledgement could still be0. The nonfatal equality assertion was
after the wait returned. Root consumes a real request and resets ACK0; Studio
publishes that request's acknowledgement later. The removed old command-line
ACK0 override remains removed and is not claimed as this failure's cause.

The predicates now require the exact actual token as well as every original
condition. Both outer ACK assertions, full restored-text and exactly-one
saved-version assertions remain. Same60s budget, no extra tap, action retry,
delay flag, simulated acknowledgement or weakened assertion.

This repairs the test's insufficient readiness condition. It is not a new
claim of offline writer-text loss or a verified cause of the separate runner
exit signal below.

## Actual failure and proof

Hosted run43349363467, headce, Quality job131636386451:

- Required offline recovery failed; native **0/2/0**, iPhone17Pro/iOS26.5
  build23F77. Summary names the two actual initial ACK0 assertions versus
  nonzero requested tokens.
- Full test tree additionally records test-runner exit75 before the expired-
  auth/conflict case finished. Do not infer that all its downstream assertions
  passed from the abbreviated evaluator summary. The cause of exit75 remains
  unverified; do not label it a job-cap timeout or purely environmental.
- Hosted units676/0/0; full V1 32/0/9 (41total); writer step passed.
  Voice/Mac steps skipped. This is separate from local parent V1 35/0/6.
- Exact-head failure artifact14005523220:222668824bytes;
  SHA256 `ae2664296bf2cca0139df89b1501aa8341e3bd1c0f6dc4fc6a1a33df99c2c4d0`.
  Verified archive and failed native bundle retained. Native failure, summary
  and activity context are separate from the local after-proof.

After: canonical two-case recovery evaluator **2/0/0**, native/controller
exit0, signed and erased task-owned81F, iPhone17Pro/iOS26.2/Xcode26.3. Actual
load ACK, exact restored draft and saved-version assertions all pass. Actual
auth-required31337 fixture, child PID/nonce verified before xcodebuild, dummy
provider key, known API egress guard blocked0 attempts. No paid model call.

App/unit/backend/package/project/workflow/runner sources are byte-identical
toce; no unchanged fullnative/fullbackend/Mac run was repeated for these two
predicate additions. Parent unit676 and backend Node20.20.2 2758/0/2 proof is
inherited with exact attribution. Backend skips: real Postgres without
DATABASE_URL and explicit preview/sync case. No skipped test is a pass.

D009 versus actual fetched original964975: Studio−4, Bridge−2, other3zero;
index33,626 retains the accepted early-stack exception. An initial check
correctly stopped on stale831 while the scoped fetch was still running;
after observing fetch exit0, the actual975 check passed. No stale-base result
is used as evidence. Diff check passes; source unchanged during native run.

## GitHub and remaining gaps

Normal fast-forward original #904 only, preserving its base/draft and every
original commit. Fresh hosted gates and genuine non-author review remain
mandatory; the old red run is retained. No main merge/push, force, replacement
PR, protection or production change. Hosted iOS26.5 resolution and the runner
exit75 are not established by a local26.2 pass.

Luna independently inspected exact hosted job/artifact/native failures and
challenged the readiness fix; Jarvis made the two-line repair and ran focused
proof. Agent work does not replace required human approval.

## Next active task and continue status

Observe the new exact-head hosted run and fix its first actual failure.
Propagate this parent through preserving merges into original919 and923,
with focused changed-workflow checks and exact source attribution. Separate
original973 remains unpublished locally: its guard integration passed721
signed units plus8mac wire cases, but native fixture startup needs bounded
cleanup before further proof/publication. Its old missing-inspector-tab
failure still requires combined-tree verification.

Private evidence: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1452-904-load-ack-20261112/`.
Production held; no real-phone/live microphone/model/intended-backend/export-
opened-outside-THEM completion claim. Preserve Clementine and the orb.
READY FOR CONTINUE.
