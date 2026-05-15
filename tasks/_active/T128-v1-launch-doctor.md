---
id: T128
title: Add in-app V1 Launch Doctor
owner: codex
status: review
branch: codex/T128-v1-launch-doctor
pillar: mobile-first
v1_pillar: ios
v1_effect: turns the remaining V1 manual smoke into a guided, recordable in-app proof instead of a loose checklist
---

## Scope

Add a debug/internal V1 Launch Doctor that guides the human through the
remaining manual smoke flows: talk pipeline, Screenplay Studio, creative
memory, and realtime. The flow should produce a structured report that the
launch room can read or point to during release readiness checks.

## Done When

- The app exposes a debug/internal V1 Launch Doctor from the existing data or
  diagnostics surface.
- The doctor has typed models for the four V1 smoke flows, pass/fail/in-progress
  state, notes, and a report/export shape.
- Tests cover the report builder and launch-room handling of the report path.
- `scripts/v1_launch_room.mjs` surfaces the current Launch Doctor report status.
- Handoff files tell Claude that Phase 7b remains his lane and that this is
  app-side smoke instrumentation only.

## Verification

- `node --check scripts/v1_launch_room.mjs` (passed)
- `node --test scripts/v1_launch_room.test.mjs` (passed, 5/5)
- `xcodebuild test -project them.xcodeproj -scheme them -destination platform=macOS CODE_SIGNING_ALLOWED=NO -only-testing:themTests/V1LaunchDoctorTests` (passed, 5/5)
- `xcodebuild test -project them.xcodeproj -scheme them -destination platform=macOS CODE_SIGNING_ALLOWED=NO -only-testing:themTests/DesignSystemGuardTests/testNewSwiftFilesDoNotBypassDesignSystemTokens` (passed, 1/1)
- `xcodebuild test -project them.xcodeproj -scheme them -destination platform=macOS CODE_SIGNING_ALLOWED=NO` (passed, 108/108; existing SwiftUI publish warnings still appear during app-hosted tests)
- `xcodebuild build -project them.xcodeproj -scheme them -destination generic/platform=iOS CODE_SIGNING_ALLOWED=NO` (passed)
- `node scripts/coordination_state.mjs validate` (passed)
- `node scripts/pre_flight.mjs --strict` (passed)
- `node scripts/v1_launch_room.mjs --role=human` (passed; reports Launch Doctor proof missing until the human/app exports it)
