# V1 Build And Test Readiness

This artifact records the current app build and `themTests` proof used to close
the V1 release-readiness checklist item in `docs/v1-definition.md`.

## Last Verified

2026-05-28 11:44 America/Los_Angeles on branch
`claude/backend-post-v1-audit`.

## Commands

```sh
node scripts/pre_flight.mjs --strict
npm run eval:canon
(cd backend && npm test)
bash -n backend/smoke.sh
env RUN_EVAL=0 RUN_TALK_RECOVERY_GATE=0 RUN_ALERT=0 RUN_SERVER=1 ./scripts/quality_gate.sh
xcodebuild build -project them.xcodeproj -scheme them -configuration Release -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO
xcodebuild test -project them.xcodeproj -scheme them -configuration Debug -destination id=E37CE808-0323-4F50-8E8E-212D7ABFA268 CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO
scripts/appstore_preflight.sh
node scripts/release_config_status.mjs
scripts/run_release_preflight.sh
```

## Results

- Strict repository preflight: passed.
- Canon and deterministic V1 smokes: passed.
- Backend test suite: passed (`1309` passing, `1` skipped, `0` failing).
- Free/local quality gate: passed with server-dependent smoke checks enabled.
- Backend smoke now creates a disposable authenticated user and sends bearer auth
  through `/session`, `/history`, `/memories`, and `/talk`, matching the Day 10+
  user-data auth boundary.
- Debug iOS unit/UI tests: passed (`137` unit tests and `5` UI smoke tests).
- Standalone unsigned Release iPhone Simulator build: passed.
- Release iPhone build inside App Store preflight: passed.
- App Store preflight: expected red without private release inputs (`fail=2 warn=1`).
- Preflight passed privacy manifest, release plist, hosted backend URL, iPhone-only posture, and unsigned Release iPhone build checks.
- Release config status: expected red, with `them/Release.local.env` ignored by git, a tracked secret-free `them/Release.local.env.example`, hosted Release `BACKEND_URL` present, and missing private `DEVELOPMENT_TEAM_ID` / `APP_TOKEN_RELEASE`.
- `scripts/run_release_preflight.sh`: expected red until the private release
  env values exist; it stops before App Store preflight with missing
  `DEVELOPMENT_TEAM_ID` and `APP_TOKEN_RELEASE`.
- Remaining release blockers: missing `DEVELOPMENT_TEAM_ID`, missing release `APP_TOKEN_RELEASE`, and a Release entitlements confirmation warning.

## Boundaries

This proof is the current local app build and automated test suite. It is not a
signed archive, not a TestFlight upload, and not the human V1 manual smoke.
Those remain covered by `docs/testflight-v1-preflight.md`.
