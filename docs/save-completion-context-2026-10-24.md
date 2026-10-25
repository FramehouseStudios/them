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

At the c4f245c checkpoint, original parent #974 was still `34b9bc5` remotely
with its hosted gate running; original child #975 remained `80a2f66`. Preserve
all local T1130/T1133/T1135 histories. Do not restart CI for each local adjustment. Finish the
coherent checkpoint, inspect the existing hosted handle, then normally integrate
and publish this shared-parent fix with fresh checks and unchanged protections.
Production/paid-call holds and Zora's separate backend T1131 lane remain intact.

Exact authored files: `them/ScreenplayStudioViewModel.swift`,
`themTests/ScreenplaySaveCompletionContextTests.swift`, this document and
`TASKS.md`. At that checkpoint the committed runtime had deliberately not been
published during the still-active hosted run. This was a local checkpoint,
not a new remote PR, original-child advance, main merge or complete-product claim.

## Preserving integration checkpoint

Local original-parent merge `8d519bd6284dccebd5058274e8724c63b9efe949`
preserves `c4f245c`; its entire tree is byte-identical to the separately proven
parent checkpoint. Remote #974 stayed `34b9bc5` until run40167414308 completed.
The later normal publication is recorded below; never publish the combined
branch as the earlier parent.

Combined merge `839a3c10cf8858fb4b9453c42d149ae2cbab8682` preserves that parent
and T1135 `f396c02`, including the original #975 `80a2f66`, T1130 correlated
recovery and T1133 interruption probes. Both merges were conflict-free. The
later branch's existing injected API already matches the parent dependency;
save receipt authority and stable plan request identities remain connected.

Combined full signed units **966/0/0**, `/tmp/them-1136-combined-units.xcresult`;
Mac build **exit0**, `/tmp/them-1136-combined-macos.log`; D009/diff pass.
Combined newer-saved-writer / lost acknowledgement recovery **1/0/0**,
`/tmp/them-1136-combined-newer-words.xcresult`: original correlated delivery is
confirmed without another save or append, newer exact writer words survive,
other project unchanged, exact editor relaunch. Real authenticated local HTTP;
intercepted ASR/chat/TTS **1/2/23**, not live quality. Before-save-admission
combined recovery **1/0/0**, `/tmp/them-1136-combined-save-admission.xcresult`:
retained inserted bytes survive relaunch/project switch, exactly one local
server save, other project unchanged and exact native-editor relaunch;
intercepted ASR/chat/TTS **1/2/23**. The parent959 and preceding combined960
remain distinct earlier source checkpoints. Combined writer/native export/
relaunch **1/0/0** with canonical runner success:
`/tmp/them-1136-combined-writer/writer-loop-2221612a-6008-4763-b665-ca1484d55891.xcresult`.
The actual Files-provider export `writer-loop-bf439633608d.md` is35 bytes,
matches `exportScreenplayToMarkdown` byte-for-byte, and contains the synthetic
marker exactly once. SHA256:
`01f0b0af38ec0478c5ed3e05b72d9d8170c27dcb1a69910d8901c2b22b207022`.
Its copy and all terminal combined bundles are preserved in the same archive.
The first case-sensitive filename lookup missed its lowercase filename; that
was not missing export data. Markdown is a projection, not the raw plain-text
marker plus newline; comparing the actual canonical projection passes.

HUMAN_INPUT_REQUIRED: CUA confirmed the Mac is locked. Manual unlock was requested
once; no credentials or bypass attempted. The outside-THEM preview is NOT proven.
Keep simulator7F1A14C1-B379-4417-AFE9-331810CD9CD3 and its export intact for that
observation; do not erase it for the next original-stack proof. Native workflows
are terminal. Use another newly task-owned simulator if further native proof is
needed before unlock. The required physical-phone journey remains separate.

Next: verify the two connected combined recovery boundaries (before save
admission, and lost acknowledgement after newer saved writer words), preserve
the exact result, then inspect the existing hosted handle. Publish only the
original-parent branch when appropriate; original #975 advances only after the
earlier gate clears. No repeated unchanged runs, main merge or deployment.

VERIFIED integration-path audit: original data fixes #766 and #770 merged on
October17, and both merge commits are ancestors of current main78b8c94. Original
#638 remains open/draft at6ad41171, based on main; #639 remains open/draft at
57225143, based on `claude/mentor-core-port`. Both original heads and main are
ancestors of this combined tree, not omitted or replaced. Their September22
red runs are stale; #638's old failed jobs have no executed steps, not fresh
code proof. Current Actions execution is established independently below.

The exact base of #974 is `codex/T-1124-page-settlement-integration`; an all-state
PR search for that head returns no PR. #973 is NOT its parent (its actual head
is the redirect-boundary branch). Do not infer dependencies from PR numbers or
create a replacement mega-PR for the rehearsal. Repair the protected landing
path using original #638 first, preserving its head and merging current main
without squash/force; retain original #639's base and follow-up commits.

Hosted run40167414308 at exact34b9bc5 has now completed SUCCESS for all three
jobs, including units, writer, broad UI, offline recovery and voice/Mac. Only
after that terminal result, normally published parent8d519bd (source tree
identical to proven parentc4f245c) through original #974, with unchanged base,
draft and protections. Fresh changed-head run40170181825 is active; no old green
result is relabeled as new-head proof. Original #975 remains80a2f66 remotely.
