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

## Authenticated running-app follow-through

VERIFIED runtime follow-up `6190d61a8c2a08b711127c0757c035d8299963ba`:

- Real UI initially could discover frameworks but did not select its stored
  report. The Craft request builder omitted the canonical bearer-header helper
  used elsewhere in BackendClient. App token and caller-supplied user ID are
  not authentication. Add the existing attachAuthorizationHeader call; do not
  loosen server authorization or create a fallback identity.
- Public framework discovery is not a versioned protected report. Capture the
  protected read's current project/version/auth scope once after discovery,
  before its retry loop. Never rebind a protected retry across identities.
  A new model regression covers version/auth convergence during discovery;
  existing late-response guards remain tested. Initial live-failure attribution
  to this handoff alone was incomplete: missing bearer wiring was a separate
  verified blocker. The successful combined path is proven, not an isolated
  causal measurement of each change in that first failure.
- The real override then returned200 and was stored, but status feedback was
  hidden: the view only used infoText when no report existed. Render status
  with an existing report too, full-width and wrapping, not an optimistic
  claim. Add stable action identifiers and actual selected-state traits for
  assistive technology and the real workflow.

Final authenticated localhost UI: **1 passed / 0 failed / 0 skipped**, signed,
erased owned Pro/iOS26.2/23C54, strict completed summary inspected:
`/tmp/them-1090-craft-ui.cgZWrx/craft-ui.xcresult` and `summary.json`.

The test uses existing signup/session fixture helpers, a real owned project,
real saved version and real stored report API. In the app it observes Save the
Cat selected, opens the Catalyst override, enters page12, taps Save Override,
observes the acknowledgement, and independently re-analyzes via the API to
verify the stored override's matching project/version/framework and manual
status. It selects Three-Act and taps Refresh; backend receipts show the
second protected report read200 while the explicit choice remains selected.

Screenshots were exported and viewed: the stored-report selection, visible
"Override saved for catalyst" feedback, and retained Three-Act selection after
Refresh. Status wraps normally across two lines in the308pt inspector; no
letter-per-line collapse. This is Pro/light-mode evidence, not an SE,
Dynamic-Type, dark-mode or physical-device sweep. A metric caption visibly
truncates to UNAVAI...; tracked separately as T-1091, not claimed polished.
Historical io.them navigation branding is still visible; no rename claim.

Backend: host Node24.19.0, REQUIRE_USER_AUTH=1, isolated persistence and dummy
local accounts. OPENAI_API_KEY is empty, Muse/embeddings disabled; a process
preload blocks non-loopback fetch and records any attempt. Final audit has
**zero external fetch attempts**. The classifier/logline fallback is explicitly
unavailable/stub, not live quality evidence. No Apple sign-in, paid model,
shipping host or physical microphone claim. Backend source itself is unchanged.

The task-owned one-off runner/preload are retained with proof, not added as
another production framework or a replacement required-gate producer. Existing
required writer-loop behavior and its actor annotation are preserved. The
additional Craft case skips without its dedicated local fixture; its strict
dedicated producer requires one pass and zero skips. A default V1 run therefore
has an additional fixture-dependent case; that default full run was not
executed here and no old pass/skip totals are relabeled as current.

### Failed attempts, not hidden retries

- Attempt1: UI0/1/0 at report selection; preserved bundle/hierarchy.
- Attempt2: compile stop from an accidental duplicate MainActor test
  annotation; no test execution claimed. Removed duplicate and preserved the
  original writer test's annotation.
- Attempt3: model11/0/0, UI0/1/0 at the expanded Page field. Protected report
  GET200 and selected Save the Cat screenshot prove auth wiring now reaches
  the server. Failure tree also reports signalterm after interaction failure;
  no production-crash cause is inferred. The test needed to reveal its new
  below-fold field; explicit guards now stop before further failed actions.
- Attempt4: UI0/1/0 at acknowledgement. Server override POST200 and private
  JSON store independently contain one correctly scoped Catalyst/page12
  override. This uncovered the actual hidden-status view defect.
- Attempt5 after rendering status: UI1/0/0. Unchanged model/backend suites
  were not repeated. Earlier model11 result is separate, not12 fresh passes.

No attempt was retried unchanged merely to obtain green. All native bundles
and relevant logs are retained privately; no real credentials or writer text
are committed. Source remains clean after scoped commits. D009 and whitespace
remain green: index-45, Studio-14, bridge-23, other monitored deltas0 vs main.

## Not covered / next execution

This is not universal Craft cancellation/retry coverage. Analysis/override
operations retain their existing busy lifetimes; no new cancellation API or
durable mutation protocol was added. Other Craft operations and full sign-out
cleanup need their own integrated evidence. D017 runtime target consistency
and the overall shipping-backend/physical-phone journey remain open.
Expired Craft-session refresh/retry and caller-selected initial API-host trust
are not established by this fresh local JWT flow; redirect protection remains
unchanged. No new full backend/unit/V1/macOS result is claimed.

GitHub #964 was freshly read: exact head5faa43d6, all3 required checks SUCCESS,
reviewDecision REVIEW_REQUIRED, mergeState BLOCKED. Main78b8c94f and production
are unchanged; approvals/protections are never bypassed. Save only a scoped
normal advance of the existing integration backup; preserve original PR heads.

Next original boundary verified from actual bases: #641
`claude/filmmaker-dialogue-port` at232098ba, based on `claude/three-act-port`.
Read its body and existing correction history before integration. Continue
status: READY FOR CONTINUE.
