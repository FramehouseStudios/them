# T-1027 — One passive recovery, one server version

## Verified failure

Original #962 at527c58d60f46d940da66484287a3fbbb51d56b8b remains draft/open.
Hosted run39357764973 completed red: signed recovery4 passed/1 failed/0 skipped.
`test_screenplay_save_outbox_survives_relaunch_and_reconnects_once` recorded
two versions instead of one: a manual save and a subsequent autosave, with
different request IDs. The recorded complete100-byte drafts are byte-equal;
both SHA256b56603588ff7e268f75f72c9ae753f2d83c009bd757332816c679a69e2088d7a.
Writer text is deliberately not reproduced here. Derived binding timestamps
and ranges differ; this is not evidence of different writer text.

Backend/D009 passed on that hosted head. Its actual downloaded summaries show
signed units867/0/0 and V1 UI29/0/15. The Quality Gate failed at recovery;
its later voice-fault/macOS steps were not reached. These parent-head results
are not a new full proof of this changed tree. Earlier green local proof does
not supersede the hosted failure. No retries or assertions were weakened.

## Root and smallest correction

Recovery can dispatch a manual save followed by a passive autosave with a
different request ID. Enqueue coalesces matching pending drafts, but after
acknowledgement the earlier entry is gone. Dispatch coalescing is same-source
and does not reject an autosave of already acknowledged text. Queue draining
and pending-save handoff advance subsequent bases after acknowledgement.
The hosted snapshots establish duplicate saved bytes/sources, not the precise
interleaving that constructed the later request. The regression deliberately
creates it after the first acknowledgement, beyond enqueue coalescing.

Extend the existing save-coalescing policy, not a second persistence system:
only `studio_autosave`, with empty notes, the exact acknowledged UTF8 bytes
and the same nonempty acknowledged version is already satisfied. Existing
auth/project/conflict guards still run. The local queue must persist removal
of that exact request before success; failure restores the in-memory entry.
This acknowledgement never retires another retained copy or rebases another
request. Explicit manual saves, snapshots, conflict decisions, meaningful
notes, stale bases and byte-different drafts are not suppressed.

Autosave's derived binding-only housekeeping is coalesced with identical
acknowledged text; this does not introduce a new independent metadata-save
contract. Explicit structural actions and imports retain their distinct save
sources. The existing conflict and server idempotency contracts are unchanged.

## Verification

The first new-test build failed because the fixture attempted to mutate three
immutable entry fields. Corrected by constructing that entry explicitly; no
runtime change or assertion relaxation was needed. Signed focused authority
suite then ran8 cases: the new combined scenario failed two assertions after
its explicit snapshot reloaded project state before the byte-change step.
Reorder that scenario so the distinct-byte autosave precedes snapshot reload,
and explicitly enqueue the duplicate after the manual acknowledgement (the
first fixture's simultaneous enqueues were already coalesced). Final signed
focused suite8 passed/0 failed/0 skipped on erased task-owned11CF5EFB, iOS26.2:
`/tmp/them-1027-save-dedup-final/v1-ui-smoke-local-1-75372.xcresult`.
Actual summary read; both failed attempts retained. Unchanged signed five-case
app recovery5 passed/0 failed/0 skipped, erased same task-owned Pro, signing on:
`/tmp/them-1027-recovery-ui/them-save-recovery-5ykCDq/recovery-ios.xcresult`.
Actual summary read, harness exit0. Covers reconnect/one exact saved version,
expired-auth/stale-conflict Keep Mine, delete-all, blank snapshot, and fresh
Load Server/relaunch. The actual UI test file is unchanged. Backend requires
user auth with isolated test storage and a dummy provider key; host Node24.19.0
orchestrated this run, not a new Node20 backend regression run.

D009 passes against freshly fetched original527c58d6: all five deltas0.
Whitespace passes. Backend source is unchanged. No new full backend suite,
paid model request, physical-phone proof or deployment is claimed.

Adversarial pass: exact Unicode/CRLF/whitespace differences, explicit snapshots,
notes, stale/empty bases, wrong owner, and preserving other parked copies are
covered by the focused cases. Existing conflict-choice/late-ack cases remain
green. Queue-persistence rollback is implemented but not fault-injected by the
new cases. Cross-device/provider/production failure behavior is not newly
proven. Local iOS26.2 success does not establish hosted iOS26.5 success.

## Evidence and boundaries

Hosted artifact: `/private/tmp/them-962-39357764973.t2dWiq/`, recovery bundle
`Users/runner/work/_temp/them-save-recovery-Qbo404/recovery-ios.xcresult`.
Scoped local evidence: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1027-20261019.Xs5ZnW/`.

Branch `codex/T-1027-recovery-save-dedup` preserves original527c58d6. Original
#962 and #963, main, production secrets and deployment remain untouched by
this fix. Fresh original-head authorization/checks remain required before
advancing the integration stack. Orb and Clementine are unchanged.

Next: scoped normal branch backup; fresh required integration proof and exact
original-head authorization before appending to #962. No original #963 update
until its parent is green. No new replacement PR or main merge.
