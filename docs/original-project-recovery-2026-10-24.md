# T-1126 — Recover a reply to its original screenplay without losing it afterward

## Scope and preserved history

VERIFIED: branch `codex/T-1126-original-project-recovery`, source checkpoint
`f2b7fbc`. Original WIP00be9dc, checkpoint50d07e6 and preserving merges61c0566
and16000d6 remain intact. Parent is original draft #974's2369367, not main.
This is a new bounded recovery capability, not a replacement for an original PR.

Exact changed files versus2369367:

- `them/OfflineTalkOutbox.swift`
- `them/OfflineTalkPageRecoveryPanel.swift`
- `them/OfflineTalkReplyReview.swift`
- `them/ScreenplayStudioViewModel.swift`
- `themTests/OfflineTalkPageDeliveryTests.swift`
- `themTests/ScreenplayRecoveryDestinationTests.swift`
- `themUITests/V1SmokeUITests.swift`
- `TASKS.md`
- `docs/original-project-recovery-2026-10-24.md`

## Causes and corrections

1. A kept response from project A could be reviewed while B was selected. The
   canonical final write guard refused the wrong destination, but the UI offered
   B's append action and no connected route back to A. Resolve the destination
   from the integrity-checked original request or existing durable delivery plan,
   not optional response trace/current editor state. Offer Open original project;
   opening alone never acknowledges the retained reply. Reuse canonical selection.
2. A cached summary was not evidence that its draft actually loaded. Failed detail
   selection could otherwise leave another project's bytes under the new label.
   Require actual loaded-draft authority for opening/appending. A failed selection
   restores the prior selection/outline only while its draft/version authority is
   still unchanged. Dirty/saving/loading/conflicted/queued/streaming work blocks
   switching rather than discarding it.
3. A late project read could overwrite a newer confirmed page. The held-response
   regression reproduced a68-byte page reverting to34 bytes. Fence the read to its
   initiating auth, selected project, actually loaded project and version. The full
   journey then exposed a further suspension between that HTTP check and hydration:
   local recovery/outbox awaits could allow the page save to complete in between.
   Carry the same predicate through those awaits, up to synchronous hydration.
   A rejected changed-authority read clears its seen-state marker so a normal
   later poll can fetch fresh state; no additional timer/retry loop or new store.

The connected failure was real, not just an absent editor. Its retained snapshot
showed the original55-character page, and isolated server data contained a1083-byte
recovered version followed roughly one second later by a55-byte studio_autosave.
The generated version survived in history, but the active page was wrong.
A content-free long-to-short mutation stack identified
`refreshCrossDeviceStateIfNeeded -> loadSelectedProjectOutline ->
hydrateDraftRestoringQueuedSaves -> hydrateDraft -> applyServerDraft`.
All temporary mutation instrumentation was removed before final proof/commit.

The test also now closes the inspector by actual state, confirms dismissal and
fails at the full-editor boundary with a screenshot/AX snapshot. It still compares
the complete native editor bytes, not the1000-character debug preview.

## Verification — current final runtime

VERIFIED: Xcode26.3/17C529; signed tests on erased task-owned simulator
`7F1A14C1-B379-4417-AFE9-331810CD9CD3`, iPhone17Pro/iOS26.2.
DerivedData `/tmp/them-1127-clean-dd`. No signing bypass or unrelated simulator.

- Held-response/destination regressions: before **2 pass /1 fail /0 skip**,
  `/tmp/them-1126-delayed-read-red.xcresult`; first HTTP fence **3/0/0**,
  `/tmp/them-1126-delayed-read-fixed.xcresult`. The final full suite below includes
  the same cases with the additional suspension fence.
- Complete final-source `themTests`: **950 pass /0 fail /0 skip**,
  `/tmp/them-1126-full-units-authority.xcresult`, using
  `scripts/run_ios_unit_tests.sh -quiet -derivedDataPath /tmp/them-1127-clean-dd
  -resultBundlePath /tmp/them-1126-full-units-authority.xcresult` with the explicit
  owned destination and `/usr/bin/xcodebuild`.
- Connected two-project queued recovery: **1 pass /0 fail /0 skip**,
  `/tmp/them-1126-original-ui-authority.xcresult`, canonical
  `backend/evals/run_home_voice_handoff_ui_smoke.mjs`, case
  `test_queued_talk_reply_plays_appends_saves_and_restores_once`.
  Real isolated authenticated HTTP: receive A's queued result, relaunch into B,
  no wrong-project append, open A without acknowledgment, play/stop retained audio,
  append/save once, verify B unchanged and restore exact A after another relaunch.
  Intercepted fixture counters STT1/chat2/TTS23; these are not paid/live calls.
- `scripts/desktop_preflight.sh`: **exit0**, build-only macOS scaffold,
  `/tmp/them-1126-authority-macos.log`. Not macOS runtime/release proof.
- D009 and `git diff --check`: **pass**. All five watched files are unchanged
  versus2369367; backend/index.js33475 versus main33626. Backend runtime/test
  source is identical to2369367, whose completed hosted Node20 job121055269150
  reports **2964 pass /0 fail /4 skip**. This is inherited identical-tree evidence,
  not a fresh local backend run for T1126.

Private retained archive:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1126-20261024.CJdcg7/`.

## Failed/intermediate evidence retained

- Initial under-revision unit run was deliberately stopped; not a full-suite pass.
  Early destination1/1/0 preceded coherent checkpoint61c0566's2/0/0.
- Original UIv3 failed0/1/0 after save. Diagnostic-only v4 passed1/0/0, but
  state-aware v5 failed0/1/0 and exposed the real page reversion. Neither a blind
  toggle nor a later pass established a root fix.
- Broad mutation instrumentation perturbed timing and passed1/0/0; not counted
  as final proof. The bridge-event hypothesis was rejected by a focused3/0/0
  check; no speculative bridge guard was added.
- HTTP-fence-only UI failed0/1/0. Reversion-only diagnostic UI failed0/1/0 and
  captured the actual stack. Final uninstrumented suspension-fenced UI passed1/0/0.

## Residual limits / next

This proves bound-project recovery for the observed local path, not arbitrary
unbound/initial-project recovery, precise rewrite recovery, or interrupted existing
delivery-plan document-ID continuity across project switches. It is not universal
exactly-once delivery, live microphone/model quality or a production security claim.
Existing Swift6 warnings remain. No new framework, paid call, secret change,
main merge, deployment or protection change.

The integrated shipping build and physical-iPhone journey, including externally
opened export, remain unproven. Production is still held. Publish this scoped
branch as a draft stacked on original #974, retain required checks/review, and
continue from the first actual failed integration boundary. Never treat simulator
fixtures or this report as completion of THEM.
