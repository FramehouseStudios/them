# T-1069 — Keep iPhone export format selection on the document

Original #904baaf39e3d4a188183c736c481161e464539fbdc0, owned branch
`codex/T-1069-inline-iphone-export`. Preserve originals and every commit,
base #964, separate #972 WIP and unrelated work. No main/production change.

## Actual hosted failure, not a guessed file error

Prior0209a126 run39474084172 passes653 signed units, then the required
writer workflow fails0/1/0: V1SmokeUITests.swift624, Markdown export does
not report the expected .md artifact. Download completed from the same
existing38009 session; it was never restarted on silent output.
Actual retained writer bundle:
`/tmp/them-1068-writer-red-native/Users/runner/work/_temp/them-v1-ui-smoke/writer-loop-8f1a3d1b-8155-4c09-b352-e9b7a0b5db2c.xcresult`.
Activity JSON `/tmp/them-1069-writer-red-activities.json`, full per-case
attachments `/tmp/them-1069-writer-red-attachments`, viewed final native
recording frame `/tmp/them-1069-export-final.png`.

**VERIFIED:** recording shows the menu still open after attempted Markdown
selection. Accessibility snapshot still says Draft saved; no export filename.
The binary synthesized event ABC6C14F resolves through plutil to down/up
x233,y297.6667. Markdown AX bounds x108,y276.7,width250,height42 contain it.
Thus the record does not justify a changed tap coordinate, automatic retry
or assuming wrong filename/backend/file bytes. Exact cause of this native
popover swallowing the interaction is not established as an OS defect.

Read original #590fd239bd3's body/file list and current export support.
Its proposed scope is Files completion/cancellation/retry and exact artifacts;
that proposal has not been independently re-proved at this current boundary.
it remains unintegrated work, not irrelevant or replaced by this chooser fix.
Current iPhone export helper still writes a temporary artifact and reports
it as saved; UI-test mode constructs an exemplar rather than calling backend
export. Do not claim current writer fixtures prove external export completion
or final shipping export semantics. Preserve #590 for its appropriate boundary.

## Small UI correction / proof contract

**DECIDED implementation:** expand existing iPhone Document export formats
inline instead of a detached native menu. Same titles, capability/disabled
policy, identifiers and callbacks; selection collapses the chooser. Preserve
the Mac native Menu byte-for-byte under its platform branch. State is local
to the existing child controls, not a new Root/Studio god-view property.
Use existing typography, borders and full-width controls; no orb/persona change.

New native regression checks choices remain under the inspector drawer,
Expanded/Collapsed accessibility state and explicit collapse. It is a layout
contract, not independent local reproduction of the hosted swallowed tap.
The actual hosted red above is the failed end-to-end observation. Keep the
writer's exact filename and saved-version assertions; no input retry or
larger timeout. Prove the connected action on an authenticated local fixture,
and require fresh hosted evidence before calling the older failure cleared.

Before layout tree987d2d699f2bbfddc50f558af2c35a9ef11dd248 ran signed on
the erased owned375pt SE26.2. Existing layout is expected to fail containment;
do not count that as proof of file loss or swallowed local input. After
tree771125c518ed1ea6ebe9e6f9456996e39322fcee is running signed full units
and the layout/legacy export cases. No after result is claimed prematurely.
No paid calls/private environments; backend and byte-generation owners remain
unchanged. Real-phone microphone/rewrite/offline/export-open journey and
production hold remain open; goal is active and not complete.

## Local results and correction of a fixture assumption

**VERIFIED before layout:**0/1/0, native65,
`/tmp/them-1069-before/v1-ui-smoke-local-1-7013.xcresult`. Fails the intended
drawer-containment requirement, not a locally reproduced swallowed tap.

**VERIFIED first after:**655 passes/1 failure/0 skips, native65,
`/tmp/them-1069-after/v1-ui-smoke-local-1-7563.xcresult`: all654 units and
the existing legacy export case passed. The new layout case reached inline
Markdown and Expanded state but wrongly required Fountain in the structural
fixture. `ScreenplayExportFormatMenu.fallbackItems` supplies FDX, Markdown
and PDF, not Fountain. Actual native activities end at that Fountain assertion.
Keep this red; do not force-enable a format to satisfy the test.

Correct the test to require the existing disabled PDF choice rather than
unadvertised Fountain, then continue its collapse/Collapsed checks. Also
strengthen the old legacy export case: require .md feedback, not a generic
Saved label that could match earlier save status. These are test-only changes;
app and unit source compare identical to full-unit tree771125c5. Frozen final
test treec5208ed14a41307eace524c723e54b218b853b52 is under focused chooser/
export, authenticated writer and Mac proof. No final result claimed yet.

Viewed native375pt inline chooser frame `/tmp/them-1069-inline-visual.png`
from the first-after case, app source identical to final. Export Copy, FDX
and Markdown labels remain readable on full-width controls in the established
cream/rose inspector. The lower options require normal panel scrolling;
this is not a claim every option fits simultaneously or that external file
save completed. No character-per-line labels in the viewed chooser portion.

## Verified final outcome / evidence attribution

Final signed focused UI2 passed/0 failed/0 skipped, native0, erased owned SE:
`/tmp/them-1069-final-ui/v1-ui-smoke-local-1-8211.xcresult`.
This includes capability-aware chooser containment, expanded/collapsed
state, collapse, disabled PDF, and strengthened .md feedback. No retry.
Full signed units654/0/0 belong to first-after771125c5 with byte-identical
app and unit source (`git diff 771125c5 -- them themTests` empty). They are
not a fabricated all-green656 cohort; its mistaken UI assertion remains red.

Authenticated local fixture writer1/0/0, native0, same erased owned SE:
`/tmp/them-1069-writer/writer-loop-71c4ab89-1ed2-45b0-a3a6-f25bff0ac3cc.xcresult`.
Unchanged exact expected Markdown filename, saved-version count and relaunch
assertions pass through the inline chooser, with the backend-advertised
formats. The helper's UI exemplar/temp-file limitation remains; this is
not a backend export-byte or external-open physical-phone claim.

macOS scaffold compile native0; unchanged native Mac menu retained. Existing
warnings remain, interactive Mac not proved. Backend/scripts/workflows/
packages byte-identical tobaaf39e3; recorded Node20.20.2 backend2753/0/2 is
reused, not newly run. No fresh whole V1 or recovery UI here: previous baaf
recovery2/0/0 is historical; outbox/runtime recovery owners remain unchanged.
Actual base #96481b05e44 D009/diff pass, no protected file growth in this slice.

Complete hosted red, native local layout red/first-after/final UI/writer,
logs, actual screenshots/activities/synthesized events and frozen sources:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1069-20261020.u8GndT`.
Hosted/first-after/final UI/writer directories byte-compared after copying.
Nothing moved/deleted; owned server/dependency link cleaned. No real keys,
private environment, paid provider or production configuration handled.

## End-of-session record

1. **Completed:** inspected the hosted native export failure and replaced
   the iPhone detached format popover with connected inline document choices.
2. **Files:** `them/ScreenplayStudioDraftToolsViews.swift`,
   `themUITests/V1SmokeUITests.swift`, `TASKS.md`, this report.
3. **Root boundary:** recorded correct-bounds tap left native menu open;
   new choices live in the existing inspector viewport and existing handlers.
   Exact OS/framework cause is not claimed; hosted re-proof still required.
4. **Proof:**654 signed units on identical app/unit source, final UI2/0/0,
   authenticated writer1/0/0, macOS0, D009/diff pass. Retain both earlier reds,
   backend skips/reuse and all external/physical proof limits above.
5. **GitHub:** normally advance same original #904 frombaaf39e3, base #964
   unchanged and every original commit preserved. No main/force/squash,
   replacement PR, auto-merge or independent-approval impersonation.
6. **Next:** inspect fresh exact-head hosted gate; stop on its first failure,
   then carry parent into preserved original #919/#973. Read/integrate original
   #590's genuine file-completion work at the correct boundary before claiming
   end-to-end externally opened export. Do not discard it or invent a second owner.
7. **Continue:** READY FOR CONTINUE; production held, goal active. Real
   phone/microphone/reply/line rewrite/offline/relaunch/external-open export
   against the explicitly intended backend remains unverified.
