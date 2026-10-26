# T-1159 — Repair original644's hosted writer typing interaction

## 1. Completed

VERIFIED local correction on `codex/T-1159-hosted-writer-focus`, based exactly
on failed original64442d6f74666f26eadcc39ec5a3eb2d1f64c90bfce. No other
saved645/646/647 source imported. Original history/base/draft preserved.

The writer test now taps a visible upper portion of the oversized native
editor, requires its keyboard and Save draft accessory, then uses focused
application typing. It still types real keystrokes exactly once and checks
exact draft bytes and one saved version. No launch-seeded replacement text,
retry loop, assertion relaxation, extra allowance or production focus change.

## 2. Exact files changed

```text
TASKS.md
backend/evals/run_home_voice_handoff_ui_smoke.mjs
docs/hosted-writer-focus-2026-10-25.md
themUITests/V1SmokeUITests.swift
```

The runner change reuses the existing saved646 allowlist entry for the shared
coverage case. Its default two Home cases are unchanged; no provider policy
or production route changed.

## 3. Root investigation and scope

Hosted run40248016339 failed at writer line864: `Failed to synthesize event:
Neither element nor any descendant has keyboard focus.` Downloaded actual
xcresult, UI hierarchy and recording before changing the test. The hierarchy
has editor frame y347/h660 in an874-high screen. The recording shows keyboard
present around115s, absent around123s, with empty draft and no active typing.

VERIFIED: keyboard focus disappears between page tap and event synthesis.
INFERENCE: XCUI element visibility scrolling/centred oversized-element targeting
is involved; no isolated UIKit regression establishes every internal cause.
The minimal test correction avoids both behaviours and asserts the necessary
keyboard precondition. A local pass alone does not establish hosted iOS26.5
reliability. Fresh exact-head hosted Quality must pass before advancement.

## 4. Verification

- Canonical `run_studio_ios_writer_loop_contract_smoke.mjs`: **1/0/0**,
  real authenticated backend and app-created project, real UI typing/save,
  single-version/export handoff/restore assertions unchanged. Native elapsed
 46.920s is test timing, not a product latency metric. No unchanged retry.
- Shared coverage UI through canonical intercepted-provider runner: **1/0/0**,
  current/earlier read and real inspector controls. Provider counters ASR0/
  chat1/TTS0, synthetic not paid/model/microphone/audio quality proof.
- First coverage invocation rejected unsupported selector before any backend/
  native case executed; retained failure log. Reused canonical allowlist entry,
  ran node syntax and then the actual case. Do not count the rejection as a
  product test failure or a pass.
- Both signed on erased owned91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A,
  Xcode26.3/iOS26.2/23C54. Reserved7F1A14C1 remains untouched.
- D009 initially failed closed because remote baseline ref was absent; fetched
  actual original644 and verified all five deltas0. Diff check passes.
- Native/backend production and unit sources are byte-identical to parent;
  retained zero-byte diff. Parent T1155 **749/0/0 units, Node20 backend2863/0/2,
  Mac BUILD SUCCEEDED** are parent evidence, not newly run here. Do not waste
  another unchanged full local suite or claim the higher647 counts on644.

Permanent explicit archive:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1159-20261025.oBhRux/`.
Retain current writer/coverage bundles, logs, exact patch and zero-diff proof.
Original hosted failure archive remains in
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1158-20261025.Dx6cbK/`.
No env, fixture auth stores, provider keys or signing material copied.

## 5. GitHub status

Publish only a normal descendant of42d6f746 to original644 after checking
parent643 and exact remote target. No force/squash/replacement, main change,
protection mutation or human approval submission. Fresh hosted checks are
mandatory; public645+ remains held until this exact updated644 is green.

## 6. Next active task

If hosted644 is red, fix its first actual failure. Otherwise preserve this
correction into saved645+ with no-ff history and normal bottom-up publication.
Remaining raw completion/coalescing/queued-save and Root async creation risks
are recorded in saved647425d354, not silently declared solved here.
Human638 review and production/physical-phone journey remain separate gates.
External file-open is not proved by an export sheet or this writer test.

## 7. Continue status

READY FOR CONTINUE; local typing repair verified, hosted clearance pending.
Full product goal active/incomplete; no paid call or deployment this task.
