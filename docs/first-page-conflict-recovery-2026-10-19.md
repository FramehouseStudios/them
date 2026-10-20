# First-page parked conflict recovery — T-1035

## Reproduced failure

Source parent: joined rehearsal `c80f2639946d972089a5d8a6bff9b6d57937606e`.
The pending-creation retry owns the creation/save lane and starts with an
empty local base. Its parked initial seed was passed directly to plain
hydration. That protected the first-page text, but empty-base conflict
inference did not restore the explicit writer choice. A generic pending-save
message was not a connected Keep Mine/Load Server decision.

Failing-first signed regression **0 passed /1 failed /0 skipped**, native
exit65, erased owned Pro/iOS26.2. Actual xcresult summary read: conflict project
is nil instead of the restored original project ID. Result:
`/tmp/them-1035-before/v1-ui-smoke-local-1-95957.xcresult`.
This is a reproduced missing decision, not a claim of disappearing text.

## Root-cause correction

Extract the existing parked-decision restoration into one private helper.
Ordinary hydration keeps its idle-save-lane restriction. Creation retry can
use that same helper only from its already-reserved lane, with the current
creation/auth/selection ownership checked before and after the await.
The helper still requires an owned/project-matching conflict-parked entry,
loaded dirty editor and complete authoritative head with different text/base.
It delegates retention and UI state to the existing conflict handler, never
posts a version, guesses a draft or replaces the writer's local words.
Keep the actual choice message instead of overwriting it with generic copy.

The regression exercises the real ViewModel create entry and existing HTTP
transport fixture: restore a durable pending intent and parked first-page
save, retry the same project ID, retain exact Unicode/CRLF/whitespace bytes,
assert zero version POSTs before choice, then invoke actual Keep Mine. The
existing fixture now models a pre-existing server head. The after-run also
asserts the explicit save uses that current server base; this extra request
assertion was added after the failing-first run, not misreported as failing
before. Queue inspection uses a fresh actor, not a stale cached fixture copy.

## Second reproduced boundary: detail refresh

The first correction did not cover ordinary detail refresh of a still-pending
first page. A second failing-first check invokes the real detail-refresh entry:
**0/1/0**, native exit65. Actual summary read, same owned erased Pro; missing
conflict project reproduced on runtime e236760b. Bundle:
`/tmp/them-1035-detail-before/v1-ui-smoke-local-1-98339.xcresult`.
The fixture now supplies its pre-existing original project ID without needing
a preceding creation PUT. This is not a test against an unrelated project.

Root: pending-first-page loaded identity was assigned after the restoration
helper. In addition, the leftover creation record makes saveCurrentDraft
refuse Keep Mine. Move the already-existing identity establishment before
restoration. Only after complete owned head/conflict/text checks, retire the
matching creation record using its existing durable removal routine. Require
the pending record's exact page still be on screen; keep the outbox and local
draft recovery. If record retirement fails, do not offer a blocked choice.
The shared regression checks both entry points through actual Keep Mine,
including no creation PUT during detail refresh and a single version request
using the known head. No second conflict or persistence mechanism is added.

## Verification

First-phase runtime commit: `e236760b18532643d51b0e385744c58ce8a2b456`.
Signed focused creation/conflict/draft-recovery **129 passed /0 failed /0
skipped**, native exit0, erased owned Pro/iOS26.2(23C54). Actual summary and
the new regression's Passed test node read. Result:
`/tmp/them-1035-focused/v1-ui-smoke-local-1-96509.xcresult`.
Before and final focused bundles were cloned and byte-compared under
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1035-20261019.E27tLL/`.

These first-phase UI results belong to e236760b, before the detail correction:
lost-creation-reply/relaunch/retry1/0/0, existing stale-conflict UI1/0/0,
macOS BUILD SUCCEEDED; native serialized command exit0, summaries read and
bundles cloned/compared. They are not final-head proof. Final focused checks
now also include project-hydration ordering. These first-phase counts are
not relabeled as final source evidence.

Final runtime commit: `68aaec28f284a2b53b6b1672cd66f15d67b315c4`.
Final signed focused **136 passed /0 failed /0 skipped**, native exit0, owned
erased Pro26.2. Actual summary and both new Passed test nodes read. Includes
creation, save-conflict authority, draft recovery and project-hydration order.
Final bundle cloned/compared privately:
`/tmp/them-1035-final-focused/v1-ui-smoke-local-1-98872.xcresult`.
Runtime is frozen at68aaec28 for the final affected UI/build sequence.

Final affected UI: lost-creation-reply/relaunch/retry **1/0/0**, stale-conflict
relaunch/Keep Mine **1/0/0**; actual summaries read, bundles cloned/compared.
Final macOS scaffold **BUILD SUCCEEDED**; serialized command native exit0.
All signing remains enabled; every iOS proof erases only the owned simulator.
Fixtures require user auth and do not call a paid provider. UI orchestration
uses host Node24.19.0, not the pinned Node20 backend-suite runtime.

Final artifacts:
`/tmp/them-1035-final-creation/them-studio-ios-writer-loop/run-YqdZ84/writer-loop.xcresult`,
`/tmp/them-1035-final-conflict/them-save-recovery-5H82Kd/recovery-ios.xcresult`.
Final logs: `/tmp/them-1035-final-focused.log`,
`/tmp/them-1035-final-creation.log`, `/tmp/them-1035-final-conflict.log`,
`/tmp/them-1035-final-macos.log`. Private copies share the E27tLL directory above.
The earlier and final proofs are retained separately, including both failures.

Adversarial review: existing creation/auth/selection guards and ordinary
active-save exclusion are retained; project-hydration ordering and existing
conflict/save authority run together. New tests assert exact UTF-8 bytes,
retained parked request/base, zero automatic version POSTs, original creation
identity/no detail-refresh creation PUT, and actual Keep Mine using the known
head once. Complete authoritative head is mandatory; no historical/excerpt
fallback. Setup retirement only applies to the matching owned pending page
currently on screen; failure leaves its record and copies retained. No UI
assertion, timeout or retry was relaxed. No new framework, store or endpoint.

Not newly run: full units/backend suite, broad V1, voice-fault, PostgreSQL
restart, macOS UI, or an interactive UI fixture of the new parked initial-seed
case itself. That case is proven through real ViewModel actions and HTTP
request-contract fixtures, not a native tap or production persistence claim.
D009 against freshly fetched origin/codex/T-1034-joined-conflict-recovery:
all five protected deltas0; whitespace pass. Backend/scripts/CI/DECISIONS
remain byte-identical to T-1034. No identical full backend rerun and no new
full-unit-run claim: earlier joined units897/0/0 belong to9cd9334d, not this
later fix. Reused pinned Node20.20.2 source evidence is backend2998/0/2,
scripts238/0/0, offline mentor gate OK; see T-1034/T-1032 for exact scope/skips.

## Limits

The fixture verifies client requests, not new PostgreSQL rows or real model
quality. Physical-phone microphone/TTS/shipping-backend proof remains open.
No paid calls, original PR advance, main mutation, production setting or
accepted decision changes. #962's original f5e746c2 hosted gate remains red;
its separate856d7624 correction still needs exact human approval and fresh CI.

Files: them/ScreenplayStudioViewModel.swift,
themTests/ScreenplayProjectCreationTrustTests.swift, TASKS.md and this record.
