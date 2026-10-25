# T-1135 — Capture a deferred page save before the selection changes

## Reproduced failure and smallest fix

VERIFIED: on preserving combined checkpoint `6ca496f`, the actual Studio model
adopted a committed scene for A, then selected B before its deferred save task
ran. An isolated canonical outbox containing B's earlier pending save received
A's scene under B's project ID. No HTTP or paid provider was needed to prove the
wrong durable destination. Focused regression **0/1/0**:
`/tmp/them-1135-deferred-owner-before.xcresult`; assertion expected
`page-owner-a` but received `project-1`.

The task called `saveCurrentDraft` after deferral, so `makeDraftSaveRequest`
borrowed the later selection. Runtime `2b13d98` captures the existing immutable
request synchronously, including owner, project, base, exact draft and original
committed-write UUID. Its deferred admission checks current owner, loaded
project, version and cancellation. A changed context parks that same request
in the existing outbox without submitting it or modifying the other page.
The analogous programmatic-autosave task reuses the same captured-request seam.
No parallel save store, auth mechanism or request format was introduced.

Page adoption also rejects an obsolete account context before changing the
editor. The separate account regression passes; it was not independently run
red before this change. The DEBUG/loopback save-admission interruption now sits
at canonical submission, so capturing the request does not bypass the existing
crash probe. Unbound promotion still owns project creation; absent bound save
requests do not manufacture a destination.

## Preserved integration, not replacement work

Branch `codex/T-1135-deferred-page-save-owner` descends from `6ca496f`:

- `3d2e8d4` preserve-merges published parent `bb005cd8` into original local
  T1130 `325cfb5`, retaining original child #975 `80a2f66` and all ancestors.
- `6ca496f` preserve-merges T1133 `6fe19b1` interruption probes.
- No source merge conflict, squash, force push, replacement PR, main mutation,
  production change, secrets access or paid provider call.

Before the T1135 source change, that combined tree passed the formerly unrun
before-save-admission journey **1/0/0**, and the newer-saved-writer-words / lost
acknowledgement journey **1/0/0**. Both use actual authenticated local HTTP and
intercepted ASR/chat/TTS **1/2/23**, not microphone or live-model proof.
Their bundles are `/tmp/them-1133-combined-save-admission.xcresult` and
`/tmp/them-1134-combined-newer-words.xcresult`. Mac build also passed there.
These preceding results are not falsely relabeled as T1135 UI proof.

## Current proof

- Runtime `2b13d98`: signed save-outbox class **39/0/0**, including the actual
  wrong-project regression, stale-account rejection, exact acknowledged-autosave
  exclusions, failed disk acknowledgement and existing recovery cases.
  `/tmp/them-1135-deferred-owner-fixed.xcresult`.
- macOS scaffold build **exit0**, `/tmp/them-1135-macos.log`.
- Full signed combined unit checkpoint **960/0/0**,
  `/tmp/them-1135-combined-units.xcresult`, same runtime `2b13d98`.
- Current-runtime before-save-admission recovery **1/0/0**,
  `/tmp/them-1135-save-admission.xcresult`: actual queued response, inserted
  page, refusal before durable save admission, relaunch/project switch, one
  saved scene, exact native-editor bytes and unchanged other project. Local
  authenticated HTTP; intercepted ASR/chat/TTS **1/2/23**. The hook remains
  effective after moving it to canonical submission.
- D009 and `git diff --check`: pass. All five watched files unchanged versus
  parent `bb005cd8`; backend production source, Packages and scripts unchanged.
- Current-runtime newer-writer acknowledgement recovery **1/0/0**,
  `/tmp/them-1135-newer-words.xcresult`: the original correlated save remains
  historical after a newer writer edit; finishing the retained acknowledgement
  adds no version, preserves the newer exact words and leaves B unchanged.
  Intercepted ASR/chat/TTS **1/2/23**, not paid/live proof.

Native proof uses an erased task-owned simulator
`7F1A14C1-B379-4417-AFE9-331810CD9CD3`, iOS26.2/Xcode26.3, signing on,
DerivedData `/tmp/them-1127-clean-dd`. Existing actor-isolation warnings remain.
Local UI orchestration uses Node24.19.0. No fresh full backend run is claimed
for a native-only runtime change; parent hosted Node20 evidence is separate.

## Not covered / next

This proves request capture before the deferred task starts, not every context
change during a later HTTP or outbox await. A failed held-request disk admission
still relies on the already-written original local recovery copy; it must not
report a server save. No claim of universal exactly-once delivery, physical
microphone behavior, live response quality, intended shipping backend readiness,
external exported-file opening, main integration or release completion.

Permanent archive, including retained red and earlier combined journeys:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1135-20261024.KooJKq/`.

The earlier-parent fix is now normally published in original #974 at `34b9bc5`
(runtime `f7eba21`): signed953/0/0, writer/native export/relaunch1/0/0, required
offline recovery3/0/0, Mac0 and D009/diff pass. No T1130 continuation or T1133
hooks were imported into that earlier parent. Its fresh required run40167414308
was pending at the last observation, not a green check claim.

That parent is now preserve-merged into this local combined branch. The single
native conflict was the equivalent loaded-project guard: keep the already-proven
child's canonical property, which checks selected ID, selected summary and loaded
draft ID. TASKS consolidates both evidence scopes. Direct
`git diff --exit-code ef62fb8 -- them themTests themUITests backend scripts Packages`
passes: runtime and tests remain byte-identical to the proven combined source.
Only task/evidence documentation changes, so there is no unchanged native rerun.

The combined checkpoint is locally proven within the scopes above. No standalone
writer/export, three-case offline suite, full backend or hosted suite was rerun
on this combined descendant; the parent writer/recovery proof is separate.
The earlier hosted gate must clear before advancing original child #975, which remains
`80a2f66` remotely with its red hosted result retained. Do not waive those checks
because local descendants pass. Zora's backend T1131 remains a separate lane.
