# T-934 — Direct, honest screenplay editor proof

## Problem and evidence

Goal item 7 requires reliable proof, not a green result obtained by retrying.
Hosted #928 Quality Gate run `37857480304` failed
`test_record_voice_turn_round_trips_to_screenplay` at its first draft assertion.
V1 smoke: **27 pass, 1 fail, 9 skip**. Backend/god-file jobs passed. This test
injected a **typed** launch prompt and used a deterministic local transport,
not physical microphone capture or a paid provider.

Downloaded the exact hosted artifact `quality-gate-failure-logs` (id 11586906291)
to `/tmp/them-928-hosted-artifacts`. Its failure bundle is:
`Users/runner/work/_temp/them-v1-ui-smoke/v1-ui-smoke-37857480304-1-35172.xcresult`.
Extracted test attachments to `/tmp/them-934-hosted-writer-attachments`.
`5E0AE847-5DAF-42A0-B54F-A202EA6AC3A2.txt` shows:

- `studio.draft.editor` and surface contain `INT. KITCHEN - DAY`;
- hidden `studio.draft.snapshot` contains the complete scene including `LUCY`;
- receipt says `Wrote to page. Typed.`;
- snapshot is below the window (y 1039); the command-bar drawer is beyond its
  right edge (x 408 in a 402-point window).

Thus this failure **does not prove missing screenplay text**. The old generic
descendant queries and per-query polling exhausted their bound without observing
the content shown in the failure hierarchy. Query/visibility latency is an
inference; the artifact does not establish the exact instant every node mounted
or prove startup timing played no role. Unchanged isolated signed baseline passed 1/1:
`/tmp/them-934-writer-baseline.xcresult`. This is diagnostic evidence of the
intermittent observation failure, not an unchanged rerun that clears hosted red.

## Correction

Rename the test to `test_typed_page_prompt_round_trips_to_visible_editor`.
Keep the same page prompt and deterministic transport. Do not open the unrelated
command-bar drawer when the launch hook already submits it. Query the actual
native screenplay TextView by its identifier and use a predicate requiring both
the original heading and character within **10 seconds**. Assert the editor is
hittable and both strings remain in its value. Retain the full synthetic fixture
hierarchy on failure. No timeout increase, skip, assertion removal, production
change or paid call. Repository search found no other reference to the old name.

## Limits and separate risks

This remains typed-stub UI coverage. The local backend writer/recovery gates
prove different portions of the real transport/save chain; none substitute for
physical-microphone/provider shipping-config proof.

Read-only startup review found independent launch-submit and hydration tasks.
The artifact proves content remained in this failure, so this change does not
claim to fix or reproduce that separate ordering risk. T-933's iOS 26.2 actor
teardown crash remains tracked. Main and Claude's work remain untouched; #766
then #770 still require independent review and required green gates.

## Files and proof

Only `themUITests/V1SmokeUITests.swift`, `TASKS.md` and this audit are changed.
Corrected focused signed test: **1 pass, 0 fail, 0 skip**, 4.619 seconds;
`/tmp/them-934-writer-focused.xcresult`.

Full signed units, erased owned iPhone 17 Pro simulator on iOS 26.2:
**672 pass, 0 fail, 0 skip**, `/tmp/them-934-units.xcresult`.

Full backend on Node 20.20.2, external networking disabled: **2,744 pass,
0 fail, 2 skip**, `/tmp/them-934-node20.log`. Source/dependencies mounted
read-only with only an ephemeral tmpfs persistence directory writable. The
initial run lacked that writable directory: 2,622 pass, 9 fail, 2 skip with
module imports unable to create `/workspace/backend/data/persistence`; retained
at `/tmp/them-934-node20-readonly-red.log`. An earlier container mount attempt
never started the test process. No code change was used to clear those errors.

God-file gate versus #931 and diff check pass; all five protected sizes unchanged.
No production file changed, so the previous #931 macOS production build is
unchanged evidence, not a new macOS test claim.

Full signed V1 UI: **28 pass, 0 fail, 11 skip, 39 total**, 432 seconds;
`/tmp/them-934-full-ui.xcresult`, output `/tmp/them-934-full-ui.log`.
The corrected typed test passed within that full run. Eleven fixture-dependent
journeys did not execute; this is not 39 passing tests.

Dedicated authenticated local-backend integrated writer gate: **1 pass, 0 fail,
0 skip**, `/tmp/them-934-integrated-writer.log`. Its strict summary verifier
passed create/save/export/relaunch/restore. The existing evaluator removes its
result bundle on completion; only the output is retained. This does not prove
physical microphone or live provider operation.

Dedicated signed authenticated recovery gate: **4 pass, 0 fail, 0 skip**;
`/tmp/them-934-recovery-ui/screenplay-save-network-fault-35407.xcresult`, output
`/tmp/them-934-recovery-ui.log`. Includes offline save/relaunch/reconnect,
expired auth/stale conflict/Keep Mine, intentional delete-all and blank Snapshot
with Saved-tab restore. All signed UI/unit proof runs erase the owned simulator
first. Six other fixture-dependent V1 skips are not covered by these dedicated
gates; do not claim every UI journey executed.

GitHub run `37858536990` for #929 completed red at the separate recovery gate:
the unresolved-conflict relaunch assertion failed. The writer marker remained,
but conflict identifiers and parked state were absent; this is not proof of
lost text. Retained output:
`/tmp/them-929-hosted-recovery-failed.log`. This test-only slice does not claim
to fix that production recovery risk or clear its required hosted gate.
