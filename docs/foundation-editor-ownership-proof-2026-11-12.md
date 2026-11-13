# Foundation native-editor ownership repair — 2026-11-12

## Exact candidate and fixed boundaries

VERIFIED: runtime `65319db11af1e01853dd36f7f65f1379c637c350` extends the preserved private port41663489, based on original #964 at831de836. The original port/PR heads remain intact. This candidate is separate from the stronger rehearsal backupb5a85e24 and published inspector repair8688c30f; it has not been merged into main or original #964.

The prepared port correctly recognised delayed native typing acknowledgements but could mistake an intentional restore equal to a pending value for another acknowledgement. Reusing the existing665268c5 native-publication marker and external-revision design makes native writes distinguishable from external model replacements. Project transitions advance that same revision, including A→B→A with equal text. Pending native receipts survive an external replacement so a later old acknowledgement cannot roll it forward again. Unicode comparisons at the binding/publication boundary use exact UTF8, not canonical String equivalence.

The actual model binding, all bridge bindings, selected project and keyboard-save action/eligibility now live in the existing child adapter. Its one native-editor factory is used by the app and real-model tests. Screen loses15lines; no new Root/Studio product state or framework.

Adversarial source review exposed a second boundary: expected bytes alone accepted queued B after an external A→C→A. Each canonical deferred record now captures its producing render's document/revision and checks the live model getter at flush. The original coalescer was moved into adjacent `ScreenplayStudioEditorBinding.swift`, not duplicated. Native text, metadata, snapshots and user-edit callbacks cannot acquire a newer render's authority merely because bytes returned to an earlier value.

Rejecting stale text must still retire the original interrupted rewrite target. The existing submission ID is now canonical Release metadata, updated at its existing prepare/capture/clear sites. A nil cleanup requires the unchanged expected control and matching operation identity; its cross-revision exception requires the same document, a nonempty original operation and a nonnil expected control. A new request B reusing target A's UUID is preserved. Unknown operation identity cannot use that exception. This promotes an existing identifier; it adds no persistence store, request, generated UUID or parallel queue.

The first real-model native run crashed in generated `BackendClient.__deallocating_deinit` through `swift_task_deinitOnExecutorImpl` / `TaskLocal::StopLookupScope`. The already-existing primary stateless `nonisolated deinit {}` was ported. Model/clients are released normally; no leaked fixture or disabled assertion masks the crash. This is direct stack evidence and a verified repair, not a general claim about every compiler/runtime defect.

## Verification and retained failures

Final signed native cohort: **54 passed / 0 failed / 0 skipped** —17 actual editor/binding/ownership cases plus37 existing deferred/state-support cases. Normal signing on an erased owned iPhone17 Pro/iOS26.2 simulator81F. The real-coordinator cases cover equal-pending restore, Unicode-native bytes, delayed echoes, external/project round trips, accepted current writes and interrupted-control cleanup protecting a newer request with the identical target UUID.

Original `test_studio_page_accepts_complete_direct_typing`: **1 passed / 0 failed / 0 skipped**, signed/erased81F. Its entire V1 source is unchanged from831. One native `typeText` call submits the original sentence; the existing accessible-draft assertion observes the full expected sentence. No changed sentence, slower/chunked typing, retry helper or weakened assertion. This local pass does not establish the exact cause of the earlier hosted missing-letter event, per-key native delivery, byte-exact persistence or a physical phone.

Pure package policy: **12 passed / 0 failed** at the earlier checkpoint; final policy function bodies and tests are byte-identical. The later added authority type is compiled/exercised by the final signed cohort. The unchanged pure run was not repeated.

macOS scaffold **build exit0**, established ad-hoc Mac Scaffold Debug configuration, compile only. Parser/whitespace checks pass. D009 versus fetched actual831: index33626 unchanged; Screen17435→17420 (**−15**); Root15112 unchanged; Bridge12952→12917 (**−35**); Memory10865 unchanged. The accepted early-stack index-count exception remains; no artificial line padding/reformatting.

| Retained attempt | Actual result | Resolution / limit |
| --- | --- | --- |
| First native cohort |48/1/0, SIGABRT | Generated client-release path; canonical stateless teardown ported |
| Second native invocation |build65 before tests | Missing explicit package import in new test helper, corrected |
| Intermediate native cohort |52/0/0 | Pre-cleanup checkpoint; not final proof |
| Cleanup cohort |53/1/0 | Fixture forwarded text/getters but constant controls; it could not retire A. Corrected to exact production factory, assertions retained |
| Final native cohort |54/0/0 | Actual production text, controls and getters |

The UI used a disposable auth-required metadata backend from the rehearsal, with generation routes and known backend egress denied, dummy/empty provider configuration, and controlled fallback. **0 provider attempts / 0 fallback requests**. It is not parent-backend/auth integration, microphone, paid-model or shipping-backend proof. Fixture session retries are not production idle-cost measurements. Backend, scripts/workflows, projects/workspace, Root and BackendMemory tracked source remain exact831; no repeated unchanged full backend or full unit suite here. Broader gates remain required at the combined foundation/main boundary.

Private proof: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1444-foundation-editor-receipt-20261112/proof.json`, SHA256 `b522dc20c7c9589b18de80a9535df3ac42acc865279075537a681a7a66e69f10`. **3,128 hashed artifacts / 0 mismatches**, retaining all failed/successful bundles, crash, source snapshots, controller and fixture sources. Later `publication.json` separately records final documentation head and remote result.

## Exact changed files and coordination

Runtime files relative to preserved416:

- `Packages/ScreenplayStudio/Sources/ScreenplayStudio/ScreenplayDeferredPublicationGate.swift`
- `Packages/ScreenplayStudio/Sources/ScreenplayStudio/ScreenplayEditorTextBindingPolicy.swift`
- `Packages/ScreenplayStudio/Tests/ScreenplayStudioTests/ScreenplayEditorTextBindingPolicyTests.swift`
- `them/BackendClient.swift`
- `them/ScreenplayLiveDraftBridge.swift`
- `them/ScreenplayStudioEditorBinding.swift`
- `them/ScreenplayStudioKeyboardSaveAccessory.swift`
- `them/ScreenplayStudioScreen.swift`
- `them/ScreenplayStudioViewModel.swift`
- `themTests/ScreenplayEditorBindingIntegrationTests.swift`

Documentation: this report and TASKS.md. Inherited416 also preserves its original helper/gate extraction, initial tests and state-support import; those were not silently removed.

Jarvis implemented/executed; Luna performed bounded source review, identified the ABA/cleanup/fixture issues, and corrected her earlier fixture-coverage overstatement. That is actual agent participation, not human approval. No other role or independent meeting is claimed.

Fresh GitHub: original #964 remains draft831, main78b8c94f, latest Quality43260656345 **failed**. This candidate does not clear that hosted run. Next: preserve-merge inspector8688 and this repaired descendant on the isolated foundation, resolve any overlap by capability, then run the complete required foundation checkpoint before normally advancing original #964. No replacement PR, force push, main change, review bypass, deployment or paid provider call.

Remaining gaps are explicit: unchanged-value external assignments have no new revision; immediate cross-owner native events and persistence-wide byte identity are not proven. Older direct completion closures still clear targets without complete operation fencing. Foundation debounce/bridge String comparisons need their preserved downstream fixes. Physical signing, reachable intended backend and the complete observed phone journey remain open. Production hold is unchanged. Do not treat this scoped proof as complete product/release validation.

READY FOR CONTINUE.
