---
id: T-v1-human-clearance
title: Integrate V1 release line to the human-clearance boundary
owner: codex
status: merged
branch: codex/T-v1-human-clearance
pillar: mobile-first
v1_pillar: ios
v1_effect: integrates the current V1 app/auth/release stack, closes every code-owned release gate, and records the exact Apple, deployment, metadata, and physical-device approvals still requiring a human
---

## Scope

Integrate the Reader Preview, stable UI smoke, durable auth, local demo/Keychain
login, current-main backend safety fixes, and iPhone release tooling into one
verified integration branch. Run the full code-owned verification story and stop at
the Apple/deployment/App Store/physical-device boundary without inventing
credentials or weakening release gates.

## Done When

- Current `main` is integrated without dropping the stacked V1 work.
- Providerless local startup, production fail-closed behavior, PII-safe logs,
  account isolation, durable auth, and the DEBUG-loopback demo path are covered.
- Remember Me and password saving are opt-in, use Apple Keychain, and survive a
  real locally signed simulator relaunch.
- Full backend, iOS unit, signed sequential UI, script-contract, audit, and
  clean unsigned iPhone Release gates are recorded.
- The merged PR names every remaining human-owned action, including approval
  of the inherited Email Address privacy-manifest declaration.

## Verification

- Backend: `2,269` total, `2,268` passed, `1` skipped, `0` failed; npm audit
  reported `0` vulnerabilities across `126` dependencies.
- iOS unit: `497/497` passed on iPhone 17 / iOS 26.2.
- Locally signed sequential UI: `31` total, `24` passed, `7` explicit
  fixture/server-gated skips, `0` failed; Keychain relaunch and Creative
  Partner reuse/Voice Pin/To Page routing passed.
- Focused release/security contracts: `37/37` passed after enforcing full-gate
  defaults, mode-600/non-symlink inputs, persistent backend configuration, and
  exact io.them public-surface identity.
- Complete script-contract suite: `197/197` passed.
- Clean unsigned iPhone Release with dummy private values now reaches
  `fail=2 warn=0`; only real `DEVELOPMENT_TEAM_ID` and `APP_TOKEN_RELEASE`
  values are absent. The dedicated iOS Sign in with Apple entitlement is
  checked in and resolves for iPhone Release; Apple portal capability,
  provisioning, and distribution signing remain human-owned.
- Human-only files were not edited in the final working pass. The inherited
  branch delta contains an Email Address declaration in
  `them/PrivacyInfo.xcprivacy`; it remains explicitly human-gated.
- PR #374 merged the entitlement and release-clearance integration into
  `main`; the former task branch is zero commits ahead of `main` and is kept
  only as local historical state until its ignored runtime files are reviewed.
