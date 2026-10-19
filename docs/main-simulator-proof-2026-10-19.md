# T-984 — Exact, signed simulator proof on main

## Scope and verified cause

Base: `deac1a6d54a65dbf5f849f0f35476ad4ff07e1f0`.
Branch: `codex/T-984-main-simulator-proof`.

The canonical runner previously resolved a simulator name for erasure but
passed that name to Xcode, allowing it to select a different installed runtime.
Original #961 run39285905264 proves this mismatch: erased device
`B34C2F57-B98B-4C84-96E2-3170887BA2DB`, tested device
`E839A11B-51B4-4AD3-ACF4-A53B95B7C957` on iOS26.5. This is not proof that
the mismatch caused its separate keyboard-focus failure.

This main-based change uses the exact-ID resolution already introduced on
the integration rehearsal. It does not import that unfinished product stack,
replace original feature PRs, or change Swift/backend runtime behavior.

The main save-recovery wrapper also had a separate, verified defect: its
iPhone path bypassed the canonical runner and explicitly disabled signing.
Its existing two tests now use the canonical signed/erased runner. The macOS
path and both test identifiers are preserved. A one-selector regression caught
an intermediate Bash3.2 empty-array/nounset failure; a nonempty argument array
fixes that without removing the selector override.

## Invariants

- JSON inventory is resolved once; erase/boot and Xcode use the same UDID.
- Local runs require explicit task-owned selection. Ambiguous names and
  invalid/unavailable/runtime-mismatched selectors fail before erasure.
- Automatic CI selection pins the newest installed iOS runtime, not an older
  runtime chosen to evade a failure.
- Appended destination/parallel overrides and signing-disable flags fail
  before erasure. Boot and Xcode failures remain failures.
- Normal simulator signing and nonparallel execution remain enabled.
- No production configuration, credentials, orb or Clementine changes.

## Verified proof

- Before canonical repair: runner/voice contracts14 pass,7 fail,0 skip.
- Before save-wrapper repair:1 pass,3 fail,0 skip. Intermediate explicit
  selector regression:0 pass,1 fail. Final three runner suites:26/0/0.
- Complete script suite on Node20.20.2:223 pass,0 fail,0 skip.
- Complete backend suite on Node20.20.2:2,739 pass,0 fail,2 skip.
  Both suites used the task-local complete tools image with external network
  disabled; no host provider credentials or host database were forwarded.
- Full signed iOS units:624 pass,0 fail,0 skip. Actual xcresult identifies
  erased task-owned device `11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, iOS26.2
  build23C54. No local26.5 runtime is installed.
- macOS scaffold compile:exit0; preexisting compiler warnings remain.
- Authenticated iPhone writer/save/Markdown-export/relaunch:1 pass,0 fail,
  0 skip. Existing harness validates exactly one successful test from the
  actual xcresult. Backend requires user auth and uses disposable storage;
  no host provider keys are forwarded. This is typed text, not generation.
- D009:all five deltas0 against origin/main. index.js remains33,626 lines;
  the later stack's33,603 invariant is not imported or artificially padded.
- Node/shell syntax and `git diff --check`:pass.
- Canonical PR-shaped offline quality gate:PASS with server/canon/heuristic
  page craft/fresh craft completeness enabled. Live/provider gates are
  explicitly off; external network disabled, synthetic auth, isolated data.

Retained unit bundle:
`/tmp/them-984-units/v1-ui-smoke-local-1-41946.xcresult`.
Logs: `/tmp/them-984-node20.log`, `/tmp/them-984-focused-final.log`,
`/tmp/them-984-units.log`, `/tmp/them-984-macos-final.log`,
`/tmp/them-984-writer.log`, `/tmp/them-984-offline-quality.log`.

## Recovery harness defect found during additional proof

Main's legacy `run_screenplay_save_network_fault_ui_smoke.mjs` starts a random
backend port and writes it to an xcconfig, but neither scheme exposes that
setting to XCTest. Both iPhone cases actually skipped at localhost31337
(0 pass,0 fail,2 skip). Quiet Xcode output hid the skip lines from its regex,
so the outer harness incorrectly exited0 and printed success. That output is
not passing recovery evidence. Retained skipped result:
`/tmp/them-984-offline/v1-ui-smoke-local-1-44265.xcresult`;
log `/tmp/them-984-offline-ui.log`.

The existing original #904 already contains port repair `ce772ce15e21a3452bd5554a976c42229c26861f`;
the rehearsal also has actual-summary/no-skips verification. Those original
heads are preserved, not silently replaced. This scoped main runner repair
does not claim to fix the outer harness. A direct authenticated fixture on
its documented port31337 is running the changed shell with actual xcresult
count validation; record the result separately before publication. Carry
forward the existing harness repair and fail-closed summary validation next.

## Still required

Main's existing writer helper deletes its temporary xcresult; do not claim
that UI bundle is retained. Required hosted checks and independent review must pass
on the published head; no direct main push or protection bypass.

This is verification infrastructure, not real-phone/live-generation proof.
Production sign-in, microphone → reply → formatted page, specific-line
rewrite, offline exact-word recovery, external-open export and a generated
120-page Hollywood screenplay remain unproven. No paid model call was made.
