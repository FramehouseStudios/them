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
The two captured hosted draft representations are85 bytes each and byte-equal,
SHA25674b1a4780aceb0790a8719932f7c9f4820f31ab7d578c8fa756b5d49549c2283.
Only hashes/lengths were emitted; these are fixture representations, not a new
production-data measurement.

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

## Earlier-parent integration checkpoint

VERIFIED: direct source comparison shows `performDraftSave` byte-identical at
9b1c279 and80a2f66; outbox/coalescing files are also unchanged between them.
Apply only the scoped source commit to original #974, not the child's unrelated
project-recovery changes. Parent runtime:
`1eb6b7d02a1f793932fb835f05d7e608a6ad6eb9`, descendant of9b1c279.

Fresh parent proof, same erased owned simulator/signing on:

- Full signed units **951/0/0**, `/tmp/them-1134-parent-units.xcresult`.
- Required recovery **3/0/0**,
  `/tmp/them-1134-parent-recovery/them-save-recovery-DcQ8N4/recovery-ios.xcresult`.
  The parent lacks the child's later hydration fences; this run is not borrowed
  from the child result. Actual expired401/refresh/fresh-bearer201 and single-save
  assertions stay enforced.
- Unchanged writer/native cancel/re-export/Save/relaunch **1/0/0**,
  `/tmp/them-1134-parent-writer/writer-loop-d8608f8b-2c07-4e04-a0ea-a541af1bcbc8.xcresult`.
- macOS scaffold build exit0 (`/tmp/them-1134-parent-macos.log`); D009/diff pass.
- Backend/scripts/Packages byte-unchanged from9b1c279. Node20 backend2964/0/4
  remains inherited hosted evidence, not another local backend run. No paid call.

Documentation carry-over conflicted only between T1132/T1134 task insertions;
both were preserved. Native/runtime source stayed1eb6b7d throughout proof.

Permanent archive:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1134-20261024.ynIpvK/`.
Use `auth-baseline/`, `recovery-fixed/`, `parent-recovery/`, `parent-writer/`
for same-named bundles. A first same-basename copy was moved to
`mixed-copy-not-proof.xcresult`, retained but NOT evidence. Both intact original
baseline/fixed bundles were recopied separately and byte-compared successfully;
no original was moved/deleted. Parent bundle/logs also remain at their /tmp paths.

Next: normally advance original #974 with these scoped changes and fresh hosted
checks, then preserve-merge into original #975/T1130. Do not merge/force/squash or
deploy. T1130 remains locally preserved at325cfb5 with955/0/0 and stronger newer-
writer-words recovery proof; T1133 at6fe19b1 proves before-insertion1/0/0 but its
save-admission probe is still unrun. Neither is hidden in the parent correction.

Not newly covered: hosted iOS26.5 on the corrected save head, full broad V1 on
that head, physical phone/live provider quality, intended shipping backend,
external exported-file opening, universal exactly-once saves or general metadata-
only edit persistence. Fresh checks and independent review still gate integration.

Exact source files: `them/ScreenplayDraftSaveOutbox.swift`,
`them/ScreenplayStudioPersistencePolicies.swift`, `them/ScreenplayStudioViewModel.swift`,
`themTests/ScreenplayDraftSaveOutboxTests.swift`, `themUITests/V1SmokeUITests.swift`.
Documentation: this report and `TASKS.md`.
