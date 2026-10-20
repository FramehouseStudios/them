# T-1018 — Correct the fresh-server-choice recovery contract

Original #962 head87a62a6c: hosted39349393133 completed failure in signed
offline-save recovery,4 passed/1 failed/0 skipped, iOS26.5. Signed units867/0/0,
V1 UI29/0/15, and both writer scenarios1/0/0 each passed. Voice/macOS steps
were not reached. Main and original heads were not advanced after the red.

The failure was at the wait before Load Server, requiring exactly one parked
entry. Recorded app accessibility states prove local writer text remained,
the correct conflict appeared, then counts changed from queued2/parked0 to
queued0/parked2. The pre-failure recording frame also shows the conflict and
local marker. Initial post-failure screenshots showed teardown/launch screens,
not the state during that wait; the timeline and recording were inspected
before drawing a conclusion. No launch-deadlock claim is supported here.

The same exact-head case passed alone locally1/0/0 on erased signed task-owned
Pro11CF5EFB/iOS26.2, at
/tmp/them-1018-fresh-server-choice/them-save-recovery-4toCyJ/recovery-ios.xcresult.
This does not erase the hosted failure or prove a harmless flake.

## Correction

ScreenplayDraftSaveOutbox.retainConflict deliberately preserves every immutable
copy in a conflict chain. Requiring one copy is not the Load Server contract.
The origin/content distinction of the second hosted copy is not proven; do not
delete or coalesce it merely to make a count pass.

The test now requires the correct selected/conflicted project, exact v2 server
head, one or more parked copies, zero queued/inflight saves, unsaved writer
state and the local marker before choosing. It still requires exact fresh v3
words, no local marker uploaded, active v3 and zero recovery entries after the
choice; zero recovery entries must also survive relaunch. It additionally
requires the server version-ID set to be precisely seed/v2/v3: no extra UI save.
Timeouts, skips, runner retries and runtime code are unchanged.

Failed waits now attach only project/version IDs, counts, flags and a draft
fingerprint/length, not screenplay text, conversations or credentials.

## Proof and limits

VERIFIED changed five-case signed recovery run5/0/0, exit0, erased task-owned
Pro11CF5EFB, signing on; authenticated loopback backend, no model calls:
/tmp/them-1018-recovery-contract/them-save-recovery-VMikFt/recovery-ios.xcresult.
Actual summary read. The local harness ran host Node24.19.0; this is not a new
Node20 backend regression run. Exact runtime source remains87a62a6c. D009 all
five deltas0 against that original head; whitespace pass. No new full unit,
backend, macOS, physical-phone or shipping-backend proof claimed.

Private evidence:
/Users/halfmutantfilms/io.them-worktrees/_proof/T-1018-20261019.6CxKO9/.
Hosted full artifact was downloaded to
/private/tmp/them-962-39349393133.XVXf1s/; its failed bundle, diagnostics and
pre-failure frame were inspected, not replaced by a retry.

Files: themUITests/V1SmokeUITests.swift, TASKS.md, this document.
Branch codex/T-1018-conflict-relaunch-diagnosis preserves original87a62a6c.
No main merge, original-head update, replacement PR or production deployment.
Fresh hosted proof is still required before advancing the next original PR.
