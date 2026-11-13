# T1477 — remove the captured auth / SwiftUI lock inversion

VERIFIED before: one signed real-login/Keychain/controlled-expiry ordinary
recovery execution on erased task-owned81F, iOS26.2/Xcode26.3, sourceT1466dcb:
**0 passed / 1 failed / 0 skipped**. Native failure: main run loop busy30seconds.
All1,408 tracked inputs and3,303 dependency entries remained unchanged. The
owned local fixture required auth; actual HTTP save401→refresh200 occurred with
no replay observed before the stall. No paid provider or physical-phone run.

The real app sample records2,546 samples in each blocked stack. Main holds the
SwiftUI graph while Studio's existing DEBUG snapshot synchronously waits on
`authSessionStateQueue`. That queue is committing refreshed tokens; native
preferences KVO waits on the SwiftUI graph mutex. The explicit deferred defaults
notification scheduler is not on this blocked path. Shipping lifecycle readers
also synchronously read auth, but a shipping/Release reproduction is not claimed.

The original private collector's header check returnedfalse because Apple sample
redacted `/Users/halfmutantfilms/` to `/Users/USER/`. Its originalfalse JSON is
retained. A separate custody receipt verifies exact PID/start/kernel executable
before/after, exact full path under ONLY that observed prefix substitution,
device/containerUUID, bundle identity and launch time. This does not rewrite a
failed controller as green. The native test ended naturally; root's interrupt
prevalidation refused before any signal was sent. Before artifacts are under
`/private/tmp/them-t1476-auth-process-capture/run-bab75e91-03eb-4dd6-89ec-9b2dfd8a90a9`.

## Smallest canonical boundary change

Enter MainActor for a complete asynchronous auth-result transaction BEFORE it
acquires the existing serial auth queue. Never main.sync inside the queue or
schedule individual metadata writes after releasing it. Preserve token-pair
atomicity, publication/deletion markers, lease/intent checks, rollback and save
version authority. No stale presentation state substitutes for auth authority.

- New `BackendAuthMutationExecutor.run` owns that asynchronous hop.
- Existing defaults-store and notification-scheduler capabilities move byte-for-
  byte into `BackendAuthMutation.swift`; the private auth queue stays private.
- Email/Apple auth commit, refresh commit/terminal invalidation, verification,
  logout, async password reset and pending-deletion restore use the boundary.
- Six immutable cross-boundary result/envelope types explicitly conform to
  Sendable; no unchecked wrapper or JSON contract change.
- Two additive real token-pair callback controls check main-thread execution,
  serialized ordering/readability and full metadata-failure rollback. They use
  isolated suite defaults/fake Keychain; they are not themselves native-KVO proof.
- Ordinary UI recovery reuses the preserved T1466 normal sign-in and mutable
  Keychain path on both launches, with controlled expiry. All42 identities,
  other41 test bodies, original assertions/deadlines and one tutorial helper
  remain. Observer credentials remain only for existing backend assertions.

## Static proof and exact limits

Root reviewed both implementations and existing transaction comparisons.
Canonical D009 against exactmain71 passes: four protected files have zero growth,
BackendMemoryAPI shrinks80 lines (10865→10785). Actual gate JSON is retained at
`/private/tmp/them-t1477-root-proof/D009.json`. Diff check passes. Agents' Swift
parse/source-preservation checks pass. **Semantic compilation and runtime after
proof have not yet executed at this source commit.**

Residual synchronous entry points remain: intent reservation, ContentView's
startup pending-delete retry, shared identity/token writers, account-deletion
cleanup and actor-owned bootstrap identity. Adding await to actor workflows
needs separate completion/partition authority review; this candidate does not
claim all auth mutations are confined or every auth/UI deadlock is eliminated.
The observed refresh path is the binary target. Existing authoritative VM reads
and the triggering DEBUG snapshot remain intact.

## Root next checkpoint

Run signed semantic/full-unit checkpoint including the two new controls and
unchanged lease/rollback/coalescing cohorts, then the same real401 recovery UI
once. Keep native and diagnostic-capture results independent; normal app
termination/relaunch may censor a sample. Retain before failure and stop at the
first actual after failure. No unchanged full backend rerun: backend sources,
lock and scripts are exactbase07af, whose Node20 suite2783/0/2 is inherited only.
Mac scaffold compile follows the Swift change. Record all actual counts/skips.

Only a scoped local candidate is committed here. Original PR heads, main71,
branch protections and production hold remain unchanged. The human deferred979
review; do not repeat the request or merge. Clementine, orb, aesthetic and D017
remain. No paid-model, microphone, real-phone, outside-app export or product
completion claim. READY FOR CONTINUE.
