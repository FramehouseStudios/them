# Writer beta — readiness and release handoff

Updated September 5, 2026 (America/Los_Angeles).

## Milestone and scope

DECIDED: the next milestone is a dependable, production-configured iPhone
writer beta. The orb and Clementine remain permanent product anchors (D014,
formerly D008 on the writer-beta branch; renumbering explicitly approved by
the human on September 5 to preserve main's separate D008 Muse-runtime decision).
The integration is published as open
[PR #445](https://github.com/FramehouseStudios/them/pull/445); no production
deployment, distribution upload, or credential change is claimed here.
The human subsequently authorized pushing and deploying verified, safe work
into main. This replaces the earlier no-push restriction, not the release
configuration, credentials, privacy/signing, or acceptance requirements.

The acceptance journey is: start a project, turn an idea into formatted pages,
edit while generation is active without losing edits, save, reopen after a
fresh launch, preserve reviewed memory corrections, and export the result.
Failures and offline transitions must preserve the writer's input and provide
a real recovery path. A simulator fixture pass is not production acceptance.

## Code-owned work

### Authenticated Render inspection (September 5, after briefing)

VERIFIED from the signed-in service dashboard, without changing configuration:

- Service `srv-dact95cmqu1s73bpjal0` shows `a5ea13faada2a7411637354cb434017113c5e776`
  as its live, last successful deployment. The newer `c2b80225...` deployment
  failed; health from the old instance does not prove new-code readiness.
- Failed deployment logs show all 12 then-current migrations already applied,
  zero pending, and the canonical auth store initialized. Pre-deploy completed.
  Startup subsequently refused to boot for missing `APP_STORE_ISSUER_ID`,
  `APP_STORE_KEY_ID`, and `APP_STORE_PRIVATE_KEY`.
- Current masked environment-key inventory still lacks those three entries.
  `APP_STORE_BUNDLE_ID` and `APP_STORE_ENVIRONMENT` exist, but their values were
  not revealed or validated. No environment groups are linked.
- Actual service settings match the checked-in Dockerfile/context, pre-deploy
  command, `/healthz`, and Auto-Deploy Off. No deploy was triggered.

HUMAN_INPUT_REQUIRED: the human confirmed these credentials are not yet
available. Obtain them and enter them securely in Render when ready. Keep the
live deployment unchanged. Do not remove the production verification guard or claim
IAP acceptance merely because environment keys exist. TestFlight signing,
public domains/privacy, exact release-token agreement, purchase verification,
and current-revision deployment checks remain separate release gates.

### Current integration and PR review (September 5)

The active isolated branch is `codex/T-writer-beta-integration` at
`/private/tmp/io-them-writer-beta-integration.Xj45Mg`. It combines tested
main-based commit `945c8cf` with writer-beta commit `6c9ed23` in merge commit
`35557b7`. Open #445 was inspected at head `d5763d4`, base main `9c74759`.
Later uncommitted feature work is not part of that verified PR head and must
be preserved separately. The reviewed 11 PR heads,
reproductions, local ports and parked features are recorded in
[the Claude-related PR audit](claude-pr-audit-2026-09-05.md).

New integration corrections cover uncertain auth-commit fencing and recovery,
empty ETag handling, owner-scoped turn metadata (including colliding public
turn IDs), deterministic FDX dates, and native print/export correctness.
The final local Node 20/PostgreSQL v4 run passed **2,707 tests, zero failures,
one live-provider skip**. Local signed iOS export v1 passed 855 units but
exposed an 866-second clipboard permission stall and failed native Files
presentation. Hosted #445 later passed signed units, native Mac exports and
the real Files Cancel/Save writer loop; its required broader V1 suite failed
Pages Previous → current page 2 (56 tests, nine skips, one failure).
Exported-file byte readback remains unverified. These are not all-green claims.

**Merge hold:** main itself and the current #445 revision must pass required
checks before merge. Main `9c74759` run 33980301593 is still red on Save now's
exactly-one UI-action assertion. #445 run 33988950331 is red on Pages. The green
#446 diagnostic used a PR merge tree, not the intended pre-#437 revision, and
its soft smokes failed. See [current coordination evidence](claude-inbox.md)
for run links and the single-lane #443/#444 plan.

The first native export tests passed despite inverted glyphs visible in the
rendered PDFs. Both renderers' raw Quartz coordinate handling is now corrected,
and final native macOS export/print tests passed **22/22**. All nine corrected
Mac PDF fixture pages and 19 corrected iOS fixture pages were visually
inspected, including Unicode and continuation layout. Physical printing
remains untested. Release printing remains off by default, with explicit opt-in
and a hard kill switch.

The disposable PostgreSQL database applied all 13 migrations, reran with zero
pending/applied, and used both new account-scoped auth indexes on 10,000-row
fixtures. No production migration was performed. Required hosted gates remain
required, with native print drawing added to macOS coverage. Code publication
in #445 is not production promotion or beta release approval.

### Previously committed writer-beta work

- Legacy memory reads no longer invent nested acceptance/learning/correction
  dates or manufacture cross-device revision conflicts. Real write events keep
  their timestamps. Committed as `a0f63cc`.
- Real PostgreSQL verification exposed an invalid account-lock SQL seed and
  password-reset comparisons that depended on JSON object-key order. The
  shared lock now binds a stable bigint seed; structural comparisons preserve
  identity/content checks while accepting JSONB key ordering. Committed as
  `17a69ca`.
- Craft routes validate authentication and ownership wiring before registering
  routes; missing dependencies no longer appear as unrelated project 404s.
  Committed as `7604ad6`.
- Release diagnostics can read the checked-in backend default when Xcode is
  deliberately skipped, without claiming resolved build or live-host proof.
  Committed as `6ea2db1`.
- A stale Swift test expected standard-default debug credentials to work
  outside explicit automation. The test now verifies rejection and restores
  prior defaults; production authentication was not weakened. Committed as
  `c3fd6a8`.
- Explicit UI-test reset now clears current owner-scoped recovery journals,
  not just the legacy filename. Normal owner-specific removal and preserved
  relaunch state remain unchanged; unrelated files, directories, and symlinks
  are protected by regression tests. This reset is DEBUG-only and requires
  explicit UI-testing/reset arguments.
- Inspector tests now use real compact-header destinations and check selected
  tabs before scrolling their rows out of the lazy view hierarchy.
- Backend-restore fixtures now actually persist their three expected notes on
  the server and check canonical readback before launching the app. Explicit
  DEBUG/UI-test backend URLs take precedence over cached healthy hosts and
  late health probes, so simulated offline-save tests cannot silently reach a
  healthy backend instead. Release/non-UI routing remains unchanged. The routing
  and launch-only command cleanup are committed as `9351129`.
- Queued saves now restore the actual local draft before reconnect or a stale
  version decision, prefer newer local journal edits, and preserve an already
  dirty page. Retry waits for selected-draft hydration; a successful authenticated
  reload retries immediately rather than waiting on stale offline backoff.
  Queued status is scoped to the exact owner/project/draft while badge totals
  remain account-wide. Delayed draft processing rejects stale draft, project,
  version, and auth contexts after suspension. Committed as `c67d23a`.
- Pages now uses full-width readable 12-point monospaced previews from the actual
  current draft, with up to four visible lines and natural two-line wrapping,
  rather than tiny truncated thumbnail text. Summary, density controls and all
  three cards were inspected on the signed iPhone 16e fixture. Page jumps update
  current state and disable Next at the final page. The density readout exposes
  a stable accessibility label and numeric value. The final signed navigation
  story passed. Committed with the Studio UI fixtures as `9f0ce37`.
- Draft-save replies now belong to the account intent and project-selection
  occurrence that requested them. A late success acknowledges the original
  queue entry without navigating back or changing the new page's journal.
  Late conflicts and failures retain the original queued bytes and leave the
  visible page alone. Explicit saves in another project are neither coalesced
  with identical text nor rebased onto the old project's version. Guards also
  cover empty-base preflight, queue-acknowledgement suspension, and post-save
  revision enrichment. Session bootstrap and authorization retry cannot dispatch
  a screenplay write under a superseded sign-in intent. This extends the existing
  auth-generation mechanism and canonical HTTP client, not a second auth system.
- Backend fixture servers and memory seeders are isolated from ambient
  PostgreSQL/Redis settings (`adcd67e`). Studio render tests bind the same IPv4 loopback
  address they request, preventing collisions with unrelated IPv4 listeners.
  The matching pattern is corrected across the HTTP fixtures, including waits
  for asynchronous host binding, and protected by a static regression test
  (`0a3e89c`; the parser fixture also changed in `5ef2786`).

### Dependency exception

The production audit identified two `qs` advisories propagated through Express
4.22.2/body-parser 1.20.6. Their current ranges pin `~6.15.1`; no newer compatible
parent release was available during this pass. The narrowly scoped npm override
pins `qs` to 6.16.0, the same-major release fixing
[GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx) and
[GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g).
The app does not enable comma parsing or use a discovered `qs.stringify` sink;
the override removes the vulnerable dependency rather than relying on those
current exposure conditions. Committed as `5ef2786`. Remove this exception when the supported Express
4/body-parser releases accept a patched `qs` range, then rerun the audit and
parser/auth/export regression gates. No Express major upgrade was made.

## Verification ledger

This document is an evidence handoff, not release approval. Results below
describe this local branch, not current `main` or the deployed Render build.
The signed offline-save stories exposed premature fixture application, replayed
launch-only commands, a queued-status debounce race, and retrying against the
hydrated server page without restoring the queued local draft first. A repeat
then exposed a fast-relaunch retry/backoff timing problem. Those fixes passed
both signed recovery stories in the v5 and v6 runs. Pages' recorded default
activation coordinates landed below the visible reset button; tapping its
current frame center passed the full navigation story. The final v6 regression
set passed **735/735, with no failures or skips**. This is not a production-beta
approval or proof that the unmerged newer main features work on this branch.
The subsequent save-isolation pass also passed **749/749 (745 unit tests and
the same four signed UI workflows), with no failures or skips**. See the
suspended-save verification below for its independently reproduced failures
and final artifacts.

Completed checks so far:

- Memory fix: 221 focused tests; full backend 2,429 passed, 7 skipped.
- Final full backend with disposable PostgreSQL enabled: **2,447 passed,
  zero failed/cancelled, one live-provider-gated test skipped**. This includes
  the patched parser and all fixture corrections. Command used the same
  `TEST_SPAWN_BACKEND=1`/sequential-test settings as `npm test`, with an added
  60-second per-test timeout.
- Fresh disposable PostgreSQL 16: all 11 migrations applied; rerun applied
  zero; six real concurrency/persistence tests passed after the fixes.
- Real HTTP → PostgreSQL account/project smoke: 38 checks passed against a
  separate disposable database. Signup/login, save/idempotent replay,
  cross-owner rejection, refresh/replay/logout, password reset and sibling
  invalidation passed. Restarting with fresh local mirror directories restored
  the exact saved draft and new password while revoked access stayed denied.
  This used test-mode inline reset tokens, not real email delivery or a
  production-environment boot. Proof: `/tmp/them-writer-beta-http.ObEBh8/proof.json`.
  Repeated successfully after the parser update. The disposable databases and
  local HTTP-smoke mirror files were removed after verification; proof and the
  reproducible local script remain. No user or production data was removed.
- Script suite: 205 passed, zero skipped or failed.
- Signed iPhone unit suite: 731 passed, zero skipped or failed on September 5,
  including current queued-draft restoration and hydration regressions.
- Full signed iPhone regression: 768 passed, three failed, four explicitly
  gated UI tests skipped (775 total). A subsequent focused run passed all 721
  unit tests, backend restore, and Pages (723 passed), but the two save-outbox
  stories still failed before their expected offline edit appeared. The
  backend-history fixture omission is fixed and verified. Later v5/v6 runs
  passed restore and both recovery stories. The final v6 set passed 731 units
  and all four targeted UI stories (backend restore, conflict resolution,
  reconnect, Pages), 735 total. The old full UI suite has not been rerun after
  these final corrections. Evidence: the `ios-verified-20260904`,
  `ios-recovery-final-20260905`, and `ios-recovery-pages-v*` bundles in `/tmp`.
- Strict pre-flight: no findings.
- Deterministic canon and fixture voice/realtime gate: passed. No real
  speech recognition, paid generation, or real audio-output claim is made.
- macOS dormant scaffold: current September 5 build passed; macOS remains outside V1.
- Production Node 20.20.2 container: built locally; 31 database/parser/auth/export
  tests passed from the image, including six real PostgreSQL tests. It runs as
  a non-root user, excludes known local
  credential/data files, and refuses production startup without required
  configuration. No image was pushed.
- Production dependency audit: zero vulnerabilities reported after the scoped
  `qs` update; 149 focused parser/auth/export tests passed, including both
  advisory regressions and preserved Express query behavior.
- Studio render fixture stability: 100 consecutive focused runs, 5,000 test
  passes. A controlled address-family collision and a failing-before binding
  regression establish the fixed fixture flaw; the exact original socket
  error was not independently reproduced.

Local evidence is stored under `/tmp/io-them-writer-beta-*20260904*` and
`/tmp/io-them-beta-nested-memory-*20260904.log`. These are temporary local
artifacts, not durable CI or production evidence. September 5 follow-up
artifacts use the matching `20260905` suffix. Commit the final code and
rerun the checked-in CI/release gates before promotion.

## Integration and current GitHub evidence

VERIFIED September 5: GitHub CLI authenticates as `FramehouseStudios` and has
repository access. Fetched `origin/main` is `9c74759`; this branch at `b6f1fb3`
has 50 unique commits versus 113 on main. Seven local commits have patch
equivalents on main; commit counts do not measure missing features. A
non-worktree-mutating `git merge-tree` check reports 16 conflicting files,
including auth, draft recovery, the UI suite, CI, and accepted decisions.
Do not merge or reset the shared checkout blindly. Reconcile in an isolated
local integration branch, preserve both sets of verified behavior, and rerun
the full gates before proposing any push.

The current [main quality-gate run](https://github.com/FramehouseStudios/them/actions/runs/33980301593)
completed with failure at 17:36 UTC: its backend job passed, but the required
iPhone writer loop failed. Backend log: 2,520 passed, zero failed, two skipped.
The failing assertion expected exactly one Save Now handler invocation but
recorded zero, with the recovery-copy discard message instead. Authenticated
project creation and typing reached that point; exact tap/layout causation is
not established. The deployed CI harness deletes its result bundle even on
failure, leaving insufficient visual evidence. The isolated local fix retains
that bundle and includes it in failure-artifact uploads; GitHub has not received
or executed that fix yet.
The relayed billing-block claim is not true for this run. Main's gate does run
the backend suite but does not explicitly run the full `themTests` unit bundle.
An isolated local branch, `codex/T-writer-beta-main-test-gates`, adds required
signed iOS units and native macOS export tests, with targeted test-fixture,
secret-redaction, and typography corrections. Its four actual native macOS
export tests and all 618 signed iOS unit tests passed (zero failures/skips).
The 18 focused script/helper tests passed. Local commits: `5d0c57d` (redaction),
`da6c146` (typography), `ec47e18` (Keychain request fixtures), and `945c8cf`
(required gates and retained writer-loop artifacts). Those results and commits
are separate from this shared branch, not merged or pushed. The checked-in
integrated writer-loop harness subsequently passed locally: exactly one signed,
unskipped test covering UI project creation, typing, one save, export, and
fresh-launch restore. Result: `/tmp/io-them-studio-ios-writer-loop-91374.xcresult`;
log: `/tmp/io-them-main-writer-loop-20260905.log`. It used installed lockfile
dependencies, a temporary JSON backend, iPhone 16e/iOS 26.2, and local Node
26.7.0 (hosted CI uses Node 20). The hosted failure is not reproduced or fixed
by that one successful local run; retain/review a future hosted failure result
before claiming CI stable. No workflow rerun or remote change was performed.
Read-only GitHub API checks also returned `404 Branch not protected` for
required checks and no applicable branch rules. Passing jobs are therefore
not evidence of enforced merge protection. Adding repository-wide protection
is a separate remote policy change; it has not been performed here.

The handoff's newly merged printing, IAP recovery, error mapping, export, and
live-draft changes are not validated by this branch's older test counts.
Keep printing off by default in Release and keep the parked story-to-page,
what-if pills, additional offline queue, and canon-LRU work out of this pass.

## Current external release blockers

Configuration findings from September 4, with September 5 public-host checks
noted below. Credentials, signing, and deployed-version proof remain separate:

1. The protected local release file is absent. `DEVELOPMENT_TEAM_ID`,
   `APP_TOKEN_RELEASE`, and `OPENAI_API_KEY` are unavailable locally. Do not
   paste secrets into task messages; use the ignored mode-600 configuration
   described in [release configuration](v1-release-preflight-proof.md).
2. Keychain reports no valid code-signing identities. Simulator ad-hoc signing
   does not establish Apple distribution signing or provisioning.
3. September 5 unauthenticated probes without following redirects:
   `https://them-backend.onrender.com/healthz` returns 200 with healthy
   persistence, while `/api/version` returns 401. This proves an accessible
   service, not its deployed commit or production configuration. The shipped
   `api.them.io` health/version URLs still redirect to parked-domain content.
   The September 5 18:19 UTC privacy probe also returned 302 to
   `https://introvert.com/?domain=them.io`. No domain configuration was changed.
4. Production PostgreSQL migrations, the canonical-auth marker, live-provider
   gates, App Store/privacy approvals, TestFlight upload, and physical-device
   acceptance remain unverified. A local disposable database is not production.
5. Pricing, real-writer retention, output acceptance, and fully loaded provider
   cost are not established by these tests. Do not convert engineering counts
   into a launch-readiness percentage or commercial claims.

Fresh main adds four mandatory `APP_STORE_*` inputs to production startup:
`ISSUER_ID`, `KEY_ID`, `PRIVATE_KEY`, and `BUNDLE_ID`. Their actual Render
configuration cannot be inferred from unauthenticated health. Main has
implemented the stricter boot guard while its D011 amendment remains proposed;
the D001 domain clarification is also still proposed. Reconcile these decision
records before release. Never bypass the purchase-verification guard to make
a boot check green.

## Remaining local reliability checks

1. Repeat the integrated newer-main writer loop and review any saved failure
   recording, including Save Now's actual activation point after keyboard and
   recovery-banner layout changes. The equivalent Pages XCTest activation
   point was stale; that does not establish the hosted writer-loop cause.
2. Reconcile the two tested branches in an isolated integration checkout,
   retaining both contracts and rerunning the complete backend, Swift and UI
   suites. Do not use the earlier 16-conflict preview as a resolution plan.

### Suspended-save adversarial verification

The pre-existing save-completion concern above was reproduced through the real
`manualSaveDraft` → canonical HTTP client → durable queue path. The first four
controlled-delay tests all failed: success navigated back to the old project;
conflict and error handling wrote the new project's draft into the old recovery
record. Result: `/tmp/io-them-save-isolation-red-20260905.xcresult` (four tests,
24 failed assertions). These were not introduced by the earlier debounce fix.

The initial correction passed all 95 focused recovery/outbox/isolation tests,
including 10 new delayed-response tests:
`/tmp/io-them-save-isolation-v1-20260905.xcresult`.
A further adversarial pass passed 13 of 14 isolation tests and exposed a second
defect: changing auth intent while session bootstrap was pending still dispatched
the old draft. Result: `/tmp/io-them-save-bootstrap-red-20260905.xcresult`.
The canonical version-write API now validates the captured generation before
bootstrap, after bootstrap, around header/response handling, and on authorization
retry. Studio passes its original request generation across the actor boundary.

Final verification after both fixes:

- **745/745 unit tests passed**, including all 14 save-isolation regressions.
- **4/4 signed iPhone 16e UI workflows passed** against a disposable authenticated
  loopback backend: seeded-project restore, expired-auth/stale-conflict recovery,
  queued-save relaunch/reconnect, and the complete narrow Pages navigator.
- Result: `/tmp/io-them-writer-beta-save-isolation-full-20260905.xcresult`;
  log: `/tmp/io-them-writer-beta-save-isolation-full-20260905.log`.
  The backend stopped normally and its disposable fixture directory was removed.
- macOS scaffold build passed via `scripts/desktop_preflight.sh`;
  log: `/tmp/io-them-save-isolation-macos-20260905.log`. This is compile-only
  proof, not a new native-macOS runtime acceptance claim.
- `node scripts/pre_flight.mjs --strict` and `git diff --check` passed.
  Existing concurrency warnings elsewhere in the Swift tests remain; the touched
  view-model initializer's actor-isolation warning was removed by constructing its
  default recovery store inside the main-actor initializer.
- GitHub read access and admin repository permission were reverified. Remote
  main remained `9c74759`; its latest hosted Quality Gate remained failed at
  [run 33980301593](https://github.com/FramehouseStudios/them/actions/runs/33980301593).
  No push, remote merge, workflow rerun, branch-policy change, or deployment occurred.

Covered boundaries include same-page newer edits, project A → B, A → B → A,
an explicit same-text save in B, a conflict in A while B's save is pending,
empty-base preflight, auth-generation changes before response and during durable
acknowledgement, and revision failure after navigation. Test transports use
isolated URL sessions and temporary journals/queues; no production/provider
request is involved. This does not certify all asynchronous project operations
or physical-device account switching. Those remain in integrated release smoke.
The next code-owned work is the isolated branch reconciliation and repeated
newer-main writer-loop verification above, not another Pages redesign.

## September 5 file manifest

Shared branch code commits (`9351129`, `c67d23a`, `9f0ce37`):

- `them/BackendClient.swift`
- `them/BackendMemoryAPI.swift`
- `them/UITestLaunchConfiguration.swift`
- `them/ScreenplayDraftSaveOutbox.swift`
- `them/ScreenplayStudioViewModel.swift`
- `them/ScreenplayStudioDraftToolsViews.swift`
- `them/ScreenplayStudioScreen.swift`
- `themTests/BackendAccountDataControlsTests.swift`
- `themTests/ScreenplayDraftSaveOutboxTests.swift`
- `themTests/ScreenplayStudioDraftRecoveryTests.swift`
- `themTests/ScreenplayStudioDraftToolsPresentationTests.swift`
- `themUITests/V1SmokeUITests.swift`

Shared branch handoff: `TASKS.md` and this document.

Suspended-save fix and regression files:

- `them/BackendMemoryAPI.swift`
- `them/ScreenplayStudioViewModel.swift`
- `themTests/ScreenplayStudioSaveResponseIsolationTests.swift`
- `docs/writer-beta-readiness.md`

Separate main-based branch commits (`5d0c57d` through `945c8cf`):

- `them/ElevenLabsTtsClient.swift`
- `them/ClementinePackStore.swift`
- `them/CompanionTtsVoiceSettingsSection.swift`
- `themTests/ElevenLabsTtsClientTests.swift`
- `themTests/BackendPageCancelClientTests.swift`
- `themTests/StudioThreadViewStateSupportTests.swift`
- `them.xcodeproj/project.pbxproj`
- `them.xcodeproj/xcshareddata/xcschemes/them-macOS-scaffold.xcscheme`
- `.github/workflows/quality-gate.yml`
- `scripts/ci_merge_safety.test.mjs`
- `scripts/run_v1_ui_smoke.test.mjs`
- `backend/evals/run_studio_ios_writer_loop_contract_smoke.mjs`

## External clearance actions

1. Confirm deployment ownership/configuration of the existing Render service
   at `them-backend.onrender.com` and the intended custom-domain cutover.
   Do not create another paid service or silently change the shipped URL.
2. Follow [backend deployment](../backend/DEPLOY.md): provision the approved
   Postgres, apply migrations, establish the canonical-auth marker, and keep
   V1 at **one backend instance**. Remaining snapshot-based auth writes do not
   support unrestricted multi-instance operation. Migration `--status` and
   `--dry-run` can create a tracking table; do not treat them as production
   read-only probes.
3. Configure protected backend/app inputs and Apple capabilities/signing.
   Publish the approved privacy policy at the exact shipped URL without a
   redirect. Never use dummy credentials as release proof.
4. With explicit paid-gate/release authority, run
   `scripts/run_release_preflight.sh` with no release gates disabled. Its
   signing, live service, quality, and artifact gates must all pass.
5. Validate and upload the signed build to TestFlight; install on a physical
   iPhone. Run [the V1 manual smoke](runbook-v1-smoke.md), including real auth,
   voice/realtime fallback, editing, save/relaunch/export, memory correction,
   logout, and account-data controls. Record failures honestly and retain
   Launch Doctor evidence.
6. Obtain explicit release-owner signoff before inviting beta writers.

## Reproducible developer checks

From the repository root:

```sh
git diff --check
env -u DATABASE_URL npm --prefix backend test
node --test scripts/*.test.mjs
node scripts/pre_flight.mjs --strict
env -u DATABASE_URL npm --prefix backend run eval:canon
ONLY_TESTING=themTests scripts/run_v1_ui_smoke.sh
scripts/run_v1_ui_smoke.sh
```

Keep simulator signing enabled. `CODE_SIGNING_ALLOWED=NO` causes UI-test
Keychain setup to abort. Run stateful UI stories sequentially on one simulator.

Real database checks belong in an isolated disposable database or the existing
`migrations-check` CI job. With `DATABASE_URL` explicitly pointing to that
test-only database:

```sh
node scripts/apply_migrations.mjs
node scripts/apply_migrations.mjs
node --test backend/tests/persistence_postgres_live.test.mjs
```

Do not run test migrations, seed data, or cleanup against production.
