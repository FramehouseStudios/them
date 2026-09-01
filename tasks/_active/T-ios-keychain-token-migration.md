---
id: T-ios-keychain-token-migration
title: Migrate iOS auth tokens from UserDefaults to Keychain
owner: codex
status: review
branch: codex/T-ios-keychain-token-migration
pillar: ios
v1_pillar: ios
v1_effect: closes V1 pre-flight security gap before TestFlight external review; auth tokens currently live in UserDefaults (plist on disk).
---

## Scope

Spec: `docs/specs/T-ios-keychain-token-migration.md`. Decision:
`D-token-keychain-migration` in `docs/decisions-queue.md`
(resolved 2026-05-14).

Finish the existing partial credential migration by making Keychain the source
of truth before any legacy defaults read, routing every app-token consumer
through that migration, and preventing failed new secure writes from falling
back to plaintext defaults. Keep the existing public client surface unchanged.

## Done when

- Keychain values are the source of truth on a fresh install and after the
  one-shot upgrade reconciliation completes.
- Existing UserDefaults entries are cleared after migration.
- `themTests` covers fresh-install, upgrade, keychain-fail branches.
- Manual smoke: install previous build, sign in, install this build
  over the top — sign-in survives.

## Local verification

- `BackendCredentialMigrationTests` pass 38/38 on an iPhone 17 Pro simulator,
  including transient-read and old-build conflict regression cases.
- The complete iOS `themTests` target passes 516/516.
- The focused suite performs real Security-framework create, read, update, and
  delete operations against an isolated Keychain service.
- A real `app_token` upgrade fixture migrates through the production helper into
  a unique test Keychain service, clears the legacy value, and remains
  idempotent without touching an app user's credential namespace.

## Human clearance remaining

- Install a previous signed build on a physical iPhone, sign in, install the
  new signed build over it, and confirm the remembered session survives. This
  cannot be reproduced by an unsigned local simulator build.
