# T-992 — Older-iPhone availability and installation boundary

## Scope and root cause

The human goal says any iPhone. Current original app/test configurations
require iOS26.2 even though both shared packages support17. A verified
compile-only iOS17 diagnostic failed on UIBarButtonItem.Style.prominent,
which requires26. Neither that declaration nor a newer-runtime pass proves
operation on every phone or an obsolete OS.

Source b7676f8 preserves prominent Save on26+, with done before26, owned by
the existing editor accessory helper. The bridge only consumes that style;
no Save action, accessibility ID, autosave or content policy changed.
An availability-aware regression keeps modern appearance asserted.

After that diagnostic succeeded, changed only six iOS app/unit/UI-test
Debug/Release minima to17.0. Two Mac-only configurations retain their
irrelevant iOS setting; no Mac minimum, architecture, bundle ID, signing
identity, credentials, aesthetic, orb or Clementine change. This isolated
candidate is not shipped support until stronger runtime proof is recorded.

## VERIFIED compile evidence

- Before: `/tmp/them-992-ios17-compatibility.log`, exit65, actual compiler
  diagnostic at ScreenplayLiveDraftBridge.swift:10778, unguarded prominent.
- After fallback: `/tmp/them-992-ios17-fixed.log`, exit0, full generic
  simulator build with iOS17 command-line override, arm64/x86_64.
- Actual project settings, no minimum override:
  `/tmp/them-992-ios17-actual-settings.log`, exit0, BUILD SUCCEEDED.
  Same separate DerivedData `/tmp/them-992-ios17-fixed`, two build jobs.
- plutil project lint and whitespace pass. D009 all five deltas0 against
  fetched parent #961 head8b19d86 before the configuration-only change;
  no god-file content changed afterward.
- Signed full units865/0/0, exit0, actual summary inspected, exact erased
  owned11CF5EFB-D8C3-4F19-8062-28AF37F27D93, runtime26.2:
  `/tmp/them-992-units.log`, bundle
  `/tmp/them-992-units/v1-ui-smoke-local-1-84106.xcresult`. Includes the new
  availability-style case. This is candidate proof, not inherited T-990 counts.
- Pinned Node20.20.2 scripts231/0/0 and full backend2897/0/2, exit0,
  `/tmp/them-992-node20.log`, no external network/synthetic configuration.
- Created a separate owned iPhone SE3 simulator on installed26.2:
  E8998A6B-35B1-49E3-896C-861550849927, name THEM compatibility SE20261019.
  No existing device erased by creation. Narrow writer/recovery proof is
  active in native session44129; this is not an older-OS simulator. Logs
  `/tmp/them-992-se-{recovery,writer,home,v1,voice}.log`, sequentially stopped
  at first failure. Exact destination observed in the recovery runner.

Completed narrow-device stages, actual summaries confirm the SE UDID:
recovery5/0/0, authenticated writer/Craft/native MD+FDX export/relaunch1/0/0,
fixed-provider Home2/0/0 (fixture STT1/chat4/TTS24). Retained three completed
bundles privately beside the unit result and compared each byte-identical.
Full SE V1 completed27/2/15; pipeline stopped before voice/macOS. Failed
Pages route and Creative Partner metrics were not ignored. Exported retained
recordings/hierarchy show Pages below the SE viewport while the helper swipes
the wrong way, and later targets skipped by full-height flings. A geometry-
only direction correction passed Pages/metrics but failed at the mode rows
(focused1/1/0). Bounded slow drags follow the actual target using the existing
screen-reveal pattern: final focused2/0/0, same erased SE UDID, no changed
assertions, timeout/swipe-limit increases or skips. No production layout fix
is claimed for a test navigation defect. All three result bundles retained,
including the original full red and intermediate partial failure.
Final bundle `/tmp/them-992-se-drawer-bounded/v1-ui-smoke-local-1-92800.xcresult`
compared byte-identical in private retention. Full combined SE UI is next;
the focused pass does not retroactively make the earlier full run green.
This is narrow-screen26.2 proof, not17-runtime or physical microphone proof.

Actual-settings source frozen atec309e2 (later commits documentation only).
The compiled app Info.plist reports MinimumOSVersion17.0. Completed unit
bundle privately retained and compared byte-identical at
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-992-20261019.3aQPpb/`,
beside final backend, before/after compiler and unavailable-runtime logs.
Same-computer retention is not off-device backup. A temporary Xcode wrapper
only injects the isolated cached DerivedData and two build jobs; all canonical
signing, exact-device erasure, test selection and result assertions remain.
Retained wrapper SHA256e6955423f89a4085dc27f13592829505baa72d259d14526959c2d1533f07d780.

Official Xcode runtime acquisition terminal results, not a silent skip:

- 17.5 arm64 variant: unavailable, exit70,
  `/tmp/them-992-ios17-runtime-download.log`.
- 17.5 universal variant: unavailable, exit70,
  `/tmp/them-992-ios17-runtime-universal.log`.
- 18.5 universal: unavailable, exit70,
  `/tmp/them-992-ios18-runtime-download.log`.

No runtime was installed and no existing simulator was erased by these
download attempts. Apple's current SDK/system support table distinguishes
deployment targets and simulator/device support; the platform version of
the compiler is not itself a requirement to install only on that same OS.
[Apple Xcode support table](https://developer.apple.com/xcode/system-requirements/)
and [official component installation instructions](https://developer.apple.com/documentation/xcode/downloading-and-installing-additional-xcode-components).

## Exact changed files

- TASKS.md
- them.xcodeproj/project.pbxproj
- them/ScreenplayLiveDraftBridge.swift
- them/ScreenplayStudioKeyboardSaveAccessory.swift
- themTests/ScreenplayEditorBindingIntegrationTests.swift
- docs/iphone-compatibility-2026-10-19.md

## Next proof and release limits

Finish authenticated narrow writer/recovery/export/relaunch and full UI
on the exact erased task-owned SE3/26.2 simulator.
Obtain an official17.x runtime through Apple Developer Downloads or an
appropriate physical device for the remaining minimum-OS proof. No credentials
may be entered for the human; any required sign-in is theirs. Do not claim17
runtime readiness from compile or newer-runtime testing.

Preserve parent/original PR heads; no replacement or main merge. Production
remains held until missing App Store credentials exist. No purchase bypass,
paid provider calls or generated120-page/physical-microphone claim here.
Continue status: READY FOR CONTINUE.
