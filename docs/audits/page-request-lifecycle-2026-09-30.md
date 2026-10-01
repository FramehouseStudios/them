# Request-owned Page lifecycle integration

Goal criteria: 1 (protect writer take-back), 4 (recoverable controls), 7 (proof).

## Source and scope

Parent: #884, `7d48102eb639815cc7926cb2359d1517e1e0de89`.
Original #632 body read; its latest head is
`d3505e2b7bc7b5d26a4be18bbb1075d1fab4ca6c`.
Original implementation commits `6573fb20` and `3f852ca6` were reused with
`cherry-pick -x`, producing `b3c663fc` and `9ef8901f`. Original documentation
is retained as historical proof, not this integration's gate results.
Original branch/PR remains unchanged. No new architecture or UI state owner.

Each transport attempt now emits ordered MainActor Page lifecycle events with
one UUID. Late headers/finish from an earlier request cannot overwrite current
tracking. Cancellation completion cannot clear a newer reservation. Companion
requests emit no Page completion. Pure insertion/rollback decisions share the
existing interruption capability instead of duplicating its reason switch.

## VERIFIED gates

Artifacts are under
`/Users/halfmutantfilms/io.them-worktrees/_proof/branch-audit-20260930/`.

- First focused iOS selector mistakenly used commas; wrapper treats the whole
  selector as one test name. It executed **zero tests**. The successful command
  exit is not test proof. Retained `page-request-lifecycle-focused.log/.xcresult`.
- Full signed unit suite on erased E37CE808: **677 tests, zero failures**,
  `page-request-lifecycle-units.log/.xcresult`. This includes the actual
  PageTalkLifecycle, ClementinePageInterruptService and all cancellation-policy
  cases; signing was on. No unsigned xcodebuild test was used.
- Initial Node 20 full backend: **2,812 passed, one failed, two skipped**,
  `page-request-lifecycle-backend.log`. Failed block-signal-history route read
  with `fetch failed`. Underlying socket cause was not captured; do not assert
  that its exact cause is known. The suite launch overlapped the dependency
  install session; the corrected run began after its successful completion.
  Do not infer product corruption or a proven socket cause from that overlap.
- Fixture changed to the existing ephemeral HTTP helper's new one-shot JSON
  read: native HTTP `agent:false`, total deadline, no retry. It removes shared
  fetch socket-pool participation from this fixture without weakening endpoint
  assertions. Five real HTTP tests prove distinct sockets, error status/body,
  invalid-JSON compatibility, interrupted response failure and stall deadline.
  Focused transport/history suite: **14 passed, zero failed/skipped**,
  `page-request-lifecycle-http-focused.log`.
- Corrected full Node 20 suite: **2,818 passed, zero failed, two skipped**,
  2,820 total, `page-request-lifecycle-backend-fixed.log`.
- Canonical build-only macOS scaffold preflight: **BUILD SUCCEEDED**, exit 0,
  `page-request-lifecycle-macos.log`. Existing actor/Sendable/deprecation
  warnings remain; this is not signed Release/TestFlight proof.
- Parent-relative god-file gate: Root **−7**, live-draft bridge **−5**,
  Studio, BackendMemoryAPI and index.js **0**. index.js stays **33,626**;
  the human approved this count before the original stack establishes 33,603.
- Syntax checks for the fixture/helper and `git diff --check`: passed.
- Signed Studio UI regression on erased E37CE808: **two passed, zero failures**,
  `page-request-lifecycle-ui.log/.xcresult`: all inspector tabs route to real
  panels and report selection; compact drawers fit and remain mutually exclusive.
  This uses structural Debug fixtures, not a paid-provider writer session.
  The full V1 UI suite and shipping-configuration recording were not run.

## Adversarial boundaries

Answered by signed tests: delayed cancellation completion vs new reservation;
new headerless turn vs old completion; late old header vs current reservation;
ordered immediate event delivery; exactly one finish; Companion silence;
all insertion modes and 16 rollback/stream/sync/queue state combinations.

Not answered by this PR: an already-sent session-wide stop reaching a newer
server turn; an early stop surviving process restart/another worker; durable
settlement after process death; full live microphone/provider/physical loop.
#635 supplies the exact-request wire and explicit receipt requirement, but its
process-local early-stop map independently failed the restart/worker tests in
#878. Preserve that work and extend it rather than labeling this precursor safe
end to end. Automatic transport retries currently make a new lifecycle UUID;
the durable integration must preserve logical identity so a retry cannot bypass
an acknowledged stop. Existing expiring talk idempotency is not, by itself,
permanent admission closure for a cancelled request.

No production secrets, live paid calls, deployment, main mutation or merge.
Priority #766/#770 still need independent authorized GitHub approval.
