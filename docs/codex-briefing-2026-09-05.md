# io.them — Codex handoff for Claude
Snapshot: September 5, 2026, 12:28 PDT. Implementation paused at the human's request for this briefing.

## Executive status

The dependable, production-configured writer beta is NOT complete or deployed. The work materially improves Pages, save recovery, account isolation, exports, and verification, but the active integration is still an uncommitted merge. No push, remote merge, PR comment/closure, deployment, production migration, paid-provider call, signing/distribution change, or physical printing was performed by this pass.

The human now explicitly authorizes pushing/merging/deploying once the work is connected, working, and safe. This supersedes the earlier no-push restriction, not security/release gates. The orb and Clementine remain permanent anchors. The approved orb/Clementine decision was renumbered D008 to D014 locally without changing its accepted wording/status; main's separate D008 Muse-runtime decision remains.

## Exact repository state — preserve it

Active integration:
- Path: /private/tmp/io-them-writer-beta-integration.Xj45Mg
- Branch: codex/T-writer-beta-integration
- HEAD: 945c8cf (main-based gate fixes)
- MERGE_HEAD: 6c9ed2361cf3c8d0991b4c303a61d4efc699b8f2 (verified writer-beta source)
- 19 conflict paths are textually resolved but remain unmerged in the index because they have not been staged.
- 185 status entries at snapshot, including inherited merge changes and five untracked files; this briefing is an additional new file.
- git diff --check passes. This is NOT a clean worktree or a finished merge.

Preserved, clean source checkouts:
- /Users/halfmutantfilms/Documents/framehouse.studio.v01/io.them/.agents/worktrees/codex-operating-rules
  branch codex/T-ios-keychain-token-migration, HEAD 6c9ed23.
- /private/tmp/io-them-main-test-gates.LG91Ht
  branch codex/T-writer-beta-main-test-gates, HEAD 945c8cf.

Do not reset/abort the integration, overwrite source worktrees, or stage unrelated shared changes. Normal commit of the resolved integration must preserve both merge parents.

## Completed engineering work

### Committed main-based preparation

The clean main-test-gates branch contains four local commits, now parents of
the active integration work:
- 5d0c57d — fully redact ElevenLabs keys in provider errors.
- da6c146 — use canonical Clementine settings typography.
- ec47e18 — align page cancellation fixtures with Keychain authentication and request-body streams.
- 945c8cf — require signed iOS unit and native Mac export verification and retain writer-loop failure artifacts.

These commits are local; the integration containing the remaining fixes is
not committed or published yet.

### Integration and client reliability

Reconciled newer main with the writer-beta work, preserving main's queued auth notifications, native print ownership, live-draft sync and required gates, plus incoming owner-scoped recovery, exact reset safety, phone layout and save isolation. Retained combined tests rather than choosing one side wholesale.

Fixed a SwiftUI type-checking-budget failure by extracting the existing Working Thread filter button expression, without changing behavior.

The integrated Pages tab now has Page Navigator guidance, current/total page summaries, estimated runtime, labeled density controls and standard-55 reset, recalculation, Previous/Next, full-width preview cards, line ranges, current-page state and real jumps. Signed iPhone 16e workflow passed; all five retained introduction/density/page-card screenshots were visually inspected with no vertical-letter collapse. Final-page Next disabling is asserted.

Remembered-login testing now reveals the containing profile scroll view and taps the actual trailing switch thumb. The earlier AX switch frame included its text label, so a center tap missed the thumb. Signed relaunch/disable passed and before/after images show both Remember me and Save password switching off.

A Home design-token violation found by the full suite was corrected using canonical typography and named companion colors, not by exempting the file. The guard and narrow Home workflow subsequently passed.

Previously committed writer-beta behavior remains: queued local text survives offline/auth/conflict/relaunch; late save replies cannot overwrite a new project/account; exact owner-scoped journals protect unrelated files; memory reads do not invent acceptance timestamps. The source's historical 749/749 proof is separate from today's combined integration tests.

### Authentication, authorization, and persistence

Ported useful #423 protections, then fixed failures the original port still had:
- Unknown canonical commits quarantine affected local sessions and fence later snapshot writes.
- Authoritative reconciliation distinguishes committed revocation from a real rollback; unrelated sessions remain valid.
- Empty If-None-Match validators return content, not an erroneous 304; valid weak/strong conditional reads remain authenticated.
- Added migration 013 for two user-scoped expression indexes, avoiding collision with main's existing 012 wallet migration.
- Applied all 13 migrations to disposable PostgreSQL, reran as a no-op, and confirmed both new indexes are used on 10,000-row fixtures. No production migration.

Found and fixed independent turn-metadata security defects:
- Double-prefixed ownership blocked the right owner and permitted legacy fallback for a wrong owner.
- Realtime writes now record server-authenticated ownership.
- Cache keys are owner-scoped, so different writers using the same public turn-N no longer overwrite each other.
- Public response keys, TTL and global bound remain stable.

Final adversarial review then reproduced two additional real failures:
- Hydrated legacy auth IDs WriterCase and writercase could alias through normalized ownership and read each other's metadata.
- Applied-but-malformed commit acknowledgements could leave stale bearers authorized or permit unfenced writes.
Both are corrected locally. Exact private owner identity is preserved without changing public user_id fields. Existing quarantine/reconciliation helpers handle malformed acknowledgements, including rollback recovery and committed predecessor rejection.
Latest focused proof: 263/263 passing, zero skips. These LAST hardening edits still require a new full Node20 backend run.

### Export and print correctness

FDX serializer is now clock-free; its route supplies an injectable UTC date when needed. Explicit dates, whitespace aliases, frozen input and determinism are covered. 25/25 pass on host Node and deployment Node20.

Repaired existing native PDF/print code, not the unsafe alternate backend:
- Raw Quartz/CoreText coordinate handling no longer mirrors glyphs.
- macOS print adapter actually draws each requested page and respects embedded rotation.
- iOS continuation labels reserve their own space.
- UTF-16 offsets are used consistently for Unicode.
- No-progress/invalid-range conditions and the iOS 250-page limit fail explicitly instead of returning a successful truncated PDF.
- Release printing remains off; physical AirPrint is untested.

Mac corrected native tests: 9/9 pass; all nine retained pages (six Unicode export pages, two print pages, one rotated fixture) visually inspected.
iPhone Letter/A4 geometry: all nine rendered pages visually inspected and upright/nonoverlapping. The latest geometry test failed three assertions because its substring lookup matched the page-number suffix inside dialogue text. The test now matches the complete page-number line; that test correction is NOT rerun yet. Ten-page corrected Unicode continuation fixture exists but full visual review remains pending.

### Important final discovery: iPhone export was not truly handed off

The existing iPhone path wrote a temporary file and displayed Saved but never presented Files/share UI. Worse, DEBUG UI tests replaced real backend export with a synthetic artifact; the writer-loop export assertion therefore proved only a filename message. Do not claim prior writer-loop passes prove real export delivery.

Implementation is now written but NOT compiled or tested:
- Existing SwiftUI FileDocument/.fileExporter presents exact backend artifact bytes.
- Preparing/choosing a location is not reported as saved.
- Actual Save URL, cancellation and errors have truthful outcomes.
- Duplicate export and stale project/account/request callbacks are guarded.
- Automatic DEBUG fake-artifact path is removed.
- Google Docs now copies the full draft on iPhone using local-only clipboard and checks URL-open completion instead of falsely claiming success.
- Mac local export/NSSavePanel stays intact.

Files: them/ScreenplayStudioExportSupport.swift, them/ScreenplayStudioScreen.swift, themTests/ScreenplayStudioExportSupportTests.swift.
Only diff checks have run for these final edits. Root has NOT yet updated V1's old fake-dependent export smoke or writer-loop Files interaction. This is the next implementation task.

## All 11 open Claude-related PRs reviewed

Exact heads and fuller findings are in docs/claude-pr-audit-2026-09-05.md. Heads were rechecked unchanged at 19:21 UTC.

- #420 CI cost: do not adopt soft gates or ineffective label-trigger policy.
- #423 auth/index/ETag: useful corrections ported and strengthened; broad soft UI gates rejected.
- #425 UI smoke: retain stronger exact reset handling; fix Remember me's real visible target.
- #431 ghost preview: parked for project/account lifecycle and INT./EXT. parsing defects.
- #435 backend PDF: not ported/enabled. Bounded tests reproduced nontermination, silent final-line loss, bypassed page caps and Unicode/continuation issues.
- #436 TODO nudge: parked for restored-draft initialization and narrow-UI gaps.
- #438 request-body next beats: rejected because model suggestions cross into writer-canon input fields.
- #440 ghost/print stack: no wholesale port; duplicated print coordinator/cancellation/state and Release-on behavior are unsafe. Repair existing print owner instead.
- #442 deterministic FDX date: ported and improved.
- #443 additive next-beats response: preferred foundation, but NOT ported/enabled.
- #444 next-beat pills: parked for stale ownership, retry identity, busy-state and visible-cost mismatches.

Review complete does NOT mean all experimental PR features are implemented. No Claude PR was merged, closed, or changed remotely.

## Verification ledger — do not add these counts together

| Run | Exact outcome | Qualification |
| --- | --- | --- |
| Full Node20 backend + disposable PostgreSQL | 2701 passed, 0 failed, 1 live-provider skip | Before the final exact-identity/malformed-ack hardening |
| Latest auth/turn metadata focused run | 263 passed, 0 failed, 0 skipped | Includes final two hardening fixes; full rerun pending |
| FDX | 25 passed | Verified on Node20 and host runtime |
| First full signed iPhone units | 835 passed, 1 failed (836 tests) | Home token violation corrected later |
| First full signed iPhone UI | 50 passed, 1 failed, 5 skipped (56 tests) | Remember me test target corrected later |
| Corrected signed iPhone units | 838 passed, 1 test failed with 3 assertions (839 tests) | Complete-line PDF header lookup fixed afterward, not rerun |
| Corrected selected signed iPhone UI | 6 passed, 0 failed, 0 skipped | Home, Remember me, Pages, real save/relaunch and two recovery stories; export assertion still used old synthetic path |
| Corrected signed native Mac tests/build | 9 passed, 0 failed, 0 skipped | All nine PDF pages visually inspected; predates final Files/clipboard edits |
| Scripts | 98 passed; later 83 affected gate contracts passed | Strict preflight and diff checks passed before final new export edits |

Five full-UI skips: three cross-platform fixture stories, live-draft two-device, writer-block instinct fixture. They were not provided to that run.
The backend skip requires a live provider. No paid-provider gate was executed.

The first full host backend run exposed five fixture failures, corrected without weakening production checks. A first Node20 run exposed two test-harness failures because the minimal production image lacked compiler/Bash tools; the green rerun supplied those tools only in a disposable test container, ran tests as nonroot, and did not change the production image.

## GitHub / production

GitHub access works. Current remote main: 9c74759e8028acfe48b44add55fdf6f6fa75857d.
Latest main quality-gate run 33980301593 failed in the Save Now writer-loop assertion; backend tests passed. Local corrections are not yet hosted proof.
Branch protection: 404; repository/applicable rulesets empty. Do not treat mergeability as proof all required tests ran.
Repository Actions secrets list has OPENAI_API_KEY but lacks APP_TOKEN_RELEASE and DEVELOPMENT_TEAM_ID. No values were exposed.

Render blueprint explicitly has autoDeploy:false and one backend instance. DEPLOY.md's stale claim that pushing main deploys automatically was corrected; promote a verified specific SHA manually after release prerequisites.
Latest recorded Render deployment failed for c2b80225d586bddc3a8b4b80a0373294b6a23504; earlier a5ea13fa... succeeded. Current served SHA is not established.
Render /healthz: 200, persistence OK. /api/version:401.
api.them.io health/version and them.io/privacy:302 to parked introvert.com.
Local private release file/team/release token/provider key are missing. Actual production secrets, App Store IAP credentials, predeploy/auth marker, backup/rollback readiness and deployed configuration remain unverified.
No production credentials, DNS/privacy, distribution settings, or databases were changed.

Render dashboard opened read-only but stopped at Sign In. Human was asked to sign in securely in the in-app browser; permission was granted, but login has not been completed/verified. Never paste credentials into this briefing or chat.

## Next exact steps

1. Finish V1 export tests: replace fake-dependent standalone smoke with truthful failure/preserved-draft coverage; required real-backend writer loop must exercise native Files Cancel then Save and prove exact delivered bytes.
2. Compile final export/clipboard changes on iPhone and Mac; run all Swift units, selected UI and native exports. Rerun whole-line PDF assertion and finish all-page Unicode visual QA.
3. Rerun the full Node20/PostgreSQL backend suite after final auth hardening.
4. Rerun strict preflight, gate tests and git diff --check; update readiness/audit docs with final evidence (their current prose lags this briefing).
5. Review/stage only intended integration paths, resolve the index, and commit the two-parent merge.
6. Push project-owned branch/open PR, wait for hosted checks on exact SHA, fix failures and only then merge to main. No force push, bypass, or bulk stale-PR merge.
7. Separately inspect failed Render deployment after secure login, verify production configuration/rollback/migrations/domains, then promote only if safe. Production-configured beta acceptance and physical-device/provider verification are still outstanding.

## Diagnostic artifacts and owned resources

- Backend full green: /tmp/io-them-integration-backend-node20-full-pg-v2-20260905.log
- Latest auth hardening: /private/tmp/io-them-integration-owner-auth-hardening-focused-20260905.log
- Full iPhone baseline: /tmp/io-them-integration-ios-full-20260905.xcresult
- Corrected iPhone: /tmp/io-them-integration-ios-corrected-20260905.xcresult
- Corrected screenshots/PDFs: /tmp/io-them-integration-ios-corrected-attachments
- Corrected native Mac: /tmp/io-them-integration-mac-export-v2-20260905.xcresult
- PDF renders: /tmp/io-them-integration-pdf-qa
- Temporary signed iPhone harness: /tmp/io-them-integration-ios-verification-20260905.mjs
- Owned iPhone16e simulator: 948555EF-51B5-4F1B-A271-63C4DD2F2729; don't touch the user's other simulator.
- Disposable PostgreSQL container io-them-integration-postgres-20260905 remains for rerun, localhost55432, no production data. Node test containers auto-removed. iOS fixture backends stopped/removed their owned data. No tests remain running at briefing.
- Signed iPhone tests MUST retain CODE_SIGNING_ALLOWED=YES; unsigned UI tests abort on Keychain reset.
- Three subagents are paused/done; no parallel editing should continue during this briefing.

## Continue status

READY FOR CONTINUE on code-owned tasks. Production promotion is separately blocked by the explicit items above. Do not mark the whole writer-beta goal complete.

## Exact pre-briefing changed-file manifest

Git status codes below include inherited merge content; they are not 185 newly authored files today. UU means the text resolution has not been staged. This briefing itself was added after the snapshot.

```text
UU .github/workflows/quality-gate.yml
UU DECISIONS.md
 M Packages/ScreenplayStudio/Sources/ScreenplayStudio/DesignSystem/IOThemColors.swift
MM TASKS.md
MM backend/DEPLOY.md
 M backend/evals/page_craft/run_page_craft_eval.mjs
M  backend/evals/run_cross_platform_question_cadence_smoke.mjs
M  backend/evals/run_realtime_learned_answer_voice_smoke.mjs
UU backend/evals/studio_app_session_helper.sh
UU backend/index.js
M  backend/lib/craft_routes.js
M  backend/lib/creative_memory_store.js
 M backend/lib/fdx_export.js
 M backend/lib/fdx_export_route.js
M  backend/lib/memories_route.js
UU backend/lib/outbox_store.js
M  backend/lib/persistence_json.js
M  backend/lib/persistence_postgres.js
 M backend/lib/read_state.js
 M backend/lib/realtime_turn_commit_route.js
 M backend/lib/talk_pipeline.js
MM backend/lib/user_auth.js
MM backend/lib/user_store.js
M  backend/tests/accepted_twist_log.test.mjs
M  backend/tests/account_routes.test.mjs
M  backend/tests/api_version_route.test.mjs
M  backend/tests/archetype_engine.test.mjs
M  backend/tests/auth_routes.test.mjs
A  backend/tests/backend_test_server.test.mjs
M  backend/tests/block_detector.test.mjs
M  backend/tests/block_signal_history.test.mjs
M  backend/tests/block_signal_history_route.test.mjs
 M backend/tests/clementine_iap_packs.test.mjs
 M backend/tests/clementine_page_abort_midflight.test.mjs
 M backend/tests/clementine_page_cancel_e2e.test.mjs
 M backend/tests/clementine_wallet.test.mjs
M  backend/tests/coverage_simulator.test.mjs
 M backend/tests/craft_auth_invariants.test.mjs
 M backend/tests/craft_completeness_gate.test.mjs
M  backend/tests/craft_endpoints.test.mjs
M  backend/tests/craft_routes_body_parser.test.mjs
M  backend/tests/creative_memory_export.test.mjs
A  backend/tests/creative_memory_recency.test.mjs
M  backend/tests/creative_memory_stats_route.test.mjs
M  backend/tests/creative_memory_triggers.test.mjs
M  backend/tests/cross_device_memory_conflict_smoke_contract.test.mjs
M  backend/tests/cross_platform_question_cadence_smoke.test.mjs
M  backend/tests/decisions_queue_route.test.mjs
MM backend/tests/fdx_export.test.mjs
M  backend/tests/first_page_telemetry.test.mjs
M  backend/tests/fountain_export.test.mjs
M  backend/tests/fountain_import.test.mjs
M  backend/tests/genre_classifier.test.mjs
M  backend/tests/health_route.test.mjs
M  backend/tests/healthz_route.test.mjs
M  backend/tests/helpers/backend_test_server.mjs
M  backend/tests/history_recap_routes.test.mjs
M  backend/tests/idempotency_envelope.test.mjs
M  backend/tests/log.test.mjs
A  backend/tests/loopback_fixture_binding.test.mjs
M  backend/tests/memories_route.test.mjs
M  backend/tests/memories_route_deeper.test.mjs
A  backend/tests/memory_card_recency.test.mjs
M  backend/tests/memory_character_mention.test.mjs
A  backend/tests/memory_quality_snapshot.test.mjs
M  backend/tests/ops_alerts_route.test.mjs
M  backend/tests/ops_health_summary_route.test.mjs
M  backend/tests/ops_metrics_route.test.mjs
M  backend/tests/ops_routes_list_route.test.mjs
UU backend/tests/outbox_store.test.mjs
 M backend/tests/page_craft_eval.test.mjs
M  backend/tests/payoff_tracker.test.mjs
M  backend/tests/persistence_adapter.test.mjs
M  backend/tests/persistence_json.test.mjs
M  backend/tests/persistence_postgres_live.test.mjs
M  backend/tests/prompt_routes.test.mjs
M  backend/tests/rate_limit.test.mjs
 M backend/tests/read_state.test.mjs
M  backend/tests/realtime_call_route.test.mjs
M  backend/tests/realtime_client_secret_route.test.mjs
M  backend/tests/realtime_learned_answer_voice_smoke.test.mjs
M  backend/tests/realtime_routes.test.mjs
M  backend/tests/realtime_routes_deeper.test.mjs
M  backend/tests/realtime_studio_render_routes.test.mjs
MM backend/tests/realtime_turn_commit_route.test.mjs
M  backend/tests/route_local_parsers.test.mjs
M  backend/tests/screenplay_companion_routes.test.mjs
M  backend/tests/screenplay_export_formats_route.test.mjs
M  backend/tests/screenplay_export_markdown_route.test.mjs
M  backend/tests/screenplay_export_pdf_error.test.mjs
 M backend/tests/screenplay_live_draft_routes.test.mjs
M  backend/tests/screenplay_question_routes.test.mjs
M  backend/tests/security_headers.test.mjs
M  backend/tests/session_evolution_route.test.mjs
M  backend/tests/state_route.test.mjs
M  backend/tests/talk_error_counter.test.mjs
MM backend/tests/talk_turn_meta_contract.test.mjs
M  backend/tests/talk_turn_rate_limit_route.test.mjs
M  backend/tests/talk_turn_stats.test.mjs
M  backend/tests/tasks_routes.test.mjs
M  backend/tests/trait_library.test.mjs
M  backend/tests/twist_engine.test.mjs
MM backend/tests/user_auth_roundtrip.test.mjs
 M backend/tests/user_store_persistence_adapter.test.mjs
M  docs/schemas/memories-list.md
 M docs/testflight-v1-preflight.md
AM docs/writer-beta-readiness.md
MM scripts/ci_merge_safety.test.mjs
 M scripts/migrate_stores_to_postgres.mjs
 M scripts/pre_flight.mjs
 M scripts/pre_flight.test.mjs
M  scripts/release_config_status.mjs
M  scripts/release_config_status.test.mjs
M  scripts/run_voice_network_fault_smokes.sh
M  scripts/run_voice_network_fault_smokes.test.mjs
A  them/AdaptiveBackgroundSyncPolicy.swift
UU them/AppShell.swift
UU them/BackendClient.swift
UU them/BackendMemoryAPI.swift
M  them/ConversationHistoryScreen.swift
M  them/DataControlsScreen.swift
A  them/FirstPageOnboardingPolicy.swift
AM them/HomeCoreLoopPresentation.swift
M  them/MemoriesScreen.swift
M  them/OfflineTalkOutbox.swift
 M them/PrintScreenplayIntent.swift
A  them/RootExperienceSheetExitPolicy.swift
M  them/RootExperienceView.swift
M  them/ScreenplayDraftSaveOutbox.swift
UU them/ScreenplayLiveDraftBridge.swift
 M them/ScreenplayLocalExport.swift
M  them/ScreenplayOutlineMutationRecoveryPanel.swift
 M them/ScreenplayPrintService.swift
UU them/ScreenplayStudioDebugTypes.swift
M  them/ScreenplayStudioDraftToolsViews.swift
 M them/ScreenplayStudioExportSupport.swift
UU them/ScreenplayStudioScreen.swift
UU them/ScreenplayStudioViewModel.swift
M  them/StudioCreativeInstinctsView.swift
M  them/TalkDiagnosticsSheet.swift
UU them/UITestLaunchConfiguration.swift
M  them/V1LaunchDoctor.swift
A  them/VoiceSettingsPresentation.swift
A  themTests/AdaptiveBackgroundSyncPolicyTests.swift
UU themTests/BackendAccountDataControlsTests.swift
M  themTests/BackendMemoryScreenplayExportTests.swift
A  themTests/ConversationHistoryPresentationTests.swift
A  themTests/ConversationHistoryRefreshTests.swift
A  themTests/FirstPageOnboardingPolicyTests.swift
A  themTests/HomeCoreLoopPresentationTests.swift
UU themTests/IOThemRuntimeTests.swift
A  themTests/MemoriesCanonActionTests.swift
A  themTests/MemoriesCardActionTests.swift
A  themTests/MemoriesCorrectionTests.swift
A  themTests/MemoriesForgetTests.swift
A  themTests/MemoriesRefreshTests.swift
A  themTests/MemoriesSignalPresentationTests.swift
A  themTests/MemoriesStoryPreferenceTests.swift
A  themTests/MemoryMutationTestSupport.swift
M  themTests/OfflineTalkOutboxTests.swift
A  themTests/RootExperienceSheetExitPolicyTests.swift
M  themTests/ScreenplayDraftSaveOutboxTests.swift
A  themTests/ScreenplayLiveDraftFileStoreTests.swift
 M themTests/ScreenplayLocalExportTests.swift
 M themTests/ScreenplayPrintServiceTests.swift
UU themTests/ScreenplayStudioDraftRecoveryTests.swift
M  themTests/ScreenplayStudioDraftToolsPresentationTests.swift
 M themTests/ScreenplayStudioExportSupportTests.swift
A  themTests/ScreenplayStudioHeaderPresentationTests.swift
A  themTests/ScreenplayStudioSaveResponseIsolationTests.swift
A  themTests/ScreenplayStudioTransientStatusPresentationTests.swift
UU themTests/StudioThreadViewStateSupportTests.swift
A  themTests/VoiceSettingsPresentationTests.swift
A  themUITests/ConversationHistoryResponsiveUITests.swift
A  themUITests/DataControlsResponsiveUITests.swift
A  themUITests/HomeCoreLoopUITests.swift
A  themUITests/HomeUtilitySheetsResponsiveUITests.swift
A  themUITests/MemoriesResponsiveUITests.swift
UU themUITests/V1SmokeUITests.swift
A  themUITests/VoiceSettingsUITests.swift
?? backend/migrations/013_auth_user_scoped_indexes.sql
?? backend/tests/memories_conditional_http.test.mjs
?? backend/tests/talk_prompt.test.mjs
?? backend/tests/talk_turn_meta_authorization.test.mjs
?? docs/claude-pr-audit-2026-09-05.md
```
