# V1 Build And Test Readiness

This artifact records the current app build and `themTests` proof used to close
the V1 release-readiness checklist item in `docs/v1-definition.md`.

## Last Verified

2026-05-14 17:56 America/Los_Angeles on branch
`codex/T118-v1-readiness-proof`.

## Commands

```sh
xcodebuild build -project them.xcodeproj -scheme them -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO
xcodebuild test -project them.xcodeproj -scheme them -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO
```

## Results

- App build: passed (`** BUILD SUCCEEDED **`).
- `themTests`: passed (`** TEST SUCCEEDED **`), 99 tests, 0 failures.

## Boundaries

This proof is the current local app build and automated test suite. It is not a
signed archive, not a TestFlight upload, and not the human V1 manual smoke.
Those remain covered by `docs/testflight-v1-preflight.md`.
