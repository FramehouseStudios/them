---
id: T130
title: Reduce V1 release preflight blockers
owner: codex
status: in-progress
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

- Pending.
