# T-932 — Exact blank history and snapshot recovery

## Writer outcome and root

Moves goal items **1 (no lost work)** and **4 (connected controls)** forward.
An actual saved empty version was rejected by history's text-content guard, and
Snapshot could not save a deliberate deletion. Loading history also replaced
dirty current words without preserving them separately. Snapshot labels cleared
even when the save failed.

VERIFIED red: the route matrix failed `400 !== 201` for `studio_snapshot`;
the signed blank-history regression failed eight assertions before production
changes (`/tmp/them-932-history-red-focused.xcresult`). The initial broad test
selector was wrong and that owned process was stopped; it is not proof. The first
full unit build then caught an immutable-source assignment in the new fixture;
the fixture was corrected without weakening production immutability.

The next full signed run was red: 669 passed, 2 crashed, 0 skipped
(`/tmp/them-932-final-units.xcresult`). Both new synchronous actor-owned fixtures
crashed during `BackendClient.__deallocating_deinit` →
`swift_task_deinitOnExecutorImpl` → `TaskLocal::StopLookupScope` teardown, not a
history assertion. The project defaults to MainActor isolation. Those fixtures
now execute as async XCTest tasks, retaining every assertion; this is an explicit
fixture correction, not an unchanged retry or proof that production has no
runtime crash. A fresh complete signed run must pass before publication.

The final connected UI attempt was also red: three passed and the new blank
snapshot case failed to locate Restore (`/tmp/them-932-connected-ui/
screenplay-save-network-fault-24383.xcresult`). The test treated tab existence as
tap readiness and did not assert selection or destination. It now uses the
existing drawer hittability helper and requires selected Saved + its panel before
searching Restore. Failure stops the test rather than tapping a missing control.
The full four-case proof is rerun after this test correction; the earlier
four-case pass without the real Restore tap is not the final proof.

That corrected run still failed (three pass, one fail): Saved was selected and
present but had no matching Restore row (`/tmp/them-932-visible-ui/
screenplay-save-network-fault-25628.xcresult`). A focused diagnostic reproduced
the root: `adoptCanonicalOutlineState` replaced loaded version history with nil
from a metadata-only response (one test, one assertion failure,
`/tmp/them-932-history-summary-red.xcresult`). This diagnostic used the existing
simulator state, so is not an erased-device gate proof. Outline, collaboration,
comments and metadata adoption now retain same-project loaded versions when the
response omits that field; an explicit empty array still clears it. The shared
response model makes only its versions field mutable for that merge, with no
god-file growth. Final erased signed gates are rerun after this production fix.

RESEARCH / INFERENCE: the matching frame sequence, default MainActor setting,
Xcode 26.3 and iOS 26.2 match [Swift issue #88036](https://github.com/swiftlang/swift/issues/88036)
and [XCTest reproduction #87316](https://github.com/swiftlang/swift/issues/87316).
The former includes a SwiftUI button reproduction, not only XCTest. Async tests
do not remove that potential production risk. T-933 should reproduce synchronous
`BackendClient` release in a task-local scope, then prove an explicit-deinit
compatibility fix on the same older runtime without async-test substitution.

## Connected fix

- Only `studio_snapshot` joins the explicit blank-source allowlist. Existing
  user/project authorization, actual-string/true-flag/base/retry-ID/current-head
  requirements, stale rejection and exact replay remain unchanged.
- One Swift blank-source policy is shared by the ViewModel and durable outbox.
- History accepts actual empty/whitespace strings, not absent text. Empty ID,
  supplied foreign project ID and unloaded/versionless blank contexts are rejected
  before replacing the editor. Current head remains the save base, not the
  historical version ID.
- Both history presentations now enable Restore for actual empty text, retaining
  disabled Restore for absent text and empty version IDs. The signed snapshot
  journey taps the real Saved-tab Restore button and requires handler feedback.
- Exact dirty current bytes are placed in the existing preserved recovery slot
  first. If that store does not accept/read back the copy, restore stops. The
  restored page is marked as a manual edit, retaining the deliberate blank intent.
- Snapshot label clearing moves into confirmed save completion and only clears
  a label still matching that request. Newer different labels are not discarded.
- Required recovery UI gains a fourth case through the real Snapshot save path,
  checking exact blank bytes, snapshot source/note, one new version, retained
  original version and repeated launch recovery against an auth-required backend.

## Existing work and residual risk

Read the bodies of Claude's #729 confirmation, #732 restore-source/note and #838
version-contents work before editing this seam. Their branches/code remain intact;
this does not reimplement or remove their UI/notes. When #732 is integrated,
`studio_restore` must receive an explicit blank contract and the same route/restart
proof. It remains disallowed here, rather than adding an unused new client path.

Recovery-store readback proves acceptance by the canonical UserDefaults-backed
store, **not disk fsync or an immediate power-loss guarantee**. Unsynced uninstall,
sub-debounce crash durability, physical microphone/provider flow, production
Postgres soak, export parity, 120-page performance and release remain unproven.
Identically re-entering a snapshot label while its save is in flight can still
have it cleared; a label edit-generation guard is a separate small follow-up.
Read-only adversarial review found no new blocking defect. It flagged existing
collaborator/comment handlers that can adopt a stale response after project
selection changes. This patch does not fix that race; a scoped project-switch
regression and current-auth/project response guard remain required.

No paid provider calls, credentials or unrelated changes. Landing remains #766
then #770 with independent approval and required hosted green. All protected files
remain unchanged in size; `index.js` stays at the approved pre-stack 33,626 count.

## Exact files

- `backend/lib/screenplay_projects_routes.js`
- `backend/tests/screenplay_projects_routes.test.mjs`
- `backend/tests/screenplay_cross_device_persistence.test.mjs`
- `backend/evals/run_screenplay_save_network_fault_ui_smoke.mjs`
- `scripts/run_screenplay_save_network_fault_smokes.sh`
- `them/ScreenplayDraftSaveOutbox.swift`
- `them/ScreenplayStudioPersistencePolicies.swift`
- `them/ScreenplayStudioRecovery.swift`
- `them/ScreenplayStudioViewModel.swift`
- `them/BackendMemoryAPI.swift`
- `them/ScreenplayStudioDraftToolsViews.swift`
- `themTests/ScreenplayDraftSaveOutboxTests.swift`
- `themTests/ScreenplayStudioDraftRecoveryTests.swift`
- `themTests/ScreenplayStudioDraftToolsPresentationTests.swift`
- `themUITests/V1SmokeUITests.swift`
- `TASKS.md` and this audit.

## Final proof

- Signed full `themTests`, erased owned iPhone 17 Pro simulator, iOS 26.2:
  **672 pass, 0 fail, 0 skip**. `/tmp/them-932-history-retained-units.xcresult`.
- Backend `npm test`, shipping Node 20.20.2, external network disabled:
  **2,744 pass, 0 fail, 2 skip**. `/tmp/them-932-final-node20.log`.
- Real route/restart focused suite: **73 pass, 0 fail, 0 skip**.
  `/tmp/them-932-final-focused.log`.
- macOS scaffold final production build: exit 0.
  `/tmp/them-932-history-mac.log`. Unsigned build-only, never unsigned tests.
- Wrapper tests 4/4; shell/Node syntax, god-file gate versus #930 and
  `git diff --check` pass. No paid model calls or credential changes.
- Final signed auth-required UI: **4 pass, 0 fail, 0 skip**, erased owned
  simulator, signing on. `/tmp/them-932-history-retained-ui/
  screenplay-save-network-fault-28068.xcresult`; output
  `/tmp/them-932-history-retained-ui.log`. Includes actual blank Saved Restore
  tap and handler feedback. Earlier red artifacts remain recorded above.
