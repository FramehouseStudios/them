# T-1143 — Preserved original641, dialogue repair and Home handoff boundary

## Identity and ownership

VERIFIED: original641232098ba still targets `claude/three-act-port`; its body
and all four correction/follow-up comments were read. Worktree
`/Users/halfmutantfilms/io.them-worktrees/codex-original-641-routing`, branch
`codex/T-1143-original-641-routing`, base22bf182 (prepared640). Local merge
060bf00 preserves original641232098ba, its corrected descendantb85e391f and
the complete current parent. No original public head/base or main was changed.

Four merge conflicts: retain both canonical-default/craft and project-memory
imports in prompt_routes; preserve both historical task-ledger sides; resolve
the two count-test wording conflicts without changing either no-growth ceiling.
No assertion relaxation, whitespace padding or broad rehearsal merge occurred.
The historical T-947/T-949 handoffs remain dated context, not fresh proof.

## Reproduced dialogue-content bug and existing fix

VERIFIED production-function result on the merged tree:
`Does this line work? She says: Rewrite the ending.` selected rewrite_scene
and page_rewrite. The command words inside the supplied line were treated as
writer instructions. Conversely, `Read this line: "Stay." Tighten it.` remained
dialogue_notes rather than selecting the requested rewrite.

Reapply the isolated existing T-1092 correction from
b04e16c249689c0a078edd3507df3f79f0f07ef3, not its broad writer-candidate tree.
The three production files and regression file are byte-identical to that
existing source. Dialogue-notes owns content masking and the shared revision
policy; task selection and cost-lane classification consume the same owner.
Balanced-quote trailing directions remain instructions, and explicit Page/
Continue hints retain priority. Unquoted colon-attributed/read-back lines are
handled by the existing policy. This is not an authorization or billing change.

## Initial backend-only proof atf63c13d — superseded by Home checkpoint below

- Signed/native/UI/macOS proof for this641tree has NOT run yet. Do not claim
  historical637/644 or inherited parent646 units as new combined-tree proof.
- Node20.20.2 focused before:5 pass/2 fail/0 skip, exit1. Both are real
  classification assertion failures, not missing dependencies or a zero-test run.
- Same seven focused regressions after:7 pass/0 fail/0 skip, exit0. Includes
  quoted/unquoted imperative dialogue, ASCII/curly quotes and contractions,
  trailing rewrite/tighten/shorter/another-pass directions and explicit hints.
- Complete exact-lock Node20.20.2 backend:2795 pass/0 fail/2 skip, exit0.
  Skips: real PostgreSQL query without DATABASE_URL, opt-in Page-response case.
  This was a host Node20 run, not a network-disabled-container claim. Live paid
  flags/key were absent; no real provider or private environment was used.
- JavaScript syntax and diff checks pass.
- First D009 invocation properly refused the missing local parent reference as
  unverified. Fetch the actual unchanged parentc8eb36b; corrected comparison
  passes with numeric deltas: index33557(-69), Studio17431(-4), Root15032(-80),
  bridge12952(0), memory10865(0). These are versus the actual public PR parent,
  not a claim that later exact33603 rules are established. No padding added.

Commands from this worktree, with provider/database overrides removed:

```sh
/private/tmp/node-v20.20.2-verified/bin/node --test backend/tests/dialogue_notes_intent.test.mjs
# Full run used the same verified Node20 PATH and isolated exact-lock install:
cd backend && npm test
# From repository root:
GITHUB_BASE_REF=claude/three-act-port /private/tmp/node-v20.20.2-verified/bin/node scripts/check_god_files.mjs --json
```

Permanent local artifacts:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1143-20261025.i4Tf9z/`.
Separate before/fixed/full logs are retained; no failed run was overwritten.
That archive also retains this turn's parent639 offline40pairs/8prompt checks,
scorer/approval guards8/0/0 and D009 deltas0, plus parent640 gate regressions
7/0/0 and numeric D009. Their updated local heads are4c61d5a and22bf182;
neither public child was advanced or given an unchanged fresh native-suite claim.

## Home voice preparation failure at the initial checkpoint

VERIFIED source ordering still prepares turn-based/realtime requests before
opening Studio. The newly protected page-routing boundary correctly requires
Studio to be active. Raw audio can select the previous global `transcript`
before current ASR arrives. This is source evidence plus the retained earlier
T-949 reproduction, not a new physical-phone observation in this session.

Next: reconcile isolated existing6e7138b1 (T-949) and its documented later
Home-open/refusal, barge-in and stop/preview ownership corrections. Preserve
current confirmed words, authentication refusal, native text ownership and
immutable save receipts; do not merely open on a speculative partial or relax
the active-Studio guard. The complete T-949 handoff was read, including its
earlier failed proofs, binding crash, save lag and explicit two-call limitation.
Do not merge a broad backup or call the Home journey fixed before real local
authenticated UI proof. Later original807 is the canonical transcribe-first
boundary and must be reconciled in order, not replaced by a second STT service.

Original641 remains NOT READY for publication. Fresh native/integration proof,
parent hosted clearance and independent human review remain separate holds.
Original638run40176990546 and974run40175219157 are live, not declared green.
No paid model, physical microphone/phone, shipping backend, production change,
integrated-main or whole-product completion claim follows from this checkpoint.

## Initial641 diff manifest atf63c13d versus prepared640 parent22bf182

- TASKS.md
- backend/evals/clementine/scenes.jsonl
- backend/index.js
- backend/lib/clementine/intents.js
- backend/lib/clementine/lanes.js
- backend/lib/clementine/page_lane_adapter.js
- backend/lib/clementine/talk_edge_adapter.js
- backend/lib/conversation_freshness.js
- backend/lib/dialogue_notes.js
- backend/lib/persona.js
- backend/lib/prompt_assembly.js
- backend/lib/prompt_routes.js
- backend/lib/screenplay_project_memory_policy.js
- backend/lib/system_prompt_trim.js
- backend/tests/clementine_intents_story.test.mjs
- backend/tests/clementine_reflex_lane.test.mjs
- backend/tests/clementine_voice_eval_scenes.test.mjs
- backend/tests/dialogue_notes_intent.test.mjs
- backend/tests/prompt_routes.test.mjs
- docs/filmmaker-review-corrections-2026-10-08.md (historical)
- docs/original-641-routing-2026-10-25.md
- them/HerDirectorContext.swift
- them/HerVoiceSpec.swift
- them/RootExperienceView+ScreenplayIntent.swift
- them/RootExperienceView.swift
- them/ScreenplayIntentClassifier.swift
- themTests/HerVoiceSpecMentorCoreParityTests.swift
- themTests/ScreenplayIntentClassifierTests.swift

## Connected Home checkpoint — current local source

Preserved existing6e7138b1 as250161c, native refusal/barge-in corrections from
8ffa3992 as9dd2332, Stop/preview ownership51ec42d8 as6213992, and cross-client/
server refusal6ccee79 asba8e808. Attribution/history remain; no broad backup
merge or replacement STT service. Historical ledger conflicts keep both sides
with explicit dated headings, not new proof claims.

Two integration corrections were necessary. A later test constructor supplied
`documentID`, absent at this boundary: initial native attempt failed to build,
not a reproduced runtime failure. Adapt only the test helper to the existing
initializer. The resulting single compound-command test genuinely failed0/1/0:
page refusal incorrectly blocked a separate positive request to open Studio.
Opening permission now remains separate from page-mutation permission; the
actual page refusal guard is not relaxed.

Focused Node first failed13/2/0. The imported refusal adapter referenced a
later `settleWallet` closure unavailable here, also causing the real handler's
missing Companion header/recovered failure. Use the existing Page-cancel owner
and idempotent canonical wallet.release, including an independently supplied
wallet. The regression now exercises both store configurations and repeated
refusal without double refund. Corrected focused15/0/0; assertions retained.

VERIFIED final local source, all signed native runs erase only owned simulator
91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A, iPhone17Pro/iOS26.2:

- Full pinned Node20.20.2 backend2803 pass/0 fail/2 skip, exit0. Real PostgreSQL
  without DATABASE_URL and the opt-in Page-response case remain skipped.
- Complete signed themTests681/0/0, exit0, including both earlier failures.
- Confirmed and raw Home journeys2/0/0: full native scene, one marker, exact
  authenticated saved version, exact editor restoration on relaunch (outer
  whitespace trimmed). Raw case deliberately starts with a stale transcript.
- Longer-audio raw Home1/0/0, not merely the shortened-audio fixture.
- Actual Studio Stop button1/0/0: capture ends, native baseline restored,
  no late text or rearming during the asserted window.
- Actual Studio write-refusal1/0/0: even with Page selected and the test provider
  returning screenplay-shaped text, the exact draft/version collection is kept.
- Existing authenticated manual writer workflow1/0/0, zero mocked provider
  calls. It covers save/export handoff/relaunch, not a file opened outside THEM.
- Mac scaffold BUILD SUCCEEDED/exit0; build-only, never unsigned iOS testing.
- Offline golden40 exemplar pairs/eight prompt checks pass, not live quality.
- D009 versus actual public parentc8eb36b: index33557(-69), Studio17431(-4),
  Root14992(-120), bridge12926(-26), memory10865(0). Diff check passes.

UI orchestration/local server used Node24.19.0; full backend used Node20.20.2.
`run_home_voice_handoff_ui_smoke.mjs` pins synthetic ASR/chat/TTS and blocks
external fetches. Its task-local XCODEBUILD wrapper only supplies isolated
DerivedData; selectors, signing, assertions, timeouts and strict summary counts
remain unchanged. No private environment or real provider key was copied.

Canonical UI command: set explicit IOS_SIMULATOR_DESTINATION above,
THEM_HOME_VOICE_RESULT_BUNDLE to a distinct result, and
XCODEBUILD=/private/tmp/them-1143-home-xcodebuild.sh; invoke
`node backend/evals/run_home_voice_handoff_ui_smoke.mjs`. Default selects the
Home pair; ONLY_TESTING selects the named long-raw, Stop, refusal or existing
writer case. Longer audio sets THEM_HOME_VOICE_LONG_AUDIO=1 for raw/Stop only.
All exact terminal logs/bundles and before failures are retained separately in
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1143-Home-20261025.GyBsBM/`.

Additional Home files, alongside the initial manifest above:

- Packages/DraftStudio/Sources/DraftStudio/DraftStudio.swift
- Packages/DraftStudio/Sources/DraftStudio/DraftStudioPageWritePolicy.swift
- backend/evals/home_voice_provider_fixture.mjs
- backend/evals/run_home_voice_handoff_ui_smoke.mjs
- backend/lib/screenplay_turn_target.js
- backend/lib/screenplay_write_instruction.js
- backend/lib/talk_handler.js
- backend/tests/fixtures/screenplay_write_refusal.json
- backend/tests/helpers/screenplay_refusal_provider.mjs
- backend/tests/home_voice_provider_fixture.test.mjs
- backend/tests/screenplay_write_refusal.integration.test.mjs
- backend/tests/screenplay_write_refusal.test.mjs
- docs/confirmed-home-voice-routing-2026-10-16.md (historical)
- docs/preview-cancellation-2026-10-20.md (historical)
- them/ConfirmedStudioTurnPreparation.swift
- them/HerVoiceController.swift
- them/ScreenplayDeferredPublicationGate.swift
- them/ScreenplayLiveDraftBridge.swift
- them/ScreenplayStudioTypes.swift
- themTests/ClementineVoiceSettingsBargeInTests.swift
- themTests/ConfirmedStudioTurnPreparationTests.swift
- themTests/ScreenplayPageWriteRefusalTests.swift
- themTests/ScreenplayPreviewCancellationTests.swift
- themTests/StudioThreadViewStateSupportTests.swift

Original638 head0b56861/run40176990546 and974 headf4aca4a/run40175219157 are
now terminal green in all three required jobs. Main is still78b8c94;638 remains
draft/REVIEW_REQUIRED. Independent personal review was requested for exact0b.
No child public head was advanced during this preparation. Local641 still needs
the protected parent sequence and its own fresh hosted checks/review.

Not covered: physical microphone/phone, live reply quality, intended shipping
backend, outside-app file opening, in-flight auth/project changes for this Home
path, populated-project Stop or paid Stop refund. Raw Home still has the dated
two-call limitation; reconcile canonical original807 before shipping. This
checkpoint does not replace the separate stronger recovery/owner-fence branch,
prove the entire stack, authorize a paid call, lift production hold or establish
integrated-main/product completion. Existing Swift6 warnings remain.
