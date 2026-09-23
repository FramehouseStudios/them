---
id: T118
title: Prove current app build and tests for V1 readiness
owner: codex
status: merged
branch: codex/T118-v1-readiness-proof
pillar: mobile-first
v1_pillar: ios
v1_effect: closes the current build/themTests V1 release-readiness checklist item if verification passes
---

## Scope

Run the current app build and `themTests` on main, record the result in a
release-readiness artifact, and update `docs/v1-definition.md` only if the
verification is green.

## Done When

- Current app build is run and documented.
- Current `themTests` are run and documented.
- `docs/v1-definition.md` reflects the real verification result.
- `TASKS.md` is regenerated.

## Verification

- `xcodebuild build -project them.xcodeproj -scheme them -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO` -> passed
- `xcodebuild test -project them.xcodeproj -scheme them -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO` -> passed, 99 tests
- `npm run v1:status` -> passed, 18/25
- `node --test scripts/v1_status.test.mjs` -> passed, 10/10
- `node scripts/pre_flight.mjs --strict` -> passed
- `git diff --check` -> passed
