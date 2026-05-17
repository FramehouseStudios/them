# V1 Release Smoke Clearance

This is the T139 launch-blocker evidence packet. It records what Codex could
truthfully clear locally and what remains blocked by missing release inputs or
manual human smoke proof.

T152 refresh, 2026-05-17 14:31 America/Los_Angeles: Codex reran the release
config/preflight path after the GitHub Actions `OPENAI_API_KEY` secret was
fixed. The OpenAI secret is no longer a human blocker for PR #33; PR #33 is now
a Claude-owned eval-quality repair. The release/manual-smoke blockers below
remain unchanged because no local Release config or signing identity exists.

## Status

- Automated app build/tests: passed.
- Launch Doctor report: exists at `docs/v1-launch-doctor.latest.json` and
  `docs/v1-launch-doctor.latest.md`.
- Launch Doctor result: `not_started`, 0/4 flows passed, because the real V1
  manual app smoke has not been performed.
- Release preflight: still failed with `fail=3 warn=1`.
- Signed Release preflight with real secrets: not run, because the real values
  are not present and this machine has no valid code signing identities.

## What Was Configured

No permanent release values were configured in the repository. The audit found
no real values for:

- `DEVELOPMENT_TEAM_ID`
- `BACKEND_URL`
- `APP_TOKEN`
- `APP_TOKEN_RELEASE`
- `RELEASE_BACKEND_URL`

The checked-in placeholders remain placeholders, and no secrets were committed.

## Release Path Audit

- `them/Config.xcconfig` still has `APP_TOKEN_RELEASE =
  REPLACE_WITH_PROD_APP_TOKEN` and an empty `DEVELOPMENT_TEAM_ID`.
- `them.xcodeproj/project.pbxproj` maps Release `APP_TOKEN` through
  `APP_TOKEN_RELEASE`, Release `BACKEND_URL` through `RELEASE_BACKEND_URL`, and
  `DEVELOPMENT_TEAM` through `DEVELOPMENT_TEAM_ID`.
- `scripts/appstore_preflight.sh` accepts runtime overrides for
  `DEVELOPMENT_TEAM_ID`, `BACKEND_URL`, `APP_TOKEN`, `APP_TOKEN_RELEASE`, and
  `RELEASE_BACKEND_URL`, then rejects placeholders/localhost Release values.
- `scripts/run_release_preflight.sh` loads the ignored
  `them/Release.local.env` file and passes those values into the existing
  preflight gate without committing secrets.
- The shared scheme passes `APP_TOKEN` and `BACKEND_URL` from build settings
  into the app environment.

## Commands And Results

```sh
zsh -lc 'for k in DEVELOPMENT_TEAM_ID BACKEND_URL APP_TOKEN APP_TOKEN_RELEASE RELEASE_BACKEND_URL OPENAI_API_KEY; do if [[ -n ${(P)k} ]]; then print "$k=present"; else print "$k=missing"; fi; done'
```

Result: all listed values were missing.

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

Result: failed, `fail=3 warn=1`.

Blocking failures:

- Development Team is not configured.
- Release `BACKEND_URL` is placeholder or unset.
- Release `APP_TOKEN` is placeholder or unset.

Warning:

- Signed Release macOS build was skipped because `DEVELOPMENT_TEAM_ID` is not
  configured.

```sh
cd backend
npm run v1:status
```

Result: 20/25 V1 checklist items complete. Remaining items are the manual Talk,
Screenplay, Memory, Realtime, and final iOS release signoff checks.

```sh
node scripts/v1_launch_doctor_report.mjs --talk=not-started --studio=not-started --memory=not-started --realtime=not-started --write-docs
```

Result: wrote `docs/v1-launch-doctor.latest.json` and
`docs/v1-launch-doctor.latest.md` with explicit blocker notes.

T152 reran the same report path with updated notes:

```sh
node scripts/v1_launch_doctor_report.mjs --talk=not-started --studio=not-started --memory=not-started --realtime=not-started --write-docs
```

Result: refreshed `docs/v1-launch-doctor.latest.json` and
`docs/v1-launch-doctor.latest.md` at `2026-05-17T21:31:39.959Z`.

## Manual V1 Smoke

The manual V1 app smoke was not completed in this pass. A passing result would
be false without the intended release backend URL, production app token,
Apple signing setup, and an actual app run through:

- Talk Pipeline: record voice -> get reply -> hear reply -> saved turn.
- Screenplay Studio: create project -> write scene -> save -> export -> reopen.
- Creative Memory: mention character -> later suggestion recalls them.
- Realtime: primary mint works; forced primary failure shows fallback.

## Remaining Blockers

1. Provide the Apple `DEVELOPMENT_TEAM_ID` and a valid signing identity.
2. Provide the hosted release `BACKEND_URL`.
3. Provide the production `APP_TOKEN`.
4. Rerun:

   ```sh
   cp them/Release.local.env.example them/Release.local.env
   chmod 600 them/Release.local.env
   # Fill in DEVELOPMENT_TEAM_ID, BACKEND_URL, and APP_TOKEN.
   scripts/run_release_preflight.sh
   ```

5. Run the in-app V1 Launch Doctor against the intended release backend and
   replace the current `not_started` report with the passing manual smoke
   export.

## Claude Direction

Claude should fix PR #33's eval-quality failures first because the credential
blocker is cleared and the gate still fails. After #33 is green, Claude should
move to Phase 6.1a unless Codex or the human posts a concrete Talk, Studio,
Memory, or Realtime smoke failure from the Launch Doctor/manual app run.
