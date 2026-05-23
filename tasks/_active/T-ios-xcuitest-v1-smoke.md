---
id: T-ios-xcuitest-v1-smoke
title: Thin XCUITest scaffold for the V1 manual smoke checklist
owner: codex
status: ready
branch: -
pillar: ios
v1_pillar: ios
v1_effect: replaces 'manual human on device' V1 smoke gate with five automated XCUITests covering the iOS golden-path contracts.
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
