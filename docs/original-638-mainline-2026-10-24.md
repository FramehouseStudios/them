# T-1137 — Original mentor-core PR638 on current main

## Scope and preserved identity

VERIFIED: original #638 remains open/draft, based onmain, at
`6ad41171276e9c314ef2b12d818d5eff7463ab71`. Its original body and source were
read before integration. Currentmain is `78b8c94f43b4a11f18c2e61df556b9cd7370e735`.
Local preserving merge `8bc3f5aca3fca501609e7b8d75bc33c37fd3c1b0` has both
as ancestors and had no conflicts. No replacement PR, squash, force-push,
main mutation or production deployment occurred.

Worktree `/Users/halfmutantfilms/io.them-worktrees/codex-original-638-mainline`;
branch `codex/T-1137-original-638-mainline`.

## Current product reconciliation

VERIFIED source defect: the original mentor block prescribed commitment and
midpoint pages for a110-page feature, contrary to the human's newer flexible
120-page direction. Reuse the existing combined writer candidate's target
wording: recommend120, respect shorter/longer choices, scale guidance, never
pad or truncate. The original mentor identity, contract and attribution remain.
No new model/provider behavior or architecture is added by this reconciliation.

## Terminal verification, completed 2026-10-25

- Node20.20.2 verified executable; task-local exact-lock install completed.
- Initial focused command named nonexistent `talk_handler.test.mjs`: exited1
  before tests. Corrected to the actual `talk_handler_closure.test.mjs`.
- Corrected focused mentor/arcs/persona/trim/closure:26 pass /0 fail /0 skip
  on the preserving merge, before the native-only target wording correction.
- D009: all five monitored file deltas0 against origin/main. Diff check passed.
- Exact candidate full Node20 backend:2750 pass /0 fail /2 skip, exit0.
  The skips are the DATABASE_URL-dependent PostgreSQL query and the explicitly
  gated live Page-sync provider case. No paid calls were enabled.
- Signed full iOS units on an erased task-owned simulator:633 pass /0 fail
  /0 skip, exit0; `them-1137-units.xcresult`.
- Required canonical authenticated local writer workflow:1 pass /0 fail /0
  skip, exit0; `them-1137-writer.xcresult`. It exercises edit/save/export/relaunch
  against a real local backend; it does not prove microphone input or live
  Clementine quality. Its wrapper used Node24.19.0; the full backend checkpoint
  above used Node20.20.2. No unchanged rerun was performed to change that scope.
- Mac scaffold build exit0, `them-1137-macos.log`. This is an unsigned build-only
  scaffold check, not an unsigned iOS test or a production macOS release.
- Final D009 and `git diff --check` pass. All five monitored file deltas0;
  index.js remains33626, as allowed until the preserved stack establishes33603.

Commands from this task worktree:

```sh
# Provider/database environment overrides removed for local proof.
# Actual full backend invocation used the verified Node20.20.2 PATH.
cd backend && npm test
```

```sh
IOS_SIMULATOR_DESTINATION='platform=iOS Simulator,id=91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A' \
  bash scripts/run_ios_unit_tests.sh -quiet \
  -derivedDataPath /private/tmp/them-1137-ios-dd \
  -resultBundlePath /private/tmp/them-1137-units.xcresult
```

The canonical writer command was
`node backend/evals/run_studio_ios_writer_loop_contract_smoke.mjs`, with the
same explicit simulator and a task-local `XCODEBUILD` wrapper. That wrapper
only supplies isolated DerivedData and copies the terminal result bundle before
the canonical script's automatic cleanup. Test selection, signing, timeouts and
exit status were not relaxed. No repository script or workflow changed.

Mac: `MAC_DESKTOP_ACTION=build MAC_DESKTOP_DERIVED_DATA_PATH=/private/tmp/them-1137-macos-dd bash scripts/desktop_preflight.sh`.

Local archive: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1137-20261025.mDALSo/`.
It retains unit/writer bundles, backend/focused/build logs and the task-local
artifact-preservation wrapper; these are not committed or uploaded as app data.

Task-owned iPhone17Pro simulator `91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A`.
The other simulator holding the actual exported-file evidence is not erased.
No paid model request, physical-phone, live quality or production proof is claimed.

## Landing

Advance the original `claude/mentor-core-port` head only with a normal
fast-forward after local integration proof. Keep the original PR andmain base;
require fresh hosted checks and independent human review before any merge.
Original #639 remains stacked on this head and must not be skipped.

## Not covered

No integrated-main, external-app export preview, physical-phone, shipping-backend,
live mentor-quality or production claim follows from these local checks. Existing
Swift6 concurrency warnings remain. Later preserved stack work still supplies
other writer/recovery improvements; this is not a replacement rollup. The
separate parent #974 head8d519bd has backend/D009 green and its own hosted
Quality Gate in progress; its result is not this candidate's CI proof.
