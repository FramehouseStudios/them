# T-964 — Give iPhone writers their exported file

Branch `codex/T-964-iphone-export-handoff`, parent T-963 `ba3876aa` / #946.

## Root cause and connected change

VERIFIED by inspecting the production action: iPhone export wrote the returned
artifact into the app's temporary directory, then reported it as saved. There
was no share/file-export presentation in Studio. A backend export success was
therefore not sufficient for a writer to take the screenplay out of THEM.

The existing export control now owns preparation and share presentation state.
Its async action receives the URL of the actual written artifact. On iPhone,
the native activity sheet lets the writer choose Save to Files or another app.
Cancel does not modify the screenplay or falsely report an external save.
Preparing an export disables repeated taps. Errors stay on the existing error
path and must never present sharing or report success.

Extract the existing Root activity-view wrapper into `SystemActivityView` and
reuse it; do not introduce a second presentation mechanism or god-view state.
macOS retains its existing save panel and saved-directory behavior. No new
framework, provider call, persistence policy or visual identity change.

## Evidence (in progress)

- D009 versus T-963: Studio17405 -> 17401 (-4), Root15004 -> 14992 (-12).
  Other watched files unchanged; whitespace check passes.
- Signed focused export HTTP/payload/action tests:28 passed/0 failed/0 skipped,
  erased task-owned iPhone17Pro/iOS26.2. Exact-byte handoff and failed-request
  no-share/no-success assertions included.
  `/tmp/them-964-export-units-v2.xcresult`.
- First attempt stopped at compile before tests: extracted menu lacked the
  ScreenplayStudio module import that owns typography. Add that existing import,
  not a duplicate font definition. Retain `/tmp/them-964-export-units.xcresult`
  and its log as a failed compile, never as executed passing tests.
- Initial authenticated writer/share/relaunch journey passed1/0/0, with actual
  backend Markdown and FDX and provider counts ASR0/chat0/TTS0.
  `/tmp/them-964-export-writer.xcresult`.
- Strengthened native-destination run failed0/1/0: the test asked for a Button,
  but retained app hierarchy shows Save to Files is an `actionGroupCell` in
  `activityCollectionView`. Visual observation confirms it is present. Correct
  the test selector to the observed native cell, without a product workaround
  or relaxed assertion. Retain `/tmp/them-964-export-writer-v2.xcresult` and
  `/tmp/them-964-share-attachments/`.
- Final corrected native-destination writer/export/relaunch workflow passed
  1/0/0, `/tmp/them-964-export-writer-v3.xcresult`; provider counts ASR0/chat0/TTS0.
  Both native collection cells assert Save to Files exists; retained screenshots
  visually confirm real Markdown and FDX file previews. Dismissing both sheets
  and relaunching preserves the exact saved draft. This exercises the real
  authenticated local backend, not paid providers or the shipping deployment.
- macOS scaffold build exited0, `/tmp/them-964-macos.log`. This is compile
  compatibility, not macOS interaction/release-signing proof. Full backend/full unit/full V1 suite and the
  standalone stub-export smoke were not repeated for this client-only pass.
- Physical-iPhone external-file opening and 120-page screenplay generation,
  pagination and dramatic quality remain unverified.

## Main landing checkpoint, separate from this draft

VERIFIED #766 merged normally, preserving its original branch/head, at
`52cef9e960f5acc41aa24a2401bf1de616ca67ec`. Its exact-head hosted run
38992162980 passed all steps. Independent signed voice-fault check passed1/0/0
on the same original source using the safe signed runner. Do not count the old
signing-disabled hosted iPhone command as signed proof.

VERIFIED #770 is retargeted to main at preserving merge
`f20391df832cc374a8f437667f23441da57d82a6`; source tree is identical to the
previous head and both original commits remain intact. Native stack metadata
was removed without retargeting/rebasing/deleting #888; its original head/base
remain preserved. GitHub dismissed the old approval after retargeting; the human
renewed approval at 2026-10-17T02:41:54Z on the final head. Fresh local signed
units on the erased task-owned iPhone17Pro/iOS26.2 passed622/0/0:
`/tmp/them-770-main-update-units-20261016.xcresult`.

Exact-head hosted run38995605542: backend, D009 and required signed unit step
passed; required writer loop is running at this checkpoint. Integrated-main
run38995445494 also remains pending.
Require complete step-level proof before #770 merges. Do not promote/deploy the
intermediate main with #766 alone: these are coupled data-safety fixes.
No manual deployment performed; automatic-deployment state is not established.
Shipping domain and physical-device integration are not proven.

## Files in this scope

Private proof (including the failed runs and exact-head #770 signed units):
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-964-20261016.hDdNTh/`.

`TASKS.md`, this proof document, `them/SystemActivityView.swift`,
`them/ScreenplayStudioExportMenu.swift`, `them/RootExperienceView.swift`,
`them/ScreenplayStudioDraftToolsViews.swift`, `them/ScreenplayStudioExportSupport.swift`,
`them/ScreenplayStudioScreen.swift`, `themTests/ScreenplayStudioExportSupportTests.swift`,
`themUITests/V1SmokeUITests.swift`.

## Copy/paste implementation briefing

T-964 closes the iPhone export dead end above original T-963/#946. The real
export action sends the returned file URL to a child-owned native share sheet;
preparation no longer claims an external save. Repeated preparation taps are
blocked. Error paths present no share and preserve the existing page. The
existing Root activity wrapper is shared, not duplicated; no god-view product
state or new framework. Preserve all earlier heads and the normal protected
merge process. This is file handoff work, not proof of full-length screenplay
quality, shipping-domain configuration, or a physical-phone external app.
