# T-1129 — Pending-question fixtures survive the startup outbox notification

## First red, independently inspected

VERIFIED: original #974 at2369367, run
https://github.com/FramehouseStudios/them/actions/runs/40155283007 , passed
947 signed units, the exact writer-loop step, D009 and Node20 backend2964/0/4.
The following broad UI step failed: **34 pass /2 fail /22 skip**, not green.
Failures were the missing provisional card and missing second-launch question in
`test_provisional_story_options_require_an_explicit_selection` and
`test_restored_screenplay_question_can_be_answered_or_skipped`.
Subsequent recovery/macOS workflow steps were skipped by that failed gate.

The terminal job log and native bundle were inspected. Artifact12585487994's3627
archive paths were validated before extracting only the native broad-UI result;
no artifact code was executed and no raw backend secrets were read or published.
Retained bundle is v1-ui-smoke-40155283007-1-35050.xcresult in the archive below.

## Root and smallest canonical correction

The explicit seeded-question mode intentionally bypassed initial server hydration.
However, normal startup outbox notifications still reached
`ScreenplayStudioViewModel.refreshPendingScreenplayQuestion`. Its correct normal
no-project behavior cleared the synthetic question. Fixture persistence therefore
depended on the ordering of launch and notification delivery.

The refresh now observes the existing
`UITestLaunchConfiguration.shouldBypassStudioHydration` policy under DEBUG. No new
production flag, refresh owner, store, framework or timer. Normal real-project
restoration and queued-page recovery are explicitly NOT presentation fixtures.
Answered/skipped cards stay dismissed; the fix does not keep reseeding them.

Move the existing Studio fixture into
`ScreenplayPendingQuestionUITestFixture.swift`, preserving text/options/actions.
It emits one real `.themOfflineTalkOutboxUpdated` notification after installation
to reproduce the actual asynchronous boundary deterministically. Existing UI tests
retain answer, skip, exact three choices, explicit option selection and dismissal
assertions, with fail-fast diagnostics instead of cascading missing-element taps.
The screenshot/mock fixture never establishes real Clementine/backend behavior.

Exact changed files for this parent follow-up:

- `them/ScreenplayPendingQuestionUITestFixture.swift` (new, DEBUG only)
- `them/ScreenplayStudioScreen.swift`
- `them/ScreenplayStudioViewModel.swift`
- `themTests/BackendAccountDataControlsTests.swift`
- `themUITests/V1SmokeUITests.swift`
- `TASKS.md`
- `docs/pending-question-fixture-isolation-2026-10-24.md`

## Proof and runtime identity

Source correction2b2cd64 on original #974. Preserving merge
`4fffce47d399b1da86402a6fe83f912881aafb01` includes that source and original #975's
11be6df recovery work. No original commits were replaced or squashed.

VERIFIED with Xcode26.3/17C529, normal signing, erased owned iPhone17Pro/iOS26.2
simulator7F1A14C1-B379-4417-AFE9-331810CD9CD3, DerivedData/tmp/them-1127-clean-dd:

- Unchanged parent local baseline: **2/0/0**, them-1129-question-baseline.xcresult.
  This was timing-dependent and did not override the hosted red result.
- Explicit outbox notification before the guard: **0/1/0**,
  them-1129-notification-red.xcresult, same missing provisional card boundary.
- Corrected parent UI workflows: **2/0/0**, them-1129-question-fixed.xcresult.
  Canonical signed runner selected the two named UI cases. A requested third unit
  selector used the wrong class and did NOT execute; never counted as a pass.
- Full combined signed `themTests` at4fffce4: **950/0/0**,
  them-1129-combined-units.xcresult. The exact executed policy case was independently
  checked in the result tree:
  `BackendCredentialMigrationTests/testUITestStudioFixtureHydrationBypassIsExplicit()`
  (Passed). Its filename is BackendAccountDataControlsTests.swift; the earlier
  selector incorrectly assumed the filename's first class.
- Parent macOS scaffold and combined4fffce4 scaffold: **exit0**,
  them-1129-macos.log / them-1129-combined-macos.log. Build-only, not macOS runtime
  or release validation. No unsigned iOS tests.
- D009 and `git diff --check`: **pass**. Studio17337 ->17299 lines versus2369367;
  remaining four watched files unchanged. Backend runtime and tests unchanged,
  so its exact-tree hosted2964/0/4 is inherited evidence, not another local run.

Full unit reproduction uses `scripts/run_ios_unit_tests.sh -quiet` with the explicit
owned destination, `/usr/bin/xcodebuild`, absolute DerivedData and a fresh result
bundle. UI reproduction uses `scripts/run_v1_ui_smoke.sh` with ONLY_TESTING set to
the provisional case and the restored-question case appended by its exact selector.
Never overwrite retained bundles or erase another task's simulator.

Private retained archive:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1129-20261024.yudpBA/`.

## Remaining / publication discipline

Final report/ledger merges are documentation only; recheck that no native source
differs from tested4fffce4 before advancing the child. Normally fast-forward
original #974, then preserve-merge it into original #975 and normally advance that
draft. Fresh hosted checks apply to each updated head. Neither a local pass nor
the older head's hosted result establishes new hosted iOS26.5 confirmation.

No main merge, force push, replacement PR, deployment, protection/secret change or
paid provider call. Production remains held. Real-phone microphone/reply/rewrite/
offline/export-open proof, unbound recovery, precise rewrite recovery and interrupted
existing delivery-plan document continuity are still unproven. THEM is not complete.
