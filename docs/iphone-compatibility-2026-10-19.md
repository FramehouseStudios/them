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
- Signed full units active in native session40119 on exact erased owned
 11CF5EFB-D8C3-4F19-8062-28AF37F27D93, runtime26.2:
  `/tmp/them-992-units.log`. Not yet a passing claim. Inherited T-990 results
  are not relabeled as candidate proof.
- Pinned Node20 scripts231/0/0; full backend still active in session13237,
  `/tmp/them-992-node20.log`, no network/synthetic configuration. No backend
  pass claim until terminal summary.
- Created a separate owned iPhone SE3 simulator on installed26.2:
  E8998A6B-35B1-49E3-896C-861550849927, name THEM compatibility SE20261019.
  No existing device erased by creation. Narrow writer/recovery proof is
  next after current units; this is not an older-OS simulator.

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

Freeze actual-settings source, then full signed units and authenticated
writer/recovery/export/relaunch on the exact erased task-owned26.2 simulator.
Obtain an official17.x runtime through Apple Developer Downloads or an
appropriate physical device for the remaining minimum-OS proof. No credentials
may be entered for the human; any required sign-in is theirs. Do not claim17
runtime readiness from compile or newer-runtime testing.

Preserve parent/original PR heads; no replacement or main merge. Production
remains held until missing App Store credentials exist. No purchase bypass,
paid provider calls or generated120-page/physical-microphone claim here.
Continue status: READY FOR CONTINUE.
