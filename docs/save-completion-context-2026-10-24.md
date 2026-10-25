# T-1136 — A save receipt is not authority over a later page

## Reproduction and ownership

VERIFIED: local branch `codex/T-1136-save-completion-context` starts directly at
published parent `34b9bc50f508beb436c90240573dcc6619497d1f`. Runtime `111bc4d`.
The actual Studio model, canonical save client and durable outbox were exercised
with a held URLProtocol transport response: admit A's save, load/edit B, then
release A's confirmation. Before the fix the model selected A again. Focused
**0/1/0**, `/tmp/them-1136-completion-before.xcresult`, with explicit A-versus-B
assertion. This is not real-server or physical-phone late-response proof.

The existing model-owned `BackendMemoryAPI` is now injectable (as the later
original-project branch already permits) and also owns the version writes,
rather than mixing it with `.shared`. Default construction uses the same
canonical API, identity, auth refresh, request format and redirect guard. The
transport seam existed at the red checkpoint; receipt adoption was unchanged.
No backend route, provider adapter, credential or authorization bypass changed.

## Smallest coherent correction

- Capture the page's version, document identity and backend at save admission;
  reuse canonical auth/project/loaded-draft identity checks after suspension.
- Validate optional response project identities before accepting a receipt.
  A valid old save still retires its own durable request, but cannot change a
  later page's selection, saved base, text, dirty state, notices or recovery copy.
- A delayed failure/conflict updates or parks the original request, never B's
  editor or A's recovery from B's current text. Keep the retryable/parked states
  actionable; the Debug-owner404 fallback cannot abandon a taskless inflight row.
- Do not discard the newest captured waiting save when the old request stops
  following the current page. Persist it with its own owner/project/base; hold
  nonretryable/conflicted copies. Rebase only an actually following same-project,
  same-owner, same-base save against the exact acknowledged draft.
- Protect the earlier queued-behind path after its outbox await too. Persist
  successful local recovery before outline/revision awaits and recheck authority
  before applying subsequent notices. Empty-base equality uses exact UTF8.

The existing API, outbox, slot, conflict and recovery machinery remain canonical.
No new persistence framework or watched god-file growth.

## Evidence, including our fixture correction

- Red held-response case above: **0/1/0**, actual wrong selected project.
- First expanded cohort: **1/4/0**, `/tmp/them-1136-completion-fixed.xcresult`.
  Our refactor accidentally loaded B's intended edit as its saved baseline, then
  expected it to be dirty. This was a fixture error, not four product failures.
  Corrected it to make a real edit after loading a distinct baseline and added
  an explicit dirty precondition; product assertions were not relaxed.
- Corrected focused cohort: **5/0/0**,
  `/tmp/them-1136-completion-actual-edits.xcresult`. Covers old success,503,
  conflict, a newer saved version of A, and B's genuinely waiting manual save.
- First broader checkpoint: **958/0/0**, `/tmp/them-1136-units.xcresult`, Mac0.
  It predates the final retained-request edge correction, not final proof.
- Final runtime: full signed **959/0/0**,
  `/tmp/them-1136-final-units.xcresult`, including the six focused cases;
  macOS scaffold build **exit0**, `/tmp/them-1136-final-macos.log`.
- D009 and `git diff --check`: pass. Backend production source, scripts,
  Packages and all five watched files unchanged from `34b9bc5`.
- Current connected writer/native Files cancel/re-export/Save/exact relaunch
  **1/0/0** with canonical runner success:
  `/tmp/them-1136-writer/writer-loop-ccc4bfdf-f598-44bf-9d45-1853bda0d76f.xcresult`.
  This uses authenticated local HTTP/storage and intercepted providers, not the
  URLProtocol model transport. Required connected recovery **3/0/0**:
  `/tmp/them-1136-recovery/them-save-recovery-dqK9hV/recovery-ios.xcresult`;
  offline relaunch/reconnect, real401/auth refresh/fresh bearer and conflict-choice
  recovery pass. No fresh unchanged full backend suite was run.

All native runs erase only owned simulator
`7F1A14C1-B379-4417-AFE9-331810CD9CD3`, use signing on, iOS26.2/Xcode26.3,
DerivedData `/tmp/them-1127-clean-dd`. Existing Swift6 warnings remain.
No paid provider request, deployment or private key read.

Permanent local archive (red, fixture correction and successful checkpoints):
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1136-20261024.oAM0qr/`.

## Residuals and integration

This does not prove every possible storage fault, app crash, live-sync ordering,
or account transition during every route. The six negative cases use intercepted
transport; real authenticated local writer/recovery workflows are separate.
No claim of live microphone/model quality, physical-phone, intended shipping
backend, external file opening, universal exactly-once delivery or main readiness.

Keep the original PRs and all local T1130/T1133/T1135 histories. Original parent
#974 remains `34b9bc5` remotely with its hosted gate running; original child #975
remains `80a2f66`. Do not restart hosted CI for each local adjustment. Finish the
coherent checkpoint, inspect the existing hosted handle, then normally integrate
and publish this shared-parent fix with fresh checks and unchanged protections.
Production/paid-call holds and Zora's separate backend T1131 lane remain intact.

Exact authored files: `them/ScreenplayStudioViewModel.swift`,
`themTests/ScreenplaySaveCompletionContextTests.swift`, this document and
`TASKS.md`. Runtime is committed; the original published parent has deliberately
not been advanced during its still-active hosted run. This is a local checkpoint,
not a new remote PR, original-child advance, main merge or complete-product claim.
