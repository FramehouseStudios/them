# T-1110 — Real credential refresh exposed and fixed a Studio freeze

October21,2026. Branch `codex/T-1110-real-refresh-recovery`.
Parent `64d56c2d80025fcd2819751323c092c4bc385563`.
Runtime/test checkpoint `26f6a0739a498cd5045298f875e59018349e9999`.

## Two verified causes, not just a better test name

The old expire-once hook changed a defaults token while the DEBUG automation
identity preferred an immutable environment bearer. A stronger real-local
native workflow failed **0 pass /1 fail /0 skip**: the save recovered but the
observer saw zero rejected saves. Historical green recovery is not retroactive
proof of real refresh.

Fixed that existing DEBUG seam: expire exactly one outgoing local version
request after its headers are built, never shared credentials. An explicit
`--ui-testing` plus loopback-only stored-session mode seeds user metadata through
the existing auth owner and preserves rotated credentials on relaunch. Other
automation keeps its existing immutable identity behavior. No Release auth
override, server acceptance bypass, real human sign-in, or new credential store.

This uncovered a **real production-path lock inversion**. The backend observed
version401 and refresh200, but no fresh-bearer save; the app remained loading.
A one-second stack sample recorded all sampled main-thread frames waiting for
`io.them.auth.session-state` while SwiftUI held its graph lock. The refresh
worker held that auth queue in `persistRefreshAuthEnvelopeIfCurrent` ->
`persistAuthTokenPair` -> `beginAuthSessionTokenMutation` -> defaults removal.
CFPreferences delivered KVO to SwiftUI, which waited for the same graph lock.
The existing deferred explicit defaults notification did not stop CFPreferences'
own synchronous KVO delivery.

The immediate main-thread read in the captured run was the DEBUG restore
snapshot. Production account-change callbacks also synchronously read this auth
owner; do not infer that a past physical-phone freeze was proven to be this exact
instance. The observed local app deadlock and production lock-order hazard are
the supported claims.

After recording the sample/counters/screenshot, stopped only the identity-checked
owned app and its exact xcodebuild invocation. Result: **TEST INTERRUPTED**, not
a passing test or a scored assertion failure. Xcode could not finalize the
action log; retain the partial bundle and interruption log. The next clean proof
erased only its task-owned simulator; no human app, session or script was erased.

## Product correction

Auth mutation entry points now resume on the main actor for sign-up, login,
Apple sign-in, persisted-session recovery, sign-out, password reset and email
verification; the actual refresh operation/commit follows the same rule.
Networking remains awaited. The serial auth queue and crash-safe Keychain /
metadata transaction remain canonical. SwiftUI/KVO writes no longer hold that
queue on a worker while waiting for a main-thread graph read. No new lock,
framework, sleep, timeout relaxation, warning suppression or optimistic receipt.

Account deletion's two local-clear hooks likewise run on main. The new actor hop
could otherwise clear a newer login, so its request uses a captured initiating
identity and checks that owner again before clearing. The server request remains
captured before local revocation; the existing post-delete same-account rule
still protects a different user. A new intercepted-client regression verifies
that a changed owner cannot reach either cleanup or DELETE transport. No real
account deletion was performed.

Main-actor Keychain work is a conscious correctness tradeoff; physical-device
latency is not measured here. This is not a claim that every possible auth,
storage, SwiftUI or cross-thread deadlock has been eliminated.

## Connected proof and retained failures

- Initial DEBUG helper isolation mismatch failed compilation (**0 tests run**).
  Corrected its type to `nonisolated`; no check disabled. Focused auth/debug /
  restore / write-ownership cohort then **24/0/0**.
- After the lock-order correction, real-local native refresh workflow **1/0/0**:
  actual version401 -> actual `/auth/refresh`200 -> exactly one201 save using the
  bearer returned by that response -> exact raw saved words -> another relaunch
  with the same version and words. Old session is correctly revoked; server
  bytes are read through a separately authenticated real session of that same
  synthetic writer, not a test-only authorization shortcut.
- Full signed **themTests861/0/0**, erased owned iPhone17Pro/iOS26.2(23C54),
  `7F1A14C1-B379-4417-AFE9-331810CD9CD3`, normal signing. Includes existing
  credential/delete/lease/cancellation cases and the new account-clear-hop case.
- Final required recovery gate **3/0/0** on the same erased owned simulator:
  ordinary offline/relaunch save, stale-conflict choice/resolution, and the
  genuine expired-auth/raw-word journey. The old misleading auth/conflict method
  was renamed; its conflict behavior remains covered. Existing Quality Gate now
  selects all three and requires three actual passes, never a skip or retry.
- The test-only observer changes no server response or auth decision. It counts
  real401/200 and compares the real returned bearer to the subsequent201 request
  only in memory. API returns three counters, never a credential or screenplay.
  Per-test before/after deltas permit sequential iPhone/macOS runs without
  crediting an earlier test. Actual local proof here is iPhone only.
- Node**20.20.2** observer/runner checks **8/0/0**, network-disabled container,
  frozen public source and matching locked dependency cache. Observer checks
  reject wrong bearers, saves without rejection, production loading and missing
  explicit proof flag. Syntax, shell syntax and diff checks pass.
- Final macOS scaffold build passed. macOS UI recovery was not run locally;
  no such claim. Existing actor/Sendable warnings remain, not suppressed.
- D009: MemoryAPI10839 ->10754 against actual parent; other monitored files
  unchanged: index33557, Studio17337, Root14961, bridge12934. Existing DEBUG
  session policy was extracted by capability, preserving its ordinary behavior.

Exact-source distinction: full861 and final macOS compile cover the final
production runtime. Later changes only wire UI/runner proof and rename the
conflict test; final three-case UI and focused Node checks cover them. After
those, removed one extra blank line at EOF from the extracted policy so staged
diff check passes. No later semantic runtime change and no unrun full-suite
total substituted for the actual861 result.

Production backend code is unchanged; T-1104's Node20 full2900/0/2 remains the
prior runtime gate, not a fresh full run. Two existing skips are not waived.
UI backend used host Node24.19.0, isolated local stores, real local auth/persistence
and explicitly intercepted external providers. No OpenAI credits, microphone
or paid model calls. No real Postgres, physical phone, intended shipping backend,
TestFlight or App Store proof; production hold remains.

## Exact files and evidence

- `backend/evals/run_screenplay_save_network_fault_ui_smoke.mjs`
- `backend/evals/save_auth_refresh_observer.mjs`
- `backend/tests/save_auth_refresh_observer.test.mjs`
- `scripts/run_screenplay_save_network_fault_smokes.sh`
- `scripts/run_screenplay_save_network_fault_smokes.test.mjs`
- `them/BackendAuthDebugSessionPolicy.swift`
- `them/BackendMemoryAPI.swift`
- `them/UITestLaunchConfiguration.swift`
- `themTests/BackendAuthDebugSessionPolicyTests.swift`
- `themTests/BackendProjectWriteOwnershipTests.swift`
- `themUITests/V1SmokeUITests.swift`
- `TASKS.md` and this report

Permanent evidence:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1110-20261021.9K6CYU/`.
Contains red, interrupted, successful and full-suite artifacts; lock sample;
screenshot; public-source snapshots for each meaningful stage; final runtime
archive/patch; logs. Ignored private environments and signing material excluded.
Final gate snapshot `/tmp/them-1110-ci-source.53XCMo/source`; full production
snapshot `/tmp/them-1110-complete-source.6Y07jl/source`.

Next: T-1109 applies the canonical request-ownership rule to remaining project
mutations, then T-1108 interrupted first-project creation, before original #648.
Keep original heads/history and independent review/check protections. This
checkpoint does not merge main, deploy production, or complete the overall THEM
goal. Clementine, the orb, visual identity and flexible120-page direction remain.
