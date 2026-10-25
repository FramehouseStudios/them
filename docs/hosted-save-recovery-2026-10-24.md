# T-1134 — Port acknowledged-autosave dedup into the current recovery stack

## Exact failure, not a guessed data-loss claim

VERIFIED: original #975 head80a2f66, run40160039304, passed units, writer,
broad UI, backend and D009, then offline recovery **1/2/0** failed. Voice/Mac
steps were skipped. The native bundle also reports SIGTERM; its precise cause
is not independently established here.

Auth-refresh case: two matching saved versions, source `studio_manual` followed
by `studio_autosave`, with different client request IDs. Conflict-relaunch case:
the failure snapshot still has87 writer characters, the correct conflict/project
and dirty state, but **two** parked copies instead of the test's required one.
Do not describe that predicate failure as proof that words disappeared.

Actual artifact260,514,303 bytes,5123 paths checked for traversal/absolute paths/
symlinks before extraction:
`/tmp/them-1134-hosted.0jXgeF/Users/runner/work/_temp/them-save-recovery-TIpJTU/recovery-ios.xcresult`.
Artifact code was not executed. Reports exclude screenplay and credential text.

## Reuse the preserved original fix

Original #962 runtime1ffa52e already fixes the same acknowledged manual-save →
passive autosave duplication; docs f5e746c records its proof. It is NOT an
ancestor of80a2f66. Port only that canonical policy/outbox/save capability; do
not merge its unrelated later branch/framework or replace original PRs.

Task source `d511edae7b45671de335154c1da78dc3cb243eda`, branch
`codex/T-1134-hosted-save-recovery`, starts at the exact failed80a2f66:

- Only `studio_autosave`, empty notes, exact acknowledged UTF8 and the same
  nonempty version can be locally satisfied without a new server write.
- Manual saves, snapshots, conflict choices, meaningful notes, stale bases and
  byte-different whitespace/Unicode remain real work. Derived binding-only
  autosave bookkeeping is coalesced under the original policy; no new separate
  metadata-save contract is introduced.
- Actor acknowledgement removes only that request. It cannot retire another
  retained copy, and memory rolls back if atomic manifest persistence fails.
- Reuse the existing acknowledged revision-base text, retaining its raw bytes
  rather than a trimmed copy. Existing normalized dirty-state policy is unchanged.
- The current model lacks the later branch's authority helper; keep its existing
  auth and selected-project checks on the awaited acknowledgement instead of
  importing another authority framework.
- Conflict UI checks permit multiple immutable retained copies, but now require
  loaded+selected project, exact draft length/tail/full native text, the expected
  server conflict version, no queued automatic write, and post-choice cleanup.
  The existing no-premature-server-save/one-resolution-version assertions stay.
  Fail at the missing boundary instead of continuing through later UI actions.

The backend and all five watched god files are unchanged. The failed
`performDraftSave` region and complete outbox/coalescing files are shared with
earlier parent #974 head9b1c279 (direct source comparison). The correction must
therefore be applied to that earliest affected parent before advancing children.

## Proof on failed-head descendant

- Unchanged local auth-refresh baseline **1/0/0**, iOS26.2. This is timing
  evidence, not a waiver of the hosted iOS26.5 duplicate failure.
- Changed focused queue suite **37/0/0**, including exact-byte/source/base/owner
  exclusions, preserving another parked copy, and real disk-failure rollback with
  the old manifest restored/read by a fresh actor.
- Changed required connected recovery **3/0/0**: reconnect, real401→refresh→fresh
  bearer save, and conflict/relaunch/Keep Mine. Exact words and one server version
  checked. `/tmp/them-1134-recovery-fixed/them-save-recovery-YXgpeJ/recovery-ios.xcresult`.
- `git diff --check` and canonical D009 pass. No new full backend or full unit
  run is claimed for this first child-source checkpoint.

Signed canonical runner erased only owned simulator
7F1A14C1-B379-4417-AFE9-331810CD9CD3, Xcode26.3/iOS26.2, DerivedData
`/tmp/them-1127-clean-dd`. Node24.19.0 orchestration, isolated authenticated
loopback data and intercepted providers. No paid model/physical microphone proof.

Next: apply only the scoped source correction to original #974, rerun parent
integration proof, publish a normal descendant with fresh hosted checks; preserve
this task and T1130/T1133 histories. No main merge or deployment.

Exact source files: `them/ScreenplayDraftSaveOutbox.swift`,
`them/ScreenplayStudioPersistencePolicies.swift`, `them/ScreenplayStudioViewModel.swift`,
`themTests/ScreenplayDraftSaveOutboxTests.swift`, `themUITests/V1SmokeUITests.swift`.
Documentation: this report and `TASKS.md`.
