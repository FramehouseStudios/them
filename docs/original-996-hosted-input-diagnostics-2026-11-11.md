# Original #996 — hosted writer input investigation, 2026-11-11

## Status: initial Autosave failure remains unresolved

Publication before this follow-up:2a83473e. Exact hosted run43166730350,
Quality job131010236394: full signed units passed; writer0/1/0 failed at the
required Autosave-off condition. V1, dedicated recovery, voice-fault and macOS
steps were skipped. Backend and D009 passed. Further integration stops here.
Local successes do not explain or resolve the hosted failure.

Complete119,829,536-byte native artifact retained privately at:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1384-996-writer-autosave-20261111/quality-gate-failure-logs.zip`.
SHA256:e81642532ac067d22d46a77032a7cb1d6ced38d4f35f9e3b3ed116fb0151a784.
The extracted writer-loop.xcresult, full attachments and pre-edit source backups
remain beside it. No original head or failure evidence was overwritten.

## What the retained evidence proves

Both actual synthesized taps target PID46245 at(328.5,564.6667), down/up0.05s
apart. The point is inside the visible switch and drawer viewport. Retained hierarchies
do not mark the switch or its ancestors disabled; no separate isEnabled sample
was retained.
Native20fps event windows show On continuously. App focus and prompt idle replies
are retained. Clipping, a disabled control, a missed coordinate, observed
false→true double-toggle and an entire-app freeze are not established.

Later drawer/editor/type/Save attempts contain no synthesized input. The session
records six XCTest10010 errors: Event dispatch preempted by earlier failure.
Those later unchanged frames cannot be used as evidence of additional app input
failures. The total case duration was509seconds, with attempted actions continuing after
its first required setup failed.

The smallest certain repair is to return immediately when Autosave-off was not
confirmed, retaining the exact failure condition/message and the sole-manual-save
invariant. The initial touch-to-binding transition still needs observation.

## Temporary, opt-in diagnostic

The original taps, retry sequence, state assertion and timeout are unchanged.
DEBUG+UIKit, --ui-testing and THEM_UITEST_TRACE_INPUT=1 are all required before
installation. The writer fixture alone sets that flag.

UIApplication's original sendEvent is called exactly once before observing touch
began/ended/cancelled metadata. The observer does not rewrite events, hit-test recipients or gesture flags.
The binding wrapper calls the original setter exactly once with its original
requested value, then records the readback. The trace includes receiving classes, coordinates,
window/scene flags, recognizer states and actual Autosave binding writes. A
process-local owner hash distinguishes different observed model instances; a
change alone does not establish allocation/recreation.

The32-record buffer can evict earlier records. A full buffer makes absence of
earlier evidence inconclusive; compare retained time ranges before interpreting
missing events. No text, accessibility labels, keys, credentials or writer data
are logged. The1px diagnostic AX surface excludes physical hit testing. Its
computed getter returns current metadata. Release/non-UIKit paths are inert;
with tracing off, the original binding is returned.

This temporary probe is not an Autosave fix or a production telemetry framework.
Do not call the initial failure resolved from a diagnostic-only green result.
Remove or explicitly settle the probe after the evidenced owner is corrected.

## Local probe validation and retained unsuccessful check

- First instrumented writer:1/0/0, but the separate metadata check did not find
  the binding receipt. That is insufficient diagnostic proof. Initial onChange
  observation/stored AX metadata was replaced with the actual binding setter and
  a computed getter. A native UISwitch ancestry expectation was also unsuitable:
  this local successful gesture's receiving chain contained SwiftUI hosting views.
- Corrected probe2:writer1/0/0;14 records including true→false binding and touch
  receipts. This preceded the final owner witness and explicit dynamic dispatch.
- Final source: signed authenticated writer1/0/0 on erased task-owned iPhone17 Pro,
  iOS26.2(23C54), Xcode26.3(17C529), normal test signing. Actual retained metadata:
  15records,12touch receipts,one observed owner and true→false binding on that
  same owner. It validates instrumentation, not the iOS26.5 hosted failure.
- Final macOS inert-path compile: passed.
- D009 vs actual #994 parent: passed; Studio -3lines, other four zero. Diff check
  passed. No timeout extension, assertion relaxation or new input retry.
- No unchanged full unit/backend rerun. Earlier1559-unit result belongs to2a83473e;
  backend tree2c40a5c3d1022c583462ad71014c0e173fed1ee8 retains3042/0/5 context.
  Fresh exact-head hosted gates are required, including the diagnostic writer.

Local probe providers are synthetic: ASR0, chat1, TTS0. No live speech/model, physical-phone,
integrated-main or production proof. No paid model calls or deployment.

## Artifacts and review

Local artifacts use prefixes `/private/tmp/them-t1384-input-probe-writer`,
`/private/tmp/them-t1384-input-probe2-writer`, `/private/tmp/them-t1384-final-probe-writer`
(logs and result bundles). Final trace export/manifest:
`/private/tmp/them-t1384-final-probe-attachments/manifest.json`.
Final macOS log:`/private/tmp/them-t1384-final-probe-mac.log`.
Retained sanitized session evidence:
`/private/tmp/them-t1384-einstein-session-l05m0sec/evidence.json`.
HOWARD verified geometry/source and withdrew the unsupported clipping theory.
EINSTEIN verified post-failure dispatch suppression and reviewed tracer safety
read-only. Neither role supplied required independent human approval.

Main remains78b8c94f; #964 review is explicitly deferred. Children #995/#997 stay
frozen while #996's first red is investigated. Original #626 is useful distinct
Release-endpoint work, read-only reviewed and not reimplemented or integrated.
Production's existing App Store-credential hold remains. No bypasses or main push.

Apple documents tap() as sending a tap event at a computed hittable point, not
as proof of a resulting state change: [XCUIElement.tap](https://developer.apple.com/documentation/xcuiautomation/xcuielement/tap()).
