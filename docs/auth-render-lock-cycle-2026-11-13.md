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
parse/source-preservation checks pass. At source preparation semantic compilation and after proof were pending;
root subsequently executed the exact source commit, as recorded below.

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

## Root execution — exact sourcea3df031b

VERIFIED fresh results, not inherited:

| Check | Result |
| --- | --- |
| Full signed themTests | 725 passed / 0 failed / 0 skipped; all unique identities and both new controls verified. |
| Same real-login / controlled-expiry ordinary recovery identity | 1 passed / 0 failed / 0 skipped; native canonical producer exit0. |
| Actual local HTTP sequence | Initial seed201, normal login200, save401, refresh200, save replay201. |
| macOS scaffold compile | BUILD SUCCEEDED / exit0. |
| Canonical D009 against exactmain71 | Four zero deltas; BackendMemoryAPI -80. |
| Diff check | Passed. |

Native tests kept normal signing and erased only reserved81F, iOS26.2/Xcode26.3.
All1,444 tracked source inputs,3,303 copied exact-lock dependency entries and
frozen private driver hashes were verified unchanged. The copied dependency
directory was moved back to private proof storage; the source worktree is clean.
No npm install or registry call occurred. Backend fixture ran on owned loopback
31337, required auth and verified PID/nonce before Xcode; all provider values were
dummy and Muse/embeddings disabled. Known Node guards and observer errors were0.
This is not OS-wide egress isolation or physical-device proof.

Before is retained0/1/0 with the actual blocked stacks and native main-thread-
busy failure. After uses the preserved same ordinary recovery identity and
full text/project/version/one-save/restoration assertions. Its normal real
Keychain login excludes immutable app bearer overrides on both launches.
This proves the observed local auth-refresh recovery failure is repaired;
it does not certify the residual synchronous writers or every auth workflow.

The AFTER profiler itself exits2: its anchored sample header matches, but the
strict post-sample identity check correctly rejects a process the test has
terminated/relaunched. The native workflow independently passes its unchanged
strict native-summary guard at exit0. Keep those separate results; no retry was
run to force a green sample, and the invalid sample is not the product pass.
The BEFORE collector's false unredacted-header result and all source/setup
failures remain preserved rather than overwritten.

Receipts:

- `/private/tmp/them-t1477-unit-proof/unit/completion.json`
- `/private/tmp/them-t1477-after-proof/run-2629212b-8634-439a-9c9c-49ccb2562622/root-native-summary.json`
- `/private/tmp/them-t1477-unit-proof/macos/completion.json`
- `/private/tmp/them-t1477-unit-proof/ROOT-ALL-PROOF.json`
- Durable BEFORE archive: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1476-auth-lock-cycle-before-20261113`;
  manifestSHA256 `f5f282e3897c5d7810ca8c2305b02fbe1db8f6ef41b638205220d5d530c65ac2`.

### Required session report

1. **Completed:** repaired the captured auth-refresh/SwiftUI lock cycle and
   preserved real-login recovery coverage; observed the same local case pass.
2. **Files changed:** BackendMemoryAPI.swift, new BackendAuthMutation.swift,
   BackendAccountDataControlsTests.swift, V1SmokeUITests.swift, TASKS.md and this
   proof document. No backend, project, package, workflow or runner source change.
3. **Root issue fixed:** async token/defaults persistence held auth serialization
   while native KVO waited on SwiftUI; whole commits now enter main first without
   weakening the existing atomic transaction or save authority.
4. **Verification:** fresh725/0/0 signed units,1/0/0 real-auth UI, Mac build,
   D009/diff; before0/1/0 retained. Profiler exit2 remains separate. Full backend
  2783/0/2 is inherited exact07af backend proof, not a newly executed suite.
5. **GitHub status:** this is a scoped verified backup branch, not a replacement
   PR or main merge. Original9792ea checks remain green; the human deferred its
   genuine current-head review. No repeated review request, bypass or deploy.
6. **Next active task:** review remaining synchronous/bootstrap/account-deletion
   writer confinement with actor completion/partition guards, then continue
   original PR landing through actual bases when genuine review is available.
7. **Continue status:** READY FOR CONTINUE. Production hold and phone/live-model/
   export-outside gaps remain; do not call THEM complete.
