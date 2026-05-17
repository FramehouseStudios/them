# V1 Release Preflight Proof

This artifact records the latest local App Store/TestFlight preflight result.
It does not commit release secrets, signing credentials, entitlements, privacy
manifest changes, or App Store metadata.

## Last Run

2026-05-16 18:55 America/Los_Angeles on branch
`codex/T146-v1-launch-smoke-preflight`.

## Configuration Audit

No real release values were available in the worktree or shell environment, and
`them/Release.local.env` did not exist. No release secrets were committed or
substituted into project files.

```sh
zsh -lc 'for k in DEVELOPMENT_TEAM_ID BACKEND_URL APP_TOKEN APP_TOKEN_RELEASE RELEASE_BACKEND_URL OPENAI_API_KEY; do if [[ -n ${(P)k} ]]; then print "$k=present"; else print "$k=missing"; fi; done'
security find-identity -v -p codesigning
```

Result:

- `DEVELOPMENT_TEAM_ID`: missing.
- `BACKEND_URL`: missing.
- `APP_TOKEN`: missing.
- `APP_TOKEN_RELEASE`: missing.
- `RELEASE_BACKEND_URL`: missing.
- `OPENAI_API_KEY`: missing.
- Code signing identities: not rechecked in T146; T139 found `0 valid
  identities found` on this machine.

## Command Run

```sh
scripts/run_release_preflight.sh
scripts/appstore_preflight.sh
```

## Result

`scripts/run_release_preflight.sh` failed before running release preflight
because `them/Release.local.env` is missing.

Failed: `fail=3`, `warn=1`.

Direct `scripts/appstore_preflight.sh` produced the failing result above.

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

When release credentials exist locally, prefer the ignored local env file:

```sh
cp them/Release.local.env.example them/Release.local.env
chmod 600 them/Release.local.env
# Fill in DEVELOPMENT_TEAM_ID, BACKEND_URL, and APP_TOKEN.
scripts/run_release_preflight.sh
```

When release credentials exist in CI or a one-off shell, run:

```sh
DEVELOPMENT_TEAM_ID=<apple-team-id> \
BACKEND_URL=<hosted-api-url> \
APP_TOKEN=<production-app-token> \
scripts/appstore_preflight.sh
```

Do not commit those values.

## Build Log

No signed Release build log was produced in this run because the signed build
step is skipped until `DEVELOPMENT_TEAM_ID` is present. This machine also has
`0 valid identities found` for code signing, so a signed Release build cannot be
truthfully completed here until the Apple team/signing setup exists. Earlier
T126 proof saw this duplicate signing error:

```text
"them" has entitlements that require signing with a development certificate.
```

## Boundary

These blockers are release-configuration and signing/deploy-secrets issues.
They do not invalidate the current Debug app build/test proof in
`docs/v1-build-test-readiness.md`, and they do not replace the human V1 manual
smoke. The T139 clearance pass did not find real values to configure; the next
concrete action is to provide `DEVELOPMENT_TEAM_ID`, a hosted release
`BACKEND_URL`, `APP_TOKEN`, and a valid Apple signing identity, then rerun the
final preflight command above.
