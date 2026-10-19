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
VERIFIED frozen runtimef5e3e844 on Node20.20.2: backend2745 pass/0 fail/2
skip; scripts210 pass/0 fail/0 skip. /tmp/them-1000-node20.log. D009 all five
deltas0, diff check passes. Parent wallet proof record merged preserving
history; runtime/test/script sources identical to the frozen tested tree.
No production change, main merge or paid call.

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

## Integration status and next target

Wallet correction is draft PR965; cancellation is a separate child review,
not a replacement PR or a main merge. Advice routing is backed up on
codex/T-998-advice-cost-lane at1e699629: Node20 backend2955/0/2 and scripts231/0/0.
Original961 at e68957fe has fresh backend/D009 checks green; hosted UI remains
pending at the last check. Original625 is red: V1 system-application AX timeout
in test_all_studio_inspector_tabs_route_to_real_panels_and_report_selection,
27 pass/1 fail/9 skip. /tmp/them-625-hosted-failure-39318515602.log.
No unchanged rerun, false green claim or original head replacement.
PR964 still requires independent review. Main remains deac1a6d.

Next: remediate current dependency advisories in a separate bounded change,
starting with the critical proxy-addr alert16 (locked2.0.7, patched2.0.8),
then fast-uri alerts15/17/18 (locked3.1.6, patched3.1.8). Remaining Multer1
alerts need a verified multipart migration, not a blanket forced update.
Advisory list read from GitHub on2026-10-19; no exploitability conclusion
from severity alone. Combined writer/phone proof remains unfinished.

## Exact files

- backend/lib/talk_pipeline.js
- backend/lib/clementine/page_cancel.js
- backend/tests/page_cancel_owner.test.mjs
- backend/tests/clementine_page_cancel_e2e.test.mjs
- backend/tests/clementine_page_abort_midflight.test.mjs
- backend/tests/clementine_wallet.test.mjs
- TASKS.md
- docs/page-cancel-owner-2026-10-19.md
