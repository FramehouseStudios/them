# T-1076 — Obsolete draft observations must not retire writer authority

## Boundary

Original #919 head `a6262b83cfc8cd10c6fcd8244ad9a258506af2dc` remains
preserved. Hosted run39499208254 failed required recovery1/1/0 after
signed units681/0/0 and full V1 UI32/0/9. The failed stale-conflict scenario
stopped before competing-version setup: queue1, parked0, original35-character
page, dirty/manual0, selected/loaded project IDs equal. The queued entry's
contents are **not** proved by that final snapshot. Voice/macOS were skipped.
Do not substitute older local green or infer an empty queue from truncated logs.

## Confirmed defect and minimal correction

VERIFIED: the Combine debounce schedules an unstructured task with captured
text. `handleDraftDebouncedChange` previously accepted that text even after
the writer had changed the page. It recalculated the global unsaved flag
from the obsolete snapshot, then could persist it after asynchronous layout
and revision requests. Those requests also permit project/session changes.

A failing-first regression calls the actual production observer after a real
manual edit and durable enqueue on the real view model. Only the observer's
visibility changed from private to internal for this direct characterization;
its pre-fix behavior was otherwise unchanged. Signed erased-SE native result
`/tmp/them-1076-before/v1-ui-smoke-local-1-47571.xcresult`: **0 pass/1 fail/0 skip**,
exit65. The unsaved flag becomes false despite the newer queued writer draft.
This proves a model authority defect, **not** the full hosted race's cause.

The correction stays in that canonical observer. It rejects cancelled,
hydrating, byte-different, project-changed or session-changed work before
mutation, and revalidates after both asynchronous calls. No parallel queue,
new framework, relaxed UI assertion, delay increase or automated retry.
The existing recovery, conflict and server-selection owners remain intact.

## Focused verification and remaining integration

The complete focused save-outbox cohort passed **31/0/0**, native exit0,
on the erased task-owned
375-point SE `E8998A6B-35B1-49E3-896C-861550849927`, iOS26.2/23C54, with
signing enabled. Actual native bundle:
`/tmp/them-1076-after/v1-ui-smoke-local-1-48332.xcresult`.
Unchanged authenticated recovery passed **2/0/0**, native producer exit0:
`/tmp/them-1076-recovery-complete-deps/them-save-recovery-Q6wmzE/recovery-ios.xcresult`.
Both exact-word reconnect and expired-auth/conflict/relaunch/explicit-choice
contracts remain unchanged. Full signed units passed **682/0/0**, native0:
`/tmp/them-1076-full-units/v1-ui-smoke-local-1-49796.xcresult`.
Authenticated writer/save/relaunch passed **1/0/0**, native0:
`/tmp/them-1076-writer/writer-loop-13154416-7be1-4606-b534-6dfce7a8fe02.xcresult`.
It uses deterministic DEBUG replies and temporary export evidence, not live
speech/provider or an external Files completion. The hosted machine is iOS26.5;
local26.2 success alone cannot close that hosted failure.

The first fixture attempt stopped before Xcode because a retained dependency
directory was empty (missing Express). A manifest-only installation then
failed npm's lock validation because the file-parent dependency requires the
complete repository layout. Neither attempt executed a recovery test. The
corrected fixture uses the full tracked-source archive and exact lock,
Node20.20.2 installation with lifecycle scripts disabled, then the existing
host Node24.22.0 native producer. Dummy providers and required user auth;
no private environment copied. Both setup failures are retained.

Full backend from frozen runtime636ddfc46c17dad3cac5eef03b76038f9d3240ce,
tree04842f5ecd64d0e30438f6b109e03a7f30a4afb2, under Node20.20.2 with network
disabled: **2753 pass/0 fail/2 skip**, exit0,77244.139243ms.
Skips: real Postgres without DATABASE_URL; conditional talk page-write
preview/sync HTTP case. Exact matching locked fixture dependencies, no secret
environment. Synthetic voice recovery passed **1/0/0**:
`/tmp/them-1076-voice-macos/voice-network-fault-local-1-51079-ios.xcresult`.
macOS scaffold compilation passed, `BUILD SUCCEEDED`, serial producer
exit0. Existing actor/Sendable warnings remain; no interactive Mac claim.

D009 against the actual original #919a6262b83: all five deltas0;
index33626, Studio17431, Root15112, bridge12929, memory10865. This retains
the human's early-stack count exception; no line padding. Diff check passed.

## Limits and next step

No new full-V1-UI, phone, live-provider, shipping-backend, external Files or
whole-product proof is claimed. No paid call, main merge, force push,
replacement PR or deployment. Original #973 remains stopped until the
corrected parent's exact hosted recovery is green. Required independent
review and checks still apply to every changed published head.

Runtime636ddfc4 is the tested source; the final proof update changes only
TASKS and this report. Retained logs, complete native bundles, exact runtime
tracked archive and all setup failures are under
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1076-20261020.bU1KRv`.

## Separate approved foundation boundary

Original #964ee5c83fd retains the human's non-author approval, but fresh
run39507066013 is terminal **failure**: Backend/D009 and signed unit stage
passed; required writer timed out waiting for Save Now's exact server draft.
Editor words remain, dirty/manual1, trigger1, queued0, saving0; no server
version was created. V1 and voice/macOS were skipped. Public hold comment:
https://github.com/FramehouseStudios/them/pull/964#issuecomment-6303518088
This failure is not attributed to the observer correction or dependency
security change without evidence. No unchanged retry or merge.

Source review identifies a known save-handoff gap at this early boundary:
an empty outbox drain owns `isDraftSaveInFlight`; a concurrent manual save
can be placed in `pendingDraftSaveRequest`, but that drain returns without
dispatching it. Preserved original #962856d7624 already contains the handoff
capability. Reproduce/port that coherent work next rather than inventing a
second queue. This is a source-supported lead, not a proved trace of the
hosted #964 failure. The synchronous producer/backpressure theory is also
unproven and is not a reason to change or retry the harness.
