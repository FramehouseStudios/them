# V1 Release Smoke Clearance

This is the T139 launch-blocker evidence packet. It records what Codex could
truthfully clear locally and what remains blocked by missing release inputs or
manual human smoke proof.

T153 refresh, 2026-05-17 17:30 America/Los_Angeles: PR #33 and PR #359 are
merged, and the eval-quality repair lane is closed. Codex reran the launch-room
and release-preflight path after those merges. The release/manual-smoke blockers
below remain unchanged because no local Release config or signing identity
exists.

T154 refresh, 2026-05-28 12:45 America/Los_Angeles: after the extracted
`/talk` handler became the live route and the inline handler was removed,
Codex reran the deterministic V1 smoke pack. Voice-to-page prompt assembly,
screenplay Fountain export, creative-memory recall, and realtime failover all
passed. Codex also replaced the stale `iPhone 15` XCUITest destination with
`scripts/run_v1_ui_smoke.sh`, then ran the V1 UI smoke successfully on
`iPhone 17 Pro` with 5/5 tests passing. The Launch Doctor latest report now
records the current state as `not_started` for all five human/manual gates,
with 0 failed flows and no manual pass claimed.

## Status

- Automated app build/tests: passed.
- Launch Doctor report: exists at `docs/v1-launch-doctor.latest.json` and
  `docs/v1-launch-doctor.latest.md`.
- Launch Doctor result: `not_started`, 0/5 flows passed, because the real V1
  manual app smoke has not been performed.
- V1 checklist status: 29/34, with only the four manual app smokes plus final
  human release signoff remaining.
- iOS V1 UI smoke: `scripts/run_v1_ui_smoke.sh` passed 5/5 on the available
  `iPhone 17 Pro` simulator.
- Release preflight: still failed with `fail=3 warn=2`.
- Signed Release preflight with real secrets: not run, because the real values
  are not present and this machine has no valid code signing identities.

## What Was Configured

No permanent release values were configured in the repository. The audit found
no real values for:

- `DEVELOPMENT_TEAM_ID`
- `APP_TOKEN_RELEASE`

Release `BACKEND_URL` is now configured as hosted HTTPS through the checked-in
Release build settings fallback: `https://api.them.io`. No secrets were
committed.

## Release Path Audit

- `them.xcodeproj/project.pbxproj` maps Release `APP_TOKEN` through
  `APP_TOKEN_RELEASE` and `DEVELOPMENT_TEAM` through `DEVELOPMENT_TEAM_ID`.
- `them/Release.local.env.example` carries the hosted
  `BACKEND_URL=https://api.them.io` default and leaves only private values blank.
- `scripts/appstore_preflight.sh` accepts runtime overrides for
  `DEVELOPMENT_TEAM_ID`, `BACKEND_URL`, and `APP_TOKEN_RELEASE`, then rejects
  placeholders/localhost Release values.
- `scripts/run_release_preflight.sh` loads the ignored
  `them/Release.local.env` file and passes those values into the existing
  preflight gate without committing secrets.
- The shared scheme passes `APP_TOKEN` and `BACKEND_URL` from build settings
  into the app environment.

## Commands And Results

```sh
security find-identity -v -p codesigning
```

Result: `0 valid identities found`.

```sh
xcodebuild build -project them.xcodeproj -scheme them -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO
```

Result: passed, `** BUILD SUCCEEDED **`.

```sh
xcodebuild test -project them.xcodeproj -scheme them -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO
```

Result: passed, `** TEST SUCCEEDED **`, 108 tests, 0 failures.

```sh
xcodebuild build -project them.xcodeproj -scheme them -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO
```

Result: passed, `** BUILD SUCCEEDED **`.

```sh
scripts/appstore_preflight.sh
```

Result: failed, `fail=3 warn=2`.

Blocking failures:

- Missing ignored `them/Release.local.env`.
- Development Team is not configured.
- Release `APP_TOKEN_RELEASE` is placeholder or unset.

Warning:

- Signing identity and App Store Connect archive validation are not proven by
  the secret-safe config status script.
- `xcodebuild -showBuildSettings` was unavailable locally, so release config
  status used the checked-in project fallback.

```sh
cd backend
npm run v1:status
```

Result: 29/34 V1 checklist items complete. Remaining items are the manual Talk,
Screenplay, Memory, Realtime, and final iOS release signoff checks.

```sh
node scripts/v1_launch_doctor_report.mjs --talk=not-started --studio=not-started --memory=not-started --realtime=not-started --release=not-started --write-docs
```

Result: refreshed `docs/v1-launch-doctor.latest.json` and
`docs/v1-launch-doctor.latest.md` with all five V1 gates represented.

## Manual V1 Smoke

The manual V1 app smoke was not completed in this pass. A passing result would
be false without the production app token, Apple signing setup, and an actual
app run through:

- Talk Pipeline: record voice -> get reply -> hear reply -> saved turn.
- Screenplay Studio: create project -> write scene -> save -> export -> reopen.
- Creative Memory: mention character -> later suggestion recalls them.
- Realtime: primary mint works; forced primary failure shows fallback.
- iOS Release Readiness: real release config -> green preflight -> exported
  Launch Doctor proof -> human signoff.

## Remaining Blockers

1. Provide the Apple `DEVELOPMENT_TEAM_ID` and a valid signing identity.
2. Provide the production `APP_TOKEN_RELEASE`.
3. Keep `BACKEND_URL=https://api.them.io` unless the release backend changes.
4. Rerun:

   ```sh
   cp them/Release.local.env.example them/Release.local.env
   chmod 600 them/Release.local.env
   # Fill in DEVELOPMENT_TEAM_ID and APP_TOKEN_RELEASE.
   scripts/run_release_preflight.sh
   ```

5. Run the in-app V1 Launch Doctor against the intended release backend and
   replace the current `not_started` report with the passing manual smoke
   export.

## Claude Direction

Claude should stay in V1 manual-smoke support mode. PR #33, PR #354, PR #358,
and PR #359 are merged; do not reopen those lanes. If Codex or the human posts
a concrete Talk, Studio, Memory, Realtime, or release-readiness smoke failure
from the Launch Doctor/manual app run, Claude should fix only that assigned
backend/support failure.
