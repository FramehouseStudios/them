# V1 Build And Test Readiness

This artifact records the current app build and `themTests` proof used to close
the V1 release-readiness checklist item in `docs/v1-definition.md`.

## Last Verified

2026-05-26 14:19 America/Los_Angeles on branch
`claude/backend-post-v1-audit`.

## Commands

```sh
xcodebuild build -project them.xcodeproj -scheme them -configuration Release -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO
xcodebuild test -project them.xcodeproj -scheme them -configuration Debug -destination id=E37CE808-0323-4F50-8E8E-212D7ABFA268 CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO
scripts/appstore_preflight.sh
node scripts/release_config_status.mjs
scripts/run_release_preflight.sh
```

## Results

- Debug iOS unit/UI tests: passed (`137` unit tests and `5` UI smoke tests).
- Release iPhone build inside App Store preflight: passed.
- App Store preflight: expected red without private release inputs (`fail=2 warn=1`).
- Preflight passed privacy manifest, release plist, hosted backend URL, iPhone-only posture, and unsigned Release iPhone build checks.
- Release config status: expected red, with `them/Release.local.env` ignored by git, a tracked secret-free `them/Release.local.env.example`, hosted Release `BACKEND_URL` present, and missing private `DEVELOPMENT_TEAM_ID` / `APP_TOKEN_RELEASE`.
- `scripts/run_release_preflight.sh`: expected red before App Store preflight until the private release env values exist.
- Remaining release blockers: missing `DEVELOPMENT_TEAM_ID`, missing release `APP_TOKEN_RELEASE`, and a Release entitlements confirmation warning.

## Boundaries

This proof is the current local app build and automated test suite. It is not a
signed archive, not a TestFlight upload, and not the human V1 manual smoke.
Those remain covered by `docs/testflight-v1-preflight.md`.
