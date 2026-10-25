# T-1148 — Explicit retry after native Files dismissal

## Exact failing boundary

VERIFIED original975 at3879816865565d5c7f10e890a0b726a6a10d1930 failed required
run40208473954. Hosted backend2964/0/4, signed units966/0/0 and D009 passed;
the required writer case failed0/1/0. Later broad V1, offline-save recovery,
voice-fault and Mac stages were skipped. Do not report those as passes.

The downloaded writer xcresult and attachments were inspected. The first real
Files picker is visible; after dismissal, Studio is visible again. The error
is "Finish or cancel the current export before starting another." Draft bytes
and saved version remain present. The activity trace shows one dismissal, one
new export-menu tap and one Markdown tap, then the readiness assertion fails.
This is a retained request gate, not merely a hidden Files filename field.

The hosted artifact does not record the native binding transition or prove
which callback the OS omitted/delayed. That specific mechanism remains an
inference until the real workflow is observed on the corrected head.

## Local reproduction and smallest correction

VERIFIED a signed focused real-coordinator test lowers the current presentation
binding without delivering either outcome callback, then explicitly requests a
second export. Before the runtime correction it fails0/1/0 (eight related
assertion failures in one method), exit65: the first request ID remains, the
second backend artifact is never requested and the picker stays closed.

The six-line runtime addition extends the existing coordinator's admission
check. A writer's new explicit export can invalidate the previous request only
when its artifact already exists and its presentation binding is false. It
cannot retire preparation or a currently presented picker. No timer, automatic
retry, extra coordinator/store or change to Files' actual Save was introduced.

Dismissal alone still does not declare Save or Cancel. Until the writer
explicitly supersedes that request, its real completion remains authoritative.
After supersession, the existing immutable request-ID guards reject old
binding, cancellation and completion callbacks, including an old success that
must not publish a false Saved notice for the newer export. Exact artifact
bytes and project/auth-context checks remain unchanged.

Files owned by this repair:

- `them/ScreenplayStudioExportSupport.swift` (six runtime lines).
- `themTests/ScreenplayStudioExportSupportTests.swift` (missing callback retry,
  stale callbacks/exact bytes/new completion, visible-picker and preparation
  admission cases; existing tests retained).
- `TASKS.md` (T1148 only).
- This handoff.

## Verification and limits

VERIFIED corrected signed export-support class: **22 pass /0 fail /0 skip**,
exit0, on erased owned91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A,
iOS26.2/23C54, Xcode26.3. Completed summary inspected and positive execution
asserted; do not add the earlier failed method to this pass total.

Command: ONLY_TESTING=themTests/ScreenplayStudioExportSupportTests,
explicit owned UDID, scripts/run_ios_unit_tests.sh, normal signing,
task-owned /private/tmp/them-1144-ios-dd and a unique1148 result bundle.
Before-fix run selects only the new missing-callback method. No retry, timeout,
skip or assertion was weakened to obtain this result.

Adversarial pass: answered within the real coordinator/client contracts are
duplicate admission while preparing/visible, late old callbacks/bindings,
completion after dismissal without retry, exact bytes, and changed project/auth
intent. The hosted OS callback mechanism and corrected real Files round trip
are still uncertain/unverified. These unit results do not establish all iOS
versions, external storage providers or crash-durable exports.

VERIFIED current macOS scaffold build: exit0, BUILD SUCCEEDED, using
MAC_DESKTOP_ACTION=build and task-owned /private/tmp/them-1144-macos-dd.
This is build-only, not an unsigned iOS test. Log:
`/private/tmp/them-1148-macos.log`. Existing warnings remain.

VERIFIED D009 versus actual original975 parent f4aca4aef0222fdb5829e41d583357fc08c82a34:
all five comparisons are numeric with delta0. Index33475, Studio17299,
Root14937, bridge12796, memory10463. Whitespace passes.
Direct source comparison to38798168 shows backend, scripts, Packages, workflows
and project configuration unchanged. Its hosted backend2964/0/4 remains
explicitly inherited, not a fresh full backend run on this native-only change.

Current logs/bundles are `/private/tmp/them-1148-export-before.*` and
`/private/tmp/them-1148-export-after.*`; D009 JSON is
`/private/tmp/them-1148-god-files.json`. Private retained archive:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1148-20261025.r2dVnc/`.
It also contains the exact hosted failed writer bundle, screenshots, activity
trace and completed job logs. Do not commit synthetic account/session logs.

The Mac is locked, so no current visible Cancel/re-export/Save or outside-THEM
file preview is claimed. The required writer test is unchanged, not weakened
or made to retry taps. No new full-native, real microphone/model, shipping
backend or physical-phone success is established by the focused reproduction.

Local branch `codex/T-1148-dismissed-export-retry` preserves38798168 and all
original history. A failure/hold comment was posted on the original PR.

DECIDED next publication is one normal fast-forward of that existing draft,
after rechecking exact public head/base and green parent974. Its required
unchanged hosted workflow is the correct checkpoint for iOS26.5, the runtime
that actually failed; local26.2 contract success is not substituted for it.
Retain draft/base/history and all required native/backend/UI/recovery gates.
No duplicate unchanged local966-unit/backend run merely for reassurance, no
new/replacement PR or weakened assertion. Record the actual push and run receipt
separately; publication intent is not an accomplished push or green result.

No main merge, deployment, protection/credential change, paid model call or
review bypass. Keep the PR held until current exact-head checks and required
personal non-author review are satisfied. Manual outside-file preview and the
intended-backend physical-phone journey remain unproven.
