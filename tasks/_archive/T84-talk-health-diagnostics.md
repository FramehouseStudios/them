---
id: T84
title: Surface talk health and error diagnostics in iOS
owner: codex
status: merged
branch: codex/T84-talk-health-diagnostics
pillar: talk + ios
---

## Scope

Consume the safe-public `/talk/stats` and `/talk/errors` endpoints in iOS and
show the result from the support/reporting flow. Include the same summaries in
problem reports/debug bundles so V1 voice-to-scene QA can see whether the core
talk path is healthy without searching backend logs.

## V1 effect

Closes the V1 talk checklist item: "iOS shows talk health, stats, and error
state without log spelunking."

## Done when

Typed Swift clients decode both endpoints, focused tests cover request paths
and diagnostic summaries, and the app has a Talk Diagnostics support sheet.

## Verification

- `xcodebuild test -project them.xcodeproj -scheme them -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO -only-testing:themTests/BackendTalkDiagnosticsTests`
- `xcodebuild test -project them.xcodeproj -scheme them -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO -only-testing:themTests/DesignSystemGuardTests/testNewSwiftFilesDoNotBypassDesignSystemTokens -only-testing:themTests/BackendTalkDiagnosticsTests`
- `xcodebuild test -project them.xcodeproj -scheme them -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO`
- `xcodebuild build -project them.xcodeproj -scheme them -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO`
- `git diff --check`
