# T1199 — readable integrity actions on the narrow screenplay page

## Contract

Branch `codex/T-1199-integrity-banner-integration`, base published36f07be
(draft [#976](https://github.com/FramehouseStudios/them/pull/976)). Original
helper12014d06f685fe75aa5d867b3a6ab46e54d83180 is preserved through no-ff
mergefe1f68f. Runtime/interaction checkpoint2cb4bc6; only documentation changes
are allowed while its owned native proof runs.

## Root cause and fix

VERIFIED: the original saved-page screenshots in T1187 show four integrity
buttons compressed into vertical columns, expanding the warning and pushing
the screenplay down. The outer horizontal stack allocated width to both the
summary and all four actions. Unlimited button wrapping determined its height.

DECIDED: reuse the existing local ViewThatFits pattern: put the summary above
the actions, then fit one readable intrinsic row, two short rows, or a full-width
column. Labels keep their intrinsic width in row candidates; the column permits
normal multiline text. All actions retain their callbacks/styles and minimum
44pt targets. Apply the same composition to inspector warnings with the same
forced-row defect. No height clipping, hidden actions, framework, new state,
store, backend contract or god-file growth.

## Files

- `them/ScreenplayStudioDraftToolsViews.swift`
- `themUITests/V1SmokeUITests.swift`
- `TASKS.md`
- `docs/T1199-integrity-banner-layout-handoff.md`
- `docs/integrity-banner-narrow-proof-2026-10-28.md`

## Verification status

Diff/D009 pass. Actual signed narrow UI proof was run on erased task-owned
simulator91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A. It measures real banner/action
geometry, requires all four buttons hittable/contained/nonoverlapping, invokes
Review and verifies Draft inspector selection, while retaining the existing
exact saved-byte/relaunch/stale-output assertions. Providers are intercepted;
no paid calls. No unchanged full backend/unit rerun for this view-only fix.

Current T1187 checkpoint evidence remains separately documented; its1107-unit
and3011-backend counts are not a fresh full-suite result for this view change.
Final signed UI and visual inspection are recorded below; macOS compilation also passed.

## GitHub and remaining scope

#976 is a draft on its original parent; its hosted checks were still running
at00:30 local time. Main and production are unchanged. Codex's automatic PR
task attachment hit the existing100-attachment limit; the GitHub PR itself was
created successfully and remains accessible through its URL. No unrelated
attachments were removed. Real microphone/provider/phone/shipping proof and
integrated main remain incomplete.

## First native failure and root correction

`narrow-banner-ui` at2cb4bc6: **0/1/0**, intercepted chat2. The screenshot
shows readable two-row actions, but the actual accessibility hierarchy assigns
`studio.page.integrity.banner` to the icon, summary and **all four buttons**,
overriding their distinct child IDs. Review ID queries therefore fail. The
old generic banner query even matched the warning icon rather than a container,
so it cannot establish banner dimensions. This is retained native evidence,
not a Mac-lock or typing diagnosis. Button frames in the hierarchy are58pt
high and78.3–134.3pt wide; visually fixed is not interaction-proof.

The fix uses the existing `.accessibilityElement(children: .contain)` pattern
on banner and inspector warning containers, preserving independently reachable
children and their IDs. The test now requires the actual Other container, with
all geometry/hittability/Review assertions unchanged. No label-only selector,
coordinate tap, retry or weaker bound was substituted for the failed target.

XCTest's async activity tree continued issuing later queries after the first
assertion even with continueAfterFailure=false. Accordingly, a first-failure
summary alone cannot establish that every later assertion was UNRUN; the failed
case supplies no passing end-to-end proof regardless of later activity.

## Final signed UI and direct visual result

VERIFIED at3c82b91: `contained-actions-ui`: **1 passed /0 failed /0 skipped**,
116.729s, intercepted chat2, STT0/TTS0. All four unique action IDs are reachable,
frames stay inside the actual banner container without overlap, widths are at
least70pt, touch targets at least44pt, and the banner is below250pt tall on the
owned iPhone17Pro. Review opens the real Draft inspector. The same journey
also passes exact active saved version/original-byte retention, relaunch and
read-only stale-output recovery with exactly two render requests.

Direct inspection of `passed-attachments/D47E52A8-BCB8-404A-A238-AA9430535856.png`
confirms a full-width summary and two readable action rows. The screenshot
contains the green Saved state and visible screenplay beneath the warning;
there are no vertical button labels. Original fill/button styles are retained.
This is normal-size simulator visual/interaction proof, not large Dynamic Type,
VoiceOver speech, contrast measurement, real model quality or physical-phone
proof. Existing dialogue-width/formatting and warning-content behavior are
unchanged and are not certified by the layout result.

`final-frozen-source.json` pins both changed code files to3c82b91. Original
helper12014d0 remains an ancestor. Backend and unit-test sources are unchanged
from published36f07be; all five god files are unchanged versus that parent.
No full backend/unit suite was rerun for this view-only change.

Next implementation target: the duplicated command-bar Send. Source currently
contains both an inline Send and a keyboard-toolbar Send while the prompt owns
focus. Retain the usable inline/keyboard-return submission path and remove the
redundant floating control only after checking focus/keyboard reachability.
External exported-file opening and physical-phone/shipping proof remain open.

## Final compile and archive

VERIFIED: canonical macOS scaffold build exit0 / BUILD SUCCEEDED on the same
3c82b91 source (unsigned compile only; iOS UI test signing was enabled).
Permanent proof: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1199-integrity-20261028-386jks4i`, 2684 hashed artifacts,
zero readback mismatches. Manifest SHA256: `87f0a8e11d7baf1c4bd12db58d7ea73289c4536fdd728d504b902357df4314a9`.
No raw backend auth/store or environment file copied.
