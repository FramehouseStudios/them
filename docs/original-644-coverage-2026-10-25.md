# T-1155 — Script-bound coverage and unblocked active writing

## 1. Completed

VERIFIED locally at runtime commit `c9949f2c22080a6c348c03cb7827f1516b88d866`.
Worktree `/Users/halfmutantfilms/io.them-worktrees/codex-original-644-coverage`,
branch `codex/T-1155-original-644-coverage`, parent `cdd463f5`.

Read the original bodies and current comments, not just their initial commits.
Preserved original #644 `047672ac`, #880 `b619d7d0`, #881 `b7a0ea52` with
no-ff merges `502f68a9`, `a61b1dea`, `840f4f05`. Kept both task histories,
current recovery/auth/Craft client injection and canonical framework setter.
No broad cumulative-backup merge or replacement PR.

Replayed existing accessibility/body/byte/newline/HTTP repairs with attribution:
`a28c7e15`→`a40f2014`, `619f9887`→`cfea305a`, `e5b7efa3`→`b15093cf`,
`0919fc82`→`a48bcf46`, `4dc346ae`→`ee417a6e`. Retained already-present Pages
linter/title fixes. Title-only documents do not request a read; original raw
document bytes travel to one server-side body parser, not successive stripping.

The current account/session, project, exact bytes and request lease gate late
card/summary/speech/error publication. Reused freshness-only seams from
`5f71ec5c` in `4a787af1`: retain useful same-project notes as an explicitly
earlier snapshot; qualify manual earlier-read speech; never quote its summary
as current conversation context after a byte-distinct edit. Exact undo can
reuse the snapshot. Original646 automatic-refresh and774 quiet-announcement
policies remain at their actual later boundaries.

## 2. Exact files changed

Full integration-relative paths (not a claim these were all newly authored):

```text
Packages/ScreenplayStudio/Sources/ScreenplayStudio/FountainPaginationSource.swift
TASKS.md
backend/evals/generate_pagination_fixtures.mjs
backend/lib/method_not_allowed_routes.js
backend/lib/screenplay_companion_routes.js
backend/lib/screenplay_coverage.js
backend/lib/screenplay_pagination.js
backend/lib/studio_actions.js
backend/lib/talk_handler.js
backend/tests/block_signal_history_route.test.mjs
backend/tests/method_not_allowed_routes.test.mjs
backend/tests/screenplay_companion_routes.test.mjs
backend/tests/screenplay_coverage.test.mjs
backend/tests/screenplay_coverage_auth.integration.test.mjs
backend/tests/studio_voice_actions.test.mjs
docs/audits/coverage-context-2026-09-30.md
docs/audits/coverage-gate-2026-09-30.md
docs/coverage-document-identity-2026-10-16.md
docs/coverage-integration-proof-2026-10-16.md
docs/original-644-coverage-2026-10-25.md
docs/pagination/fixtures.json
them/BackendHTTPRedirectGuard.swift
them/BackendMemoryAPI.swift
them/BackendMemoryStatsModels.swift
them/CrossDeviceSyncPolicy.swift
them/RootExperienceView.swift
them/ScreenplayCoverage.swift
them/ScreenplayCoverageCardView.swift
them/ScreenplayCraftRailView.swift
them/ScreenplayPageLayout.swift
them/ScreenplayStudioScreen.swift
them/ScreenplayStudioThemRailCraftViews.swift
them/ScreenplayStudioViewModel.swift
them/StudioActions.swift
themTests/BackendHTTPRedirectGuardTests.swift
themTests/ScreenplayCoverageTests.swift
themTests/ScreenplayStudioDraftRecoveryTests.swift
themUITests/V1SmokeUITests.swift
```

## 3. Root issues fixed and adversarial boundaries

First native compile failed: imported `0919fc82` referenced a redirect guard
absent at this original-stack boundary. Zero tests executed, not a test pass.
`0de20427` reuses the exact existing delegate and five callback cases from
`fc759311`, calling the canonical origin validator still in BackendClient.
No duplicate origin policy or global HTTP migration. Coverage alone now uses
the guarded request; other legacy clients require their later security work.
These callback cases are not a new current native wire-redirect proof.

First connected UI run was **2 pass /1 fail /0 skip**, not green. Its retained
activity timeline/screenshot shows Read again was tapped behind a recovery
overlay; no additional coverage POST reached the backend. The failure was
waiting for the earlier-snapshot label to disappear, not a grading failure.

Root: `applyServerDraft` protected active dirty text from an unchanged server
poll, then called recovery evaluation anyway. The durable copy of those same
on-page edits became a modal and swallowed inspector controls. `c9949f2c`
does not reevaluate that redundant decision in the protected/no-conflict path.
It does not delete the local copy, allow remote overwrite, dismiss a genuine
conflict or skip fresh-launch recovery. Existing production seam is internal
for two direct VM regressions: exact Unicode/trailing bytes survive a poll
and a separately created recovery-store/VM restore; changed remote version
still raises a conflict and retains local text. No new state/store/client.

Account/project/request/byte ownership and cancelled/superseded completions
are covered by the real VM tests. Earlier cards are visibly qualified and
conversation snapshots compare raw UTF8, not trimmed text. Delayed manual
speech already queued outside this context, all legacy transport paths and
universal natural-language command consent are not claimed solved.

## 4. Verification — actual failures, skips and scope

- Pinned host Node **20.20.2**, full `npm test`: **2863 pass /0 fail /2 skip**.
  Isolated stores, no private .env read, real model key explicitly empty,
  Muse disabled. Not a network-disabled-container claim. Skips: real PostgreSQL
  prefix case without DATABASE_URL; existing talk page preview-header case.
  Final Swift-only corrections have zero backend diff from this tested tree;
  retained `backend-unchanged-after-native-fixes.diff`, no redundant rerun.
- First signed compile: failure, **0 executed**. Corrected dependency run:
  **747/0/0**. After the newly observed recovery root fix: full signed erased
  **749/0/0**, owned simulator91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A,
  iPhone17Pro/iOS26.2/23C54, Xcode26.3. Signing enabled normally.
- Connected UI before root fix **2/1/0**; unchanged three cases after fix
  **3/0/0**: all six inspector destinations/selection; authenticated project
  create/type/save→Craft read matched to independent HTTP→Markdown artifact→
  relaunch; separate actual same-page edit→earlier snapshot→Read again→current
  label. Real local authenticated HTTP, empty real provider key, external
  fetch blocked, **0 external attempts**. No physical mic/model/audio proof.
  The early writer export is an API artifact, not Files Save or external open.
- Current repaired screenshot inspected: readable multiline method/freshness
  labels, no redundant recovery overlay. Smaller SE/Dynamic Type and every
  panel's appearance were not re-reviewed. Legacy io.them tab wording remains
  at this historical boundary; do not describe name cleanup as complete.
- macOS scaffold **BUILD SUCCEEDED**; build-only canonical signing policy,
  not a signed macOS device journey. Existing actor/Sendable warnings remain.
- Offline mentor: **40 strong/weak exemplar pairs plus8 prompt checks**.
  This is not generated live model scoring. No paid calls these changes.
- D009 vs freshly fetched public parent643cdd463f5: index33557 unchanged,
  Studio17402→17352(-50), Root14992 unchanged, bridge12926 unchanged,
  Memory10846→10845(-1). No padding/allow-growth. Diff and JS syntax pass.

Initial unavailable-parent D009 comparison is recorded as unverified/failing,
then fetched correct refs and passed strict comparison; never treated absence
as clearance. All local proof handles terminal before documentation changes.
The corrected747 run began from unchanged dirty bytes because Git metadata
write permission failed; committing `0de20427` changed no compiled source.
Final749/UI3/Mac run from committed `c9949f2c` supplies the final evidence.

Producer `/private/tmp/them-1155.HTFq6i`, permanent completed archive
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1155-20261025.94VE7f/`.
Failed and successful bundles/logs, explicit manifests and source hashes kept;
no private env/backend state store copied. Remove only the task-owned exact
dependency symlink, never its parent641 target.

## 5. GitHub

Original64284659a6a now all required checks SUCCESS, run40239057836. Audited
hosted: Node20 backend2839/0/2; units705/0/0; strict writer contract pass;
V1 **29/0/15** (44 total, not44 passes); voice-fault1/0/0; Macbuild.
Original643 normally fast-forwarded86cc5b24→cdd463f5, draft and base unchanged,
all original history preserved. Fresh run40243698383: backend/D009/Docker
green, Quality still in progress at the latest checkpoint. Publication comment:
https://github.com/FramehouseStudios/them/pull/643#issuecomment-6404744035

Original644 remains047672ac/draft/baseclaude/studio-actions-port until exact
643 required hosted clearance. Save this scoped branch normally as a backup,
not a replacement PR. No main merge, approval impersonation, bypass, force,
squash, branch deletion, deployment, secret mutation or paid provider call.
Independent human approval for original638+ remains a landing prerequisite.

## 6. Next active task

Original6458a7f367a is the actual next product child; original880 is already
preserved. Body and current follow-up read. Reuse scoped02e9bee target-aware
mentor/scorer/delivery repair and its evidence, reconciling original649 seams
without silently merging intervening PRs. Flexible120 is a recommendation,
never hardcoded110-page instruction, forced length, padding or truncation.
Full native/live delivery must be re-proven for the resulting actual tree.

Then646/774 bounded quiet freshness at their real boundaries;648 prompt and
reply/writer authority; legacy coverage orphan disposition at its own boundary.
Physical phone, shipping host/auth/model/microphone/rewrite/offline/external
export remain unproven. Production credential hold is unchanged. No present
unlock blocker is asserted: human said the Mac is unlocked. THEM is not done.

## 7. Continue status

**READY FOR CONTINUE.** Safe local integration remains. Personal approval,
production clearance and eventual physical-phone participation remain human
actions, not a reason to mark the active product goal complete or blocked.
