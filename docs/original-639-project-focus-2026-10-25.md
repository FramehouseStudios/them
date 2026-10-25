# T-1146 — Project creation must hand the keyboard back

## Observed boundary

VERIFIED: original6396ec372d run40190222594 is terminal red in the required
writer loop: `V1SmokeUITests.swift:389`, project-title keyboard could not be
dismissed. Backend/D009 succeeded; later V1/voice/Mac did not execute. This run
therefore does not yet re-prove T1145's selected-tab fix on hosted26.5.

The log also proves the old runner erased B34C2F57 but let Xcode select E839A11B
by name. Do not describe that as an exact erased-simulator proof. The writer
runner deletes its result in finally; artifact12598571274 contains only the unit
bundle, so there is no retained writer screenshot/hierarchy to invent a cause
from. Log: `/private/tmp/them-639-40190222594-failed.log`.

## Preserved existing repairs, not parallel implementations

- Reused980c001 asaca5c2d: resolve once to an exact immutable UDID before erasure,
  reject ambiguous/unavailable selectors, preserve signing/non-parallel ownership,
  pass that same ID to Xcode. Keep negative-path and fake-tool fixtures.
- Reused9f64c97 as1b7ed58: one unique private writer artifact directory, retain
  bundles on every outcome, expose failure diagnostics and upload the existing
  owner. This matches the imported evidence contract. Do not also install the
  alternative571592e artifact owner. Both historical implementations remain in
  Git; this is an explicit compatibility choice, not missing work.
- Keep incoming JSON-inventory/exact-ID assertions when reconciling proof-test
  conflicts. Both ledger sides remain, with incoming context clearly historical.
  No app/backend production change is in these runner commits.

The first focused runner attempt was22 pass/5 fail/0 skip because the fresh
worktree had no Express/dependencies; fake Apple tools were never reached in
those five cases. Linked the existing byte-identical-lock dependency directory
read-only and reran: **27/0/0**, Node20.20.2. No package/lock or shared dependency
mutation. The owned link is local/untracked and must never be staged.

## Product reproducer and smallest focus owner

The strengthened existing authenticated writer workflow requires Create itself
to dismiss its title keyboard, with no extra Return/Done/swipe helper. All
project/save count, exact native text, export and relaunch assertions remain.
The old one-use keyboard-dismiss helper is removed, not retried or made slower.
The actual local baseline failed **0/1/0** at that new Create-owned dismissal
assertion, with the project already created through authenticated HTTP. It used
the exact erased91693AF0 simulator with signing; no separate dismissal tap.
The unusually long native operation1028s is not an acceptable latency result.
Unlike the old hosted runner, this baseline's full recording is retained.
Result owner is `/private/tmp/them-1146-before/them-studio-ios-writer-loop/`;
the exact bundle is `run-UvMh02/writer-loop.xcresult`. Native processes are
terminal before the runtime edit.

Existing0fe58ca provides the scoped SwiftUI FocusState/submit correction in
`ScreenplayStudioSidebarViews.swift`; it is now reused with the same blank-title/
busy eligibility guard as the Create button, so keyboard submission cannot bypass
that UI protection. No new state belongs
on Root/Studio god views, no second project writer and no auth bypass.

Full Node20 checkpoint after the coherent runner repairs: **2764/0/2**, retained
at `/private/tmp/them-1146-backend.log`. No backend code changed afterward:
title-focus and stronger writer checks are Swift-only. Existing backend
runtime remains byte-identical to6ec372d; six evidence cases add to2758 passes.

The corrected authenticated writer workflow passed **1/0/0**, canonical runner
exit0 and positive xcresult counts on the same exact erased owned simulator:
`/private/tmp/them-1146-fixed/them-studio-ios-writer-loop/run-KZhb74/writer-loop.xcresult`.
Create dismissed its own keyboard; actual inspector/typing/single-save/export/
relaunch assertions then passed. No extra dismissal action, synthetic save or
provider generation. Xcode reports55.6s for its test operation, but the bundle
interval includes a much longer build/setup period; this is not a general
performance guarantee. New full signed units passed **635/0/0**, positive
xcresult counts and process exit0, retained at `/private/tmp/them-1146-units.xcresult`.
Mac scaffold build passed **exit0 / BUILD SUCCEEDED**, retained at
`/private/tmp/them-1146-macos.log`. This is a build-only unsigned Mac check,
not a test invocation with signing disabled or proof of Mac interaction.

All five D009 numeric deltas are0 against actual original6380b56861. Backend
index33626 remains under the approved pre-stack exception; no padding/growth.
Node/shell syntax and diff checks pass. Permanent completed baseline/fixed/unit/
backend evidence, including failures, is retained at
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1146-20261025.PRUsjT/`.

Exact combined files versus failed6ec372d: `.github/workflows/quality-gate.yml`,
`TASKS.md`, `backend/evals/run_studio_ios_writer_loop_contract_smoke.mjs`,
`backend/tests/studio_ios_writer_loop_evidence_contract.test.mjs`,
`docs/audits/writer-evidence-retention-2026-10-08.md`,
`docs/exact-simulator-proof-2026-10-19.md`, `scripts/resolve_ios_simulator.mjs`,
`scripts/run_v1_ui_smoke.sh`, `scripts/run_v1_ui_smoke.test.mjs`,
`scripts/run_voice_network_fault_smokes.test.mjs`,
`them/ScreenplayStudioSidebarViews.swift`, `themUITests/V1SmokeUITests.swift`,
and this report. Most added ledger lines preserve both historical conflict sides;
they are not new code, active assignments or fresh proof.

The final sidebar eligibility guard and stronger Create-owned keyboard assertion
were already present for the passed writer and full signed-unit runs. No app or
runner change follows those runs. No unchanged rerun solely for documentation.

Adversarial scope: blank/busy submit is refused by the same view eligibility as
Create; cancelled/failed creation retains the existing model/error path. The
actual failed-HTTP/blank/Done-key UI paths were not separately exercised here.
Request owner, raw screenplay bytes and project storage are unchanged by the
focus patch; this is not new proof of all earlier new-project/promotion races.
Runner contracts positively cover duplicate names, wrong runtime/unavailable
IDs, caller override, boot/test/build failures, malformed/zero summaries, unique
retained bundles and preservation of unrelated config. Those use fake Apple
tools, not a second actual native process.

## Limits

No paid provider, production/deployment, main merge or physical-phone claim.
Production hold and independent human review remain. Original639/base/history
are preserved; nothing in this new lane is published until a coherent proven
checkpoint. Local975cc2ed19 remains saved and held at the earlier gate.
