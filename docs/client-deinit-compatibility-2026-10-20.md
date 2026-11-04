# T-1050 — Release the client, not the writer's app

Isolated main-based branch codex/T-1050-client-deinit-compatibility;
base deac1a6d54a65dbf5f849f0f35476ad4ff07e1f0. Preserve all original
feature/security PR heads; this is a separate actual runtime capability.

## Observed crash and falsifiable contract

T1049 new synchronous actual-model tests crashed during BackendClient
deallocation on erased signed owned SE E8998A6B / iOS26.2/23C54, Xcode26.3
17C529. Stack: invalid free, TaskLocal::StopLookupScope destructor,
swift_task_deinitOnExecutorImpl, BackendClient deallocating deinit, then
ScreenplayStudioViewModel deinit. Current main's BackendClient is byte-
identical. Merely changing test functions to async avoids that path; it
does not correct production synchronous release.

Direct characterization creates the actual BackendClient with unused test
URLs and persistence/user-header attachment off; it makes no HTTP request.
Explicitly release its final strong reference inside a synchronous task-local
scope, require the weak reference to become nil and the surrounding marker
to remain intact. Keep a separate async release/suspension case. No mock
client, source-regex assertion, leak, asynchronous release workaround or
test retry. New file is included by the existing synchronized test group.

VERIFIED direct main-based before-run0 passed/1 failed/0 skipped, native
exit65; actual summary identifies that same erased signed owned SE/iOS26.2.
Bundle `/tmp/them-1050-before/v1-ui-smoke-local-1-53641.xcresult`;
log `/tmp/them-1050-before.log`. Actual crash report
`/tmp/them-1050-before-diagnostics/0_Test_THEM compatibility SE 20261019_Diagnostics/simctl_diagnostics/DiagnosticReports/them-2026-10-20-050934.ips`
shows invalid free, StopLookupScope destructor, deinitOnExecutorImpl,
BackendClient deallocating deinit, then the test's client=nil at Swift18.
This directly reproduces the concrete runtime defect, not a hypothetical
explanation from a prior test crash. Project iPhone deployment floor is26.2.

## Primary technical references and decision boundary

Swift's matching runtime report:
https://github.com/swiftlang/swift/issues/88036. It describes default-
MainActor synchronous release under a task-local value on the same
Xcode26.3/iOS26.2 combination, with explicit empty deinit as a workaround.
Do not infer that every other OS/client crash has that cause.

SE-0371 distinguishes explicit nonisolated synchronous cleanup from executor-
hopping isolated cleanup, and says reference release alone does not require
isolated deinit:
https://github.com/swiftlang/swift-evolution/blob/main/proposals/0371-isolated-synchronous-deinit.md.
BackendClient currently has no custom cleanup; ARC owns its URL/session/
callback/cache fields. Any correction must preserve that ownership, class
actor isolation and existing URLSession lifecycle without invalidating a
shared session or adding a global concurrency escape hatch.

DECIDED implementation: explicit empty nonisolated deinit on BackendClient.
ARC still releases every field; no custom cleanup is invented. The class's
actor isolation and request/session behavior stay unchanged. No minimum-OS
bump, compiler-mode change, @unchecked Sendable, Task/queue-wrapped release
or leaked reference. The synchronous before test is unchanged for after.
VERIFIED full signed unit after-run626 passed/0 failed/0 skipped, native
exit0; actual summary identifies the same erased owned SE/iOS26.2:
`/tmp/them-1050-units/v1-ui-smoke-local-1-54326.xcresult`;
log `/tmp/them-1050-units.log`. Both synchronous and async real-client
release assertions execute; weak references become nil and task-local
markers survive and return to defaults. The synchronous test is unchanged.
This is a product deinit fix, not the earlier async-test-context workaround.

## Still required

VERIFIED authenticated typed create/save/Markdown-export/relaunch writer
workflow1 passed/0 failed/0 skipped, existing canonical actual-summary
verifier exited0; `/tmp/them-1050-writer.log`. Native Node24.22.0, disposable
auth-required backend, dummy provider key, embeddings/Muse disabled. Its
existing helper deletes its temporary result bundle after verification;
do not claim that writer bundle retained. This is not spoken generation.

Canonical macOS scaffold build completed native exit0 after the writer
workflow; `/tmp/them-1050-macos.log`. Existing actor/deprecation warnings
remain; no macOS runtime-lifecycle test claimed. God-file/whitespace pass
with all five protected
deltas0 versus actual main. Backend/scripts are byte-identical to main,
not a new backend implementation or fresh backend proof run. Require
scoped draft PR with fresh hosted checks/independent review. No
paid calls, real speech, physical-phone or shipping-backend claim. Production
hold remains. Exact intended files: them/BackendClient.swift,
themTests/BackendClientLifecycleTests.swift, TASKS.md, this report.

## Adversarial boundary

Answered by actual before/after: synchronous task-local release crashes on
main and no longer crashes with the explicit ARC-only deinit; real instance
deallocation and surrounding task-local state are asserted. Async release
remains covered. No actor opt-out on methods, session invalidation, fake
client, leaked strong reference or suppressed failure. Source-only resource
audit: there was no custom deinit cleanup to preserve; all stored fields
remain ARC-owned. Not covered: every other default-MainActor class, arbitrary
OS/runtime versions, physical-device lifecycle, speech/model behavior or
whole-app reliability. Do not call a platform workaround a universal cure.

Retained full before/after unit bundles, selected current crash report and
workflow/build logs: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1050-20261020.5atrfV/`.
Verified source hashes remained frozen during proof:
BackendClient c6d65e2858c447041c829b6121486e6c7e01268294d970ce3f3a02fb831fc0ea;
test31e31f9c9fb5d0e1474e8c2317195766d64c9793563543e6ee335f11d00a17e1.

Publish a separate scoped main-based draft PR; it does not replace, squash,
retarget or rewrite an original feature/security PR. No main or production
change. Main still requires real independent review and three required checks.
