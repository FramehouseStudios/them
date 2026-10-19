# T-996 — Reach the expanded confirmation before tapping

VERIFIED original combined source65eeb95652cc7b5c433bb24fd38ae606ead332cd:
signed erased SE3/iOS26.2 full V1 UI28 pass/1 fail/15 skip, exit65.
Failure: test_creative_partner_mode_reuse_and_to_page_callbacks line1522,
waitForHittability on Clear Thread confirmation. Both old drawer failures
passed in that run. Later voice/macOS pipeline stages did not execute.

Viewed the failed recording's final frame:
/tmp/them-994-clear-confirmation.png, exported from
/tmp/them-994-se-v1/v1-ui-smoke-local-1-95982.xcresult.
The warning is visibly expanded at the viewport bottom; its buttons are
below it. Production uses an inline panel, not a modal alert. The test only
waited for hittability after expansion instead of scrolling as a person must.

Smallest correction: reveal both confirmation buttons using the existing
bounded geometry-aware drawer helper. Same exact selectors, destructive
confirmation, callbacks, observable mutation and disappearance assertions.
No production layout or destructive-action behavior changed. No retry of the
unchanged failed test. Focused signed erased owned SE run is recorded below
only after completion; it does not replace a future full combined UI gate.

Exact files: themUITests/V1SmokeUITests.swift, TASKS.md and this report.
Runtime/backend/scripts/unit/packages/project match parentd68d071 exactly;
D009 and whitespace checks pass. No redundant full backend/unit run claimed
for this test-only correction.

VERIFIED final focused signed workflow1 pass/0 fail/0 skip, native94705
exit0, exact erased owned SE E8998A6B-35B1-49E3-896C-861550849927/iOS26.2:
/tmp/them-996-confirmation/v1-ui-smoke-local-1-97757.xcresult.
Log /tmp/them-996-confirmation.log. Both destructive confirmations, actual
callback messages and removal assertions completed. No new full V1 passing
claim; prior full28/1/15 remains red evidence pending integrated re-proof.

Separate, higher-priority boundary: original961 hosted39312650862 completed
recovery4 pass/1 fail/0 skip on iPhone17Pro/iOS26.5. Durable-conflict state
failed after relaunch; synthetic marker still exists. Private artifact:
/Users/halfmutantfilms/io.them-worktrees/_proof/T-961-hosted-39312650862/.
No source deletion, data-loss conclusion, unchanged retry or child promotion.
Recorded on original PR961 comment6277108392. Production credentials hold,
independent review, real microphone/shipping backend/120-page proof remain.
