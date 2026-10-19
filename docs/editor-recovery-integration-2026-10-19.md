# T-988 — Preserve original focused-editor protection

## Before evidence

T-986 executable `e0477d5` failed full signed V1 UI:27 pass/1 fail/9 skip.
On erased owned simulator11CF5EFB-D8C3-4F19-8062-28AF37F27D93/iOS26.2,
direct typing chunk9 expected `motel sign`, but UIKit and the draft model
both contained `motel sig`. Bundle:
`/tmp/them-986-v1/v1-ui-smoke-local-1-54352.xcresult`.
Recorded activities confirm XCTest attempted the chunk; they do not prove
every keyboard event reached the delegate or identify where the byte vanished.

## Preserved work and hypothesis

Read original #919's body and both commits `5bef4dc` / `fc7a5571` before
integration. Original base is #904. Normal merge
`7b0d189616a76501d9480d8c650fc3ffac5bcbea` has parents
`dc64849eda4ce71a3b08bc3077beef8440e158f2` and
`fc7a5571ebf1a60cedd02d3add5314e2c2451364`. No conflicts, squash,
replacement PR, remote original update, main merge, or assertion weakening.

The unguarded updateUIView path writes a differing binding value into UIKit
even while focused. #919 rejects unchanged same-document model echoes,
while retaining changed model values, unfocused updates and explicit project
switches. It wires project identity through the existing editor façade,
extracts the existing deferred-publication gate to ScreenplayStudio, and
strengthens typing checks to exact editor/model equality. This mechanism
is a root-cause candidate, not a proven explanation of the observed failure.

## Current proof

- D009 against origin/main passes: bridge -21, Studio -4, other watched files0.
  Compared with T-986, only the bridge shrinks (-21); no watched file grows.
- `git diff --check` passes.
- Focused package policy suite5 pass/0 fail, process exit0:
  `/tmp/them-988-policy.log` (XCTest count, not the separate empty Swift Testing
  runner). Covers stale echoes, fresh values, project switches and focus.
- Signed exact typing regression1 pass/0 fail, process exit0 after task-owned
  simulator erase: `/tmp/them-988-typing.log`; retained bundle
  `/tmp/them-988-typing/v1-ui-smoke-local-1-60419.xcresult`.
  A focused after-pass is not proof of the full-suite failure's root cause.
- Adversarial review reproduced a separate fresh-rewrite defect: the old
  parent Binding already reads the new value and cannot represent history.
  Extracted the existing decision to the existing editor façade file without
  changing that comparison, then exercised the real coordinator with a live
  SwiftUI Binding and UITextView whose focus is controlled by a test subclass.
  Before:1 pass/2 fail/0 skip, exit65. Bundle
  `/tmp/them-988-binding-before/v1-ui-smoke-local-1-61912.xcresult`;
  log `/tmp/them-988-binding-before.log`.
- Root fix: coordinator stores the last rendered model text independently
  of its live parent Binding; the production updateUIView calls that decision
  and advances its snapshot each time. Original #919's policy stays canonical.
  After:3 pass/0 fail/0 skip, exit0, erased owned UDID/iOS26.2 confirmed.
  Bundle `/tmp/them-988-binding-after/v1-ui-smoke-local-1-63090.xcresult`.
  This proves the fresh-rewrite binding defect, not the complete root cause
  of the earlier intermittent direct-typing failure.
- D009 after correction: bridge -22 versus main (-1 versus preserved #919),
  Studio -4 versus main, other watched deltas0; whitespace checks pass.
- Full combined signed units then V1 run serially, stopping at first red:
  `/tmp/them-988-units.log`, `/tmp/them-988-v1.log`. No final counts yet.
  Recovery, backend and macOS are not yet re-proven on the updated tree.

Production microphone/model, physical phone, shipping backend, external-open
export and generated120-page screenplay remain unproven. No provider call,
credential/DNS change or production deployment was made.
