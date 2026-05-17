---
id: T130
title: Reduce V1 release preflight blockers
owner: codex
status: merged
branch: codex/T130-release-preflight-clearance
pillar: mobile-first
v1_pillar: ios
v1_effect: turns the release preflight from a broad red wall into an honest gate with only real credential/deploy blockers remaining
---

## Scope

Clear the release-preflight blockers Codex can own without committing secrets
or changing human-only App Store/privacy surfaces. Make the script accept
runtime-provided release values, remove duplicate/false-positive checks, and
enable the non-secret Release build settings that should be source-controlled.

## Done When

- Release Hardened Runtime is enabled in the app target.
- Release backend URL/app-token checks can be satisfied by environment or
  command-line build settings without committing secrets.
- Microphone usage validation accepts the checked-in release plist when the
  build setting is not present.
- The signed Release build check is skipped with a clear warning when
  development-team credentials are absent, instead of adding a duplicate
  failure.
- The latest release proof records the smaller, honest blocker set.

## Verification

- `bash -n scripts/appstore_preflight.sh` passed.
- `scripts/appstore_preflight.sh` reached the expected `fail=3 warn=1`
  state: Apple Development Team, hosted `BACKEND_URL`, and production
  `APP_TOKEN` remain the only release-preflight failures; signed Release build
  is a warning until credentials exist.
- `node --check scripts/v1_launch_room.mjs` passed.
- `node --test scripts/v1_launch_room.test.mjs` passed, 5/5.
- `node scripts/v1_launch_room.mjs --role=human` passed and now shows the
  runtime command shape for clearing the remaining release config.
- `node scripts/pre_flight.mjs --strict` passed.
- `node scripts/coordination_state.mjs validate` passed.
- `git diff --check` passed.
- `xcodebuild build -project them.xcodeproj -scheme them -configuration Release -sdk macosx -destination platform=macOS CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO` passed.
- `xcodebuild test -project them.xcodeproj -scheme them -destination platform=macOS CODE_SIGNING_ALLOWED=NO` passed, 108/108.
- `xcodebuild build -project them.xcodeproj -scheme them -destination generic/platform=iOS CODE_SIGNING_ALLOWED=NO` passed.
