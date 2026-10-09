# Existing iPhone export handoff — 2026-10-08

Goal item 4; file safety also advances item 1. Branch
`codex/T-942-export-share-proof`, directly above original #868 exact
`a6428e3deb1d58a3f811b32b5913bc9ce6778d1e`. Read its PR body and helper/tests;
preserve its UIKit implementation, status message and macOS save panel. No
competing replacement, branch closure, squash, main push or PDF enablement.

## Characterization and smallest fixes

VERIFIED: clean signed regression `/tmp/them-942-export-red-clean.xcresult`
and matching log: one failed test, zero pass/skip, two failed assertions.
Two same-name exports return one URL; second bytes replace the first artifact.
Each export now uses its own UUID directory, retaining the requested leaf name.

The earlier `/tmp/them-942-export-red.log` also failed but is **not clean proof**:
the original #868 runner only boots, does not erase, and ignores the newer
result-path environment override. Waited for its terminal result before an
explicit owned-device erase and rerun with `-resultBundlePath`. No restart due
to an observation timeout; no human simulator or physical device touched.

VERIFIED input boundary: Foundation normalizes an appended `../escape.md`
outside the generated directory. Although the current backend sanitizes names,
the client response-header parser does not. Reject non-leaf/control-character
filenames before writing, and verify the standardized destination's parent.
This is malformed-input hardening, not evidence of a production attack.

Presentation now reports acceptance, rather than silently returning and still
saying “Choose where to send it.” Unavailable/background/ambiguous scenes or an
already-sharing presenter produce a retry instruction, preserving the draft.
No arbitrary background/other window receives the script. Multi-window origin
selection is not implemented: use a single active Studio window.

The new DEBUG-only UI opt-in exercises the original native presenter instead of
suppressing it. Existing status-only export test now checks the filename's
`.md` extension, not the obsolete “Saved” wording. Native test asserts sheet and
file action presence, attaches a screenshot, dismisses it and checks the page.
Its artifact is synthetic DEBUG data, not shipping backend or formatter proof.

## Native proof correction

First native test: one fail, zero pass/skip, `/tmp/them-942-native-share.xcresult`.
The custom accessibility-ID assertion failed. Exporting **all** attachments
(failure-only export found none) retains app hierarchy and recording under
`/tmp/them-942-native-all-attachments`. A frame at
`/tmp/them-942-native-failure-frame.png` shows the actual native sheet, a
174-byte Debug-Structural text document, Copy and Save to Files.
Observed native hierarchy: `ActivityListView` / `ShareSheet.RemoteContainerView`.

VERIFIED: this was not proof of a broken original #868 presenter. The follow-up's
immediate `top.presentedViewController === sheet` check falsely reports refusal
while the remote sheet opens. Replace it with UIKit's presentation completion;
the installed SDK's `UIViewController.h` documents completion after
`viewDidAppear`. Remove the invisible custom ID. Test the observed native
container/actions and outside-popover dismissal; no rerun-unchanged or retry.

Second native test: one fail, zero pass/skip,
`/tmp/them-942-native-share-v2.xcresult`. The native container assertion passed
and the status reported ready without an error. Retained hierarchy at
`/tmp/them-942-native-v2-attachments` proves Copy and Save to Files are **cells**,
not buttons, and the filename caption is an **Other**, not static text. Correct
those observed locators, without changing production behavior or retrying an
unchanged test.

Third native test: one pass, zero fail/skip,
`/tmp/them-942-native-share-v3.xcresult`. The kept screenshot exported to
`/tmp/them-942-native-v3-attachments/2CE537C3-5CAE-4E10-AEA7-50B85056E6C5.png`
was visually inspected: native Debug-Structural text document, 174 bytes,
Copy and Save to Files visible. Dismissal returns to the unchanged seeded page.
This is native presentation/dismissal proof, not an external save completion.

macOS build `/tmp/them-942-mac.log` failed on an inherited Pages modifier:
`navigationBarTitleDisplayMode` is unavailable on macOS. Exact #868 source
contains the same unguarded modifier. Add an iOS-only conditional in the small
Pages overview file; no iPhone behavior or god-file change.

## Evidence and limits

Initial focused signed class: 10 pass, zero fail/skip,
`/tmp/them-942-export-focused.xcresult` and matching log. Final filename guard
was added after that run, so it is not final-code proof.
Signed full units after final export fixes: 948 pass, zero fail/skip,
`/tmp/them-942-units-final.xcresult`. Final source including the platform-only
Pages guard: 948 pass, zero fail/skip,
`/tmp/them-942-units-final-v2.xcresult` and matching log. No source edits while
a test/build was active. Final macOS scaffold build `/tmp/them-942-mac-v2.log`
exits zero, BUILD SUCCEEDED. Unsigned build-only; all iOS tests signed.
Final signed UI run includes native share/dismissal and existing export status:
two pass, zero fail/skip, `/tmp/them-942-export-ui-final.xcresult` and matching
log. Its kept native screenshot was exported under
`/tmp/them-942-export-ui-final-attachments` and visually inspected again.
Offline Node 20.20.2 full backend suite, network disabled:
`/tmp/them-942-backend.log`, 2,923 pass, zero fail, two skip. Backend code and
lockfile unchanged; generated dependencies reused only after lockfile match.
God-file growth/diff checks pass; `backend/index.js` stays exactly 33,603 lines.

Local signed proofs explicitly erase only task-owned simulator
`11CF5EFB-D8C3-4F19-8062-28AF37F27D93` (iOS 26.2, Xcode 26.3). Normal signing
remains enabled. Do not treat the older stack runner's hosted green result as
an erased-device proof until the canonical newer runner is integrated.

Not covered yet: physical phone,
real backend export contents or FDX/Fountain/page parity, external Save to Files
completion, late export response after account/project changes, shipping voice,
production DB, 120-page performance or release readiness. Temp artifacts remain
owned by the app's temporary storage and can accumulate; no premature deletion
while a share might consume them. OS cleanup is not a durable export guarantee.
Human must use an external save action to retain the export beyond app storage.
UIKit completion currently has no cancellation/deadline if a scene disappears
during presentation. Guards reject known invalid presenters; no such hang was
observed. Track lifecycle/cancellation and cleanup with the next export proof,
not a claim that every background/window race is covered.

#940 in the separate trust lane retains hosted writer bundles; it does not
retroactively restore #938's deleted failure artifact. Both lanes remain unmerged.
