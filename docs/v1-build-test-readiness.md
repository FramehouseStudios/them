# V1 Build And Test Readiness

This artifact records the current app build and `themTests` proof used to close
the V1 release-readiness checklist item in `docs/v1-definition.md`.

## Last Verified

2026-05-24 17:15 America/Los_Angeles on branch
`claude/backend-post-v1-audit`.

## Commands

```sh
xcodebuild build -project them.xcodeproj -scheme them -configuration Release -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO
scripts/appstore_preflight.sh
```

## Results

- Release iOS Simulator build: passed (`** BUILD SUCCEEDED **`).
- App Store preflight: expected red without private release inputs (`fail=2 warn=1`).
- Preflight passed privacy manifest, release plist, hosted backend URL, iPhone-only posture, and unsigned Release iPhone build checks.
- Remaining release blockers: missing `DEVELOPMENT_TEAM_ID`, missing release `APP_TOKEN`, and a Release entitlements confirmation warning.

## Boundaries

This proof is the current local app build and automated test suite. It is not a
signed archive, not a TestFlight upload, and not the human V1 manual smoke.
Those remain covered by `docs/testflight-v1-preflight.md`.
