# T-1052 — A keyboard action must belong to the field being edited

Owned branch codex/T-1052-prompt-keyboard-focus starts at original #625
d493c515aca38a95a22d401fb24934f84dceb611. Parent already contains the
keyboard-safe-area and bounded-inspector corrections; do not retest an old
unfixed boundary or advance its head again while its hosted gate is running.

## Existing work, not a replacement implementation

Read original #899 body/current e23511bde40688a23742401baa57acce59ca96db
and preserved commit13fe618ee8e0f9b7060dea0ec04f9df19378f258. The original
guard still exists unchanged at that tip despite its later cumulative
revision/other features. Its author described an unrelated disabled Send
floating while page editing; historical unit proof793/0 and two failed
auth-fixture UI cases are not fresh proof on this earlier boundary.

Current Studio registers the prompt's keyboard toolbar without a focus
guard. Correct scope: render its items only while studioPromptFocused.
Preserve its existing action, identifier and disabled predicate. Page Save
and the inline prompt button retain their existing handlers. Do not import
the cumulative feature stack, replace #899, discard original follow-ups or
claim its full PR integrated from this small port.

## Observable proof contract

New iPhone UI regression opens/focuses the real command bar, verifies Send,
closes its inspector, types into the actual page, checks exact marker/page
Save and absence of command Send, then reopens/refocuses the prompt and
requires Send reachable again. Preserve a screenshot before the negative
assertion. Initial additional pending-question assertions were not run and
are removed; do not claim a new answer-submit proof from them. No source-
regex substitute or disconnected fake button is used.

VERIFIED unchanged product baseline1 passed/0 failed/0 skipped, native0;
actual erased signed owned375-point SE E8998A6B/iOS26.2 summary read.
Bundle `/tmp/them-1052-before/` (single actual xcresult), log
`/tmp/them-1052-before.log`. This does not reproduce the old stray Send on
the narrow phone: closing the inspector removes its content.

Viewed retained screenshot
`/tmp/them-1052-focus-visual/964E0C3A-6BBE-4E2B-A3B7-D4D2BC0B815C.png`:
page Save is present but disabled while signed out; no unrelated Send.
No successful save or prompt submission is claimed by this focus-only case.
Persistent-inspector threshold1080 exceeds current phone target widths;
device family is1. Do not broaden into unsupported iPad work to manufacture
a failure. Original #899 remains intact/queued; no product port or new PR.

The same screenshot reveals a more relevant concern: typed marker is in
the draft, but no paper text is visible above the keyboard. T1053 measures
the actual editor/caret viewport before attributing cause. This is not
evidence of lost bytes. Retain the fixture screenshot.

If the original guard is ported, keep content/toolbar identity stable and
condition only the toolbar items, just as the preserved source does. An
outer conditional modifier could recreate the TextField on focus changes.
Move the sole toolbar implementation to the existing inspector-chrome file
instead of growing ScreenplayStudioScreen. No second focus state, observer,
sleep, framework or submission protocol.

Exact changed files: themUITests/V1SmokeUITests.swift, TASKS.md, this report.
No product source changed. All existing work,
orb/Clementine/aesthetic, original PRs and production hold remain intact.
No provider/model calls or main merge; future draft requires fresh hosted
checks and genuine independent review. Physical-phone behavior is unproven.
