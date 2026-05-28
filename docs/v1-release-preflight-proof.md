# V1 Release Preflight Proof

This artifact records the latest local App Store/TestFlight preflight result.
It does not commit release secrets, signing credentials, entitlements, privacy
manifest changes, or App Store metadata.

## Last Run

2026-05-28 America/Los_Angeles on branch
`codex/talk-handler-live-parity`.

## Configuration Audit

`them/Release.local.env` does not exist in the worktree. No release secrets
were committed or substituted into project files. The checked-in Release build
settings provide the hosted backend URL, so `BACKEND_URL` is no longer a local
private-input blocker; `DEVELOPMENT_TEAM_ID` and `APP_TOKEN_RELEASE` still are.

```sh
node scripts/release_config_status.mjs
scripts/run_release_preflight.sh
```

Result:

- `them/Release.local.env`: missing.
- `DEVELOPMENT_TEAM_ID`: missing.
- `APP_TOKEN_RELEASE`: missing.
- `BACKEND_URL`: configured as hosted HTTPS (`https://api.them.io`) through
  project Release build settings fallback.

## Command Run

```sh
scripts/run_release_preflight.sh
```

## Result

`scripts/run_release_preflight.sh` failed before running release preflight
because `them/Release.local.env` is missing.

Failed: `fail=3`, `warn=2`.

## Passing Checks

- Bundle identifier is set: `io.them.them`.
- Release `BACKEND_URL` is hosted and HTTPS: `https://api.them.io`.
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

- Missing local release config: create ignored `them/Release.local.env` from
  `them/Release.local.env.example`.
- Development Team is not configured. Provide `DEVELOPMENT_TEAM_ID` through
  release config, environment, or an `xcodebuild` build setting.
- `APP_TOKEN_RELEASE` is placeholder or unset for Release. Provide the
  production value through the ignored release config or environment.

## Warning

- Signing identity and App Store Connect archive validation are not proven by
  this status script; run the signed archive/upload path after config preflight
  is green.
- `xcodebuild -showBuildSettings` was unavailable in this local check, so
  release config status used the checked-in project file fallback.

## Final Preflight Command Shape

When release credentials exist locally, prefer the ignored local env file:

```sh
cp them/Release.local.env.example them/Release.local.env
chmod 600 them/Release.local.env
# Fill in DEVELOPMENT_TEAM_ID and APP_TOKEN_RELEASE.
node scripts/release_config_status.mjs
scripts/run_release_preflight.sh
```

When release credentials exist in CI or a one-off shell, run:

```sh
DEVELOPMENT_TEAM_ID=<apple-team-id> \
APP_TOKEN_RELEASE=<production-app-token> \
scripts/run_release_preflight.sh
```

Do not commit those values.

## Build Log

No signed Release build log was produced in this run because the release wrapper
stops before App Store preflight until private release inputs exist. A signed
Release build cannot be truthfully completed here until the Apple team/signing
setup exists. Earlier T126 proof saw this duplicate signing error:

```text
"them" has entitlements that require signing with a development certificate.
```

## Boundary

These blockers are release-configuration and signing/deploy-secrets issues.
They do not invalidate the current Debug app build/test proof in
`docs/v1-build-test-readiness.md`, and they do not replace the human V1 manual
smoke. The next concrete action is to create ignored `them/Release.local.env`,
provide `DEVELOPMENT_TEAM_ID`, provide production `APP_TOKEN_RELEASE`, confirm
Apple signing, and rerun the final preflight command above.
