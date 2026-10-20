# Release backend selection — 2026-09-19

Branch: `codex/T-release-live-backend-default`, based on main `647e01fc`.

## Verified issue and change

Public probes found `https://them-backend.onrender.com/healthz` ready and its
`/api/version` app-token protected. `https://api.them.io` redirected to a parked
domain. Both Release app configurations hard-coded the latter at target level,
overriding the optional private xcconfig's `BACKEND_URL`.

Release configurations now use `them/Release.xcconfig`: the public Render URL
is the default, then shared/private configuration is included so an explicit
private override wins. Debug's base configurations are unchanged. The new file
is excluded from synchronized target membership. The release template and
operator documentation now name the verified live host.

## Evidence

- 55 local release/configuration/health contract tests passed, zero failures.
  Log: `/tmp/them-release-url-tests.log`.
- Full backend, Node 24.19.0: 2,739 passed, zero failed, two skipped.
  Log: `/tmp/them-release-url-backend.log`.
- Actual `xcodebuild -showBuildSettings -json`:
  - iPhone Release default: `https://them-backend.onrender.com`.
  - Mac Scaffold Release default: same Render host.
  - Both Release targets honor a synthetic private override URL.
  - iPhone Debug remains `http://localhost:3000` with that override present.
- Synthetic ignored `Release.local.xcconfig` was removed after verification.
  No real credentials were used, copied, changed, or printed.
- `plutil -lint them.xcodeproj/project.pbxproj`, `git diff --check`, and
  `node scripts/check_god_files.mjs`: passed.
- Mac Release scaffold compilation passed (`BUILD SUCCEEDED`); log:
  `/tmp/them-release-url-mac-build.log`. This is an unsigned scaffold build, not
  a distribution archive or install proof.
- Signed iOS unit bundle: 618 passed, zero failed, on the erased disposable simulator
  `65A0A68B-4910-4B4A-A4E1-80469E8468D2`; log:
  `/tmp/them-release-url-ios.log`.
- Generated Mac app `Contents/Info.plist` embeds the Render URL. Neither shared
  nor release xcconfig files are present in the app bundle.

## Release limits

This does not configure signing, tokens, public privacy pages, or the backend's
provider credentials. The normal live release gates remain required. No archive,
upload, deployment, or physical-device install has been performed.

The connected physical iPhone was readable after unlock and has THEM 1.0 (1),
bundle `io.them.them`. Those generic version numbers do not identify its source
commit or prove a successful voice-to-saved-page flow.

GitHub Quality Gate run `35482714909` on billing PR #625 ran no steps. Its
annotation states the account is locked due to a billing issue. This external
hosted-validation blocker is not a code failure and must not be bypassed.
