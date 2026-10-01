# Cancellation ownership integration — 2026-09-30

## Scope

Goal criteria 6 and 7. Parent: #881 `b7a0ea52`. Exact #634 commit
`19fc6411e47f548caf954307fb26fac64c7c7393` brought forward with `cherry-pick -x`
as `6293927a`; both production files match #634 byte-for-byte. No original
branch was rewritten or closed. #766 → #770 remain first to merge.

## Reproduction and root fix

VERIFIED: against the unpatched parent, #634's existing route/store tests
passed two and failed three. A foreign reservation returned 200 instead of
404; forged body identity controlled session cancellation; the bare route
accepted anonymous cancellation. The full backend's middleware already
rejected anonymous traffic: no anonymous production exposure is claimed.
The initial attempt lacked Express in the new worktree; locked dependencies
were installed before the actual regression run.

The exact port uses canonical `req.authUser.id`, checks the reservation owner
before cancellation, and excludes legacy ownerless entries from HTTP session
cancellation. Body identity is compatibility-only. Current iOS cancellation
attaches Authorization; internal store callers retain their existing behavior.
Owner retries release once; foreign, missing and ownerless IDs reveal no
reservation state and cannot abort/release another owner's work.

Added ownerless-ID, same-error-envelope and repeated-session assertions.
Tests use the production route/store with trusted identity middleware and a
wallet-release recorder; a separate full-server test verifies real Bearer auth
under REQUIRE_USER_AUTH=true. These are synthetic local identities, not human
credentials or paid model calls.

## Proof and failures

VERIFIED: focused ownership/abort/wallet/memory-export suites: 36 passed,
zero failed. Signed full iOS units on erased dedicated simulator E37CE808:
666 passed, zero failed. Parent-relative god-file gate: all five files +0.
Node syntax and diff checks pass. No Swift code changed in this integration.

First full backend: 2,792 passed, one failed, two skipped (2,795 total).
The memory-export fixture failed with `fetch failed`. Brought forward Claude's
existing `ed670e0d` fixture migration, using the already-present canonical
ephemeral server helper. The resulting test file matches tip #877 verbatim;
no assertions were removed or retry added. Failure log preserved.
Final full backend after that code change: 2,793 passed, zero failed, two skipped
(2,795 total, Node 20). This is local deterministic proof, not hosted main proof.

Artifacts: `/Users/halfmutantfilms/io.them-worktrees/_proof/branch-audit-20260930/`
with prefix `page-cancel-stack-`: install/repro/repro-installed/focused/
focused-final/focused-http/backend/backend-final/units logs and units xcresult.

## Limits and next priority

No deployment, physical microphone, provider call, full V1 UI or production
writer-loop proof. Reservation storage remains process-local. Crash durability,
cancellation racing settlement, and session cancellation affecting a later
same-writer turn remain unresolved; #635's request-specific cancellation work
must also be reviewed, not dismissed. Early index count stays human-approved
33,626; later stack establishes exact 33,603.

GitHub currently reports 15 open dependency alerts: 14 Multer and one fast-uri,
with duplicate manifest/lock entries. Existing #612 includes upload limits and
adversarial tests; #616 only upgrades Multer. Existing #782 upgrades fast-uri.
Next: independently verify these exact candidates before integrating, without
silently discarding any branch or treating historical audit numbers as current.
