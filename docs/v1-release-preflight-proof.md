# V1 Release Preflight Proof

This artifact records the latest local App Store/TestFlight preflight result.
It does not commit release secrets, signing credentials, entitlements, privacy
manifest changes, or App Store metadata.

## Last Run

2026-05-16 01:20 America/Los_Angeles on branch
`codex/T130-release-preflight-clearance`.

## Command

```sh
scripts/appstore_preflight.sh
```

## Result

Failed: `fail=3`, `warn=1`.

## Passing Checks

- Bundle identifier is set: `io.them.them`.
- Hardened Runtime is enabled for Release.
- Release entitlements are wired: `them/them.entitlements`.
- Sandbox, network client, and audio input entitlements are present.
- Privacy policy URL is set: `https://them.io/privacy`.
- Support email is set: `support@them.io`.
- Microphone usage description is configured.
- Privacy manifest declares Audio Data and User Content.
- Privacy manifest tracking is disabled.
- Release Info.plist includes `NSMicrophoneUsageDescription`.

## Blocking Checks

- Development Team is not configured. Provide `DEVELOPMENT_TEAM_ID` through
  release config, environment, or an `xcodebuild` build setting.
- `BACKEND_URL` is placeholder or unset for Release. Provide a hosted API URL
  through release config, environment, or an `xcodebuild` build setting.
- `APP_TOKEN` is placeholder or unset for Release. Provide the production app
  token through release config, environment, or an `xcodebuild` build setting.

## Warning

- Signed Release macOS build was skipped because `DEVELOPMENT_TEAM_ID` is not
  configured. This avoids double-counting the missing team as both a
  configuration failure and a signing failure.

## Final Preflight Command Shape

When release credentials exist locally or in CI, run:

```sh
DEVELOPMENT_TEAM_ID=<apple-team-id> \
BACKEND_URL=<hosted-api-url> \
APP_TOKEN=<production-app-token> \
scripts/appstore_preflight.sh
```

Do not commit those values.

## Build Log

No signed Release build log was produced in this run because the signed build
step is skipped until `DEVELOPMENT_TEAM_ID` is present. Earlier T126 proof saw
this duplicate signing error:

```text
"them" has entitlements that require signing with a development certificate.
```

## Boundary

These blockers are release-configuration and signing/deploy-secrets issues.
They do not invalidate the current Debug app build/test proof in
`docs/v1-build-test-readiness.md`, and they do not replace the human V1 manual
smoke.
