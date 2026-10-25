# T-1138 — Preserve original mentor golden set safely

VERIFIED: original639 `57225143908b8fa0b3c832372f9f8676d4cdf43c` is based
on `claude/mentor-core-port`. Its body was read before changes. Merge946a3c9
preserves it and updated original638 `612bf17023854a3a5ba5890418b17ac1acc33b5e`.
No public head, base, main or production was changed by this local preparation.

## Root corrections and attribution

Original weekly workflow would make paid model calls automatically. Existing
Codex fix `6c55d9bcea66ef4667404a94929e6b3b7a299097` was cherry-picked with
attribution as49486db: weekly offline-only, fresh explicit manual approval for
live execution, no provider credentials in offline job, quoted selector data,
unknown-selector rejection and stop after provider failure. No live run is
authorized by this backport or this report.

The task-ledger cherry-pick conflicted. Safety review rejected removing large
historical context. Both sides were instead preserved with only markers removed
and an explicit historical-context heading. Those dated results are not new
proof or live ownership instructions.

The native pitch-priority hunk and regression are reused from existing
`dc8af7b522ef27ee5899dfedd237b2fdae7bab03`, not a replacement persona:
specific writer requests must outrank unsolicited scene pitches. Align the shared
mentor text with the accepted flexible120-page identity; preserve original
idea-building, dialogue-note and one-question rules. The standalone90–120
vocabulary phrase is removed from both copies because120 is not a ceiling.

## Evidence

VERIFIED red: offline gate at merge+backport exits1 because the original shared
persona file still contains110-page structural prescriptions. The flexible120
assertion fails; all40 golden/weak exemplar pairs separate. Update canonical
text, not the expectation. Log `/private/tmp/them-1138-offline-before.log`,
report `/private/tmp/them-1138-offline-before.json`.

## Terminal local proof on this candidate

- Official verified Node20.20.2, exact task-local lock install: full backend
  **2758 pass /0 fail /2 skip**, exit0. The skips are the DATABASE_URL-only
  real Postgres query and the explicitly gated live Page-sync provider case.
- Scorer and approval-guard regressions: **8/0/0**. Real CLI subprocesses prove
  a key alone does not authorize live mode; unknown scopes exit2; one injected
  provider failure yields one attempted case and a failed partial report, not
  a loop across remaining cases. Fetch is independently blocked in these tests.
- Offline golden gate: **all40 exemplar pairs separated, all8 prompt checks
  passed**, exit0. This is deterministic exemplar scoring, not live quality.
- Full signed iOS units on an erased integration-owned iPhone17Pro:
  **635/0/0**, including byte-equal shared persona parity and the reused
  direct-request-priority regression; exit0.
- Canonical authenticated local writer workflow: **1/0/0**, exit0. Its UI
  wrapper/backend used Node24.19.0; the full backend checkpoint used Node20.
- Mac scaffold build exit0. This is build-only, not an unsigned iOS test.
- Static workflow YAML safety checks passed: live job explicitly requires a
  manual approved dispatch; offline job has no provider secret; selector data
  is not interpolated into shell source. This is not a hosted dispatch claim.
- D009 all five monitored deltas0 against main; index remains33626 under the
  explicit staged exception. JavaScript syntax and `git diff --check` pass.

### Commands and retained artifacts

`node backend/evals/run_mentor_golden_eval.mjs` ran without live approval or a
provider key, with distinct before/fixed `MENTOR_GOLDEN_REPORT` paths.
Focused: `node --test backend/tests/mentor_golden_runner.test.mjs backend/tests/mentor_golden_scorer.test.mjs`.
Full backend: `cd backend && npm test` with the verified Node20 executable/PATH.

```sh
IOS_SIMULATOR_DESTINATION='platform=iOS Simulator,id=91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A' \
  bash scripts/run_ios_unit_tests.sh -quiet \
  -derivedDataPath /private/tmp/them-1138-ios-dd \
  -resultBundlePath /private/tmp/them-1138-units.xcresult
```

Writer: `node backend/evals/run_studio_ios_writer_loop_contract_smoke.mjs`,
same explicit simulator, task-owned XCODEBUILD wrapper supplying only isolated
DerivedData and a terminal result copy before canonical cleanup. No signing,
selection, timeout, product assertion or nonzero exit was suppressed.

Mac: `MAC_DESKTOP_ACTION=build MAC_DESKTOP_DERIVED_DATA_PATH=/private/tmp/them-1138-macos-dd bash scripts/desktop_preflight.sh`.

Archive `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1138-20261025.qIpuhf/`
retains unit/writer bundles, all terminal logs, failing/fixed offline reports and
the artifact-preservation wrapper. Provider/database environment overrides were
removed for local runs. No private environment file was copied or inspected.

### Exact authored/backported files

- `.github/workflows/mentor-golden-live.yml`
- `TASKS.md`
- `backend/evals/mentor_conversation/cases.mjs`
- `backend/evals/run_mentor_golden_eval.mjs`
- `backend/tests/mentor_golden_runner.test.mjs`
- `docs/mentor-golden-writer-sync-2026-10-20.md` (dated historical proof)
- `docs/product/mentor-golden-set.md`
- `docs/persona/mentor-core.txt`
- `them/HerVoiceSpec.swift`
- `themTests/HerVoiceSpecScenePitchTests.swift`
- `docs/original-639-parent-2026-10-25.md`

No inherited T1088 numbers are claimed as new proof. Existing Swift6 warnings
remain. No paid, production, physical-phone, live-model-quality, external-app
export preview or integrated-main proof follows from this local checkpoint.

## Integration action and stopping boundary

Keep original639 remote5722514 and its base `claude/mentor-core-port` unchanged
until corrected original638 head0b56861 has fresh green hosted checks. Then normally
fast-forward the original child, preserving all history, and require its own
fresh checks and independent human review. Main is still78b8c94. No approval,
merge, deployment, force-push or replacement PR was performed here.

VERIFIED next actual boundary: original640 `c8eb36bad5979748130e2da7ed9ea2b9b6abe061`
is based on `claude/mentor-golden-port`, not inferred from its number. Review its
original body/follow-ups and preserve existing three-act corrections rather than
reimplementing them. Fix the first actual integration failure before advancing.

## Parent touch-target refresh

VERIFIED: original638's prior612bf17/run40171307411 is terminal red: one
Snapshots tap left Revisions selected. T-1142 repaired the existing tab label's
hit region with one content shape and proved it with a failing-before/passing-
after minimum-target/padding-tap workflow. Original638 now publishes0b56861;
run40176990546 is live, backend/D009 green, full gate not yet terminal. Main and
original6395722514 remain unchanged.

Locally preserve both639candidatef2cf7b5 and638repair0b56861 with a no-ff
merge2ef41fd. Only TASKS conflicted; both task entries and historical ledger context
are kept. This is preparation, not a child publication past a pending parent.

Inherited T-1142 proof is UI3/0/0, units633/0/0, writer1/0/0 and Mac compile;
those are the parent tree's results, not fresh635-unit/combined-child results.
The earlier candidate proof above is retained with its original scope. Recheck
the offline identity/approval guard and numeric D009 here; full updated-child
native/hosted integration proof remains necessary before landing. No paid call,
live golden run, production change or independent-review bypass is authorized.

VERIFIED on2ef41fd: refreshed offline40 exemplar pairs and8 prompt checks pass;
Node20.20.2 scorer/approval guards8/0/0; all five D009 numeric deltas0 against
verified origin/main78b8c94; diff check pass. Backend, workflow, native identity
and Swift test source are byte-identical to priorf2cf7b5. DraftToolsViews and
V1SmokeUITests are byte-identical to tested parent0b56861. Earlier full-suite
and parent UI counts remain inherited, not newly executed combined-native proof.
Raw refreshed artifacts: `/private/tmp/them-1138-parent-refresh.1AAh99/`.
