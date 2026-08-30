# Spec: T-ios-keychain-token-migration

**Status**: ready-for-codex. Backed by `D-token-keychain-migration` in
`docs/decisions-queue.md` (resolved 2026-05-14).
**Owner**: codex (iOS scope; support agent does not edit `them/`).
**V1 pillar**: ios
**V1 effect**: closes the security pre-flight gap before TestFlight external
review. Today the `app_token` and `sharedUserID` live in `UserDefaults`,
which is a plist on disk that's readable by anything with the container.

## Problem

`them/BackendClient.swift` currently reads and writes auth credentials
through `UserDefaults` keys named `sharedClientTokenDefaultsKey` and
`sharedUserIDDefaultsKey` (plus any related app-token storage). Three
consequences:

1. The values are recoverable from an unencrypted backup.
2. They are not protected by the device passcode / Secure Enclave.
3. They survive an app delete on iOS (UserDefaults is in the container
   that gets removed, but iCloud-backed device backups can replay them).

V1 will not pass an external security review with this storage.

## Scope

In:
- Replace UserDefaults reads/writes for the auth `app_token` and the
  per-user `sharedUserID` with Keychain entries (kSecClassGenericPassword).
- One-shot, idempotent migration on first launch of the new build: if a
  UserDefaults value is present, copy it to Keychain, then **clear** the
  UserDefaults entry. New writes use Keychain only.
- All-or-nothing migration: if Keychain write fails, leave UserDefaults
  untouched and log a structured warning. Never wedge a launch.
- Same `BackendClient` public surface — callers (BackendMemoryAPI,
  RootExperienceView, etc.) do not change.

Out:
- Re-architecting auth flows.
- Changing token formats or refresh semantics.
- Anything other than the two known keys. If the app stores additional
  secrets in UserDefaults, file a follow-up spec — do not bundle.

## Approach

Add a `KeychainTokenStore` (struct or actor) inside `them/`:

```swift
struct KeychainTokenStore {
    let service: String          // e.g. "io.them.auth"
    let accessGroup: String?     // nil unless app group is needed
    func read(_ key: String) throws -> String?
    func write(_ value: String, key: String) throws
    func delete(_ key: String) throws
}
```

Use:
- `kSecAttrAccessible = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`
  (available after first unlock; does not roam to a new device via iCloud).
- A consistent `kSecAttrService` like `"io.them.auth"`.
- No `kSecAttrAccount` collision with other apps.

`BackendClient` then routes:

```swift
private let tokenStore = KeychainTokenStore(service: "io.them.auth", accessGroup: nil)
// On read: tokenStore.read("app_token") ?? migrateFromDefaults("app_token")
// On write: tokenStore.write(value, key: "app_token")
// migrateFromDefaults: if UserDefaults has it, write to Keychain, clear UserDefaults, return value.
```

## Acceptance

- New install: tokens only ever land in Keychain. UserDefaults never sees them.
- Upgrade install (UserDefaults populated, Keychain empty): first launch
  copies values to Keychain, clears UserDefaults, returns them as if
  nothing changed. Second launch reads from Keychain only.
- Keychain write failure: existing UserDefaults values are NOT cleared.
  Log a structured warning (`HerLog.warn` or equivalent). App still boots.
- `themTests`: add a test that round-trips a value through
  `KeychainTokenStore` against the simulator's keychain, plus a mocked-
  store unit test that exercises the migration branch.

## Test plan

- Unit test the migration helper with an injected store protocol
  (in-memory implementation) covering: fresh-install, upgrade,
  keychain-write-fails, double-migration-is-no-op.
- Integration test against the iOS simulator keychain.
- Manual smoke: install the previous build, sign in, install this build
  over the top, confirm sign-in survives.

## Risks

- App-group keychain access if BackendClient runs in an extension. Audit
  first; this spec assumes single-process.
- Keychain values not erased on app delete (this is desired here, since
  tokens are tied to the user account, not the install).

## Out-of-scope follow-ups

- Encrypt the local screenplay store with a Keychain-derived key (separate
  spec; talk to support agent about server-side key derivation).
- App-group keychain if a Share extension or widget needs auth.
