# T-1000 — Only the writer can interrupt their Page

VERIFIED: cancellation by reservation ID did not check ownership; session
cancellation trusted body user_id/userId before authenticated identity. The
store also let owner-scoped cancellation match reservations without an owner.
Actual Express HTTP + real linked Page/wallet stores reproduced these issues:
failing-first1 pass/3 fail, /tmp/them-1000-before.log.

Use the same canonical trusted-user resolver as T999; reject anonymous
cancellation independent of the global auth flag. By-ID cancellation returns
the existing404 for foreign/unowned/missing work, without revealing ownership.
Session mode ignores caller owner aliases and requires exact owner equality.
Trusted internal cancelOnBargeIn(sessionId) retains its existing unscoped
contract; no new public path invokes it. No wallet arithmetic or billing rate
change. Signed-in owner success fields and repeat-cancel behavior remain.

VERIFIED focused host Node26:29 pass/0 fail/0 skip, including midflight abort,
wallet refund once, own repeat cancellation, cross-owner and anonymous denial,
shared-session separation, unowned legacy reservations, and T999's real JWT
wallet restart/revocation suite. /tmp/them-1000-focused.log.
Cancellation route tests inject trusted identity via fixture middleware; they
do not claim production JWT verification or a live model/physical-phone run.
Full pinned Node20 suite pending. No production change, main merge or paid call.

## Adversarial review

- Answered: forged body/header owners cannot cancel another account's work or
  release its wallet hold. Unowned legacy reservations are not claimable.
- Answered: own cancellation aborts the actual signal and releases a real hold
  exactly once; a retry remains safe. Get/check/cancel is synchronous in the
  current single-process store, with no await between check and mutation.
- Partially addressed: revocation protected by canonical auth middleware;
  real JWT revocation is covered by T999 wallet HTTP tests, not by a new
  in-flight generation with two real authenticated actors here.
- Not covered: multi-process reservations, provider ignoring cancellation,
  physical microphone races and production infrastructure. No global security
  certification from these bounded tests. Existing dependency debt remains.

## Exact files

- backend/lib/talk_pipeline.js
- backend/lib/clementine/page_cancel.js
- backend/tests/page_cancel_owner.test.mjs
- backend/tests/clementine_page_cancel_e2e.test.mjs
- backend/tests/clementine_page_abort_midflight.test.mjs
- backend/tests/clementine_wallet.test.mjs
- TASKS.md
- docs/page-cancel-owner-2026-10-19.md
