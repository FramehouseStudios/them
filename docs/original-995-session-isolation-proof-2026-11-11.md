# Original #995 — session isolation and updated-parent proof

## Current checkpoint — 2026-11-12

Original35cd28d70476d64bf60360f72a25a13464ea0098 and prior published
e91f0898f8e2f5760ddfe385a3273e80efb157f7 remain ancestors. Preserving merge
5862470b250c83a8c72b520cfa35e9e8ce278d9a has parents e91 then published
#996 b0e265eab25872f07471bc010d1704b5efcdde55. No conflict, squash,
replacement PR, original-history rewrite or main merge.

The direct-typing fixture gets a unique automation-session ID. Queued
recovery creates one unique ID before its first launch and reuses the same
environment across all three launches. A reset cannot consume another
fixture's queue, while both preserve-state relaunches retain this fixture's
actual auth/session identity. No production runtime/store contract changes.

The own code diff versus b0 is exactly the original two session-ID hunks:
four additions and one deletion in V1SmokeUITests.swift. Root and LUNA
verified the reconstructed entire file against those replacements.
The strict known-state/single-action Autosave setup, diagnostics, stable
review tap and centralized frame-before-hit helper remain intact.

App, backend, unit-test, script, workflow, Xcode project and Packages trees
are byte-identical to b0. Do not resolve a future merge by taking this
child's older whole V1 file over its newer parent.

## Changed-source verification

Xcode26.3; exact erased root-owned iPhone17 Pro/iOS26.2(23C54),
81F0FF38-9DAD-4011-907B-357DFADD094C; normal signing enabled.

| Check | Result |
| --- | --- |
| Complete direct typing / no floating keyboard Send | 1 passed / 0 failed / 0 skipped |
| Authenticated reconnect, real expired-auth refresh, conflict/relaunch | 3 passed / 0 failed / 0 skipped |
| D009 versus actual published parent b0 | Five zero deltas |
| Diff, source identity and original ancestry | Passed |

Counts and exact device identity were checked in the actual native summaries.
No assertion, wait, required test or producer validator was weakened.

Direct bundle: /private/tmp/them-t1394-direct-typing.xcresult
Direct summary: /private/tmp/them-t1394-direct-typing-summary.json
Recovery bundle:
/private/tmp/them-t1394-recovery/them-save-recovery-sIBvEj/recovery-ios.xcresult
Recovery summary: /private/tmp/them-t1394-recovery-summary.json
Logs: /private/tmp/them-t1394-direct-typing.log and
/private/tmp/them-t1394-recovery.log.

Dependency-cache reuse was gated on identical package/lock bytes and all136
installed version/integrity records. The shared cache was not modified.
Its local symlink is untracked; no registry request or real.env was used.

## Inherited boundary, not repeated unchanged suites

The completed prior-parent541 run43188242750 passed all three required
checks: Node20.20.2 backend3042/0/5; signed units1559 executed/0 failures,
no skips reported; writer1/0/0; V1 39/0/36; dedicated recovery3/0/0;
voice fault1/0/0; macOS/D009 passed. The app/backend/unit/script trees
remain identical, but those are not fresh hosted checks of this new head.
No unchanged broad local suite is repeated solely for two test session IDs.

Correction: the five backend skips are four missing dedicated PostgreSQL
URL cases and one explicitly skipped talk preview-header test. The earlier
description of that fifth skip as a paid live-model case was incorrect.
Actual final logs are retained in the parent proof archive. No paid
provider call was made.

The earlier terminal-leaf inventory was historical. Current source/topology
review identifies original #997 as the next PR based on #995. Verify actual
bases again at publication; PR numbers alone do not determine order.

## Limits and landing boundary

Authenticated HTTP recovery uses synthetic accounts/providers. It proves
fixture transport/save/recovery, not live microphone/model quality, phone
responsiveness, a real purchase or the intended shipping-backend journey.

Current published b0 parent is still awaiting its fresh hosted checks.
This private preparation does not clear original #995 for advancement
before that boundary passes. Fresh exact-head checks and genuine non-author
review remain required. Main's review is deferred; no agent approval.
Main and production remain unchanged; production is held.
