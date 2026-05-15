---
id: T119
title: Close Screenplay Studio export UX gap
owner: codex
status: in-progress
branch: codex/T119-screenplay-export-ux
pillar: mobile-first
v1_pillar: screenplay
v1_effect: closes the V1 Screenplay Studio item for consuming FDX export and backend PDF rejection alternatives cleanly
---

## Scope

Make the Studio export menu consume backend FDX support while treating backend
PDF rejection as a clear, non-dead-end alternative path on non-macOS clients.
Keep macOS local PDF export available because the app has a local renderer.

## Done When

- FDX stays available from backend-supported formats.
- Unsupported backend PDF is not presented as a normal working export on
  non-macOS clients.
- Backend PDF rejection messages surface usable alternatives instead of a raw
  error code.
- `docs/v1-definition.md` marks the Screenplay Studio export UX item complete.
- Focused Swift tests cover the menu and error behavior.

## Verification

- `xcodebuild test -project them.xcodeproj -scheme them -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO -only-testing:themTests/ScreenplayExportFormatMenuTests -only-testing:themTests/BackendMemoryScreenplayExportTests`
- `npm run v1:status`
- `node scripts/pre_flight.mjs --strict`
- `git diff --check`
