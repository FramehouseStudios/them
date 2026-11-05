# T-1054 — Original #904 inspector navigation

## Scope and success criteria

Original #904 head `a6a36260357afe8a8ba9f937197f26b6a017c8de`;
base remains original #964, `codex/T-984-main-simulator-proof`.
Task branch `codex/T-1054-parent-inspector-navigation` preserves that head.
No replacement PR, squash, force push, main merge, paid provider request,
production configuration, or physical-device change.

The navigation must stay visible while its panel scrolls, and selecting a
different panel must start at its heading. The existing story-obligation
restore/relaunch and all-six-panel workflows must still exercise real UI.
Retain exact text/recovery assertions; no retry loop or relaxed timeout.

## First red

**VERIFIED:** hosted run39419339905, Quality job118616089203 fails
`test_story_obligation_evidence_survives_studio_relaunch` at the existing
`revealStudioAppliedMemory` helper's `isHittable` check for the Clementine
inspector button. XCTest reports an invalid activation point, not a missing
saved obligation. The failure log is retained. This alone does not establish
that scrolling caused the hosted accessibility error.

**VERIFIED:** code at this head puts all inspector navigation inside the
panel's vertical scroll content. Original #625 already contains a separately
reproduced narrow-phone correction, commit `5824f226`, with a structural
header, selection identity and bounded reveal helper. Its exact updated head
`d493c515` has completed the hosted Quality Gate successfully. Reuse this
work rather than invent a second navigation architecture.

## What the hosted evidence actually shows

**VERIFIED:** the downloaded native V1 bundle reports **27 passed / 1 failed /
9 skipped**, iPhone17Pro/iOS26.5. Its final recording and hierarchy show
the Clementine tab visible and already selected, with the exact expected
story-obligation result/evidence visible. This is not proof of hidden
navigation or lost recovery data. The helper checked content before opening
the drawer, then asked for the tab's hit point before checking its selected
state, even though opening had already exposed the requested content.

The shared pending-question/memory reveal now checks for its actual content
again after opening; if a route is still needed, it checks selection before
hittability and uses the existing stable tab identifier. All result/evidence,
correction-control and post-relaunch assertions remain unchanged. This removes
an unnecessary interaction, not a requirement that the memory be rendered.
No universal hosted accessibility-framework cure is claimed.

## Independent product defect and correction

**VERIFIED:** the already-preserved #625 pinned-navigation behavior case
fails against unchanged #904 runtime: **0 passed / 1 failed / 0 skipped**,
native exit65. Exact bundle:
`/tmp/them-1054-before/v1-ui-smoke-local-1-59076.xcresult`.
Erased task-owned SE `E8998A6B-35B1-49E3-896C-861550849927`, iOS26.2,
375-point width, signing on. One upward scroll hides all six navigation tabs;
the final video frame was extracted and inspected. It is a separate real
usability defect, not an inferred cause of the hosted hit-point error.

Reuse #625's existing chrome modifier: tabs are siblings above the scroll
body, and selection identity resets the newly selected panel's position.
Reuse its bounded, content-viewport-relative reveal algorithm for deep
actions, including the proven minimum pan distance. Remove the six-panel
test's obsolete scroll/reopen navigation fallback; require directly hittable
tabs instead. No new app state, persistence, framework or god-file growth.

## After verification

**VERIFIED:** the same erased, signed owned SE/iOS26.2 passes **3/0/0**,
native exit0: pinned-navigation/selection reset, all six actual panels, and
the unchanged story-obligation evidence/relaunch workflow. Actual bundle:
`/tmp/them-1054-after/v1-ui-smoke-local-1-59816.xcresult`.
During the six-panel run a native screenshot was captured and inspected:
Outline remains scrolled to its real controls, all six tab labels are fully
readable above the content, and the selected state is visible. This is
synthetic local UI evidence, not a physical-phone or live-model claim.

**VERIFIED:** full signed `themTests` on the freshly erased same owned SE:
**634 passed / 0 failed / 0 skipped**, native exit0; actual bundle
`/tmp/them-1054-units/v1-ui-smoke-local-1-60519.xcresult`.

**VERIFIED:** full backend `npm test`, isolated Node20.20.2 with external
network disabled, tracked-source archive and matching read-only dependencies:
**2,749 passed / 0 failed / 2 skipped**, native exit0. No `.env` or provider
credential was copied or supplied. Backend, scripts, workflows and Xcode
configuration are byte-identical to original `a6a36260`; the backend result
is fresh but no backend behavior was changed by this task.

**VERIFIED:** D009 against the actual fetched #964 base: Studio -4 lines
(same as the pre-task parent), all other four deltas0. Index remains33,626
at this approved pre-product-stack boundary. Whitespace check passes.

**VERIFIED:** canonical `them-macOS-scaffold`, `Mac Scaffold Debug`, ad-hoc
compile: native exit0. This is not macOS interaction proof. Existing
actor-isolation/Sendable/deprecation warnings remain migration debt.
No fresh hosted-green claim yet. Completed pre/post/hosted V1/full-unit
bundles and inspected screenshots are retained in the private folder:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1054-20261020.fdvCqH/`.
Copied after/full-unit bundles were compared byte-identical with originals.
The two backend skips are the real-Postgres prefix case (no DATABASE_URL)
and the existing talk page-write preview/sync integration case; they are
not counted as passes.

## Publication and limits

Normally fast-forward original #904, preserving `a6a36260` and every earlier
original commit. Keep its existing #964 base and draft status. No force,
replacement PR, main push or main merge. Fresh exact-head hosted checks and
independent human review are still mandatory; local3/0/0 does not establish
a hosted26.5 cure. Full local V1, drag/drop, physical microphone, paid model,
external-open export and intended production-backend journeys were not run
by this UI-only task. Production hold and review protections are unchanged.

Exact changed files: `them/ScreenplayStudioInspectorChromeViews.swift`,
`them/ScreenplayStudioScreen.swift`, `themUITests/V1SmokeUITests.swift`,
`TASKS.md`, this document. Existing recovery guards and exact text/version
assertions remain intact. The empty-generation billing work in #625 is not
ported, and its original source/history remains intact.

The separate #972 head `53b4d6d` has now failed its hosted integrated writer
workflow. It is not green and will not be merged; log retained separately.
The already-confirmed manual caret clipping remains an open product defect
in T-1053, not a fix included in this navigation change.
