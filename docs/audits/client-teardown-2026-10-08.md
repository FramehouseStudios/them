# T-933 — BackendClient synchronous teardown compatibility

Goal items 1 and 5. Base #936 `3a1449e5196396e84e559500de20199ff7c14aec`.

## Problem and decision

VERIFIED: unchanged production crashed in a new real-client synchronous
task-local release regression: zero pass, one failure. Retained baseline:
`/tmp/them-933-client-teardown-red.xcresult` and `.log`. Diagnostic report
`/Users/halfmutantfilms/Library/Logs/DiagnosticReports/them-2026-10-08-185445.ips`
shows malloc abort through `TaskLocal::StopLookupScope`,
`swift_task_deinitOnExecutorImpl`, `BackendClient.__deallocating_deinit` and
the test's synchronous closure. Only relevant frames were inspected.

The upstream [Swift #88036](https://github.com/swiftlang/swift/issues/88036)
and [#87316](https://github.com/swiftlang/swift/issues/87316) describe compatible
actor-deinitialization failures and explicit-deinit workarounds. The fix here
is locally tested, not inferred from a newer OS reportedly resolving the issue.

An explicit empty deinit prevents this synthesized teardown crash. It does not
remove main-actor isolation, retain clients forever, cancel outstanding tasks,
or invalidate shared/injected URLSession resources. Normal stored-property
release remains intact. No new networking or lifecycle architecture.

## Files and proof

- `them/BackendClient.swift`: five-line compatibility fix and ownership comment.
- `themTests/BackendClientTeardownTests.swift`: synchronous main-thread release
  within a task-local scope, 100 iterations, weak-reference and scope assertions;
  separate caller-owned session reuse through a second real client.
- `TASKS.md` and this audit: scope, evidence and limitations.

Focused signed tests: two pass, zero fail/skip,
`/tmp/them-933-client-teardown-focused.xcresult` and `.log`.
Node 20.20.2 backend with external networking disabled: 2,744 pass, zero fail,
two skipped, `/tmp/them-933-node20.log`. Four recovery-runner tests and god-file
gate pass. Full signed units: **693 pass, zero fail/skip**,
`/tmp/them-933-full-units.xcresult` and `.log`; exact summary checked.
macOS scaffold build exit zero, `/tmp/them-933-mac.log`; unsigned build-only,
not an unsigned test. Authenticated recovery UI: **five pass, zero fail/skip**,
`/tmp/them-933-recovery-ui/screenplay-save-network-fault-70186.xcresult`
and `/tmp/them-933-recovery-ui.log`; exact summary checked.
Integrated authenticated writer UI: **one pass, zero fail/skip**,
`/tmp/them-933-integrated-writer.log`. The evaluator validates its exact
single-case summary and removes the bundle at completion. This proves the
deterministic local writer path, not live speech/provider generation.
Simulator proof uses the erased owned device
`11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, iOS 26.2, signing on.

## Not covered / landing

Read-only adversarial review found no scoped blocker. The reproducer uses a
custom task-local scope; the retained diagnostic bridges that fixture to the
observed runtime crash. Session reuse is verified, not general in-flight task
lifetime behavior. This review is not a GitHub approving review.

This is a reproducer-specific compatibility fix, not proof that every actor,
runtime or startup path is crash-free. Test health traffic is synthetic and
intercepted by URLProtocol; no paid/provider call is made. Physical microphone,
shipping configuration, production storage, export parity and 120-page
performance remain unproved. Full V1 UI is not rerun in this slice.
Required hosted checks and independent approval remain mandatory; #766 then
#770 still land first. No merge, approval bypass or main push.
