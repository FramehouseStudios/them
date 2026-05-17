# V1 Build And Test Readiness

This artifact records the current app build and `themTests` proof used to close
the V1 release-readiness checklist item in `docs/v1-definition.md`.

## Last Verified

2026-05-16 14:45 America/Los_Angeles on branch
`codex/T139-v1-release-smoke-clearance`.

## Commands

```sh
xcodebuild build -project them.xcodeproj -scheme them -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO
xcodebuild test -project them.xcodeproj -scheme them -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO
xcodebuild build -project them.xcodeproj -scheme them -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO
```

## Results

- App build: passed (`** BUILD SUCCEEDED **`).
- `themTests`: passed (`** TEST SUCCEEDED **`), 108 tests, 0 failures.
- Generic iOS build: passed (`** BUILD SUCCEEDED **`) with signing disabled.

## Boundaries

This proof is the current local app build and automated test suite. It is not a
signed archive, not a TestFlight upload, and not a passing human V1 manual
smoke. Those remain covered by `docs/testflight-v1-preflight.md` and
`docs/v1-release-smoke-clearance.md`.
