# T-1047 — Voice Pin actions must be reached, not flung past

## Preserved boundaries

Original #625 starts at `5824f226`. Preserving merge `37c50378` has that
head and original #964 `81b05e44` as parents. Only TASKS conflicted; both
task histories were retained. No original remote head or main changed at
this checkpoint. Do not replace, squash, force-push or bypass either PR.
The original billing correction, listening-recovery settlement, exact
project/restart checks and pinned inspector navigation remain intact.

Original #625 run39398273450/job118546311369: signed units624/0/0;
full V1 UI28 passed /1 failed /9 skipped. Failure is the Creative Partner
callback's To Page full-visibility assertion. Both result summaries confirm
actual E839A11B/iOS26.5, while the log erased B34C2F57. The wrong-device
proof defect is real; it does not establish the cause of this UI failure.
Reuse #964's exact-ID resolve/erase/test repair rather than a second runner.

## Reproduced scrolling defect

Read actual test activity and screen recording from the downloaded bundle:
`/tmp/them-1047-hosted-ui.MhekaA/Users/runner/work/_temp/them-v1-ui-smoke/v1-ui-smoke-39398273450-1-42911.xcresult`.
The helper scrolls past the Voice Pin card to Clear Thread/Clear Memory and
the bottom of the panel, then repeatedly swipes farther down. Reuse and To
Page intentionally use focusComposer:false; the recording has no keyboard.
This is not proof of a disconnected callback or a keyboard-overlay cause.

Unchanged app/test source after runner-only merge `37c50378`, erased signed
375-point iPhone SE, iOS26.2/23C54, owned E8998A6B:
0 passed /1 failed /0 skipped, exit65, same To Page assertion. Actual bundle:
`/tmp/them-1047-before/v1-ui-smoke-local-1-38573.xcresult`;
log `/tmp/them-1047-before.log`.

Consolidate the two full-height-fling helpers onto the existing T-992 bounded
reveal owner. Measure the content-scroll viewport, not the pinned tab header;
add its accessibility identifier in the existing chrome modifier, not a new
god-file state/property. Preserve selectors, single callback taps, full
visibility/hittability margins, gesture budgets and all handler assertions.

First intermediate still failed0/1/0, exit65 at co-writer. Actual frame was
y577,height44; drawer bottom635.5. Repeated synthesized gestures moved from
y431.75 to422.25 (9.5 points) without advancing the control. This does not
establish Apple's exact pan-recognition threshold. Minimum44-point travel,
still capped to the content viewport, avoids repeating those tiny presses.
Intermediate bundle `/tmp/them-1047-after/v1-ui-smoke-local-1-39376.xcresult`;
log `/tmp/them-1047-after.log`.

The minimum-pan run remained red0/1/0, exit65, but reached all mode, Reuse,
Prepare for Page and composer/routing assertions. Its failure was the later
Clear Thread confirmation: the recording shows its inline warning expanded
below the visible card while the test merely waits for a hittable button.
Bundle `/tmp/them-1047-minimum-pan/v1-ui-smoke-local-1-40005.xcresult`;
log `/tmp/them-1047-minimum-pan.log`. Do not report that whole run as passing.

Read preserved T-996 `d82b3757` and its retained before/after narrow proof.
Reuse only its two confirmation-reveal assertions here: reach the expanded
inline controls with the canonical bounded helper, then tap once. Keep
destructive confirmation, handlers, feedback and disappearance assertions.
Do not import the later product stack wholesale or change clear behavior.
The four-flow batch then completed3 pass /1 fail /0 skip, exit65. Actual
bundle `/tmp/them-1047-final-ui/v1-ui-smoke-local-1-40636.xcresult`, log
`/tmp/them-1047-final-ui.log`. Callback, all-six-panel routing and pinned
navigation passed. The remaining live-intent case failed returning to its
focused composer. Its actual screen recording shows Apple's first-use
keyboard tutorial ("Speed up your typing by sliding...", Continue), not a
disconnected app handler. The conditional macOS build did not run after red.

Read the preserved `2fcdc772` keyboard setup via its later test helper; reuse
its exact identified tutorial, single Continue tap and disappearance guard.
Extract one test-local owner for live-intent and the existing submit helper;
never tap an arbitrary Continue or submit the writer's ask twice. Live-intent
now uses the same bounded content-scroll reveal instead of24 full-height
downward flings. No production focus, keyboard or routing behavior changes.
Only the failed live-intent case was rerun on a newly erased signed SE;
the three unaffected passing flows were not repeated unchanged at that stage.
That tutorial-aware run still failed0/1/0, exit65. Its activity confirms
Continue was tapped and the tutorial disappeared; the normal keyboard still
covered the input. Bundle:
`/tmp/them-1047-live-intent-fixed/v1-ui-smoke-local-1-41854.xcresult`.

Two product focus/keyboard-event and anchor experiments also failed0/1/0
each: `/tmp/them-1047-focus-layout/v1-ui-smoke-local-1-42689.xcresult` and
`/tmp/them-1047-composer-anchor/v1-ui-smoke-local-1-43453.xcresult`.
Those unsuccessful event observers, extracted modifier and alternate anchor
were removed, not shipped as speculative workarounds. The original focus
handler and anchor remain unchanged.

## Structural keyboard correction

RootExperienceView's studioSurface explicitly ignored all safe areas, as did
the Studio background. Apple's SafeAreaRegions distinguishes container edges
from the software keyboard:
https://developer.apple.com/documentation/swiftui/safearearegions.
Keep ignoring container edges for the established edge-to-edge look, but
allow SwiftUI's keyboard-safe layout. The actual product correction is two
`.ignoresSafeArea(.container)` changes; no new focus state, notification
listeners, delays or view framework. All five god-file line deltas remain0.

VERIFIED: erased signed owned SE, iOS26.2/23C54, live-intent workflow1/0/0,
exit0. After the identified keyboard tutorial is dismissed, the loaded field
must become hittable automatically within the existing5-second wait; no
compensating scroll gesture. Expected prompt value and routing also pass.
Actual bundle `/tmp/them-1047-keyboard-safe-area/v1-ui-smoke-local-1-44183.xcresult`;
log `/tmp/them-1047-keyboard-safe-area.log`. Canonical macOS scaffold compile
then exited0; `/tmp/them-1047-macos.log`. Existing concurrency/deprecation
warnings remain; no macOS UI or physical-phone proof is claimed.

VERIFIED final changed-runtime cohort:11 passed /0 failed /0 skipped,
native exit0 on the same erased, signed owned SE/iOS26.2. Seven unit/design
guards plus all four affected UI workflows execute together, including both
clear confirmations, exact prompt/routing callbacks, all-six-tab/deep-panel
navigation, pinned header and automatic keyboard-safe live-intent focus.
Actual bundle `/tmp/them-1047-final-cohort/v1-ui-smoke-local-1-45029.xcresult`;
log `/tmp/them-1047-final-cohort.log`. Earlier3/1/0 remains red history.

Viewed the retained success screenshot: complete two-line live ask, caret
and inline Send sit above the keyboard; pinned tab labels remain readable.
Artifact `/tmp/them-1047-success-visual/829EF0AF-A51B-45A2-A903-551ED76E063C.png`.
No portrait labels wrap letter-per-line. Duplicate inline/toolbar Send
affordances remain visible; that existing usability item is not fixed here.
VERIFIED separate direct page typing:1 passed /0 failed /0 skipped on the
same freshly erased signed owned SE. Actual summary read from
`/tmp/them-1047-page-typing/v1-ui-smoke-local-1-45856.xcresult`;
log `/tmp/them-1047-page-typing.log`. Complete direct input assertion passes.
No new full624-unit/full V1/live model or physical-phone claim is made.

## Boundary checks so far

Pinned Node20.20.2, network disabled, disposable writable tracked-source
archive `/tmp/them-1047-node20.UfRs6l`, fixture dependencies only:
runner contracts26/0/0 and full backend2769/0/2, native process exit0.
Log `/tmp/them-1047-node20.log`. The two backend skips are not live proof.
Backend/runner sources are unchanged by the later UI-gesture correction;
this Node run is not a passing UI or real-model claim.

Whitespace and D009 pass; all five protected files delta0. No backend,
provider, dependency, account, deployment, accepted decision or release
configuration changes beyond preserving the original runner work. No paid
model call or physical-phone proof. Actual screenshots/video are fixture
evidence only. Require final actual UI results and macOS build before
promoting original #625, plus fresh hosted checks and independent review.

## Scope, adversarial audit and publication

Changed files: TASKS.md, this evidence document, RootExperienceView.swift,
ScreenplayStudioScreen.swift, ScreenplayStudioInspectorChromeViews.swift,
and V1SmokeUITests.swift. Runtime scope is exactly two safe-area-region
changes plus the scroll-content accessibility identifier. Preserve the orb,
Clementine, existing focus handlers, pinned tabs and billing/auth behavior.
No provider, dependency, persistence or accepted decision change.

Answered by actual narrow runs: one-tap mode/Reuse/To Page callback routing,
both destructive inline confirmations, six panels/pinned navigation,
automatic keyboard-safe prompt focus with expected prompt value, complete
page typing. Earlier failures remain recorded above, not relabeled green.
Partially covered: broader keyboard/editor behavior beyond these flows;
fresh full hosted units and V1 suite are required. Not covered: physical
iPhone microphone/provider/export journey, shipping backend, cross-device
behavior, real wallet charges, privacy or production configuration.

DECIDED publication path: normal fast-forward of original #625, preserving
`5824f226` and #964 `81b05e44`. Retarget #625 to #964's existing branch so
the exact-device runner is an explicit dependency, not silently presented
as main. Keep draft. No squash, force-push, replacement PR or main merge.
After #964 lands, retarget/re-prove #625 on main before any reviewed merge.

Retained non-secret logs, final actual summary JSON and selected fixture
screenshots: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1047-20261020.iruWsI/`.
Large original result bundles remain at the exact paths above.
