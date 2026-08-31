# Spec: T-ios-keychain-token-migration

**Status**: implemented locally on `codex/T-ios-keychain-token-migration`;
awaiting GitHub restoration, project review, and the signed physical-device
upgrade smoke. Backed by `D-token-keychain-migration` in
`docs/decisions-queue.md` (resolved 2026-05-14).
**Owner**: codex (iOS scope; support agent does not edit `them/`).
**V1 pillar**: ios
**V1 effect**: closes the security pre-flight gap before TestFlight external
review. Today the `app_token` and `sharedUserID` live in `UserDefaults`,
which is a plist on disk that's readable by anything with the container.

## Problem

The branch already contained a substantial partial Keychain migration when this
task was resumed. Session and user-ID helpers used Security-framework storage,
but three correctness gaps remained:

1. Each app-token request path read `UserDefaults["app_token"]` before calling
   the migration helper, so a legacy token could remain in plaintext forever.
2. The migration helper preferred the legacy defaults value over an existing
   Keychain value indefinitely, with no marker distinguishing an unfinished
   old-build fallback from plaintext reintroduced after migration.
3. A failed new Keychain write copied the new credential back into
   `UserDefaults` and still reported success.
4. A transient Keychain read was indistinguishable from an absent item, so a
   later write could overwrite a credential that Security had not returned.

Those paths made the migration incomplete even though normal successful writes
already used `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`.

## Scope

In:
- Use one `BackendKeychainTokenStore` owner for the shared app/client/user
  credential migration's Security-framework reads, writes, updates, and
  deletes.
- Make an existing Keychain value authoritative and clear a conflicting legacy
  default after the migration marker is present. On the first upgraded read,
  promote a conflicting defaults value once because older builds could leave a
  newer fallback beside an older Keychain item after delete-before-add failed.
- One-shot, idempotent migration on first launch of the new build: if Keychain
  is empty and a UserDefaults value is present, copy it to Keychain, then
  **clear** the UserDefaults entry. New writes use Keychain only.
- All-or-nothing migration: if Keychain write fails, leave UserDefaults
  untouched and log a structured warning. Never wedge a launch.
- Failed new credential writes return failure and never persist the attempted
  value into defaults.
- Treat `.notFound` separately from unavailable or invalid Keychain reads;
  only a confirmed missing item may accept a legacy migration write.
- Route all three app-token readers through the canonical migration helper
  before plist, environment, or debug fallbacks.
- Reset and seed UI-test credentials through the canonical Keychain accounts so
  simulator runs cannot inherit or override stale secure fixtures.
- Same `BackendClient` public surface — callers (BackendMemoryAPI,
  RootExperienceView, etc.) do not change.

Out:
- Re-architecting auth flows.
- Changing token formats or refresh semantics.
- Anything other than the two known keys. If the app stores additional
  secrets in UserDefaults, file a follow-up spec — do not bundle.

## Approach

Use `BackendKeychainTokenStore` inside `them/BackendMemoryAPI.swift`:

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

The client then routes:

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

## Verified locally

- iPhone 17 Pro simulator: `BackendCredentialMigrationTests` 38/38 pass.
- Complete iOS `themTests` target: 516/516 pass.
- The real Keychain test creates, reads, updates, and deletes a credential in an
  isolated service.
- The upgrade test writes a legacy `app_token` to an isolated defaults suite,
  calls the production migration helper with a unique real Keychain service,
  verifies the secure value, and verifies a second read does not remigrate. It
  never touches an app or simulator user's production credential namespace.
- Adversarial fixtures prove transient reads never write and the exact
  old-build conflict state promotes the newer fallback once without identity
  rollback.
- The required second adversarial review cleared all three release-blocking
  findings and found no new blocker in the marker or UI-test paths.
- Physical signed-build install-over remains a human clearance step.

## Risks

- App-group keychain access if BackendClient runs in an extension. Audit
  first; this spec assumes single-process.
- Keychain values not erased on app delete (this is desired here, since
  tokens are tied to the user account, not the install).
- All dormant macOS scaffold configurations intentionally retain their existing
  defaults policy; this accepted task is iOS-only. Desktop credential posture
  remains deferred to the separate macOS cleanup task.

## Out-of-scope follow-ups

- Encrypt the local screenplay store with a Keychain-derived key (separate
  spec; talk to support agent about server-side key derivation).
- App-group keychain if a Share extension or widget needs auth.
