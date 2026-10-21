# Persisted Craft report and writer selection reconciliation

## Root and implementation

VERIFIED source trace on `b5013440`: loadCraftReport first awaits framework
discovery, which chooses the nonempty automatic three-act default. The report
loader then adopts the stored report's framework only for an empty selection.
A stored Save the Cat report can therefore disagree with the chip and override
context. The older pure selection-helper tests do not exercise that sequence.

Runtime fix: `12396da77558d4fd58423ab2fc25c5d5f4d57432`.

- Track explicit writer selection separately from an automatic default. The
  published selection is externally read-only; the existing picker binding
  calls selectCraftFramework. Model-owned selection updates invalidate stale
  simulation/report state directly. Remove the view's old onChange side-effect
  rather than treat every programmatic state update as a user action.
- A restored report sets the automatic selection to its own framework. An
  explicit incompatible choice stays selected, with Analyze guidance instead
  of presenting a contradictory old report. Choices during both report and
  accepted-reversal fetches win; late completion cannot replace that guidance.
- Project reset keeps a valid available automatic default, clears explicit
  intent and retires the old report request. Request-ID-owned loading cleanup
  cannot clear a newer project's spinner.
- Capture project/version/auth-intent context before awaiting report,
  framework, analysis, override or accepted-reversal responses. Use the existing
  canonical auth-context policy; no second auth/HTTP implementation. Reject
  wrong project/version report payloads and wrong-framework analysis payloads.
- Override writes capture their original version/framework; success/error
  feedback is ignored after context changes. Existing server authorization
  remains required; client presentation guards do not replace it.
- Inject the existing BackendClient through the model initializer for focused
  real-client checks; production's default client/credential policy is unchanged.

No backend, shared save slot/outbox, redirect client, export bytes, mentor
identity, paid-eval safeguard, orb or visual style change. No new framework or
god-view state. Studio is four lines smaller than the prior candidate.

## Fresh focused proof

VERIFIED signed, erased task-owned Pro
`11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, iOS26.2/23C54:

`scripts/run_v1_ui_smoke.sh` with
`ONLY_TESTING=themTests/StudioCraftReportSelectionTests` and additional
`-only-testing:themTests/StudioCraftFrameworkSelectionTests`, normal signing.

Final result: **10 passed / 0 failed / 0 skipped**; completed result summary
read. Seven real-model/client cases plus three existing selection-policy cases:

- Stored Save the Cat report replaces automatic Three-Act; the actual override
  HTTP request carries that report's project/version/framework and displays a
  successful acknowledgement. Reset still treats the next default as automatic.
- Explicit Three-Act survives an incompatible stored report.
- A writer choice during report or accepted-reversal fetch stays selected and
  is not relabeled as a completed report load.
- Both success and404 responses are ignored across project, version and actual
  canonical authentication-intent generation changes.
- Old report completion cannot clear a concurrently loading new project.
- A wrong-project report payload is rejected without presentation.
- Analysis cannot replace an explicit choice with a different response framework.

Tests use actual ScreenplayStudioViewModel and BackendClient with a custom
URLProtocol, isolated recovery defaults and a nonpersistent test-host client.
They do NOT prove a real server commit, server-side permission enforcement,
visible picker interaction, microphone input or model quality. No private
environment was loaded and no paid/provider call was made.

Final bundle:
`/tmp/them-1090-craft-report-final/v1-ui-smoke-local-1-82622.xcresult`;
summary `/tmp/them-1090-craft-report-final-summary.json`;
log `/tmp/them-1090-craft-report-final.log`.
An initial version passed9/0/0 in
`/tmp/them-1090-craft-report/v1-ui-smoke-local-1-81902.xcresult`. Code review
then tightened the post-reversal-fetch guard, reset default and analysis echo
validation; final10-test evidence covers those changes. These are not summed
as19 unique tests. Existing simulator haptic-library/compiler warnings remain.

VERIFIED D009 vs fetched main78b8c94f: index33581 delta-45,
Studio17421 delta-14, Root15112 delta0, bridge12929 delta-23,
memoryAPI10865 delta0. Whitespace passes. Backend source is unchanged, so no
unchanged full backend/unit/V1/macOS or paid golden run was repeated here.
The SE's previously observed exported file/state was not erased.

## Not covered / next execution

T-948 is not closed yet: observe the real Craft picker, stored report and Save
Override together against an authenticated disposable localhost backend, then
confirm explicit switching remains intact. Do not claim that compiling the
Binding or passing model tests proves those visible UI actions.

This is not universal Craft cancellation/retry coverage. Analysis/override
operations retain their existing busy lifetimes; no new cancellation API or
durable mutation protocol was added. Other Craft operations and full sign-out
cleanup need their own integrated evidence. D017 runtime target consistency
and the overall shipping-backend/physical-phone journey remain open.

GitHub #964 was freshly read: exact head5faa43d6, all3 required checks SUCCESS,
reviewDecision REVIEW_REQUIRED, mergeState BLOCKED. Main78b8c94f and production
are unchanged; approvals/protections are never bypassed. Save only a scoped
normal advance of the existing integration backup; preserve original PR heads.

Continue status: READY FOR CONTINUE (narrow authenticated running-app proof).
