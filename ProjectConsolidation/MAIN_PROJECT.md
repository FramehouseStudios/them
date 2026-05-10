# THEM Main Project Consolidation

Date: 2026-05-09

Canonical project for Codex and Claude work:

`/Users/halfmutantfilms/Desktop/io.them/them_MAIN.xcodeproj`

Canonical source tree:

`/Users/halfmutantfilms/Desktop/io.them`

## What Was Consolidated

- Kept the current Desktop project as the source authority because it is the only project with the `themTests` target, `DraftStudio` and `ScreenplayStudio` package dependencies, and the newest screenplay-craft implementation.
- Folded in the best project-file settings from the older Claude/Codex snapshots:
  - Debug uses `them/Info-Debug.plist`.
  - Release uses `them/Info-Release.plist`.
  - Debug backend defaults to `http://localhost:3000`.
  - Release backend defaults to `https://api.them.io`.
  - Release keeps hardened runtime enabled.
  - macOS sandbox keeps outgoing network and audio input entitlements explicit.
- Archived the four source `project.pbxproj` files under `ProjectConsolidation/xcodeproj_sources/` for traceability.

## What Was Not Merged Blindly

- Older root-level Swift files from the rescue snapshots were not copied over the newer `them/` files.
- Older modular backend files from `codex_stage` were archived as provenance only; the active backend in the Desktop tree is newer and already contains the screenplay-craft work.
- Existing dirty work in the current tree was preserved.

## Working Rule Going Forward

Codex and Claude should use `them_MAIN.xcodeproj` as the MAIN Xcode project file and keep all source edits inside `/Users/halfmutantfilms/Desktop/io.them`.

## Verification

- `plutil -lint them_MAIN.xcodeproj/project.pbxproj` passes.
- `xcodebuild -list -project them_MAIN.xcodeproj` resolves `DraftStudio`, `ScreenplayStudio`, `them`, and `themTests`.
- `xcodebuild test -project them_MAIN.xcodeproj -scheme them -destination platform=macOS -derivedDataPath /private/tmp/io-them-main-test-dd CODE_SIGNING_ALLOWED=NO -only-testing:themTests/ScreenplayCraftModelsTests -only-testing:themTests/BackendClientCraftAPITests` passed 7 tests with 0 failures.


