# Spec: T-ios-xcuitest-v1-smoke

**Status**: ready-for-codex.
**Owner**: codex (iOS / Xcode scope).
**V1 pillar**: ios
**V1 effect**: replaces the "manual human on device" V1 smoke gate with
a thin automated XCUITest scaffold that exercises the golden path. The
deterministic V1 evals already cover the *backend* contracts; this
covers the *iOS UI* contracts that today only exist as a manual
checklist in `docs/runbook-v1-smoke.md`.

## Problem

`themTests/` has 14 unit-style test files. There is no `themUITests`
target and no XCUITests. Every macOS or iPad regression — every time
the screenplay editor accidentally swallows a keystroke, every time
the orb stops animating, every time the onboarding name prompt
returns — is found by the human, manually, on the device. This won't
scale and it's a meaningful contributor to "V1 isn't shipping yet."

## Scope (V1: thin scaffold, not full coverage)

In:
- Add a `themUITests` target to the Xcode project.
- One XCUITest case per V1 manual smoke item, kept thin (~50 lines each):
  1. `test_first_run_onboarding_unlocks_companion`
  2. `test_record_voice_turn_round_trips_to_screenplay`
  3. `test_screenplay_export_returns_a_file`
  4. `test_memory_recall_includes_a_mentioned_character`
  5. `test_realtime_fallback_does_not_crash_companion`
- A `MockBackendClient` switch (compile-time flag) that lets UI tests
  run against a deterministic in-memory backend, so tests don't depend
  on the production API.
- One CI workflow step that runs `xcodebuild test` against the iOS
  simulator. Treated as a soft gate initially (failure logs but doesn't
  block), then promoted to hard gate after a stable run of 10 builds.

Out:
- Visual regression / pixel diffing. Use Codex eyes for those.
- Full-coverage UI tests. Five thin smokes is the V1 surface; deeper
  coverage is a follow-on.

## Approach

Mock backend wiring:
- Existing `BackendClient` already has a single entry point.
- Add a protocol `BackendTransport` extracted from the request-execution
  path, then inject a `MockBackendTransport` in UI tests via a launch
  argument: `app.launchArguments = ["--ui-mock-backend"]`.
- Mock returns canned JSON for the V1 endpoints exercised by tests.

Test isolation:
- Each test reuses a fresh app launch (XCUIApplication().launch()).
- Onboarding is replayed (or skipped via a launch arg
  `--ui-skip-onboarding`).

## Acceptance

- `xcodebuild -scheme them -destination 'platform=iOS Simulator,name=iPhone 15' test` runs
  the five UI tests and they pass on a clean simulator.
- A new GitHub Actions step (or addition to `quality-gate.yml`) runs
  the same on every iOS-touching PR.
- `docs/runbook-v1-smoke.md` updates to say "the five XCUITests below
  cover this; manual smoke remains the source of truth for visual
  polish only."
- Adding a sixth test is a 1-file change, not a refactor.

## Test plan

- Each test runs locally on the simulator and in CI green.
- One intentional break test: delete the onboarding screen, confirm
  test #1 fails loudly (proving the gate works).

## Risks

- Simulator boot adds ~30s to CI. Mitigation: keep tests under 90s
  total wall clock; reuse a single simulator instance.
- Mock backend drifts from real backend. Mitigation: contract tests
  on the mock against the real `BackendClient` request shape.

## Out-of-scope follow-ups

- Visual regression tooling (e.g. snapshot tests).
- Performance smokes (cold-start time, first-page-written latency).
- macOS UI test target (depends on `T-macos-shell-v1.1`).
