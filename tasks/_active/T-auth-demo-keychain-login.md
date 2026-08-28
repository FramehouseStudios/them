---
id: T-auth-demo-keychain-login
title: Add local demo login and Keychain remembered credentials
owner: codex
status: review
branch: codex/T-auth-demo-keychain-login
pillar: mobile-first
v1_pillar: ios
v1_effect: gives local reviewers a repeatable authenticated Profile flow while preserving production Apple and email-auth boundaries.
---

## Scope

- Add a debug-and-loopback-only fake email account through the existing email
  signup/login routes.
- Add explicit remembered-email and remembered-password controls to Profile.
- Store the opted-in password only in Apple Keychain and clear it immediately
  when the user disables remembrance.
- Preserve refresh-token session restoration and keep Sign in with Apple on
  the Apple-issued identity-token path.
- Normalize backend millisecond session timestamps before rendering account
  activity so a valid current session never appears tens of thousands of years
  in the future.
- Do not add a backend demo endpoint, production credential, or auth bypass.

## Done when

- The documented demo credential can create or reuse a local account and sign
  in through normal auth.
- Remembered credentials repopulate after sign-out/relaunch, while disabling
  the option removes them.
- Release or non-loopback configurations cannot surface or invoke demo login.
- Current-session activity displays the real calendar date for both legacy
  second timestamps and backend millisecond timestamps.
- Focused credential/auth tests, iPhone and macOS builds, local backend smoke,
  strict pre-flight, and `git diff --check` pass.

## Verification

- Focused credential and authentication policy tests: 61 passed, 0 failed.
- Remembered-login/session-date policy tests after the live smoke repair: 26
  passed, 0 failed.
- Focused account deletion, password reset, session bootstrap, and auth-race tests: 15 passed, 0 failed.
- Signed Profile UI tests for demo separation and Keychain relaunch restoration: 2 passed, 0 failed.
- Full `themTests` target: 496 passed, 0 failed, 0 skipped.
- Exact replay of the formerly deadlocked first-page telemetry test: 1 passed, 0 failed.
- Backend auth/account contracts: 37 passed, 0 failed.
- iOS Simulator Release, macOS Scaffold Debug, and macOS Scaffold Release builds passed.
- Rebuilt macOS Scaffold Debug app relaunched into the same authenticated local
  account and rendered the active session as `Aug 27, 2026` instead of year
  `58625`.
- Release-app scan found none of the demo email, password, or UI label.
- Isolated local-backend smoke passed signup, refresh rotation, logout, repeat login, persistence, process restart, and repeat login.
- `node scripts/pre_flight.mjs --strict`, active-task front-matter evaluation, and `git diff --check` passed.
- Global strict task sync still reports repository-wide legacy/orphan debt; this task's row, owner, and status are synchronized and produce no finding.
