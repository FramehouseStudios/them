# T-1058 — Original paid-talk gate, not a replacement auth implementation

Original #971c670abf23374d49df1c350a6c33851ae89c2761a. Original parent
#9669487cf5f2ee3a1548b3ab98cadd9196aafe08e52 is now hosted green, unlike
the child's older parent boundary. Preserve both in mergecf1b6d1, with the
documentation conflict resolved by retaining both current task records.
No original remote head/base, main or production changes yet.

**VERIFIED:** downloaded hosted39408393871 V1 native bundle reports
27 passed /1 failed /9 skipped on iPhone17Pro/iOS26.5. Exact source1183
fails waiting for `studio.them.creative-partner.clear-thread.confirm` in
the multi-action callback test. The earlier To Page action is not that
failure. Actual source uses an inline confirmation panel; viewed native
final recording shows that expanded panel below the viewport. The test
waited for a hit point without revealing it. Do not infer a server auth,
provider or billing failure from this UI assertion.

Native bundle:
`/tmp/them-1058-971-hosted/Users/runner/work/_temp/them-v1-ui-smoke/v1-ui-smoke-39408393871-1-37516.xcresult`.
Failed log `/tmp/them-1058-971-failure.log`; final frame
`/tmp/them-1058-hosted-final.png` was inspected.

Reuse original #625/d82b3757's exact two-assertion correction: after the
inline panel expands, reveal the actual confirmation before tapping once.
Preserve its accessibility identifiers, enabled/side-effect assertions and
swipe bounds. Also reuse that same original's complete bounded reveal owner,
as independently verified on original #904 by T1060: all three wrappers use
one target-relative pan algorithm and the actual content viewport where
identified, preserving the frame-only and hittability policies. This branch
still had the old full-height flings, the same source defect observed in
the parent and integration To Page failures. No duplicate navigation owner.
No repeated clear action, auth relaxation, increased timeout,
new test framework or app runtime change. The updated parent carries the
canonical exact-device/signing/result-count proof owner; do not duplicate it.

At preparation this candidate was **not yet verified locally** or pushed to the
original PR. T1059's confirmed writer word loss takes priority; serialize
native checks, then verify this gate on the signed erased owned SE with
focused auth/runner checks and full Node20. Main and all originals stay
unchanged in the meantime. Human review and terminal exact-head hosted
checks still required; no paid model, physical-phone or production proof.

**VERIFIED backend checkpoint:** preserving mergecf1b6d1's tracked-source
archive, Node20.20.2, external network disabled, read-only matching
dependencies and no environment files: **2755 passed /0 failed /2 skipped**,
native0 (`/tmp/them-1058-backend.log`). The candidate only changes UI tests
and documentation after that frozen archive; backend source is identical.
Canonical exact-device/signing smoke-runner contracts: **22/0/0**, native0,
same isolated Node20 archive (`/tmp/them-1058-runner.log`). These are command
contract checks, not actual native UI or physical-phone evidence. The signed
native callback verification remains queued behind T1059's active run.

## Actual signed after-proof

**VERIFIED:** signed full units624/0/0 plus original callback and six-tab
UI2/0/0, total **626 passed /0 failed /0 skipped**, native0. Erased owned
375-point SE E8998A6B-35B1-49E3-896C-861550849927/iOS26.2/23C54.
Actual bundle `/tmp/them-1058-after/v1-ui-smoke-local-1-78104.xcresult`;
log `/tmp/them-1058-after.log`. This is full units and two affected UI
workflows, not a fresh full V1 or a paid-provider/physical-phone claim.
Full backend2755/0/2 and runner22/0/0 above are on preserving cf1b6d1;
only the tested UI helper/assertions and documentation changed afterward.
No backend/auth/billing runtime-source change in this follow-up.

D009 against original parent #9669487cf5: all five protected deltas0;
diff clean. The old Clear Thread hosted failure was an unrevealed inline
confirmation, not proof that verified-identity rules should be relaxed.
Keep single-action/clear side-effect checks. Parent exact-device/signing
and fail-closed executed-result rules remain canonical, not replaced.

Normally advance original #971 preserving c670abf, updated parent9487cf5,
all history, its base and draft status. Fresh exact-head hosted checks and
genuine independent review still required. No replacement PR, force push,
main merge, production change, live microphone or paid model call.
