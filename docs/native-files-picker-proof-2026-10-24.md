# T-1128 — Recognize the real native Files exporter

## Reproduced hosted boundary

VERIFIED: original draft #974 head
`10557ad3d19625037c847659f60439415534ab32` compiled and passed hosted signed
units947/0/0 in run
https://github.com/FramehouseStudios/them/actions/runs/40124255938 .
D009 and Backend tests also passed. The next required writer workflow reported
0 pass /1 fail /0 skip: “Real export did not present the native Files picker.”

The retained result contradicts the assertion's presentation diagnosis, not the
test's actual failure: iOS26.5's accessibility snapshot contains native
`Browse View (Picker)` and an active Save control, and both attached screenshots
show the real Files exporter. The private `DOCPicker.filenameTextField` was absent
in the failing snapshot. No unchanged retry was requested.

Hosted artifact12573657005 was inspected as diagnostic data only. Local retained
hosted bundle:
`/tmp/them-1128-hosted-proof.nmKwCl/Users/runner/work/_temp/them-v1-ui-smoke/writer-loop-f837e218-e79d-4e66-8ab9-75781e3309fc.xcresult`.
Its exported screenshots B4919B39-1387-4184-981C-082BA1E574AE.png and
DEC36916-740A-4C7D-831F-00C4B0D954D6.png were visually inspected.

## Smallest correction

- Recognize the observed native picker, retaining the older filename-field
  fallback. Require the entire picker to disappear on cancellation/save, not
  merely the private field. Reuse this boundary across existing export callers.
- Stop the integrated test at a failed presentation/cancel boundary instead of
  cascading actions into an unexpected screen. Preserve actual Save, filename
  confirmation, exact saved draft/version and relaunch assertions.
- Bound individual xcresult failure messages before applying the overall output
  tail. A large UI hierarchy can no longer erase the assertion headline. Full
  evidence remains in the retained xcresult.
- Let the canonical signed runner accept optional absolute
  `IOS_DERIVED_DATA_PATH` for task-owned native builds. Default CI behavior is
  unchanged; relative paths fail before simulator erase. No signing relaxation.

Exact files: `themUITests/V1SmokeUITests.swift`,
`backend/evals/studio_ios_writer_loop_contract_helpers.mjs`,
`backend/tests/studio_ios_writer_loop_contract_helpers.test.mjs`,
`scripts/run_v1_ui_smoke.sh`, `TASKS.md`, and this report.
No production app/backend source or watched god file changed in this follow-up.

## Current local proof

VERIFIED: Xcode26.3/17C529, signed tests on erased task-owned simulator
`7F1A14C1-B379-4417-AFE9-331810CD9CD3`, iPhone17Pro/iOS26.2.
Native DerivedData `/tmp/them-1127-clean-dd`; no other simulator was erased.

- Exact required `backend/evals/run_studio_ios_writer_loop_contract_smoke.mjs`:
  **1 pass /0 fail /0 skip**. Result
  `/tmp/them-1128-writer-proof/writer-loop-8e8cf87a-c839-4d21-be5c-65387c8ef5c1.xcresult`;
  `/tmp/them-1128-writer-proof-v2.log` records contract-smoke success.
  Authenticated isolated HTTP, real native Files cancellation/save, one saved
  server version and exact restored draft. Deterministic provider interception,
  not live model or microphone proof.
- Shared caller cases: **3 pass /0 fail /0 skip** in
  `/tmp/them-1128-export-callers.xcresult`:
  `test_talk_recovery_exports_current_owner_and_confirms_exact_deletion`,
  `test_received_talk_reply_is_held_across_relaunch_and_exported_without_resend`,
  `test_screenplay_export_failure_preserves_draft_without_claiming_a_file`.
- Node24.19.0 diagnostic helper: **11 pass /0 fail /0 skip**, via
  `node --test backend/tests/studio_ios_writer_loop_contract_helpers.test.mjs`.
- `bash -n scripts/run_v1_ui_smoke.sh`: exit0. Actual invocation with relative
  `IOS_DERIVED_DATA_PATH`: exit2 before erase, expected validation message.
- `node scripts/check_god_files.mjs`: pass versus origin/main; same five watched
  files also unchanged versus10557ad. `git diff --check`: pass.

The first local attempt was deliberately interrupted after review found a stale
test variable and Bash3 empty-array/nounset handling. Those were fixed before
the coherent passing run; the stopped bundle is not counted as a pass.

Reproduction uses the canonical smoke runner with `NODE_ENV=test`, isolated
stores, database/Redis environment removed, the existing local home-voice
provider fixture, Node24.19.0, the owned simulator and absolute DerivedData.
Never overwrite existing bundles or reuse another task's resources.

Local proof retained under
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1128-20261024.mLoBSW/`.

## Limits and next boundary

The exact app source already passed947 hosted signed units at10557ad; that is
inherited evidence, not another full local-unit run. macOS production sources are
unchanged; no fresh macOS build/full backend runtime suite was needed for this
test-and-runner-only correction. Fresh required hosted checks still run on the
descendant. iOS26.5 confirmation is pending; local26.2 passing cannot establish it.

The writer test verifies native save confirmation and exact backend/restored
draft, not exported file bytes or opening the file outside THEM. Physical-phone,
live provider quality, intended shipping backend and production remain unproven.
No paid calls, deployment, protection changes or main merge.

T1126 original-project recovery stays local-only at50d07e6 on its original branch,
preserving00be9dc and61c0566. Coherent destination regressions2/0/0; full feature
UI/full units remain unfinished. First publish this scoped correction to original
#974 and inspect new hosted results; then resume that preserved recovery work.
