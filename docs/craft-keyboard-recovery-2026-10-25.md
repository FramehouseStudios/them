# T-1150 — Reach Craft Save Override after page entry

## Observed boundary

The human unlocked the Mac. On preserved original640 descendant3c88c50,
the dedicated authenticated Craft workflow executed0 pass/1 fail/0 skip:
"Save Override was not reachable above the keyboard". The stored-report
selection screenshot and subsequent screen recording were retained and read.
The recording shows Page12 focused and the keyboard covering the save row.
The generic drawer swipe can begin inside the keyboard; this is not proof
that a human cannot manually scroll above it. The Page field has no explicit
submit dismissal, so the reachable recovery path is unclear regardless.

## Smallest product correction

Five runtime lines in ScreenplayCraftRailView: canonical SwiftUI FocusState,
Page submitLabel(.done), onSubmit releasing that focus, and focus cleared when
the existing composer clears. Done only dismisses; it does not save or change
the page. The separate existing Save Override remains the mutation action.
No application-wide responder injection, toolbar duplication, auth policy,
transport, model, persistence or second focus framework is introduced.

The existing UI case now uses that visible Done action and asserts keyboard
disappearance and retained12 before proceeding. It retains the original Save,
visible backend acknowledgement, independent API verification of manual turn
status and project/version/framework identity, and explicit-choice Refresh
assertions. No assertion was removed, fixture substituted or unchanged retry
used to turn the failed run green.

## Completed proof and limits

VERIFIED corrected signed UI: **1 pass/0 fail/0 skip**, exit0, erased owned
91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A, iPhone17Pro/iOS26.2/Xcode26.3.
Backend uses Node20.20.2, fresh isolated data and required user authentication.
OpenAI key is explicitly empty, embeddings/Muse disabled; external fetch guard
recorded no attempted non-loopback request. No paid/live model proof claimed.
The producer asserts exact source HEAD/diff/status unchanged through execution.

Retained before: /private/tmp/them-1150-craft-ui.DFwXcS/.
Retained after: /private/tmp/them-1150-craft-after.b5Wgur/.
Inspected all three after screenshots: stored report selects Save the Cat;
"Override saved for catalyst. Run Analyze to rebuild craft coverage." is fully
visible and wraps normally; explicit Three-Act remains selected after Refresh.
This does not prove phone microphone, generated writing, shipping-backend or
real-device performance. Existing narrow UNAVAI… metric remains a visual issue;
it is visible in the failed run's video, not silently declared polished.

Proper-parent D009: index33581 vs33626 (-45), Studio17431 vs17435 (-4),
Root15112/bridge12952/memory10865 unchanged; diff check passes. Backend,
Packages, workflows, scripts, project and unit sources unchanged from3c88c50.
Prior T1147 backend2785/0/2 and units647/0/0 are prior checkpoint results,
not reruns for this five-line UI correction. Current Mac scaffold compile
completed with exit0 and BUILD SUCCEEDED on the same corrected source.
Required updated-parent writer checkpoint and original640 publication remain
pending; public original640 is still uncorrectedc8eb36b and must not merge.
Private completed before/after archive:
/Users/halfmutantfilms/io.them-worktrees/_proof/T-1150-20261025.2KIHOX/.

The older Mac-lock and original975-red notices in T1147 describe that checkpoint,
not current state: lock cleared; original975a754cac later passed all required
checks. Its separately proven journal repair is now original9757dfbc0d with
fresh required checks in progress. No main, deployment, force, squash, original
PR replacement, credential access, paid call or review bypass.
