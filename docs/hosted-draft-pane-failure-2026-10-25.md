# Original638 — Retained hosted Snapshots-pane failure

VERIFIED: original638 head `612bf17023854a3a5ba5890418b17ac1acc33b5e`,
run40171307411, is terminal failure. Main remains78b8c94. Backend and D009 jobs
passed; Quality Gate failed the required broad V1 UI step, and the subsequent
voice-fault/macOS step was skipped. Extracted hosted summaries: signed units
633 pass/0 fail/0 skip; broad V1 27 pass/1 fail/9 skip (37 total), hosted
iPhone17Pro/iOS26.5. The skipped broad writer case is not the separate required
authenticated writer step. Do not combine their scopes or infer missing counts.

The failure log identifies:
`V1SmokeUITests/test_draft_tools_tabs_route_to_each_presentation_pane`, line613,
asserting `studio.draft.snapshot-tools` after tapping Snapshots. Event trace
first finds Pages and successfully switches to Revisions. It then records one
Snapshots tap, but the snapshot-tools existence check fails within the raw4s
wait. That does not establish whether the tap, routing, visibility, accessibility
container or timing caused the failure. Inspect the actual artifact before
choosing a code or test correction. Do not just rerun the old job or increase a
timeout without evidence.

Raw failed-step log: `/private/tmp/them-638-40171307411-failed.log`.
The published PR remains draft and requires independent human approval; do not
merge while red, and do not advance original639/640. Earlier local backend2750/
0/2, signed633/0/0 and writer1/0/0 are retained, not relabeled hosted success.

Separate failure: original974's older run40170181825 failed recovery Files
readiness. Minimal UI-only candidatef4aca4a is published with fresh run40175219157
in progress. It is not declared resolved; those results do not clear638.

## T-1142 — Captured state and bounded correction

VERIFIED: artifact12591418575 was downloaded once to
`/private/tmp/them-638-ci-40171307411.O4pUTI/`. The explicit failed-test export
contains a24.603s recording, a hierarchy and both synthesized taps. Recording
frames at17/19/23s show Pages initially and Revisions after the first tap;
Revisions remains visibly selected after the Snapshots tap, matching the
selected accessibility trait. This is not evidence that Snapshot rendering
merely needed a longer wait.

The inactive Snapshots accessibility frame is (290.7,742.3,62.7,33.6). Its icon
occupies y742.3–755.6 and text y761.6–775.9. The recorded tap at
(321.9999847,759.1197205) is in the clear5pt gap between the two. Source uses
a plain Button with a padded/minimum-height VStack but no explicit content
shape; only the active tile has a nonclear fill. The intended tile is larger
than the inactive accessible/icon-text hit region. Define one rectangular label
content shape, without changing selection/routing, visuals or timing. The
before/after regression below verifies this product touch-target correction.

Isolated worktree
`/Users/halfmutantfilms/io.them-worktrees/codex-draft-pane-navigation`, branch
`codex/T-1142-draft-pane-navigation`, basee63c6e0 (preserves original638612).
Only the draft-tools label, its existing workflow regression, T-1142 ledger
entry and this handoff are owned. The regression asserts a minimum44pt target,
single padding taps, selected state, actual pane contents and return to Pages.
No repeated taps, sleeps, timeout increase or weakened assertion is proposed.

No paid model, shipping backend, private credential or phone action is needed.
All existing original heads/history and protections remain. Original638 stays
red pending the corrected exact head's required proof and independent review.

## Local differential proof

- Before the runtime change, the strengthened existing workflow fails0 pass/
  1 fail/0 skip on iOS26.2, exit65. Exact cause: inactive Revisions target is
  (193.8333,742.0,56.3333,34.2395), violating the44pt minimum. This is a real
  touch-target regression, not a compile failure, nonexistent selector or zero
  executed tests. Bundle `/private/tmp/them-1142-pane-before.xcresult`.
- Runtime change: one `.contentShape(Rectangle())` on the existing full padded
  draft-tools label. No button action, data, timeout or selection logic changed.
- Corrected signed focused run:3 pass/0 fail/0 skip, exit0, on an erased owned
  iPhone17Pro/iOS26.2. It includes the strengthened draft-tools workflow and
  the unchanged all-inspector-tabs and header/project-drawer workflows.
  Bundle `/private/tmp/them-1142-pane-fixed.xcresult`.
- Same source backend tree object as hosted638612:
  `8a25b8b6c22be36814c1b26040303fffe6053e96`. Its independently extracted
  hosted Node20 summary is2750 pass/0 fail/2 skip; not rerun or represented
  as a new full backend execution for this one-line native-only change.
- D009, `GITHUB_BASE_REF=main node scripts/check_god_files.mjs --json`:
  all five numeric deltas0 against verified origin/main78b8c94. No missing
  baseline accepted. An earlier invocation included an unsupported `--base`
  argument; its actual fallback was also verified origin/main, and the canonical
  environment-based invocation was then run explicitly. Diff check passed.

- Corrected signed full unit bundle:633 pass/0 fail/0 skip, exit0, same erased
  owned simulator. Bundle `/private/tmp/them-1142-units.xcresult`.
- Canonical authenticated local writer checkpoint:1 pass/0 fail/0 skip, exit0;
  `/private/tmp/them-1142-writer.xcresult`. REQUIRE_USER_AUTH=1, isolated server
  and storage. Wrapper Node24.19.0, exact-lock dependencies installed using
  Node20.20.2. No provider key or private environment file was copied.
  This is local edit/save/export/relaunch proof, not microphone/live generation
  or an externally opened file. Task-local XCODEBUILD wrapper only supplies
  owned DerivedData and retains the terminal result before canonical cleanup;
  selection, signing, timeouts and exit status remain intact.

Canonical commands from the T-1142 worktree (provider/database overrides unset):

```sh
IOS_SIMULATOR_DESTINATION='platform=iOS Simulator,id=91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A' \
  ONLY_TESTING=themUITests/V1SmokeUITests/test_draft_tools_tabs_route_to_each_presentation_pane \
  bash scripts/run_v1_ui_smoke.sh -quiet \
  -derivedDataPath /private/tmp/them-1142-ios-dd \
  -resultBundlePath /private/tmp/them-1142-pane-fixed.xcresult \
  -only-testing:themUITests/V1SmokeUITests/test_all_studio_inspector_tabs_route_to_real_panels_and_report_selection \
  -only-testing:themUITests/V1SmokeUITests/test_studio_header_shortcuts_and_project_drawer_tabs_reveal_their_destinations
IOS_SIMULATOR_DESTINATION='platform=iOS Simulator,id=91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A' \
  bash scripts/run_ios_unit_tests.sh -quiet \
  -derivedDataPath /private/tmp/them-1142-ios-dd \
  -resultBundlePath /private/tmp/them-1142-units.xcresult
IOS_SIMULATOR_DESTINATION='platform=iOS Simulator,id=91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A' \
  XCODEBUILD=/private/tmp/them-1142-xcodebuild.sh \
  /opt/homebrew/opt/node@24/bin/node backend/evals/run_studio_ios_writer_loop_contract_smoke.mjs
```

- Mac scaffold build exit0, positive BUILD SUCCEEDED and preflight OK. Command:
  `MAC_DESKTOP_ACTION=build MAC_DESKTOP_DERIVED_DATA_PATH=/private/tmp/them-1142-macos-dd bash scripts/desktop_preflight.sh`.
  This is a build-only unsigned Mac scaffold, never an unsigned iOS test.
- Proof retained under
  `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1142-20261025.Pm2R9K/`,
  with distinct before/fixed/unit/writer bundles and the original hosted artifact.

New hosted iOS26.5 proof is required before declaring the original run's failure
cleared; local26.2 is not silently relabeled hosted proof. No whole-app,
physical-phone or production claim follows. Existing Swift6 concurrency warnings
remain; they are not hidden by this touch-target correction.
