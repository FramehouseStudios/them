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
- Full combined signed units635 pass/0 fail/0 skip, exit0, actual same owned
  erased UDID/iOS26.2 confirmed. Bundle
  `/tmp/them-988-units/v1-ui-smoke-local-1-64155.xcresult`;
  log `/tmp/them-988-units.log`.
- Full combined Node20.20.2 scripts224/0/0 and backend2749/0/2, exit0.
  Network disabled for tests; log `/tmp/them-988-node20.log`.
- macOS scaffold compile exit0, separate DerivedData avoids active UI build
  database contention; log `/tmp/them-988-macos.log`. Existing warnings remain.
- Full V1 UI28 pass/0 fail/9 skip, exit0. Retained bundle
  `/tmp/them-988-v1/v1-ui-smoke-local-1-64145.xcresult`; same erased owned
  UDID/iOS26.2 confirmed. Direct typing passes in the full run. Fixture-only
  skips are not claimed as passing or evidence of live model behavior.
- Authenticated signed recovery2/0/0, exit0, retained bundle
  `/tmp/them-988-recovery/them-save-recovery-OstmJn/recovery-ios.xcresult`;
  log `/tmp/them-988-recovery.log`. Both full exact-text/exactly-once stories
  execute. Controlled DEBUG save fault is not physical airplane-mode proof.
- Authenticated writer/save/Markdown-export/relaunch1/0/0, exit0;
  `/tmp/them-988-writer.log`. Existing helper removes its temporary bundle.
- Signed voice-fault1/0/0 and wrapper macOS build exit0. Retained bundle
  `/tmp/them-988-voice/voice-network-fault-local-1-69205-ios.xcresult`;
  log `/tmp/them-988-voice.log`. Actual same erased UDID/iOS26.2 confirmed.
- Executable source `bfbd5af` has no later app-code changes on this branch.
  These are local fixture/transport proofs, not real speech/model outputs.

## Registrar observation

Human signed in to Porkbun in Chrome. Current account `framehouse` presents
an empty domain-management list; its separate Simple Domain List also lists
no domains. This does not prove the human owns no domain elsewhere. Requested
the owning account or exact domain name before changing DNS. No purchase,
transfer, DNS, nameserver, email, security or credential change performed.

Read-only Render shell diagnostic on live instance b5244 prints booleans,
never values. Nodev20.20.2, NODE_ENV production. DATABASE_URL, JWT_SECRET,
OPENAI_API_KEY, APP_TOKEN, AUTH_APPLE_AUDIENCE and APP_STORE_BUNDLE_ID are
present. APP_STORE_ISSUER_ID, APP_STORE_KEY_ID and APP_STORE_PRIVATE_KEY are
absent. REQUIRE_USER_AUTH is not explicitly disabled. Presence does not
validate the credentials or prove user/project isolation. These are live
instance values, not a claim about pending environment changes for a future
deploy. Current source's assertProductionEnv refuses missing IAP verification
configuration. No guard was bypassed; requested human decision on an explicit
purchases-disabled beta mode before changing that production policy.
Human answered: keep production blocked until App Store credentials exist.
Do not implement that beta-mode bypass or change production startup policy.

Owned scoped branch backed up at source commit `bfbd5af`; evidence posted
on original #919 comment6274955590. Original #919/#904 heads and main stay
unchanged. Original #909 proof is separately backed up on T-987 and posted
in comment6274956110 (audit0; backend2740/0/2), not merged or deployed.

Production microphone/model, physical phone, shipping backend, external-open
export and generated120-page screenplay remain unproven. No provider call,
credential/DNS change or production deployment was made.
