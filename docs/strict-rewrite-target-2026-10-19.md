# Strict native rewrite targets — T-1037

Parent: `b6eb73fc6a26785eb813db32c1bbd5c825a01c08`.

## Reproduction and correction

The two native resolvers could replace whatever occupied an old line range,
search for a different occurrence, or turn an unresolved rewrite into a cursor
insertion. Extracted the resolution policy, wired it into both editors while
preserving that behavior, then ran the failing-first checks: signed **1 pass /
2 fail /0 skip**, native exit65, actual summary read. The valid case passed;
unmatched line and missing-target cases failed. This is a resolver reproduction
through the shared production owner, not a before-run physical-phone observation.

Capture an exact draft identity plus project and sign-in intent with the
replacement target. Resolve only the verified original range, never another
occurrence or current selection. Preserve valid partial-word selections by
retaining their original UTF-16 range, validated inside their original lines.
macOS now receives the document ID already supplied to the iOS editor.

Both native dispatchers check before mutation. A continued stream can change
its own rendering, but must own the same target and still match the last text
it rendered. Later writer edits stop it without restoring the older base.
Rejected requests are acknowledged; matching stale targets are cleared and
the existing preserve-current-draft cancellation path stops old work. Deferred
feedback/cleanup is guarded by request ID and runs outside view updates.
Ordinary insertion with no rewrite target keeps its existing behavior.

## Evidence and exact scope

- Before bundle: `/tmp/them-1037-before/v1-ui-smoke-local-1-3026.xcresult`.
- Initial focused verification did not execute: new test tuple inference
  caused a compile failure. Fixed its explicit mode types; not an app test pass.
- Intermediate full signed units **911/0/0**, native exit0, erased owned
  Pro26.2(23C54), actual summary read. Tree
  `bff0ae71ca8746b58f11e9e968acd99b50f37f3d`. This was before adding valid
  partial-selection support; do not relabel it as final full-unit proof.
- Final focused **19/0/0**, native exit0, actual summary/important test nodes
  read. Includes the real UIKit coordinator, eight stale writing-start modes,
  valid own streaming continuation and partial selection, manual-edit/late
  chunk/no-rollback, and matching-request acknowledgement/cancellation/feedback.
- Final source frozen as tree `8a4fd47205bd2998acc0a738d46f8c3d6789222a`.
  Relevant Node20.20.2 god-gate contracts **7/0/0**, native exit0, external
  network disabled. Backend code unchanged; no repeated full backend run.
- D009 vs freshly fetched original parent: live-draft bridge -45 lines,
  other protected deltas0. Whitespace pass.
- Final signed writer/save/native export/relaunch UI **1/0/0**, actual summary
  read. Final macOS scaffold **BUILD SUCCEEDED**; serialized command exit0.
  This UI flow enters text manually and checks app/server saves/export, not
  spoken generation or a new model-driven rewrite. macOS is compile-only.
- Runtime commit `c67e97760439b69c6d75e1a8ff52d73642a4d7cf` matches the final
  frozen tree for all runtime/tests; only task/proof records change later.

Intermediate bundle: `/tmp/them-1037-full-units/v1-ui-smoke-local-1-4644.xcresult`.
Final focused: `/tmp/them-1037-final-focused/v1-ui-smoke-local-1-5451.xcresult`.
Logs: `/tmp/them-1037-before.log`, `/tmp/them-1037-focused.log`,
`/tmp/them-1037-full-units.log`, `/tmp/them-1037-final-focused.log`,
`/tmp/them-1037-gate-contract.log`, `/tmp/them-1037-writer.log`,
`/tmp/them-1037-macos.log`.
Writer bundle: `/tmp/them-1037-writer/them-studio-ios-writer-loop/run-1G7Q9C/writer-loop.xcresult`.
Private proof: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1037-20261019.nyZJIk/`.
Completed before/intermediate/final/writer bundles were cloned and byte-compared;
logs and both frozen source-file archives are retained. No screenshot assertion.

## Remaining boundaries

This is local exact-target editing safety, not proof of speech recognition,
model intent/line interpretation, every writing interaction, macOS native UI,
or the shipping physical-phone journey. Recovered-page application still needs
explicit preview, durable stable save identity and acknowledgement through the
existing Studio/save owners. Original #962 stays held at f5e746c2; no main or
original PR advance, paid call, production setting or accepted decision change.

Files: them/ScreenplayLiveDraftBridge.swift,
them/ScreenplayReplacementResolver.swift,
them/ScreenplayStudioKeyboardSaveAccessory.swift,
themTests/ScreenplayEditorBindingIntegrationTests.swift,
themTests/ScreenplayReplacementResolverTests.swift, TASKS.md and this record.
