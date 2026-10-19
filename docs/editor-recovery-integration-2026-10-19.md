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
- Next adversarial review: `previousParentText` reads a live Binding rather
  than a stored last-rendered snapshot. The policy's fresh-value unit test
  does not prove the representable supplies that historical value correctly.
  Characterize the actual wiring before declaring fresh model updates safe.
- Full combined units, recovery, V1, backend and macOS are not yet re-proven.

Production microphone/model, physical phone, shipping backend, external-open
export and generated120-page screenplay remain unproven. No provider call,
credential/DNS change or production deployment was made.
