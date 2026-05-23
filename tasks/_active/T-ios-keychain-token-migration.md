---
id: T-ios-keychain-token-migration
title: Migrate iOS auth tokens from UserDefaults to Keychain
owner: codex
status: ready
branch: -
pillar: ios
v1_pillar: ios
v1_effect: closes V1 pre-flight security gap before TestFlight external review; auth tokens currently live in UserDefaults (plist on disk).
---

## Scope

Spec: `docs/specs/T-ios-keychain-token-migration.md`. Decision:
`D-token-keychain-migration` in `docs/decisions-queue.md`
(resolved 2026-05-14).

Replace UserDefaults reads/writes for the `app_token` and
`sharedUserID` keys in `them/BackendClient.swift` with a
`KeychainTokenStore`, including a one-shot idempotent migration from
existing UserDefaults values. No public-surface changes; callers stay
untouched.

## Done when

- Keychain values are the source of truth on a fresh install and after
  upgrade-over-existing.
- Existing UserDefaults entries are cleared after migration.
- `themTests` covers fresh-install, upgrade, keychain-fail branches.
- Manual smoke: install previous build, sign in, install this build
  over the top — sign-in survives.
