# T-1130 — Resume the original page recovery, not a second write

## Checkpoint and scope

VERIFIED: runtime checkpoint `aa8cc35` on
`codex/T-1130-recovery-plan-continuity`, preserving parent
`80a2f66874691c9c3e126b1a5f5b2556019d5e9c`. Local only. Full signed units,
the unchanged normal recovery workflow, macOS compile and hosted proof have NOT
yet been rerun on this source. No main merge, production change or paid call.

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
  authenticated server versions first. An already-saved result is acknowledged
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
- `node --check backend/evals/run_home_voice_handoff_ui_smoke.mjs`,
  `git diff --check` and canonical D009 vs existing `origin/main`: pass. All five
  watched files are byte-unchanged from this task's parent. An attempted D009 run
  against a missing remote-tracking parent produced null baselines: it is NOT
  evidence of a parent comparison. Direct parent diff confirms no watched changes.

Runner: signed canonical iOS script, erased task-owned simulator
`7F1A14C1-B379-4417-AFE9-331810CD9CD3`, iOS26.2/Xcode26.3; task DerivedData
`/tmp/them-1127-clean-dd`. UI fixture runner Node24.19.0. No backend runtime was
changed; no new full backend run is claimed.

## Stop for earlier integration failure / remaining work

VERIFIED: original #974 head `7428be7` run `40160014884` is terminal red in the
integrated writer workflow: `V1SmokeUITests.swift:1409`, second native export
after cancellation not detected. Its signed units, backend and D009 passed;
later broad UI/offline recovery/voice/macOS steps were skipped. Inspect that
artifact and fix the first red before publishing/integrating this task. #975's
separate run `40160039304` was still in broad UI at the last observation; this
does not waive #974's failure.

Not covered: connected interruption before insertion or before save completion;
historical results outside the 32-version read window; universal exactly-once
save semantics during concurrent uncertain server commits; unbound or precise
rewrite delivery; physical microphone/live quality; intended shipping backend;
external exported-file opening. These are not established by fixture proof.

Next: repair #974's actual hosted boundary, preserve its original head/history,
then bring that fix forward and finish this task's broader native checkpoint.
