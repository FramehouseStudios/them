# T-1051 — Put recovered-writer authority at the first red parent

Original #904 starts at2a10365f9d52c2fa9cd2b8a8558cbd09dc5224d0,
based on original #964. Current hosted39406112568/job118572329857 fails
test_screenplay_save_outbox_refreshes_auth_and_resolves_stale_conflict_once
at Swift1888. Original child #919 ce04777c fails the same recovery case at
Swift1896 in39406648854. Do not land a child above that red parent.

Isolated codex/T-1051-parent-recovery-authority ports only implementation
4abd517 as90ba102. Both are two-file corrections; original heads/history
remain preserved. Exact git diff of ViewModel and DraftRecoveryTests between
both original heads is empty, so the characterized authority defect exists
at this same earlier boundary. No replacement PR, squash or main merge.

## Confirmed defect and small fix

Bridge preferred-version hints are shared context, not canonical receipts
for recovered manual writer words. Actual-model characterization at the
identical earlier source0/2/0 shows hints retiring local base/dirty state
before competing canonical hydration, and accepting unresolved conflicts.
Source correction reuses preserved0c1afb1 guard instead of implementing a
second save policy. Explicit recovery calls existing noteManualDraftEdit
to establish writer authority, stop remote following and persist the draft.
Remove the duplicate store write; genuine generated-page ack stays intact.

Existing hydrateDraft method becomes internal only to exercise its real
production transition; no duplicate hydration logic or new runtime state.
New tests keep full exact-text/base/conflict assertions and a positive
generated-page acknowledgement. XCTest methods use the existing async
task-context pattern: synchronous model release produced the separately
tracked Swift26.2 allocator crash, not a reason to drop any assertion.

## Evidence boundary

The child correction executed full signed637/0/0, both unchanged recovery
flows2/0/0 and macOS compile0 before this port. Its earlier full635/2/0
teardown crash remains red history. Native node24.22.0 drives the disposable
auth-required recovery backend with fake provider key; no paid model calls.
VERIFIED parent-specific full signed units634/0/0, native exit0; actual
owned375-point SE E8998A6B/iOS26.2/23C54 summary read:
`/tmp/them-1051-units/v1-ui-smoke-local-1-51575.xcresult`.
Both unchanged real signed recovery scenarios2/0/0, native exit0; same
freshly erased owned device:
`/tmp/them-1051-recovery/them-save-recovery-j0TD4q/recovery-ios.xcresult`.
These are actual parent results, not borrowed child counts. Logs:
`/tmp/them-1051-units.log`, `/tmp/them-1051-recovery.log`.
Canonical macOS scaffold compile completed native exit0 after recovery;
`/tmp/them-1051-macos.log`. Existing actor/deprecation warnings remain.

Retained complete parent unit/recovery bundles and logs:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1051-20261020.2KseZq/`.
Compared with frozen child proof, both changed source hashes are identical.

D009 vs the fetched actual #964 base: Studio -4, other four deltas0.
The first local invocation lacked that base ref and printed only absolute
sizes; that was not accepted as a measured passing comparison. Fetch the
exact remote branch and re-run before claiming deltas. Existing original
#969/118920a already owns the fail-closed missing-base correction; preserve
that separately rather than duplicating it here. Whitespace passes.

Publication: normal fast-forward of original draft #904, original2a10365f
remains an ancestor, base stays original #964. Then preserve-merge this
updated original parent into #919. Require new exact-head hosted gates
and independent review; main/production unchanged. Source90ba102 contains
only the exact characterized two-file correction, not the later product stack.

No backend/scripts/dependency/provider/UI-test change. Retained Node20
backend2749/0/2 and scripts224/0/0 cover the identical backend/scripts source,
not a fresh run after this Swift-only port. No physical-phone, production
or hosted26.5 fix claim. Fresh exact-head hosted checks and independent
review remain required for each original PR. Production hold unchanged.

Exact files: them/ScreenplayStudioViewModel.swift,
themTests/ScreenplayStudioDraftRecoveryTests.swift, TASKS.md, this document.

Adversarial scope: recovered text/base/manual state and unresolved conflict
must survive a shared version hint; uncontested generated-page ack remains
allowed. Do not change auth identity guards, retry original failures without
a source change, remove queues to satisfy counters, or weaken recovery text
assertions. Universal receipt identity, older-runtime synchronous-client
deallocation, shipping infrastructure and actual microphone/export journey
remain separate gaps, not certified by these tests.
