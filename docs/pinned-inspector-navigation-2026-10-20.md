# T-1041 — Inspector navigation belongs to the viewport

## Scope and original history

- Original PR: #625, `codex/T-empty-generation-billing`, base `main`.
- Preserved starting head: `78430decbc6294481f562c15aa3b02f3a9bfd87c`.
- Task branch: `codex/T-1041-pinned-inspector-navigation`.
- No billing/backend, provider, signing, workflow, dependency, decision,
  deployment or main changes. The original empty-generation correction and
  its real HTTP/auth/restart evidence remain intact; this is its UI-gate repair.

## Observed failures, not inferred infrastructure claims

**VERIFIED:** hosted run `39318515602`, job `118286169900`, passed Backend
tests, D009 and **624/0/0 units** but failed the V1 six-panel inspector workflow when
tapping Outline. Its downloaded UI result has **27 passed / 1 failed /
9 skipped** on iPhone 17 Pro / iOS 26.5. The exact error was a system-wide
accessibility attribute-fetch timeout. Earlier activity repeatedly scrolled
to recover navigation. This does **not** establish that hiding navigation
caused the hosted system-AX timeout.

**VERIFIED:** on an erased, task-owned 375-point iPhone SE (3rd generation),
iOS 26.2, UDID `E8998A6B-35B1-49E3-896C-861550849927`, the new behavioral
case failed against unchanged original runtime: **0 passed / 1 failed /
0 skipped**, native exit65. One upward swipe hid the inspector tabs.

Intermediate corrections were not called green:

1. Safe-area inset alone: **1 passed / 1 failed / 0 skipped**, exit65.
   Navigation remained visible, but Craft inherited the prior panel's scroll
   position. Direct native observation confirmed its heading was above the
   viewport. This is an independently observed usability defect.
2. Inset plus selection identity: **1 passed / 1 failed / 0 skipped**,
   exit65. Panel-top recovery passed; the six-panel route failed reaching
   Outline's Write control. Native gestures did not move that Outline view.
   An intermediate screenshot is retained. No claim about a SwiftUI framework
   root cause is made from this observation.
3. Structural header: **8 passed / 1 failed / 0 skipped**, exit65: all
   seven focused presentation/design units and the pinned/selection UI case
   passed, but the original full-height, direction-only reveal still failed
   at Outline. A geometry-diagnostic-only run of that six-panel case then
   passed **1/0/0**, exit0, without a runtime change. It did not produce failure
   frames. That variable outcome is not accepted as proof of a fixed gesture.

## Final correction

Use the existing inspector chrome owner for a small structural `VStack`:
the unchanged six-tab component is a sibling above the scrolling panel,
not part of its content and not an overlay. The panel scroll identity changes
only on selected-tab changes, so a new panel starts at its heading. The
existing column surface, typography, spacing, selection binding, callbacks,
scroll reader, drag/drop anchors and editor/view-model ownership remain.
No new application state or persistence mechanism is added.

The six-panel workflow now requires each tab to be directly visible and
hittable. Its sole-use 16-swipe/reopen fallback is deleted rather than used
as a retry. Deep panel actions still must actually be revealed; selected
state alone is not accepted as proof of a working panel. Reuse the existing
T-992 bounded, geometry-aware reveal algorithm from commit
`6a57ff975f93d1b0334a0576e948376cb90f90ed` (already proven on this SE and
retained in the newer product branch), without changing selectors, assertions,
swipe limits or timeouts. This older PR must not depend on a full-height fling
that can skip a nearby target and continue in the wrong direction.

## Final verification

**VERIFIED:** final frozen source tree
`427d680e6fca20943286a8ccdd2181b666aab381` (the three changed Swift source/test
files; subsequent changes are documentation only):

- Signed, erased owned SE: **9 passed / 0 failed / 0 skipped**, native exit0.
  Seven `ScreenplayStudioDraftToolsPresentationTests`/`DesignSystemGuardTests`
  checks and two real UI workflows: pinned navigation/selection-scroll reset,
  plus all six real inspector panels with selection and deep-action assertions.
- Exact actual summary read from
  `/tmp/them-1041-final/v1-ui-smoke-local-1-25669.xcresult`;
  `totalTestCount=9`, `result=Passed`, owned SE/iOS26.2 identity confirmed.
  An initial summary lookup used the wrong filename and returned no result;
  it is not counted as proof. The path above comes from the completed log.
- Canonical `them-macOS-scaffold`, `Mac Scaffold Debug`, ad-hoc compile:
  native exit0, `/tmp/them-1041-macos.log`. Existing warnings in untouched
  PrintScreenplayIntent/ElevenLabsTtsClient remain Swift6 migration debt;
  this is a compile result, not a macOS interactive proof.
- Direct native inspection on the same 375-point device: Draft, Craft and
  Outline open at their headings; all six fixed tab labels are readable,
  without letter-per-line wrapping or panel text behind navigation. Retained
  `final-craft.png` and `final-outline.png`. The synthetic app was terminated
  after observation; no personal device or writer project was touched.

The final invocation used the newer canonical `run_v1_ui_smoke.sh` from
`codex-replay-conversation-sync` with `PROJECT` pointing to this exact task's
project, the explicit SE UDID, `XCODEBUILD=/tmp/them-994-xcodebuild` (cached
DerivedData/two jobs) and the four focused `-only-testing` selectors above.
That runner resolves/erases only the supplied task-owned device. Original
#964 owns the older runner correction; no workflow/script code is ported
incidentally here. Signing stayed on; no unsigned test invocation occurred.

**VERIFIED:** D009 against the preserved original branch and current main:
index `33626`, Studio `17435`, Root `15112`, live bridge `12952`, memory facade
`10865`; every delta is zero. `git diff --check` passes.

Backend, scripts, workflows and project configuration are byte-identical to
the original head. No unchanged full backend run is attributed to this UI
change. Fresh hosted required checks and independent review remain mandatory.

## Evidence and limits

Private evidence folder:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1041-20261020.0ZdDt2/`.
Completed failed/intermediate bundles were cloned and compared with `diff -qr`.
No secrets or writer documents are included; native content is synthetic.
The final bundle is cloned as `final.xcresult`, compared byte-identical, with
the completed log and tracked-source archive `final-source.tar`. The archive
uses the frozen tree above, not ignored local configuration or Git metadata.

No paid provider request, production change, physical-phone or live voice
proof. Production remains held. Character learning from saved pages belongs
to preserved original #722/#897, not a second memory subsystem introduced here.
The hosted accessibility timeout is unresolved until the updated exact head
passes its actual required gate; a local pass alone does not prove that cause.
