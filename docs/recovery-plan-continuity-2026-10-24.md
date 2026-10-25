# T-1130 — Resume the original page recovery, not a second write

## Checkpoint and scope

VERIFIED: initial runtime checkpoint `aa8cc35` on
`codex/T-1130-recovery-plan-continuity`, preserving parent
`80a2f66874691c9c3e126b1a5f5b2556019d5e9c`. Preserving merge `b81d153`
also includes published parent `9b1c279`; final runtime
`0b103208f449aded963ecc41a426d90938529632` strengthens save correlation.
Local only: final full signed955/0/0, focused10/0/0, stronger connected UI1/0/0
and Mac build pass. Hosted proof is still required. No main merge, production
change or paid call.

## Reproduced boundaries and fixes

- The connected interrupted-acknowledgement case first failed when reopening B
  after A's recovered scene was saved. The second run retained a native hierarchy:
  A's 1,083-byte scene appeared as B's dirty draft and a save conflict; the server
  did not accept that overwrite. The startup debounce could journal/save the
  restored page after selection changed but before the selected draft loaded.
  Its canonical current-draft guard now requires the loaded project to match.
  Unbound drafts remain eligible for their existing local recovery path.
- A durable page plan retained an ephemeral document UUID. `preparePageDelivery`
  rejected a renewed UUID before checking whether the exact scene was already
  durable. Recovery now reads the integrity-checked current journal and checks
  authenticated server versions first. A request-correlated saved result is acknowledged
  without inserting, saving or regenerating anything, preserving newer editor
  words. The original plan/receipt identity is never replaced.
- New plans also retain their canonical base version. If the result is not yet
  saved, continuation requires the same project, exact original before/after
  bytes, matching current/server base, loaded authority and unchanged owner/backend.
  A newer version or different text stays held for review/export. Legacy plans
  retain strict document matching; their absent optional field re-encodes to the
  original integrity bytes. A known empty base is distinct from legacy unknown.
- The existing review copy distinguishes finishing a plan from appending a new
  scene. The interruption hook is DEBUG + explicit UI flag + loopback only, and
  interrupts only acknowledgement after a real saved version was read.

## Self-audit: identical historical text is not this request's receipt

The preserving combined tree `b81d153` passed954/0/0 and Mac, but a subsequent
source-level adversarial review identified a real gap: the old byte-only history
search could accept an unrelated older version containing identical words. This
was NOT a reproduced physical-phone failure, and that green suite did not cover it.

Final `0b10320` carries the existing immutable committed-write UUID through the
canonical save request's existing `client_request_id`. A retained after-insertion
save resumes with the same plan UUID via the same save/outbox machinery, not a
new store or server contract. New plans require both that request ID and exact
after bytes in the saved version. Matching newer hints cannot rebase a plan.
Legacy records without correlation can finish only against a current exact
result, never an unrelated historical copy. Unknown or out-of-window evidence
stays held rather than silently acknowledged.

The stronger UI case saves newer writer words after the acknowledged server
write but before finishing the interrupted recovery. The old correlated version
then proves delivery while the current newer page remains untouched. This also
exercises the real save request ID in authenticated HTTP, not just a pure helper.

## Exact evidence (all providers intercepted)

- `/tmp/them-1130-plan-before.xcresult`: UI **0/1/0**, earlier B-load failure.
- `/tmp/them-1130-plan-diagnostic.xcresult`: UI **0/1/0**, same boundary with
  native hierarchy showing the wrong-project dirty/conflict state.
- `/tmp/them-1130-unloaded-debounce.xcresult`: **no tests executed**; a new test
  inferred an optional recovery store and did not compile. Corrected explicitly
  with `XCTUnwrap`, not counted as a pass.
- `/tmp/them-1130-debounce-ui.xcresult`: UI **0/1/0**; B loaded and the original
  plan reopened, then the new test did not scroll far enough to hit Finish.
  A bounded real scroll corrected that test interaction; no automatic action.
- `/tmp/them-1130-continuity-focused.xcresult`: signed focused **9/0/0**.
  Includes loaded-project debounce, persisted version anchor, exact Unicode/byte
  and newer-version refusals, original-project isolation and legacy encoding.
- `/tmp/them-1130-plan-fixed.xcresult`: connected UI **1/0/0**, real local
  authenticated queued response → A save → interrupted acknowledgement → relaunch
  B → reopen A → finish original plan → unchanged saved-version count → B unchanged
  → exact native-editor relaunch. Intercepted ASR/chat/TTS counts **1/2/23**.
- Preserving combined `b81d153`: full signed **954/0/0** and Mac build0 before
  the correlation self-audit. These do not prove the later changed source.
- Final `0b10320`: `/tmp/them-1130-receipt-focused.xcresult` **10/0/0**;
  `/tmp/them-1130-receipt-newer-ui.xcresult` **1/0/0**, same real HTTP journey
  plus a newer saved writer edit before finishing recovery; current newer words
  preserved, B untouched, no extra version, exact relaunch. Intercepted
  ASR/chat/TTS **1/2/23**. The actual saved request ID must match the plan for this
  historical-version confirmation to succeed.
- Final full signed `/tmp/them-1130-final-units.xcresult`: **955/0/0**;
  final macOS scaffold build exit0 (`/tmp/them-1130-final-macos.log`).
  The standalone no-interruption UI case was not rerun on this final source;
  the stronger case executes its same initial append/save path, then interrupts
  acknowledgement and exercises correlated finish after a newer saved edit.
- `node --check backend/evals/run_home_voice_handoff_ui_smoke.mjs`,
  `git diff --check` and canonical D009 vs existing `origin/main`: pass. All five
  watched files are byte-unchanged from this task's parent. An attempted D009 run
  against a missing remote-tracking parent produced null baselines: it is NOT
  evidence of a parent comparison. Direct parent diff confirms no watched changes.

Runner: signed canonical iOS script, erased task-owned simulator
`7F1A14C1-B379-4417-AFE9-331810CD9CD3`, iOS26.2/Xcode26.3; task DerivedData
`/tmp/them-1127-clean-dd`. UI fixture runner Node24.19.0. No backend runtime was
changed; no new full backend run is claimed.

Permanent local archive for successful and failed checkpoints:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1130-20261024.aZX3zh/`.

## Exact combined file inventory versus original #975 parent80a2f66

- `them/OfflineTalkOutbox.swift`
- `them/OfflineTalkPageDelivery.swift`
- `them/OfflineTalkPageRecoveryPanel.swift`
- `them/OfflineTalkPageRecoveryUITestFixture.swift`
- `them/OfflineTalkReplyReview.swift`
- `them/ScreenplayStudioViewModel.swift`
- `themTests/OfflineTalkPageDeliveryTests.swift`
- `themTests/ScreenplayStudioDraftRecoveryTests.swift`
- `themUITests/V1SmokeUITests.swift`
- `backend/evals/run_home_voice_handoff_ui_smoke.mjs`
- `docs/recovery-plan-continuity-2026-10-24.md`
- `TASKS.md`
- Inherited parent T1132: `them/ScreenplayStudioExportSupport.swift`,
  `themTests/ScreenplayStudioExportSupportTests.swift`,
  `docs/native-export-presentation-identity-2026-10-24.md`.

## Stop for earlier integration failure / remaining work

VERIFIED: original #974 head `7428be7` run `40160014884` is terminal red in the
integrated writer workflow: `V1SmokeUITests.swift:1409`, second native export
after cancellation not detected. Its signed units, backend and D009 passed;
later broad UI/offline recovery/voice/macOS steps were skipped. T1132 now preserves
the local fix and948 signed units/writer1/0/0/Mac in published parent9b1c279.
Fresh parent run40162533820 passes backend/D009 and has advanced through signed
units into the writer workflow, still unresolved at the last observation.
#975's separate old-head run40160039304 has advanced through broad UI into
offline-save recovery. Neither is a waiver of the old red run or new-head proof.

Not covered: connected interruption before insertion or before save completion;
historical results outside the 32-version read window; universal exactly-once
save semantics during concurrent uncertain server commits; unbound or precise
rewrite delivery; physical microphone/live quality; intended shipping backend;
external exported-file opening. These are not established by fixture proof.

Also not covered: a legacy uncorrelated result after it has become historical;
a crash before the stable save request reaches the canonical outbox followed by
an unrelated autosave ID. Such evidence remains held, not silently acknowledged.
Connected interruption before insertion/save is the next native recovery boundary.

Next: resolve the fresh parent hosted writer/gate result first; when green,
preserve-merge the proven local descendant into original #975 and publish normally,
then require its fresh hosted checks/review. Do not force, squash, replace or merge
to main. Main remains78b8c94; #975 remains80a2f66 remotely at this checkpoint.
