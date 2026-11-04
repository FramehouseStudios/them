# T-1163 — Save transport ownership and genuine login refresh

October25,2026. Branch `codex/T-1163-project-write-owner`.
Parent47be66d178c549b9ee51afc54b348b10eac7972a; reproduced failurea09778a;
runtimee97982f; proof-helper correctiond551759.

## Completed / root causes

VERIFIED: four signed regressions against this current parent failed,0/4/0
(10 assertions). During `/session`, change the supplied account: pending
metadata/version writes proceed under the new identity. Change account while
metadata success/version conflict returns: the stale response publishes its
sync state. These are intercepted native client failures, not a demonstrated
cross-account leak in the shipping service.

Reused the canonical8fba5bb repair, not a second auth framework. Capture the
initiating login intent at the caller before actor admission; check at admission,
after bootstrap, before constructing the write, after transport and refresh.
Construct headers from the checked snapshot. Ordinary same-login token/epoch
rotation is allowed; changed user or same-user new login intent is rejected.
Keep existing `auth_request_superseded`409 separate from a genuine version
conflict, whose server version still returns unchanged. Cancellation cannot
submit a second save. Existing exact raw UTF8 payload handling is preserved.

Also reused26f6a07's auth lock-order correction and reviewed its historical
report/sampled deadlock evidence. Auth mutation commits resume on main so a
worker holding the auth queue cannot wait on SwiftUI KVO while the main thread
holds the graph lock and waits on that queue. Main-actor Keychain latency is
unmeasured debt, not claimed free. No fresh deadlock was deliberately induced
here; the October21 sample is historical evidence, not today's reproduction.
Account deletion's main-actor cleanup hop checks its captured owner; no real
account was deleted. No claim that all possible auth deadlocks are eliminated.

The previous expire-once hook altered defaults while automation used an immutable
environment bearer. Repair that DEBUG seam: alter only one outgoing loopback
version request, not global credentials. Explicit local UI stored-session mode
preserves the actual rotated credential on relaunch. No Release override or
authorization bypass. The test-only server observer changes no auth decision;
compares returned/subsequent bearers only in memory, exposes counters, not keys.

The recovery script now delegates iOS erasure, explicit task-device selection
and signing to existing `run_v1_ui_smoke.sh`; the old unsigned duplicate runner
is gone. Retained optional macOS UI invocation is not locally exercised here.
Renamed the old conflict-only test so it no longer claims refresh coverage.

## Verification and retained failed attempts

- Full final signed themTests: **800 passed /0 failed /0 skipped**, erased
  owned91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A, iPhone17Pro/iOS26.2(23C54),
  Xcode26.3/17C529. Includes the four regressions and canonical14 ownership cases.
  The regression fixture now explicitly passes its synthetic initiating identity
  to the production caller-capture API; it does not pretend the human auth store
  contains that synthetic writer. Original red source/bundle are retained.
- Actual required-auth local recovery UI: **3/0/0**. Ordinary offline queue,
  conflict decision/resolution, and real expired-auth recovery. The last asserts
  actual version401 -> `/auth/refresh`200 -> exactly one201 request carrying
  the returned bearer, exact queued bytes in the server/editor, same saved
  version/bytes on another relaunch. Includes decomposed Unicode. A second real
  login for the same synthetic writer reads server bytes after rotation revokes
  the original session; no test-only server authorization shortcut.
- Positive first-project promotion/title/raw-byte/relaunch UI: **1/0/0**,
  intercepted provider counts ASR/chat/TTS **0/0/0**. Existing title, project
  binding and one-version assertions remain. No physical microphone proof.
- Node20.20.2 focused observer/runner/summary checks: **15/0/0**. Observer rejects
  production loading, absent proof flag, no actual rejected save, wrong bearer;
  summary rejects zero tests/failures/skips/incomplete count; runner requires
  explicit owned simulator, successful boot, normal signing and all selectors.
- First recovery launch failed at module import, **zero tests executed**:
  the preserved runner needed `assertPassedTestSummary`, absent in this prefix.
  Extended the existing canonical writer-summary helper (single-test wrapper
  unchanged) and checked it; no duplicated count policy or relaxed assertion.
- First positive UI command used an unsupported selector. Runner rejected it
  before app/backend execution. Correct existing selector then passed1/0/0.
  Neither rejected attempt is counted as a passing test or product failure.
- Final macOS scaffold **BUILD SUCCEEDED**. Existing compiler/concurrency warnings
  remain; no suppression. No local macOS UI result claimed.
- D009 vs fetched actual parent: MemoryAPI10845 -> **10754(-91)**; index33557,
  Studio17345, Root14955, bridge12926 unchanged. `git diff --check`, shell/Node
  syntax pass. No line-count exception or artificial padding.
- Backend production and existing production tests, except the extended proof
  summary test, are byte-identical to47be66d. Reuse parent Node20 full
  **2869/0/2** explicitly; today's15 focused checks are separate. No invented
  new full-suite total. Local UI used pinned Node20.20.2 with isolated stores,
  required user auth, fixed fake provider key and intercepted providers.

## GitHub readback

VERIFIED: original645 exact92b55f73df8c2529f81458ec06ea03e1723874ab now has all
four hosted checks green. Audited complete run40258575199: backend2867/0/2,
signed units751/0/0, strict integrated writer contract pass, V1 **29 pass /
0 fail /16 skip** (45 total, not45 passes), voice-fault1/0/0, Mac build pass.
Docker40258575225 also succeeded. These are that original645 prefix's hosted
results, not a substitute for the saved647 safety branch's local800/3/1 proof.

Main remains78b8c94f43b4a11f18c2e61df556b9cd7370e735. Original646 remains72f9375e,
base`claude/mentor-structure-map`;647 remains848e59d0,base`claude/coverage-follows-draft`;
both drafts. No original head, main, review/protection, deployment, DNS, secret
or accepted product decision changed. This checkpoint is a scoped backup, not
permission to skip lower bases or present a separate replacement PR.

## Adversarial limits / next task

Answered at exercised boundaries: changed user, same-user new login intent,
bootstrap, actor admission, pinned headers, late success/conflict, cancellation,
same-login rotation, real new-bearer retry and raw queued restore. A server may
accept an already-submitted request under its original valid account; this
does not promise rollback. Test services/outputs are synthetic and local.

Still open: ownership for activation/outline/scene/beat/transition/collaborator/
comment/companion mutations and read/cache publication (T1109); atomic first
project+version creation, crash/orphan/idempotency handling (T1108); concurrent
real devices/Postgres; fresh durable export opened externally; physical iPhone,
audible response relevance and explicitly identified intended shipping backend.
No paid model calls, fresh keys, credentials or production changes. Production
hold remains. Orb/Clementine/aesthetic/flexible120-page direction unchanged.

Next integration action: preserve-merge hosted-green64592b into saved646968428e,
verify that updated prefix, then normally advance original646 if all required
proof passes. Retain the higher saved647 safety changes; never jump the chain.
Next reliability action before648/phone: extend canonical ownership to remaining
mutations, then fix interrupted initial creation. Goal remains active.

## Exact changed files / evidence

- `TASKS.md` and this report
- `them/BackendAuthRequestOwnership.swift`
- `them/BackendAuthDebugSessionPolicy.swift`
- `them/BackendMemoryAPI.swift`
- `them/UITestLaunchConfiguration.swift`
- `themTests/BackendProjectWriteBoundaryRegressionTests.swift`
- `themTests/BackendProjectWriteOwnershipTests.swift`
- `themTests/BackendAuthDebugSessionPolicyTests.swift`
- `themUITests/V1SmokeUITests.swift`
- `backend/evals/run_screenplay_save_network_fault_ui_smoke.mjs`
- `backend/evals/save_auth_refresh_observer.mjs`
- `backend/evals/studio_ios_writer_loop_contract_helpers.mjs`
- `backend/tests/save_auth_refresh_observer.test.mjs`
- `backend/tests/studio_ios_writer_loop_contract_helpers.test.mjs`
- `scripts/run_screenplay_save_network_fault_smokes.sh`
- `scripts/run_screenplay_save_network_fault_smokes.test.mjs`

Permanent archive:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1163-20261025.rWsaNN/`.
Red/final full/recovery/promotion bundles, logs, exact patches, hosted645 log,
result summaries and SHA256 readback. No ignored env/credential/build cache.

**Continue status: READY FOR CONTINUE.**
