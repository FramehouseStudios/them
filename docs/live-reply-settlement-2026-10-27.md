# T1182 — Confirm delivery before retiring a live reply

## Problem and connected change

VERIFIED: the published custody checkpoint retained accepted `/talk` responses,
but normal page saves and completed playback did not jointly settle that durable
record. Recovery also treated an original replacement as an append.

DECIDED: extend the existing admitted `.turn` record and canonical draft-save
path. No second queue, framework, root view state or provider call is added.

- Immutable save provenance captures the initiating writer, document, project
  and backend when the save is requested. Retry, queueing, coalescing and
  completion retain that identity. Actual response origin and exact UTF8 server
  echo are required; the current visible page cannot supply missing provenance.
- An ordinary or initial save records its exact saved-version evidence in the
  admitted reply before queue removal. Initial promotion is restricted to the
  original unbound document and its verified first-save receipt.
- Normal page delivery retires only after both exact save evidence and full
  successful playback. A conversation-only reply needs full successful playback.
  Save and playback can arrive in either order and survive reopening the store.
- A kept live change recovers its original range/replacement. Exact before
  bytes permit applying it; exact after bytes permit finishing its save; newer
  ambiguous bytes require review. An already-confirmed save never replays the
  mutation. The reviewed action must still match the freshly loaded plan.
- The accepted response registers its audio remainder before post-response
  awaits. A stale first-segment callback cannot complete an active remainder.
- The active orb driver uses the exact current AVAudioPlayer's successful
  delegate callback as its sole completion authority. Metering, decode failure,
  unsuccessful completion, explicit Stop and interruptions cannot mint delivery.
  Cleanup runs before callbacks so it cannot clear a newly started remainder.
  Success and failure share the existing goodbye/microphone-resume rule.
- Recovery read failures retain known rows with a retry action. Stable document
  capture no longer publishes unchanged origin state.

Source contract reference: Apple's [audio completion delegate documentation](https://developer.apple.com/documentation/avfaudio/avaudioplayerdelegate/audioplayerdidfinishplaying(_:successfully:))
distinguishes successful completion from interruption; it does not equate
`isPlaying == false` with completed playback.

## Failure evidence and verification scope

All native runs use signing and the erased task-owned simulator
`91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A` (iPhone17Pro/iOS26.2).
The local UI backend enforces user authentication and uses synthetic funds and
intercepted provider responses. These are client/HTTP/persistence proofs, not
microphone, model quality, purchase, shipping deployment or physical-phone proof.

- First focused run: **65 passed / 1 failed / 0 skipped**. The obsolete-editor
  regression crashed in `BackendClient.__deallocating_deinit` / generated
  executor-hopping teardown. Explicit stateless `nonisolated deinit` fixes the
  production teardown; the reproducer remains in the suite.
- First full checkpoint: **1015 passed / 0 failed / 0 skipped**.
- First new delivery UI assertion: **0 passed / 1 failed / 0 skipped**. It
  blindly toggled an already-open inspector closed and could not reach Draft.
  The test now opens the actual drawer only when absent and reveals the real
  recovery controller. Its counter remains `loading` until a successful scoped
  store read; an initial empty array is not proof of settlement.
- Corrected normal workflow before the orb delegate repair: **1/0/0**, actual
  saved version, loaded received-reply count zero, exact text after relaunch.
- Signed full checkpoint including delegate/error/current-player regressions:
  **1022 passed / 0 failed / 0 skipped**. This precedes the final shared
  goodbye-resume extraction; final source verification is recorded below.
- Final-runtime three-workflow batch: **2 passed / 1 failed / 0 skipped**.
  Normal voice settlement and legacy append passed. Replacement save, exact
  native bytes and relaunch passed their assertions, but its version-count
  assertion used `stringValue`, which trims trailing whitespace, against a
  deliberately untrimmed page. Corrected the assertion to compare raw draft
  bytes; the same false-trimming check in initial-project recovery was corrected
  too. The failed replacement case is rerun alone; it is not relabeled green.
- Corrected replacement workflow: **1/0/0**, including one raw-byte exact saved
  version, unchanged surrounding CRLF/decomposed Unicode/trailing whitespace and
  exact relaunch with the old line gone and no duplicate insertion.
- Final Stop workflow: **1/0/0**. Actual authenticated reservation cancellation
  returned HTTP200, `cancelled:true`, `dropped:1`, `byReservation:true`.
- Final frozen-source full units: **1022 passed / 0 failed / 0 skipped**,
  `settlement-head-units.xcresult`, signed and erased owned simulator.
- Final macOS scaffold: **BUILD SUCCEEDED**, process exit0.
- D009 passes against the actual T1181 parent: index33494 unchanged,
  Studio17340→17339, Root14930→14928, bridge12784→12774,
  Memory10463→10461. `git diff --check` and UI runner syntax pass.

Temporary artifacts: `/private/tmp/them-1182-settlement-proof`.
Permanent archive, final committed-source hashes and publication are recorded
after the jobs terminate. No failed result is overwritten or described as green.

Backend production and scripts remain byte-identical to `18d27c3`; only the
allowlisted UI orchestration script changes (replacement case and batching
explicit allowlisted identifiers). Its syntax and actual local execution are
checked. The earlier Node20 full backend **2996/0/5** result is inherited, not a
fresh run. Repeating that unchanged suite would not prove the new Swift behavior.

## Adversarial boundaries

VERIFIED in signed tests: first audio/save alone cannot retire a page; either
ordering of exact save and final playback works; wrong owner, project, document,
backend or bytes cannot settle; a copied project cannot claim initial promotion;
plan ID alone cannot delete an unsaved mutation; corrupt evidence and failed
disk/index operations preserve recoverable work; acknowledged records never
regenerate; old player callbacks cannot clear or complete a replacement player.

DECIDED: legacy saves with no immutable origin continue saving, but cannot mint
automatic live settlement evidence. Missing server echo keeps the accepted reply.
Explicit reviewed recovery may finish an exact confirmed save without requiring
that the writer replay the audio. It does not manufacture playback evidence.

NOT COVERED: all typed Studio/render/SSE consumers, Notes rewriting receipt
settlement, the broader pre-existing save-admission concurrency question,
real microphone/provider quality, real phone export opening, and shipping
backend/release prerequisites. No App Store or production readiness claim.
The separate recovery-preview `AudioPlayer` still needs an error/old-player
callback audit; it does not acknowledge canonical live receipts.

## GitHub and next implementation target

Original helper commit `5457b7e12420232bd7196c2d949ef527a74c655e` is preserved
as a parent of merge `65f56b466196526a806083c8d6315ff7988a3965` on
`codex/T-1182-live-reply-custody`.
No squash, original PR replacement, force push, main merge or deployment.
Fresh GitHub inspection still shows main `78b8c94f` and original #964 open at
`5faa43d6` with its only review dismissed. The human chose review later.

Next target: typed Studio `submitStudioPrompt` uses render/SSE, not `talkText`.
Retain accepted render output before fencing late partial/final/cleanup effects
with the original turn/document/auth/backend. Binary success: release A after
selecting B or Stop; B's exact text/status/submission stay unchanged, A remains
recoverable after relaunch and no second generation starts. Preserve normal
typed preview, commit, save and restore. Notes receipt settlement is separate.

## Permanent proof and publication checkpoint

Runtime: `65f56b466196526a806083c8d6315ff7988a3965`.
Parents: published `f588fb8` and original helper `5457b7e`.
Archive: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1182-settlement-20261027-rfo70mxj`.
Verified **12817 artifact files / zero hash mismatches**, and all **25 scoped
source files** match the committed runtime bytes. Manifest SHA256:
`618b2e63f5cb42c095a4bd535d74268b2d6a8f4971445e40d11043384d7eeaf6`.
All owned native jobs terminated; failed and intermediate artifacts remain
preserved. The final-source snapshot identifies the definitive unit/build inputs.
Only a normal fast-forward publication of the existing backup branch is intended;
the following documentation commit records the proof without changing runtime.

## Exact changed files

- `TASKS.md`
- `backend/evals/run_home_voice_handoff_ui_smoke.mjs`
- `docs/live-reply-settlement-2026-10-27.md`
- `docs/save-evidence-provenance-2026-10-27.md`
- `them/Audio/OrbAudioDriver.swift`
- `them/BackendClient.swift`
- `them/BackendMemoryAPI.swift`
- `them/BackendReadResult.swift`
- `them/BackendTalkStreamingTransport.swift`
- `them/OfflineTalkOutbox.swift`
- `them/OfflineTalkPageDelivery.swift`
- `them/OfflineTalkPageRecoveryPanel.swift`
- `them/OfflineTalkPageRecoveryUITestFixture.swift`
- `them/OfflineTalkRecovery.swift`
- `them/OfflineTalkReplyReview.swift`
- `them/RootExperienceView.swift`
- `them/ScreenplayDraftSaveEvidence.swift`
- `them/ScreenplayDraftSaveOutbox.swift`
- `them/ScreenplayInitialProjectCreation.swift`
- `them/ScreenplayLiveDraftBridge.swift`
- `them/ScreenplayStudioViewModel.swift`
- `them/TalkStreamPlaybackDelivery.swift`
- `themTests/OfflineTalkLiveSettlementTests.swift`
- `themTests/OrbAudioDeliveryTests.swift`
- `themTests/ScreenplayDraftSaveEvidenceTests.swift`
- `themTests/ScreenplayLiveDraftOriginTests.swift`
- `themTests/TalkStreamPlaybackDeliveryTests.swift`
- `themUITests/V1SmokeUITests.swift`

## End-of-session report

1. **Completed:** native live save evidence/settlement, exact replacement
   recovery, real successful-audio completion and ownership/failure repairs.
   Overall product goal remains incomplete.
2. **Files changed:** the exact28 paths above; no unrelated work staged.
3. **Root issues fixed:** original save identity lost across awaits/queueing;
   no normal durable receipt settlement; append assumptions in replacement
   recovery; first-segment/remainder ordering; stopped audio treated as success;
   old-player cleanup; unconditional mic resume after an interrupted goodbye;
   generated BackendClient teardown crash; unchanged origin publications.
4. **Verification:** final signed1022/0/0; normal/append workflow passes in the
   recorded batch, corrected replacement1/0/0, Stop1/0/0, Mac exit0,
   D009/syntax/diff pass. Intermediate failures remain recorded above.
   Backend2996/0/5 inherited, not rerun; zero paid provider calls.
5. **GitHub:** existing T1182 backup branch only; publication details follow.
   Main and original PR heads unchanged, no deployment or review bypass.
6. **Next active task:** typed render/SSE accepted-result custody and original
   turn/document/auth/backend ownership; normal typed save/restore must survive.
7. **Continue status:** **READY FOR CONTINUE**. Main review and the real-phone /
   shipping-backend journey remain separate open gates.
