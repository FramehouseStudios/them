# T-949 — confirmed Home voice-to-page routing, 2026-10-16

## Outcome and boundary

DECIDED: prioritize a functioning writing app; App Store work is deferred.
The human asked to continue local testing rather than wait for a physical phone.
Branch `codex/T-949-confirmed-home-page-routing`, from preserved rehearsal
`5cfa52bb660715603cee82c4c8397fd491224d61`. Original PR heads and main
are not changed by this task. Orb and Clementine remain.

Target: confirmed current words open authenticated Studio before preparing a
page request. Raw Home audio cannot inherit an earlier global transcript or
speculative partial as the current writer instruction. A successful generated
page must be saved and restored exactly after relaunch.

## Root causes and implementation

VERIFIED in the prior source: the realtime final callback prepared the request
before opening Studio; the page guard therefore observed Home. Turn-based raw
audio used the previous global transcript before ASR completed. Partial Home
speech could also select screenplay mode prematurely.

The new pure `ConfirmedStudioTurnPreparation` sequences authentication-aware
opening before preparation and accepts only current client/server confirmed
words. Root's existing opener retains its authentication policy. Home partials
stay companion-only. Current server ASR drives the post-response routing.
If that current transcript newly requests a page, the existing Studio renderer
is reused; this is not a new STT service or generation architecture.
A new committed-write identity, not an old synced draft, supplies insertion
acknowledgement. Page cues share the classifier's punctuation normalization.

The real UI path additionally exposed generic progression-guide advice being
placed in story-continuity fields. The unchanged quality gate then demanded
literal overlap with that advice as the next story event. Generic guidance now
stays in the existing continuity notes; saved project/session/workflow story
facts still populate the enforced fields. A workspace/cancellation check also
prevents a late fallback renderer from inserting after the active project changes.

Validated synchronized pages enter the existing first-project save path without
waiting for narration to finish. Other first writes save the immutable
committedDraft in their commit receipt, not a shared draft snapshot which can
still lag by one streamed update. The raw UI test caught that lag saving a partial
script. First-save completion no longer overwrites edits made during its await.
The native insertion is the sole document-text writer; Root no longer assigns a
whole draft before inserting the same page. Late adoption/rendering checks the
current owner/project rather than assuming the initiating account remains open.

The raw-audio UI run also reproduced a SIGABRT at
`IOSCursorInsertTextEditor.Coordinator.applyStreamingInsertProgress`, on
`NSMutableString.replaceCharacters`: an old binding could replace newer native
streaming text before deferred publication, invalidating its insertion range.
The canonical deferred-publication gate is extracted intact and extended to
reject the known stale baseline even after a deferred queue drains. Current
native text can publish across advancing chunk IDs only when its binding baseline
still matches and an insertion request remains active. Cancelled requests are
rejected; commit receipts retain strict request-identity checks. The policy
allows genuinely different external text; mid-generation project switching still
needs integration proof. This is not a range clamp or a second state store.
Six signed regression cases cover these distinctions; runtime results follow.

DEBUG-only UI injection begins on Home and taps its actual Talk control.
It injects either confirmed words or silent audio with a deliberately stale
global transcript. It does NOT prove microphone capture or model quality.

## Claude work preserved

Read the bodies and relevant source of #763, #775, #891 and #807 rather than
assuming this work replaces them. #807 (`d3550a2067a0abf7c784fac3835a96b4c19b19b1`,
base #806) is the canonical pending transcribe-first change: shared server STT,
guarded /talk/transcribe, client pre-transcription and current-heard-word safety.
It is not ported out of order or replaced here. On reaching that boundary,
reconcile Home pre-transcription with this ordering fix, and retire an
unnecessary post-response fallback. Auth onboarding and first-project behavior
in later original branches still need their own preserving integration.

Also read #860 (17faf609 and its follow-ups) and #911 (through 05170950).
The one-second app sample retained below found integrity analysis in the view
render hot path. #860 already owns a related typing coalescer, and #911 owns
exact-keystroke/line-index work. Neither is reimplemented or bypassed here.

## Proof ledger

- Characterization seam, prior order: 4 pass / 1 fail / 0 skip,
  `/tmp/them-949-red.xcresult`. Failure: preparation happened before opening.
  This is a unit characterization, not a real-phone reproduction.
- Corrected focused signed selection: 11 pass / 0 fail / 0 skip,
  `/tmp/them-949-focused.xcresult`. Two later test additions require final proof.
- Offline Node20.20.2 backend baseline and pre-fixture tree: 2,785 pass /
  0 fail / 2 skip; `/tmp/them-949-baseline-backend.log`,
  `/tmp/them-949-backend-proof.log`.
- Fixture safety tests: 3 pass / 0 fail / 0 skip on host runtime; explicit
  loopback/test-only guard, blocked external hosts, JSON/SSE shapes and
  unchanged feature-opening quality gate.
- Full Node20.20.2 tree including fixture tests: 2,788 pass / 0 fail / 2 skip,
  `/tmp/them-949-backend-final-tree.log`; before the final Swift continuity fix.
- Offline exemplar golden passes, `/tmp/them-949-offline-golden.log`.
  It is not a live model score.
- D009 against the rehearsal passes: Root 15,032 -> 15,024 (-8),
  live bridge 12,952 -> 12,926 (-26), other god files unchanged;
  index.js remains 33,557. Diff check passes.

Retained unsuccessful UI attempts are NOT passing proof:
`/tmp/them-949-home-ui.xcresult` and
`/tmp/them-949-home-ui-corrected.xcresult` each have 0 pass / 1 fail.
The initial runner blocked backend pipe processing; its zero-call counter
was invalid. Fixture response API/stream shapes also needed correction.
`/tmp/them-949-home-ui-stream.xcresult` ran zero tests because the temporary
runner did not create its requested xcconfig. Corrected config run
`/tmp/them-949-home-ui-stream-config.xcresult` again failed 0/1:
actual backend rejection was `missing_act_one_commitment`. The fixture now
contains the emotional question and consequential action required by the
actual feature context. No production quality gate was weakened.

`/tmp/them-949-home-contract.xcresult`: 0 pass / 1 fail / 0 skip. Actual
rejection `missing_next_turn_continuation` exposed the generic-guidance/story-
event conflation described above. This mapping was checked in later original
`origin/codex/T-four-tabs` as well; it was not already fixed there. This is
production evidence from the deterministic app/backend path, not a live-model result.

`/tmp/them-949-home-guidance.xcresult`: 0/1/0. Visible page/marker assertions
passed, but selected-project persistence did not. `/tmp/them-949-home-pair.xcresult`:
0/2/0; confirmed case again failed selected project; raw case lost the app
connection due to the SIGABRT above. Crash diagnostic:
`/Users/halfmutantfilms/Library/Logs/DiagnosticReports/them-2026-10-16-133118.ips`.
These results motivated the save handoff and deferred-binding corrections;
they must not be represented as successful voice/save proof.

## Final current-source proof

VERIFIED on task-owned simulator 11CF5EFB-D8C3-4F19-8062-28AF37F27D93,
iOS 26.2 / Xcode 26.3, erased before each proof run, signing enabled:

| Gate | Passed / failed / skipped | Retained original |
| --- | --- | --- |
| Complete themTests | 657 / 0 / 0 | /tmp/them-949-all-units.xcresult |
| Confirmed + server-ASR Home workflows | 2 / 0 / 0 | /tmp/them-949-receipt-save.xcresult |
| Longer-audio raw Home regression | 1 / 0 / 0 | /tmp/them-949-long-audio.xcresult |
| Existing authenticated writer workflow | 1 / 0 / 0 | /tmp/them-949-writer.xcresult |
| Full backend, Node20.20.2, network disabled | 2,788 / 0 / 2 | /tmp/them-949-final-all-backend.log |

The two backend skips are the real-Postgres prefix test without DATABASE_URL
and the opt-in live page response fixture with RUN_LIVE_PAGE_TESTS=0.
Offline mentor exemplar gate passes under network-disabled Node20; it is NOT
a live golden score. macOS scaffold build succeeds, /tmp/them-949-mac.log.
Only that build-only preflight disables signing; no test disables signing.
D009 and git diff --check pass. The original rehearsal and main are unchanged.

The Home tests start on Home, use real local authenticated HTTP and quality
gates, require one marker and the complete scene in the native editor, find an
exact matching saved version, terminate the app, and require exact full native
editor equality after relaunch (outer whitespace trimmed). They do not use the
1,000-character draft preview for exact equality.

Permanent local evidence (not committed/uploaded):
/Users/halfmutantfilms/io.them-worktrees/_proof/T-949-20261016.mXIPsa

It contains the final four result bundles, the pre-receipt-fix partial-save
bundle, backend/build/golden logs and the app sample. The /tmp originals and
earlier unsuccessful attempts remain; none was overwritten with a green run.

Additional failed attempts matter: home-pair and native-pair failed 0/2;
deferred-pair was interrupted after its app crashed (do not infer a clean test
summary). Short-audio failed 0/2. Insertion-owner failed 0/2: one assertion used
a truncated preview and the raw case still failed. Full-editor then passed 1/2,
with the confirmed journey green but raw save losing the final part of the scene.
Receipt-based persistence closes that exact raw regression at 2/2 above.

The original fixture mistakenly repeated a measured 7.704-second audio file
per TTS segment. Default fixture audio is now generated 0.168-second silence,
not model output. The separate long-audio raw run retains the original clip
and also passes, so the crash proof is not merely a shorter-audio workaround.

## Reproduction and safety

Use `backend/evals/run_home_voice_handoff_ui_smoke.mjs` with an explicit
task-owned `IOS_SIMULATOR_DESTINATION=platform=iOS Simulator,id=...`.
Erase that owned simulator first; never erase the human's simulator/phone.
Normal code signing remains enabled. The runner creates an ephemeral local
authenticated backend and a 0600 xcconfig, deletes the config on exit, keeps
the result bundle, drains pipes asynchronously and rejects failures/skips.
Select the raw-audio case using ONLY_TESTING. No paid provider call is allowed
through this fixture. Both chat API formats, ASR and TTS are synthetic.
The full backend gate uses a network-disabled Node20.20.2 container.

Default runner executes both Home cases; it rejects failures and skips. To run
the longer-audio regression, set ONLY_TESTING to the raw-audio method and
THEM_HOME_VOICE_LONG_AUDIO=1. That mode rejects the combined pair because repeating
the long clip for every confirmed-page TTS phrase invalidates its timing budget.
No real microphone, OpenAI, Muse or external TTS is used by these runs.

## Not covered / adversarial boundaries

- Actual microphone recognition, live model response/craft and physical phone.
- Intended shipping backend/configuration, deployment parity and external export.
- Signed-out/expired-auth UI journey: pure refusal behavior is tested, but later
  #763/#775 onboarding is not integrated here.
- Project switching/account changes during an in-flight generation, background
  cancellation, multiple devices and full offline recovery need broader proof.
- Paid metering and live latency: the raw fixture records two chat calls,
  companion /talk followed by the existing validated renderer. This is an
  integration tradeoff, NOT production cost proof. Reconcile Home with canonical
  #807 transcribe-first before shipping; do not create a second STT endpoint.
- Full V1 UI suite, 120-page performance, server restart recovery, #80 element/
  print agreement and existing narrow integrity-banner layout are not closed.
- Existing stored project memory is not migrated by the generic-guide fix.
- Entire remaining PR stack; #642 remains the next actual base-chain boundary.
- Independent non-author approval and required exact-head checks before landing.
  No main merge, protection bypass, original-head rewrite or replacement PR.

## Exact changed-file manifest

All paths below are relative to:
/Users/halfmutantfilms/io.them-worktrees/codex-confirmed-home-page-routing

- TASKS.md
- them/ConfirmedStudioTurnPreparation.swift
- them/RootExperienceView+ScreenplayIntent.swift
- them/RootExperienceView.swift
- them/ScreenplayIntentClassifier.swift
- them/ScreenplayDeferredPublicationGate.swift
- them/ScreenplayLiveDraftBridge.swift
- themTests/ConfirmedStudioTurnPreparationTests.swift
- themTests/StudioThreadViewStateSupportTests.swift
- themUITests/V1SmokeUITests.swift
- backend/evals/home_voice_provider_fixture.mjs
- backend/evals/run_home_voice_handoff_ui_smoke.mjs
- backend/tests/home_voice_provider_fixture.test.mjs
- docs/confirmed-home-voice-routing-2026-10-16.md

## Copy/paste Claude briefing

T-949 is an isolated correction above preserved rehearsal 5cfa52bb, on
codex/T-949-confirmed-home-page-routing. Original heads/main are intact.
Current confirmed words open authenticated Studio before page preparation;
old transcript/partial Home promotion is removed. Generic craft advice is no
longer seeded as enforced story events. Native insertion has one text-write
owner, stale native-binding rollback is guarded, and first saves use immutable
committedDraft receipts, not lagging shared snapshots. No quality gate was weakened.

VERIFIED current-source local proof: backend Node20 2,788/0/2; full signed units
657/0/0; Home pair 2/0/0; long-audio raw regression 1/0/0; existing writer UI
1/0/0; scaffold, offline golden, D009 and diff pass. The signed proof device was
task-owned and erased, never the human phone. Evidence is retained above.

#807 remains the canonical pending transcribe-first implementation; reconcile
the raw fallback's two-call path there before shipping. #860/#911 were read,
not duplicated. Next original base-chain boundary is #642; refresh its actual
head/base before preserving integration. Main stays 647e01fc; #766 remains
REVIEW_REQUIRED and #770 remains open. No merge, deploy, paid model call or
real-phone completion claim. The human deferred phone testing; App Store later.
