# T-1135 — Place the deferred-save owner fix at the earlier shared parent

## Why this precedes child integration

VERIFIED: the combined recovery descendant reproduced a wrong durable project
destination with the actual Studio model. It adopted a page for A, selected B
before its deferred task started, then queued A's scene under B. The request
was constructed after deferral from the later selected project. The focused
baseline was **0/1/0**, with the explicit A-versus-B assertion retained in
`/tmp/them-1135-deferred-owner-before.xcresult`. This is an isolated local queue
reproduction, not a claim that an actual writer's server draft was overwritten.

Original earlier parent #974 at `bb005cd8` has the same deferred selection read.
Do not leave the safety correction only in the newer child. Port the small
capture/hold seam, not the child's continuation feature or DEBUG crash hooks.

## Correction and compatibility

- Capture the existing `DraftSaveRequest` before creating the Task: original
  owner, project, exact draft, base/version, intent, notes and request ID.
- When the task starts, check cancellation, current auth context, both selected
  project identities, actually loaded draft project and unchanged saved base.
  A changed context parks the captured request in the canonical outbox without
  writing it through the newly selected project or replacing the current page.
- Reuse that seam for the existing programmatic-autosave Task too.
- Reject a committed page from a previous account before modifying the editor.
- This earlier helper needs one additive private optional request-ID argument:
  a committed page keeps its existing UUID; other saves retain generated UUIDs.
  No HTTP shape, public endpoint, storage format, new auth/store or framework.
- Use this parent's actual selected/loaded fields. The later child's equivalent
  `isSelectedProjectDraftLoaded` property is not silently imported here.

Only runtime file `them/ScreenplayStudioViewModel.swift` and the two regressions
in `themTests/ScreenplayDraftSaveOutboxTests.swift` change. No later project-load
or recovery-plan code is imported. All watched god files, backend production
source, scripts and Packages remain byte-unchanged from `bb005cd8`.

## Evidence boundaries

The preserved combined branch `codex/T-1135-deferred-page-save-owner` at
`ef62fb8` contains runtime `2b13d98`, full signed **960/0/0**, focused save class
**39/0/0**, actual before-save-admission recovery **1/0/0**, newer-writer / lost
acknowledgement recovery **1/0/0**, Mac build0 and D009/diff pass. Those are
combined-descendant results, not results for this earlier parent.

Earlier-parent runtime `f7eba21` passes full signed units **953/0/0**,
`/tmp/them-1135-parent-units.xcresult`, and macOS scaffold build **exit0**,
`/tmp/them-1135-parent-macos.log`. Its unchanged canonical writer workflow passes
**1/0/0**, including save, actual Files cancel/re-export/Save and exact relaunch:
`/tmp/them-1135-parent-writer/writer-loop-96defbbc-d5fd-4d90-94f0-f311cf3880b0.xcresult`.
Required signed offline recovery **3/0/0**:
`/tmp/them-1135-parent-recovery/them-save-recovery-Ayjnck/recovery-ios.xcresult`.
The unchanged reconnect, real401/refresh/fresh bearer, and conflict-choice
relaunch workflows pass. D009/diff pass. All terminal native evidence is archived
under the same task archive; the writer and recovery bundles have distinct
`parent-writer/` and `parent-recovery/` directories.
All live provider requests remain disabled. UI evidence uses real local auth,
HTTP and storage with intercepted providers, not microphone or live-model proof.

Proof archive for the reproduced failure and combined checkpoint:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1135-20261024.KooJKq/`.

## Residuals and next

This is the before-deferred-task boundary, not a proof of every project/account
change during a later HTTP or outbox await. A held-request disk failure retains
the already-written original local recovery copy, but cannot claim a server
save. Unbound initial-project promotion stays with its existing owner.

Do not claim live quality, physical-phone, shipping-backend, external file-open,
production or main proof. Earlier parent remains draft with review/check holds;
fresh changed-head checks are required after a normal scoped push. Preserve
original child #975 and the separate T1130/T1133/T1135 histories. Zora owns the
separate backend T1131 lane. Production and paid-call holds are unchanged.

Freshly read main remains `78b8c94f43b4a11f18c2e61df556b9cd7370e735`; original
parent remote was `bb005cd8` immediately before publication. Its run40165310208
passed backend, D009, units and writer and was still in broad UI at the last
snapshot. That is not a whole-gate pass. This is a changed root-cause fix, not
an unchanged retry or waiver of the existing gate. No fresh full local backend
run is claimed for unchanged backend runtime source.
