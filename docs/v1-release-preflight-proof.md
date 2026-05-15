# V1 Release Preflight Proof

This artifact records the latest local App Store/TestFlight preflight result.
It does not change signing, entitlements, release plist values, or App Store
metadata.

## Last Run

2026-05-15 01:19 America/Los_Angeles on branch
`codex/T126-release-preflight-proof`.

## Command

```sh
scripts/appstore_preflight.sh
```

## Result

Failed: `fail=6`, `warn=0`.

## Passing Checks

- Bundle identifier is set: `io.them.them`.
- Release entitlements are wired: `them/them.entitlements`.
- Sandbox, network client, and audio input entitlements are present.
- Privacy policy URL is set: `https://them.io/privacy`.
- Support email is set: `support@them.io`.
- Privacy manifest declares Audio Data and User Content.
- Privacy manifest tracking is disabled.
- Release Info.plist includes `NSMicrophoneUsageDescription`.

## Blocking Checks

- Development Team is not configured. `DEVELOPMENT_TEAM_ID` must be set in
  `Config.xcconfig`.
- Hardened Runtime is not `YES` for Release.
- `BACKEND_URL` is placeholder or unset for Release.
- `APP_TOKEN` is placeholder or unset for Release.
- Release build settings did not surface a usable microphone usage description.
- Release macOS build failed because the target has entitlements that require
  signing with a development certificate.

## Build Log

The release build log was written to `/tmp/them_release_preflight_build.log`.
The relevant error was:

```text
"them" has entitlements that require signing with a development certificate.
```

## Boundary

These blockers are release-configuration and signing issues. They do not
invalidate the current Debug app build/test proof in
`docs/v1-build-test-readiness.md`, and they do not replace the human V1 manual
smoke.
