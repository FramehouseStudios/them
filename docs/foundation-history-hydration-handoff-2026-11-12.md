# Combined foundation and restored-history handoff — 2026-11-12

## Result and source

VERIFIED: local runtime commit `8e4518c2dbb0f03051ed3a6ab55b3724431a8453`
fixes the reproduced restored-history sync handoff. The original unchanged
`test_backend_project_restore_loads_seeded_screenplay_session` passed **1/0/0**
on the erased task-owned iPhone simulator, signing enabled and a real local
`REQUIRE_USER_AUTH=1` backend. No provider calls were permitted. This proves
that case, not the physical-phone journey or complete offline recovery.

The parent `8fbb15bf92e46b83ac186ef3fe9c534063ad3722` is a preserving merge of
editor `c6ec7720` and inspector `8688c30f`, retaining original #964 `831de836`
and every incoming commit. Source is preserved on scoped branches and in a
private Git bundle; no original PR head or main was advanced in this pass.

## Cause and smallest fix

The history observer called `persistStudioAskNoteHistory` before
`refreshAcknowledgedDiffState`. Restored history could therefore be written
locally while backend persistence was deferred by acknowledgement/reopened
hydration flags. Refresh then cleared the flags without another history
change to schedule the missed server write. The failing snapshot had local
history 3 and backend history 0.

Move the same persistence call immediately after the existing refresh. Keep
one canonical scheduler, the same captured history/project key, synchronous
callback, local write and 24-entry limit. No new state, framework, retry or
network path was added. Luna's bounded source challenge found no intervening
project/history mutation or await. Existing asynchronous auth isolation was
not independently re-proven by that review.

## Exact proof and retained failures

At combined parent `8fbb15bf`, before the one-call correction:

- Node **20.20.2**, full backend: **2,752 passed / 0 failed / 2 skipped**.
  Skips: real-Postgres prefix test (no DATABASE_URL); explicit talk page-write
  preview/sync skip. Cached locked dependencies matched 136 package versions.
  Docker networking was disabled; tracked source remained unchanged.
- Full signed iOS units on erased owned `81F0FF38-9DAD-4011-907B-357DFADD094C`:
  **655/0/0**.
- Original authenticated writer workflow: **1/0/0**; actual local backend,
  saved-version/export/relaunch contract. Its explicit Save-tap fallback
  activity did not occur. Synthetic typed input does not establish speech.
- Full original V1 class, plus the incoming inspector-edge case: **29 passed /
  3 failed / 6 skipped** (38 total), native exit 65. Enabling the real 31337
  fixture exposed project-history restore and both offline-save recovery
  failures. Typing, inspector navigation/edge and voice-fault case passed.
- V1 skips: three cross-platform scenarios, dedicated integrated writer
  scenario (proved separately above), two-device live draft, writer-block
  rescue. These were not silently counted as passing.
- Canonical offline quality gate passed. Initial image lacked curl and failed;
  that tooling failure is retained. Corrected cached Node20 image passed;
  product/tests/assertions unchanged, paid gates disabled.
- Required CI provider/merge-safety contract: **18/0/0**, Node20/network disabled.
- macOS scaffold compile: **exit 0**, canonical Mac Scaffold Debug flags.

At runtime `8e4518c2`, only the focused unchanged restore case was rerun:
**1/0/0**. Full parent numbers above are inherited evidence, not a newly run
full suite on this Swift change. The two residual original offline-save cases were then run once: **0 passed /
2 failed / 0 skipped**, native exit65, both at the initial queue assertion.
The history correction does not repair those paths. No assertions were weakened
or unchanged broad suites repeated; blocked provider requests remained0.

D009 versus fetched original #964 `831de836`: index 33,626 (accepted early-stack
exception), Studio -15, bridge -35, Root/Memory/index zero growth. The ordering
change itself changes no file's line count. `git diff --check` passed.

## Current GitHub, deployment and remaining work

Luna refreshed GitHub at 2026-11-13 01:14 UTC: main remains `78b8c94f`; original
#964 is draft at `831de836` (Quality red, Backend/D009 green, prior approval
dismissed). Original #904 is draft at `909f9e90`, based on the actual #964
branch at `831de836`, with merge conflicts and no review. Its old green run
is not current-base integration proof. Strict three-check protection,
one genuine approval, stale dismissal and administrator enforcement remain.

TLS health observation at 01:19 UTC: `https://api.them.io/healthz` returns
HTTP 302 to `https://introvert.com/?domain=them.io`. Production hold remains.
No production configuration, credentials, approval or main was changed.

Original #904 already contains queued-hydration/recovery work, fixture
readiness completion, operation-scoped offline failure and whole-draft
assertions. Preserve and reconcile that work rather than reimplement it.
Zora also verified that a DEBUG launch acknowledgement can stay masked by
NSArgumentDomain; that standalone Foundation proof does not establish a
shipping-path defect or explain every current recovery failure.

No physical iPhone, real microphone/model response, intended shipping backend,
or external-file-open journey was established. No paid model calls occurred.

## Evidence and coordination

Completed combined checkpoint: private
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1445-foundation-combined-20261112/`.
Its artifact archive was read back against the manifest: **2,861 files,
0 mismatches, 0 missing**. Archive SHA-256:
`7ca4e0c253cfa03a5e3f89d7f30dc1304ee64e7f1766bc1167ff778b829e6578`.
The preserved Git bundle requires published `831de836` as its prerequisite.

Actual participants: Jarvis executed/fixed; Zora investigated recovery and
DEBUG launch state; Luna checked GitHub and challenged the scoped fix.
Einstein, Howard and Alfred were idle to avoid duplicating ownership or
native runs. Agent source review does not substitute for a human approval.

Luna prepared the next preserving merge in
`/Users/halfmutantfilms/io.them-worktrees/codex-T1447-904-history-handoff`:
HEAD `b2b7ab24`, incoming `8e4518c2`, common base `831de836`. It is deliberately
uncommitted with nine conflicted paths /21 hunks. Raw conflicts and23 stage
blobs are retained at `/private/tmp/them-t1447-904-history-handoff/manifest.json`
(SHA256 `6644687258e18fe1b61e3e855d1ff1b731cf08c68f4eaa17475ef198b9ab68d4`).
No conflict was resolved wholesale and no backend change was introduced.

Focused proof is retained privately in
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1446-history-hydration-handoff-20261112/`.

Next: reconcile those nine original #904 conflicts, preserving both histories
and the verified history ordering fix; then address/prove the first remaining
recovery failure before claiming an integrated writer build.
READY FOR CONTINUE; full-product completion remains unproved.
