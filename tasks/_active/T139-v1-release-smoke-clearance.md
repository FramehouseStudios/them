---
id: T139
title: Clear V1 release smoke and config gap
owner: codex
status: review
branch: codex/T139-v1-release-smoke-clearance
pillar: mobile-first
v1_pillar: ios
v1_effect: attempts to clear the remaining Launch Doctor, Xcode, release preflight, and manual smoke blockers with evidence
---

## Scope

Audit the current V1 launch/release path, configure real release values when
available without committing secrets, run the Xcode build/test lane, run release
preflight with real values when available, record or block the manual smoke with
Launch Doctor evidence, and document exact results.

## Done When

- Release docs/code paths are audited.
- Xcode build/test results are recorded.
- Release preflight either passes with real values or records the exact missing
  real value/blocker.
- Launch Doctor either has a real smoke report or records why a truthful report
  cannot be generated.
- support agent has a precise backend support instruction for any smoke failure.

## Verification

- `zsh -lc 'for k in DEVELOPMENT_TEAM_ID BACKEND_URL APP_TOKEN APP_TOKEN_RELEASE RELEASE_BACKEND_URL OPENAI_API_KEY; do if [[ -n ${(P)k} ]]; then print "$k=present"; else print "$k=missing"; fi; done'` showed all listed values missing.
- `security find-identity -v -p codesigning` showed `0 valid identities found`.
- `xcodebuild build -project them.xcodeproj -scheme them -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO` passed.
- `xcodebuild test -project them.xcodeproj -scheme them -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO` passed, 108 tests, 0 failures.
- `xcodebuild build -project them.xcodeproj -scheme them -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO` passed.
- At that historical run, `scripts/appstore_preflight.sh` failed for the then-unset
  Development Team, backend, and token inputs; the current contract fixes the
  hosted backend at `https://api.them.io` and names the remaining token secret
  `APP_TOKEN_RELEASE`. The signed Release build was skipped because
  `DEVELOPMENT_TEAM_ID` was not configured.
- `cd backend && npm run v1:status` reported 19/25 V1 checklist items complete.
- `node scripts/v1_launch_doctor_report.mjs --talk=not-started --studio=not-started --memory=not-started --realtime=not-started --write-docs` wrote the blocked Launch Doctor report.
