---
id: T-ios-xcuitest-v1-smoke
title: Thin XCUITest scaffold for the V1 manual smoke checklist
owner: codex
status: review
branch: codex/T-ios-xcuitest-v1-smoke-bash32
pillar: ios
v1_pillar: ios
v1_effect: automates the iOS golden-path contracts while keeping microphone, hardware, visual-polish, and final TestFlight signoff explicitly human-owned.
---

## Scope

Spec: `docs/specs/T-ios-xcuitest-v1-smoke.md`.

Add a `themUITests` target with five thin tests covering the V1
manual smoke checklist items. Inject a `MockBackendTransport` so tests
run deterministically without hitting the production API. Wire one CI
step to run the suite on the iOS simulator.

## Done when

- `themUITests` target exists; five tests pass on a clean simulator.
- CI runs the suite as a soft gate on every iOS-touching PR.
- `docs/runbook-v1-smoke.md` updated to reflect automated coverage.
- Adding a sixth UI test is a 1-file change.

## Repair milestone — 2026-08-25

- Made both optional-xcconfig smoke runners safe under macOS Bash 3.2
  with `set -u` enabled.
- Reset the persisted screenplay draft-save outbox during isolated UI
  launches so stale queued work cannot mutate a later smoke.
- Prevented an empty reconnect notification from reloading and clearing
  the selected Studio project.
- Made draft-conflict, pending-question, and structural fixtures install
  before live hydration can race them.
- Kept the structural reversal-card fixture stable when the Them rail opens,
  while preserving the manual refresh action.
- Hardened route-selection assertions to wait for the selected accessibility
  state instead of sampling during a SwiftUI render transition.

## Verification — 2026-08-25

- `scripts/run_v1_ui_smoke.sh` — 29 executed, 7 fixture-dependent skips,
  0 failures.
- `env ONLY_TESTING=themTests scripts/run_v1_ui_smoke.sh` — 450/450 passed.
- `xcodebuild build -project them.xcodeproj -scheme them-macOS-scaffold
  -configuration 'Mac Scaffold Debug' -destination platform=macOS
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO` — passed.
- Smoke-runner Node regressions — 4/4 passed.
- Bash syntax and `git diff --check` — passed.

## Repair milestone — 2026-10-07

- Isolated `OfflineTalkOutbox` in UI-automation storage and clear it on
  `--ui-reset-state`; this queue was the remaining persisted journal not
  cleared between UI tests and could suppress a seeded pending screenplay
  question after an earlier answer test.
- Split answer and skip assertions into separate UI cases so failures identify
  the action under test, while the launch reset keeps their fixtures isolated.

## Verification — 2026-10-07

- Signed iOS unit suite on erased iPhone 17 Pro: 636/636 passed.
- V1 UI suite on erased iPhone 17 Pro: 38 executed, 0 failures, 9
  environment-gated skips; answer and skip cases ran in suite order.
- Authenticated local-backend integrated iPhone writer loop: 1/1 passed
  (write, save, export, restore contract; no live provider calls).
- Backend `npm test`: 2,739 passed, 0 failed, 2 skipped.
- macOS scaffold build with the CI ad-hoc signing settings: passed.
- `node scripts/check_god_files.mjs`: passed; no tracked god file grew.
- The hosted #911 quality-gate failure remains separate: its XCTest runner
  timed out while loading Accessibility before test methods began.
