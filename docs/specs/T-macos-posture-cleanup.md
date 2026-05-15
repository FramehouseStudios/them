# Spec: T-macos-posture-cleanup

**Status**: ready-for-codex. Backed by `D-desktop-posture-v1` in
`docs/decisions-queue.md` (resolved 2026-05-14: no desktop app for V1).
**Owner**: codex (iOS / Xcode scope).
**V1 pillar**: ios
**V1 effect**: closes the "macOS scaffolding compiles but isn't a
product" gap. Without this, an external reviewer (or a curious user
running the Mac build) sees a half-Catalyst app that doesn't match the
mobile-first promise.

## Problem

The Xcode project declares `macosx` in `SUPPORTED_PLATFORMS` and several
files (`ScreenplayLocalExport.swift`, `AudioPlayer.swift`,
`ClementineRealtimeWebViewBridge.swift`, ~6 total) contain
`#if os(macOS)` branches. There is no Mac UI (no sidebar, no menu, no
keyboard shortcut handlers), so the Catalyst build today is a
phone-shaped window with iOS chrome.

D-desktop-posture-v1 resolved: V1 is mobile-only. The macOS target
stays dormant so we don't churn the project file, but it must not
appear in any V1 marketing or TestFlight notes, and the codepaths
that branch on it must be either (a) genuinely correct or (b) clearly
labeled as dormant scaffolding.

## Scope

In:
- Inventory every `#if os(macOS)` and the function it lives in. One
  table in this spec, kept current as the spec ages.
- For each branch, pick one of three outcomes:
  1. **Keep correct** — the branch is genuinely needed even today
     (e.g. macOS-specific NSPasteboard handling that wouldn't compile
     on iOS). Add a 1-line comment naming the reason.
  2. **Park behind a build flag** — wrap in a `#if THEM_MAC_SHELL`
     compile flag that's off in the iOS-only V1 scheme. Keeps source
     compiling, removes from the active iOS build.
  3. **Delete** — branch was dead or wrong. Remove.
- Add a single `THEM_MAC_SHELL` flag definition to the project's build
  settings, default off.
- Remove `macosx` from the active V1 TestFlight scheme (NOT the project's
  `SUPPORTED_PLATFORMS`; leave the project-wide flag so post-V1 work
  can re-enable a Mac target without re-plumbing).
- Update the App Store listing checklist to read "iPhone only" until
  a real Mac shell ships.

Out:
- Building a real macOS shell. That's a separate spec (`T-macos-shell-v1.1`)
  and a separate ADR.
- Touching any iOS-only code path.

## Approach

1. Run `grep -rn "#if os(macOS)" them/` and fill the inventory table
   in this spec.
2. Per-branch decision is by Codex eye + a short comment in the diff
   explaining the choice.
3. Single project setting change: V1 scheme excludes macOS as a destination.
4. One verification build for both iOS and macOS schemes to confirm:
   - iOS build is identical functionally (no warning regressions).
   - macOS build still compiles after `THEM_MAC_SHELL` is off (dormant
     code is gated, not deleted).

## Acceptance

- `grep -rn "#if os(macOS)"` returns either:
  - Branches with a "kept — reason: ..." line above, or
  - Branches wrapped in `#if THEM_MAC_SHELL ... #endif` blocks.
- iOS-only V1 scheme: no macOS destination present. Building this
  scheme for `My Mac (Designed for iPad)` yields a no-op or a clear
  "not supported in V1" gate.
- macOS scheme: still builds (so the option to re-enable later isn't
  destroyed).
- App Store metadata says iPhone only.

## Test plan

- Build the iOS V1 scheme. `themTests` green.
- Build the macOS scheme with `THEM_MAC_SHELL` undefined. Should
  build (dormant) without warnings.
- Manual sanity: install on iPhone, app behaves identically.

## Risks

- Removing `macosx` from the active scheme could surface a previously-
  hidden compile error in iOS-only code. Mitigation: do the inventory
  first, fix branches before flipping the scheme.

## Out-of-scope follow-ups

- `T-macos-shell-v1.1`: when product decides desktop is on the roadmap,
  this is the spec that builds a real sidebar + menu + window-sizing
  Mac app. Requires its own ADR.
