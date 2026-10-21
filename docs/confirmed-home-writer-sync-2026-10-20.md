# T-1093 — confirmed Home voice writing on the current writer candidate

## Scope and history

DECIDED: continue bug fixes locally, preserving original PR heads and the
required protected landing process. Production remains held; no paid provider
calls without fresh scoped approval. No physical-phone or App Store claim.

Branch `codex/T-1093-confirmed-home-writer-sync`, starting at `fc873384`.
Reuses the isolated existing T-949 capability commit
`6e7138b1fa950f206eceb59ca17bc9f165d983dc`, not its older cumulative rehearsal.
The source commit and original PR branches remain intact. This is a scoped
current-parent port, not a replacement PR or a reimplementation of #807.
Historical evidence stays in `confirmed-home-voice-routing-2026-10-16.md`;
its old totals/main references are not current-state claims.

## Root fixes retained and reconciled

- Current confirmed client/server words open authenticated Studio before page
  prompt preparation. Home partials and an earlier global transcript cannot
  supply that current instruction. Authentication refusal leaves Page disabled.
- A new committed-write receipt supplies the immutable complete first-save
  draft; completion does not replace newer local typing. Native insertion is
  the sole document-text writer, not a duplicate whole-draft assignment.
- Generic craft guidance is no longer promoted into mandatory story events
  that the unchanged page quality gate requires the generated scene to echo.
- The post-ASR renderer checks cancellation, owner, project and active surface
  before applying its result.
- The current foundation already owns ScreenplayDeferredPublicationGate in
  the ScreenplayStudio package. Extended that owner; no shadow app-local
  duplicate type. Native text may publish across advancing chunk IDs only
  when its actual text and binding baseline still match; receipt/metadata
  commits retain strict request identity.
- Preserved current `publishEditorText`/pending-publication tracking, historical
  rendered-model comparison and document-switch handling. Streaming-baseline
  protection is composed into that existing coordinator path, not substituted
  for the later typing fixes.

VERIFIED additional failure discovered by directly compiling/executing the
actual Swift classifier: `Don't write a story. Just listen.`,
`Do not open Studio.`, and `I don't want you to write a screenplay.` all
returned explicit=true before correction. Refused verb phrases are now
excluded from Home opening; a separate positive instruction remains valid.
The same actual-source probe then returned false/false/false for those cases,
true for the positive story request and true for the separate positive opener.
Signed tests cover those cases and `Never launch Studio` / `Stop writing`.
This is bounded lexical Home-opening protection, not a claim of general
natural-language understanding or completed active-Studio refusal routing.

## Fresh proof

All source in the following checks is this current-parent port, not the old
T-949 tree. No private environment files were included in the frozen backend.

- Initial signed focused Swift: **67 passed / 0 failed / 0 skipped**, erased task-owned
  Pro `11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, iOS26.2. Native result summary
  inspected. Selected ConfirmedStudioTurnPreparationTests,
  StudioThreadViewStateSupportTests, ScreenplayEditorBindingIntegrationTests
  and ScreenplayIntentClassifierTests. Existing actor/Sendable warnings remain.
  `/tmp/them-1093-signed.EqKChG/v1-ui-smoke-local-1-92954.xcresult`.
- Node **20.20.2**, network disabled, frozen source: Home fixture safety/stream
  shapes/unchanged production quality-gate cases **3/0/0**.
  `/tmp/them-1093-home.8E6Akr/backend-fixture.log`.
- Real signed app Home workflows: **2 passed / 0 failed / 0 skipped**.
  `/tmp/them-1093-home-ui.RJIrKJ/home-ui.xcresult`. Both start on Home and tap
  its actual Talk control, use real authenticated local HTTP, require the
  complete scene and exactly one marker in the native editor, independently
  find its matching saved version, terminate/relaunch, and compare the entire
  restored editor value (outer whitespace trimmed). One injects confirmed
  words, the other sends synthetic audio and requires current server ASR,
  despite a deliberately stale prior transcript.
- That backend ran on host Node24.19.0 from the frozen source, auth required,
  synthetic provider key/ASR/chat/TTS, all non-loopback external fetches blocked.
  Actual mocked counters across both cases: STT1/chat4/TTS24. These are fixture
  transport counts, not cost, latency or live-model quality measurements.
- macOS scaffold build passes using the existing desktop preflight. Build-only
  signing disabled; no iOS test disables signing.
  `/tmp/them-1093-macos.pV4VnG/scaffold.log`.
- Longer-audio regression **FAILED: 0 passed / 1 failed / 0 skipped**.
  `/tmp/them-1093-long-audio.xl4IzN/long-audio.xcresult`: marker appeared but
  the complete scene did not reach the native editor. Existing task949 debug
  receipt reports status=ok with finalCommittedPageText length0; the native
  trace records streamed-line cancellation restoring the pre-insert draft at
  03:49:21Z, before narration finished at03:49:26Z. This is not a passing save
  proof, timeout workaround or established crash. STT1/chat2/TTS1 are synthetic.
  Investigating the cancellation origin before committing/pushing this port.
- Instrumented long-audio reproduction **also failed 0/1/0**, retained at
  `/tmp/them-1093-cancel-origin.9pghec/cancel-origin.xcresult`. UI-test-only
  content-free cancellation diagnostics identify `reason=bargeIn`, from
  HerVoiceController.handle -> Root.configureVoiceCallbacks -> cancelStream.
  This confirms microphone input being interpreted as interruption during
  narrated synthetic audio; it does not identify the acoustic source or prove
  a physical-iPhone echo problem. No timeout or assertion was weakened.
  Both failures and the event/source are retained in
  `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1093-long-failure-20261020.D6xvZV/`.
- Reused the native portion of original #623 (isolated `de49ba4f`, current
  original head `fbd1071d`). HerVoiceController and its four existing settings
  tests match that original exactly: simulator default off, device default
  on, explicit overrides retained. The attempted source commit also contained
  backend streak changes; those newly introduced files were removed and the
  previously untouched talk facade restored before proof. No prior task work
  was discarded. Complete backend confidence/streak changes, including the
  original later short/multilingual corrections, remain on original #623 for
  their own proven integration. This does not make that whole PR green/landed.
- Final signed selection after the native root fix: **71 passed / 0 failed /
  0 skipped**, actual native summary inspected. Earlier selected classes plus
  the preserved ClementineVoiceSettingsBargeInTests; task-owned Pro erased
  first, signing enabled. Bundle:
  `/tmp/them-1093-final-units.HsUcRt/v1-ui-smoke-local-1-97900.xcresult`.
  This is focused proof, not the full themTests bundle. The final macOS
  scaffold also passes: `/tmp/them-1093-final-macos.IjIg4d/scaffold.log`.
- Final unchanged longer-audio workflow after the native fix: **1 passed /
  0 failed / 0 skipped**, erased same task-owned Pro with signing enabled.
  `/tmp/them-1093-fixed-long.JFUEPO/fixed-long.xcresult`. Complete native scene,
  one marker, authenticated saved version and exact post-relaunch editor
  equality are required by the unchanged test. STT1/chat2/TTS1 are synthetic.
  No timeout/assertion relaxation, blanket stream-finalization workaround or
  paid provider call. The two failed long runs above remain separate evidence.
- D009 passes versus `origin/main` `78b8c94f`: index33,557(-69),
  Studio17,421(-14), Root15,024(-88), bridge12,934(-18), memory10,865(0).
  Syntax/diff checks pass. No unchanged full backend or full unit rerun.
- Prior Craft bearer/scope/status behavior, notes/revision routing, flexible120
  mentor text, save client and fresh live-approval workflow are unchanged in
  their respective source paths from `fc873384`.

## Remaining work, not hidden by green local fixtures

Fresh #807 read: OPEN/draft, head `d3550a2067a0abf7c784fac3835a96b4c19b19b1`,
base `codex/T-voice-heard-words-only`. Its shared guarded transcribe-first route
remains canonical. It initially targets Studio, not Home. Reconcile the Home
post-ASR fallback at that actual stack boundary; do not retain unnecessary
duplicate generation or invent another STT endpoint. The current pair made
four mocked chat calls in aggregate; no single-call or production-cost claim.

Follow-up: active-Studio command signals still have their older independent
lexical checks. Verify refusals end to end there rather than assuming the new
Home-opening filter settles Page routing everywhere. Also retain T-1091 narrow
Craft metric-caption clipping. Original #642 remains the next stack child.

Separate source finding: cancelStreamingVoiceTurnPreview cancels a stream
before checking whether a preview is active. That can affect an unrelated
stream; it was NOT the cancellation origin in the instrumented failure.
Track separately, including explicit Stop/cancel semantics, rather than
silently moving the guard and weakening genuine writer interruption.

Actual microphone/recognition, complete relevant live reply, physical phone,
shipping backend, expired-auth UI, in-flight account/project changes, broader
offline/conflict recovery, integrated-main gates and exact-head independent
approval remain separate work. No main merge, protection bypass, production
mutation, new paid call or completion claim. Orb/Clementine/aesthetic retained.
