---
id: T-macos-posture-cleanup
title: Gate macOS scaffolding off the V1 iOS scheme
owner: codex
status: ready-for-codex
branch: -
pillar: ios
v1_pillar: ios
v1_effect: closes the 'macOS scaffolding compiles but isn't a product' gap before TestFlight; V1 is mobile-only per D-desktop-posture-v1.
---

## Scope

Spec: `docs/specs/T-macos-posture-cleanup.md`. Decision:
`D-desktop-posture-v1` in `docs/decisions-queue.md` (resolved
2026-05-14: no desktop app for V1).

Inventory every `#if os(macOS)` branch in `them/`; for each either
(a) keep with a one-line "reason" comment, (b) wrap in a dormant
`THEM_MAC_SHELL` compile flag, or (c) delete. Remove macOS from the
active V1 TestFlight scheme. Leave the project-wide `macosx` flag in
`SUPPORTED_PLATFORMS` so a future Mac shell isn't re-plumbed from
scratch.

## Done when

- `grep -rn "#if os(macOS)" them/` shows every branch annotated or
  gated.
- V1 TestFlight scheme excludes macOS as a destination.
- macOS scheme still compiles (dormant), no warning regressions.
- iOS scheme `themTests` green.
