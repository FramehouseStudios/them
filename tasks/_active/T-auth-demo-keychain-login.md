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
- Do not add a backend demo endpoint, production credential, or auth bypass.

## Done when

- The documented demo credential can create or reuse a local account and sign
  in through normal auth.
- Remembered credentials repopulate after sign-out/relaunch, while disabling
  the option removes them.
- Release or non-loopback configurations cannot surface or invoke demo login.
- Focused credential/auth tests, iPhone and macOS builds, local backend smoke,
  strict pre-flight, and `git diff --check` pass.

## Verification

- `xcodebuild test ... BackendRememberedLoginCredentialPolicyTests ... BackendCredentialMigrationTests`: 27 passed, 0 failed.
- `xcodebuild test ... test_profile_exposes_local_demo_and_keychain_remember_options_separately_from_apple`: 1 passed, 0 failed.
- Full `themTests` target: 455 passed, 0 failed.
- iOS Simulator Release, macOS Scaffold Debug, and macOS Scaffold Release builds passed.
- Release-binary scan found none of the demo email, password, or UI label.
- Isolated local-backend smoke passed signup, refresh rotation, logout, repeat login, persistence, process restart, and repeat login.
- `node scripts/pre_flight.mjs --strict`, active-task front-matter evaluation, and `git diff --check` passed.
- Global strict task sync still reports repository-wide legacy/orphan debt; this task's row, owner, and status are synchronized and produce no finding.
