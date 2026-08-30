import XCTest
@testable import them

final class ScreenplayStudioDraftRecoveryTests: XCTestCase {
    private let recoveryKey = "screenplay.studio.localDraftRecovery.tests"
    private var defaults: UserDefaults!
    private var store: ScreenplayLocalDraftRecoveryStore!

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: "io.them.ScreenplayStudioDraftRecoveryTests")!
        defaults.removeObject(forKey: recoveryKey)
        store = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: recoveryKey)
    }

    override func tearDown() {
        defaults.removeObject(forKey: recoveryKey)
        store = nil
        defaults = nil
        super.tearDown()
    }

    func testSaveWritesLocalRecoverySnapshot() {
        let draft = """
        INT. MOTEL ROOM - NIGHT

        CLEMENTINE watches the rain make tiny rivers down the glass.
        """

        store.save(
            projectId: " project-recovery ",
            draft: draft,
            baseVersionId: "version-before-edit",
            dirty: true,
            savedAt: 1_700_000_000
        )

        let payload = store.payloads()["project-recovery"]
        XCTAssertEqual(payload?["draft"] as? String, draft)
        XCTAssertEqual(payload?["baseVersionId"] as? String, "version-before-edit")
        XCTAssertEqual(payload?["dirty"] as? Bool, true)
        XCTAssertEqual(payload?["savedAt"] as? TimeInterval, 1_700_000_000)
    }

    func testClearRemovesOnlyRequestedProjectRecoverySnapshot() {
        store.save(projectId: "project-a", draft: "A", baseVersionId: "v-a", dirty: true)
        store.save(projectId: "project-b", draft: "B", baseVersionId: "v-b", dirty: true)

        store.clear(projectId: " project-a ")

        let payloads = store.payloads()
        XCTAssertNil(payloads["project-a"])
        XCTAssertEqual(payloads["project-b"]?["draft"] as? String, "B")
    }

    func testRecoverySnapshotPreservesUnsavedDraftBasedOnCurrentServerVersion() {
        store.save(
            projectId: "project-recovery",
            draft: "INT. MOTEL ROOM - NIGHT\n\nShe adds the line she cannot forget.",
            baseVersionId: "server-current",
            dirty: true,
            savedAt: 1_700_000_123
        )

        let snapshot = store.recoverySnapshot(
            projectId: "project-recovery",
            serverDraft: "INT. MOTEL ROOM - NIGHT",
            fingerprint: stableFingerprint
        )

        XCTAssertEqual(snapshot?.projectId, "project-recovery")
        XCTAssertEqual(snapshot?.baseVersionId, "server-current")
        XCTAssertEqual(snapshot?.savedAt, 1_700_000_123)
        XCTAssertEqual(snapshot?.draft, "INT. MOTEL ROOM - NIGHT\n\nShe adds the line she cannot forget.")
    }

    func testRecoverySnapshotClearsWhenStoredDraftMatchesServerDraft() {
        store.save(
            projectId: "project-recovery",
            draft: "INT. MOTEL ROOM - NIGHT",
            baseVersionId: "server-current",
            dirty: true,
            savedAt: 1_700_000_123
        )

        let snapshot = store.recoverySnapshot(
            projectId: "project-recovery",
            serverDraft: "INT. MOTEL ROOM - NIGHT",
            fingerprint: stableFingerprint
        )

        XCTAssertNil(snapshot)
        XCTAssertNil(store.payloads()["project-recovery"])
    }

    func testProjectScopedStateRequiresMatchingNonEmptyProjectIds() {
        XCTAssertTrue(ScreenplayProjectScopedState.matches(" project-a ", selectedProjectId: "project-a"))
        XCTAssertFalse(ScreenplayProjectScopedState.matches("project-a", selectedProjectId: "project-b"))
        XCTAssertFalse(ScreenplayProjectScopedState.matches("", selectedProjectId: "project-a"))
        XCTAssertFalse(ScreenplayProjectScopedState.matches("project-a", selectedProjectId: ""))
        XCTAssertFalse(ScreenplayProjectScopedState.matches(nil, selectedProjectId: "project-a"))
    }

    func testCrossDeviceStateVersionRefreshesOnlyForNewNonEmptyVersion() {
        XCTAssertTrue(CrossDeviceStateVersionPolicy.shouldRefresh(
            knownStateVersion: "",
            incomingStateVersion: "screenplay-v1"
        ))
        XCTAssertTrue(CrossDeviceStateVersionPolicy.shouldRefresh(
            knownStateVersion: "screenplay-v1",
            incomingStateVersion: "screenplay-v2"
        ))
        XCTAssertFalse(CrossDeviceStateVersionPolicy.shouldRefresh(
            knownStateVersion: " screenplay-v2 ",
            incomingStateVersion: "screenplay-v2"
        ))
        XCTAssertFalse(CrossDeviceStateVersionPolicy.shouldRefresh(
            knownStateVersion: "screenplay-v2",
            incomingStateVersion: " "
        ))
    }

    func testDraftSaveRetryPolicyRetriesOnlyTransientFailures() {
        XCTAssertTrue(ScreenplayDraftSaveRetryPolicy.shouldRetry(URLError(.notConnectedToInternet)))
        XCTAssertTrue(ScreenplayDraftSaveRetryPolicy.shouldRetry(BackendMemoryAPIError.invalidResponse))
        XCTAssertTrue(ScreenplayDraftSaveRetryPolicy.shouldRetry(
            BackendMemoryAPIError.server(status: 503, message: "unavailable")
        ))
        XCTAssertTrue(ScreenplayDraftSaveRetryPolicy.shouldRetry(
            BackendMemoryAPIError.server(status: 429, message: "slow_down")
        ))
        XCTAssertFalse(ScreenplayDraftSaveRetryPolicy.shouldRetry(
            BackendMemoryAPIError.server(status: 401, message: "auth_required")
        ))
        XCTAssertFalse(ScreenplayDraftSaveRetryPolicy.shouldRetry(
            BackendMemoryAPIError.server(status: 422, message: "invalid_draft")
        ))
    }

    func testRemoteDraftProtectsDirtyLocalPageAndSurfacesNewerVersionConflict() {
        let protected = ScreenplayRemoteDraftConflictPolicy.shouldProtectLocalDraft(
            selectedProjectId: "project-a",
            loadedProjectId: "project-a",
            localDraft: "INT. FERRY - NIGHT\n\nMara waits.",
            serverDraft: "INT. FERRY - NIGHT\n\nMara returns.",
            hasUnsavedChanges: true,
            isManualEditing: false,
            secondsSinceManualEdit: 999,
            allowOverwrite: false
        )

        XCTAssertTrue(protected)
        XCTAssertTrue(ScreenplayRemoteDraftConflictPolicy.shouldSurfaceConflict(
            localEditsProtected: protected,
            localVersionId: "version-local",
            serverVersionId: "version-remote",
            localDraft: "INT. FERRY - NIGHT\n\nMara waits.",
            serverDraft: "INT. FERRY - NIGHT\n\nMara returns."
        ))
    }

    func testRemoteDraftDoesNotSurfaceConflictForCleanPageOrSameVersion() {
        let protected = ScreenplayRemoteDraftConflictPolicy.shouldProtectLocalDraft(
            selectedProjectId: "project-a",
            loadedProjectId: "project-a",
            localDraft: "INT. FERRY - NIGHT\n\nMara waits.",
            serverDraft: "INT. FERRY - NIGHT\n\nMara returns.",
            hasUnsavedChanges: false,
            isManualEditing: false,
            secondsSinceManualEdit: 999,
            allowOverwrite: false
        )

        XCTAssertFalse(protected)
        XCTAssertFalse(ScreenplayRemoteDraftConflictPolicy.shouldSurfaceConflict(
            localEditsProtected: true,
            localVersionId: "version-same",
            serverVersionId: "version-same",
            localDraft: "INT. FERRY - NIGHT\n\nMara waits.",
            serverDraft: "INT. FERRY - NIGHT\n\nMara returns."
        ))
    }

    func testFeatureProgressionGuideMapsPageToNextScenePlan() {
        let guide = ScreenplayFeatureProgressionGuide.guide(
            actPosition: "",
            currentPage: 47,
            targetPages: 110
        )

        XCTAssertEqual(guide.currentAct, "Act II")
        XCTAssertEqual(guide.sequenceLabel, "Midpoint Pressure")
        XCTAssertEqual(guide.pageRangeText, "p41-p55")
        XCTAssertEqual(guide.progressText, "p47 / 110")
        XCTAssertTrue(guide.dueNow.contains("midpoint reversal"))
        XCTAssertTrue(guide.nextScenePlan.contains("Midpoint Pressure"))
        XCTAssertTrue(guide.nextMoves.contains("Let the emotional truth arrive before the exposition."))
        XCTAssertTrue(guide.comingNext.contains("Reversal Fallout"))
    }

    func testFeatureProgressionGuideTrustsExplicitLateActOverTinyDraft() {
        let guide = ScreenplayFeatureProgressionGuide.guide(
            actPosition: "Act III",
            currentPage: 1,
            targetPages: 110
        )

        XCTAssertEqual(guide.currentAct, "Act III")
        XCTAssertEqual(guide.sequenceLabel, "Break Into Three / Final Plan")
        XCTAssertEqual(guide.progressText, "Act estimate")
        XCTAssertTrue(guide.nextScenePlan.contains("Final Plan"))
    }

    func testStructuredDraftRestoresRecentActionBeatsForPromptMemory() {
        let draft = ScreenplayStructuredDraft(
            updatedAt: Date(timeIntervalSince1970: 100),
            lineCount: 11,
            sceneCount: 1,
            paragraphs: [
                ScreenplayDraftParagraphSnapshot(
                    id: "p1",
                    line: 1,
                    element: .sceneHeading,
                    text: "INT. ROOFTOP - NIGHT"
                ),
                ScreenplayDraftParagraphSnapshot(
                    id: "p2",
                    line: 3,
                    element: .action,
                    text: "Mara hides the cassette under the rain-swollen vent."
                ),
                ScreenplayDraftParagraphSnapshot(
                    id: "p3",
                    line: 5,
                    element: .character,
                    text: "ELI"
                ),
                ScreenplayDraftParagraphSnapshot(
                    id: "p4",
                    line: 6,
                    element: .dialogue,
                    text: "You said nobody else knew."
                ),
                ScreenplayDraftParagraphSnapshot(
                    id: "p5",
                    line: 10,
                    element: .action,
                    text: "She watches the courthouse lights blink out below them."
                )
            ],
            scenes: [
                ScreenplayDraftSceneSnapshot(
                    id: "scene-rooftop",
                    line: 1,
                    endLine: 11,
                    slugline: "INT. ROOFTOP - NIGHT",
                    shortLabel: "ROOFTOP",
                    characterCues: ["ELI", "MARA"],
                    dialogueLineCount: 1
                )
            ],
            characters: ["ELI", "MARA"]
        )

        XCTAssertEqual(draft.activeScene(containingOrBefore: 99)?.slugline, "INT. ROOFTOP - NIGHT")
        XCTAssertEqual(
            draft.recentActionBeatSequence(endingAtLine: 11, limit: 2),
            [
                "Mara hides the cassette under the rain-swollen vent.",
                "She watches the courthouse lights blink out below them."
            ]
        )
        XCTAssertEqual(
            draft.currentActionBeat(endingAtLine: 11),
            "She watches the courthouse lights blink out below them."
        )
    }

    func testFeatureActionPromptBuilderCreatesPageSafeNextScenePrompt() {
        let guide = ScreenplayFeatureProgressionGuide.guide(
            actPosition: "",
            currentPage: 47,
            targetPages: 110
        )
        let context = ScreenplayFeatureActionContext(
            logline: "A courier crosses a flooded Los Angeles to deliver one impossible confession.",
            themeArgument: "Truth is only love when it costs the liar something.",
            centralQuestion: "Can Sol tell the truth before the city goes underwater?",
            protagonistWant: "Sol wants to deliver the confession unseen.",
            protagonistNeed: "Sol needs to stop treating honesty as punishment.",
            antagonisticForce: "A surveillance startup controlling evacuation routes.",
            endingImage: "Sol walks into sunrise with the confession finally public.",
            unresolvedSetups: ["The blue key has not paid off."]
        )

        let prompt = ScreenplayFeatureActionPromptBuilder.prompt(
            for: .writeNextScene,
            guide: guide,
            context: context
        )

        XCTAssertTrue(prompt.contains("Write the next scene directly into the screenplay draft"))
        XCTAssertTrue(prompt.contains("Current feature position: Act II - Midpoint Pressure"))
        XCTAssertTrue(prompt.contains("Feature spine:"))
        XCTAssertTrue(prompt.contains("Logline: A courier crosses"))
        XCTAssertTrue(prompt.contains("Next page moves:"))
        XCTAssertTrue(prompt.contains("Unresolved setups to protect:"))
        XCTAssertTrue(prompt.contains("Return screenplay text only."))
        XCTAssertFalse(prompt.contains("TODO"))
    }

    func testFeatureActionPromptBuilderCreatesThreeTurnDraftPrompt() {
        let guide = ScreenplayFeatureProgressionGuide.guide(
            actPosition: "Act IIb",
            currentPage: 1,
            targetPages: 110
        )
        let prompt = ScreenplayFeatureActionPromptBuilder.prompt(
            for: .outlineNextThreeTurns,
            guide: guide,
            context: ScreenplayFeatureActionContext(
                protagonistWant: "Mara wants the missing reel.",
                protagonistNeed: "Mara needs to trust someone with the truth."
            )
        )

        XCTAssertTrue(prompt.contains("Draft the next three structural turns directly into the screenplay draft"))
        XCTAssertTrue(prompt.contains("Current feature position: Act II - Collapse / All Is Lost"))
        XCTAssertTrue(prompt.contains("Protagonist want: Mara wants the missing reel."))
        XCTAssertTrue(prompt.contains("Protagonist need: Mara needs to trust someone with the truth."))
        XCTAssertTrue(prompt.contains("Return screenplay-facing text only."))
    }

    func testFeatureActionPromptBuilderCreatesActToActRoadmapPrompt() {
        let guide = ScreenplayFeatureProgressionGuide.guide(
            actPosition: "Act II",
            currentPage: 47,
            targetPages: 110
        )
        let prompt = ScreenplayFeatureActionPromptBuilder.prompt(
            for: .mapFeatureRoadmap,
            guide: guide,
            context: ScreenplayFeatureActionContext(
                logline: "A lonely projectionist has one night to finish a movie that keeps changing around him.",
                themeArgument: "Art only saves him when he stops using it to hide.",
                centralQuestion: "Can Eli enter the unfinished film before it erases his life?",
                protagonistWant: "Eli wants to complete the lost final reel.",
                protagonistNeed: "Eli needs to be seen outside the fantasy.",
                antagonisticForce: "The film itself keeps rewriting his memories.",
                endingImage: "Eli exits the theater into daylight with the last frame still on his hands."
            )
        )

        XCTAssertEqual(ScreenplayFeatureActionCommand.mapFeatureRoadmap.routingModeRawValue, "voicePin")
        XCTAssertTrue(prompt.contains("Build a feature-completion roadmap"))
        XCTAssertTrue(prompt.contains("Act I spine"))
        XCTAssertTrue(prompt.contains("Act II engine"))
        XCTAssertTrue(prompt.contains("Act III payoff path"))
        XCTAssertTrue(prompt.contains("Next three turns"))
        XCTAssertTrue(prompt.contains("Do not output screenplay pages"))
        XCTAssertFalse(prompt.contains("Return screenplay text only."))
    }

    func testFeaturePlannerActionRecoveryStoreSavesProjectScopedSnapshot() {
        let snapshot = featurePlannerActionSnapshot(
            projectId: "project-a",
            command: .mapFeatureRoadmap,
            displayText: "Map Act I to Act III",
            routingModeRawValue: "voicePin"
        )

        let raw = ScreenplayFeaturePlannerActionRecoveryStore.save(snapshot, in: "")
        let restored = ScreenplayFeaturePlannerActionRecoveryStore.pendingSnapshot(
            projectId: " project-a ",
            in: raw
        )

        XCTAssertEqual(restored, snapshot)
        XCTAssertEqual(restored?.resolvedRoutingModeRawValue, "voicePin")
        XCTAssertNil(ScreenplayFeaturePlannerActionRecoveryStore.pendingSnapshot(projectId: "project-b", in: raw))
    }

    func testFeaturePlannerActionRecoveryStoreReplacesOnlyMatchingProject() {
        let first = featurePlannerActionSnapshot(
            id: "planner-first",
            projectId: "project-a",
            command: .writeNextScene,
            displayText: "Write next feature scene",
            submittedAt: 10
        )
        let replacement = featurePlannerActionSnapshot(
            id: "planner-replacement",
            projectId: "project-a",
            command: .outlineNextThreeTurns,
            displayText: "Outline next three turns",
            submittedAt: 20
        )
        let otherProject = featurePlannerActionSnapshot(
            id: "planner-other",
            projectId: "project-b",
            command: .writeNextScene,
            displayText: "Write next feature scene",
            submittedAt: 30
        )

        var raw = ScreenplayFeaturePlannerActionRecoveryStore.save(first, in: "")
        raw = ScreenplayFeaturePlannerActionRecoveryStore.save(otherProject, in: raw)
        raw = ScreenplayFeaturePlannerActionRecoveryStore.save(replacement, in: raw)

        XCTAssertEqual(
            ScreenplayFeaturePlannerActionRecoveryStore.pendingSnapshot(projectId: "project-a", in: raw),
            replacement
        )
        XCTAssertEqual(
            ScreenplayFeaturePlannerActionRecoveryStore.pendingSnapshot(projectId: "project-b", in: raw),
            otherProject
        )
    }

    func testFeaturePlannerActionRecoveryStoreClearsById() {
        let first = featurePlannerActionSnapshot(id: "planner-first", projectId: "project-a")
        let second = featurePlannerActionSnapshot(id: "planner-second", projectId: "project-b")
        var raw = ScreenplayFeaturePlannerActionRecoveryStore.save(first, in: "")
        raw = ScreenplayFeaturePlannerActionRecoveryStore.save(second, in: raw)

        raw = ScreenplayFeaturePlannerActionRecoveryStore.clear(id: " planner-first ", in: raw)

        XCTAssertNil(ScreenplayFeaturePlannerActionRecoveryStore.pendingSnapshot(projectId: "project-a", in: raw))
        XCTAssertEqual(ScreenplayFeaturePlannerActionRecoveryStore.pendingSnapshot(projectId: "project-b", in: raw), second)
    }

    func testFeaturePlannerActionSnapshotKeepsRetryIdentityButRefreshesRequest() {
        let snapshot = featurePlannerActionSnapshot(
            id: "planner-first",
            projectId: "project-a",
            requestID: "request-first",
            submittedAt: 10
        )

        let retry = snapshot.retrySnapshot(requestID: "request-retry", submittedAt: 20)

        XCTAssertEqual(retry.id, "planner-first")
        XCTAssertEqual(retry.requestID, "request-retry")
        XCTAssertEqual(retry.submittedAt, 20)
        XCTAssertEqual(retry.prompt, snapshot.prompt)
    }

    func testRestorePolicyKeepsBackendActiveProjectEvenWhenListPageOmitsIt() {
        let selectedProjectId = ScreenplayProjectSelectionRestorePolicy.selectedProjectId(
            activeProjectId: " legacy-active-project ",
            preferredProjectId: "recent-project",
            projects: [
                projectSummary(id: "recent-project"),
                projectSummary(id: "another-recent-project"),
            ]
        )

        XCTAssertEqual(selectedProjectId, "legacy-active-project")
    }

    func testRestorePolicyFallsBackToPreferredProjectWhenBackendActiveIsMissing() {
        let selectedProjectId = ScreenplayProjectSelectionRestorePolicy.selectedProjectId(
            activeProjectId: " ",
            preferredProjectId: " preferred-project ",
            projects: [
                projectSummary(id: "first-project"),
                projectSummary(id: "preferred-project"),
            ]
        )

        XCTAssertEqual(selectedProjectId, "preferred-project")
    }

    func testRestorePolicyIgnoresStalePreferredProjectWhenListOmitsIt() {
        let selectedProjectId = ScreenplayProjectSelectionRestorePolicy.selectedProjectId(
            activeProjectId: nil,
            preferredProjectId: "missing-project",
            projects: [
                projectSummary(id: "first-project"),
                projectSummary(id: "second-project"),
            ]
        )

        XCTAssertEqual(selectedProjectId, "first-project")
    }

    func testRestorePolicyFallsBackToFirstProjectWhenNoActiveProjectExists() {
        let selectedProjectId = ScreenplayProjectSelectionRestorePolicy.selectedProjectId(
            activeProjectId: " ",
            preferredProjectId: " ",
            projects: [
                projectSummary(id: "first-project"),
                projectSummary(id: "second-project"),
            ]
        )

        XCTAssertEqual(selectedProjectId, "first-project")
    }

    func testProjectLoadApplicationPolicyAcceptsUnchangedSelection() {
        XCTAssertTrue(ScreenplayProjectLoadApplicationPolicy.shouldApply(
            selectedProjectIDAtStart: " project-a ",
            currentSelectedProjectID: "project-a"
        ))
    }

    func testProjectLoadApplicationPolicyRejectsStaleSelection() {
        XCTAssertFalse(ScreenplayProjectLoadApplicationPolicy.shouldApply(
            selectedProjectIDAtStart: "project-a",
            currentSelectedProjectID: "project-b"
        ))
    }

    func testProjectBindingStoragePolicyMigratesProductStateAndIsolatesAutomation() {
        XCTAssertEqual(
            ScreenplayProjectBindingStoragePolicy.restoredValue(
                productValue: "product-binding",
                legacyDebugValue: "legacy-binding",
                isAutomationSession: false
            ),
            "product-binding"
        )
        XCTAssertEqual(
            ScreenplayProjectBindingStoragePolicy.restoredValue(
                productValue: nil,
                legacyDebugValue: "legacy-binding",
                isAutomationSession: false
            ),
            "legacy-binding"
        )
        XCTAssertEqual(
            ScreenplayProjectBindingStoragePolicy.restoredValue(
                productValue: "product-binding",
                legacyDebugValue: "automation-binding",
                isAutomationSession: true
            ),
            "automation-binding"
        )
        XCTAssertNil(ScreenplayProjectBindingStoragePolicy.restoredValue(
            productValue: "product-binding",
            legacyDebugValue: nil,
            isAutomationSession: true
        ))
    }

    func testPostHydrationRestorePolicyRequiresLoadedProjectAndDraftMatch() {
        XCTAssertTrue(ScreenplayStudioPostHydrationRestorePolicy.canRestoreWorkspace(
            selectedProjectID: " project-a ",
            loadedProjectID: "project-a",
            loadedDraftProjectID: " project-a ",
            isLoading: false
        ))
        XCTAssertFalse(ScreenplayStudioPostHydrationRestorePolicy.canRestoreWorkspace(
            selectedProjectID: "project-a",
            loadedProjectID: "project-b",
            loadedDraftProjectID: "project-a",
            isLoading: false
        ))
        XCTAssertFalse(ScreenplayStudioPostHydrationRestorePolicy.canRestoreWorkspace(
            selectedProjectID: "project-a",
            loadedProjectID: "project-a",
            loadedDraftProjectID: "project-b",
            isLoading: false
        ))
    }

    func testPostHydrationRestorePolicyWaitsWhileLoadingButAllowsLiveDraftFallback() {
        XCTAssertFalse(ScreenplayStudioPostHydrationRestorePolicy.canRestoreWorkspace(
            selectedProjectID: "project-a",
            loadedProjectID: "project-a",
            loadedDraftProjectID: "project-a",
            isLoading: true
        ))
        XCTAssertTrue(ScreenplayStudioPostHydrationRestorePolicy.canRestoreWorkspace(
            selectedProjectID: " ",
            loadedProjectID: nil,
            loadedDraftProjectID: "",
            isLoading: false
        ))
    }

    func testBridgeDraftAdoptionPolicyAllowsProjectlessLiveDraftFallback() {
        XCTAssertTrue(ScreenplayBridgeDraftAdoptionPolicy.shouldAdoptLiveBridgeDraft(
            selectedProjectId: " ",
            currentDraft: "",
            bridgeDraft: "INT. DINER - NIGHT\n\nCLEMENTINE listens.",
            draftOriginProjectId: ""
        ))
    }

    func testBridgeDraftAdoptionPolicyRequiresMatchingOriginForSelectedProject() {
        XCTAssertTrue(ScreenplayBridgeDraftAdoptionPolicy.shouldAdoptLiveBridgeDraft(
            selectedProjectId: " project-a ",
            currentDraft: "",
            bridgeDraft: "INT. DINER - NIGHT\n\nCLEMENTINE listens.",
            draftOriginProjectId: "project-a"
        ))
        XCTAssertFalse(ScreenplayBridgeDraftAdoptionPolicy.shouldAdoptLiveBridgeDraft(
            selectedProjectId: "project-a",
            currentDraft: "",
            bridgeDraft: "INT. MOTEL - NIGHT\n\nA different movie waits.",
            draftOriginProjectId: "project-b"
        ))
        XCTAssertFalse(ScreenplayBridgeDraftAdoptionPolicy.shouldAdoptLiveBridgeDraft(
            selectedProjectId: "project-a",
            currentDraft: "",
            bridgeDraft: "INT. MOTEL - NIGHT\n\nA different movie waits.",
            draftOriginProjectId: " "
        ))
    }

    func testBridgeDraftAdoptionPolicyDoesNotReplaceExistingDraftOrAdoptEmptyBridgeDraft() {
        XCTAssertFalse(ScreenplayBridgeDraftAdoptionPolicy.shouldAdoptLiveBridgeDraft(
            selectedProjectId: "project-a",
            currentDraft: "INT. DINER - NIGHT",
            bridgeDraft: "INT. MOTEL - NIGHT",
            draftOriginProjectId: "project-a"
        ))
        XCTAssertFalse(ScreenplayBridgeDraftAdoptionPolicy.shouldAdoptLiveBridgeDraft(
            selectedProjectId: "project-a",
            currentDraft: "",
            bridgeDraft: "   ",
            draftOriginProjectId: "project-a"
        ))
    }

    func testDraftRestorePolicyPrefersActiveClementinePageWriteBeyondNewerVersion() {
        let generatedDraft = "FADE IN:\n\nINT. DINER - NIGHT\n\nClementine gives the silence a shape."
        let project = projectSummary(
            id: "project-page-write",
            activeVersionId: "v_clementine",
            lastVersionId: "v_clementine",
            versions: [
                version(
                    id: "v_manual_newer",
                    source: "studio_manual",
                    updatedAt: 300,
                    draft: "INT. ROOM - DAY\n\nThe manual draft is newer but inactive."
                ),
                version(
                    id: "v_clementine",
                    source: "studio_clementine_page_write",
                    updatedAt: 200,
                    draft: generatedDraft
                ),
            ]
        )

        let restored = ScreenplayProjectDraftRestorePolicy.preferredVersion(in: project)

        XCTAssertEqual(restored?.id, "v_clementine")
        XCTAssertEqual(restored?.source, "studio_clementine_page_write")
        XCTAssertEqual(restored?.draft, generatedDraft)
    }

    func testDraftRestorePolicyFallsBackToLastVersionWhenActiveVersionIsMissing() {
        let project = projectSummary(
            id: "project-active-missing",
            activeVersionId: "v_active_missing",
            lastVersionId: "v_last_saved",
            versions: [
                version(id: "v_newer_inactive", updatedAt: 300, draft: "INT. NEWER - DAY"),
                version(id: "v_last_saved", updatedAt: 200, draft: "INT. LAST SAVED - NIGHT"),
            ]
        )

        let restored = ScreenplayProjectDraftRestorePolicy.preferredVersion(in: project)

        XCTAssertEqual(restored?.id, "v_last_saved")
        XCTAssertEqual(restored?.draft, "INT. LAST SAVED - NIGHT")
    }

    func testUnconfirmedSaveRecoveryPolicyRequiresProjectAndDraft() {
        XCTAssertTrue(ScreenplayUnconfirmedSaveRecoveryPolicy.shouldPersist(
            projectId: " project-a ",
            draft: "INT. ROOM - NIGHT"
        ))
        XCTAssertFalse(ScreenplayUnconfirmedSaveRecoveryPolicy.shouldPersist(
            projectId: "",
            draft: "INT. ROOM - NIGHT"
        ))
        XCTAssertFalse(ScreenplayUnconfirmedSaveRecoveryPolicy.shouldPersist(
            projectId: "project-a",
            draft: "   "
        ))
    }

    func testProgrammaticAutosaveRequiresProjectDirtyDraftAndIdleStreaming() {
        XCTAssertTrue(ScreenplayProgrammaticDraftAutosavePolicy.shouldAutosave(
            hasSelectedProject: true,
            autosaveEnabled: true,
            hasUnsavedDraftChanges: true,
            isStreamingDraftPreviewActive: false,
            draft: "INT. ROOM - NIGHT"
        ))
        XCTAssertFalse(ScreenplayProgrammaticDraftAutosavePolicy.shouldAutosave(
            hasSelectedProject: false,
            autosaveEnabled: true,
            hasUnsavedDraftChanges: true,
            isStreamingDraftPreviewActive: false,
            draft: "INT. ROOM - NIGHT"
        ))
        XCTAssertFalse(ScreenplayProgrammaticDraftAutosavePolicy.shouldAutosave(
            hasSelectedProject: true,
            autosaveEnabled: false,
            hasUnsavedDraftChanges: true,
            isStreamingDraftPreviewActive: false,
            draft: "INT. ROOM - NIGHT"
        ))
        XCTAssertFalse(ScreenplayProgrammaticDraftAutosavePolicy.shouldAutosave(
            hasSelectedProject: true,
            autosaveEnabled: true,
            hasUnsavedDraftChanges: false,
            isStreamingDraftPreviewActive: false,
            draft: "INT. ROOM - NIGHT"
        ))
        XCTAssertFalse(ScreenplayProgrammaticDraftAutosavePolicy.shouldAutosave(
            hasSelectedProject: true,
            autosaveEnabled: true,
            hasUnsavedDraftChanges: true,
            isStreamingDraftPreviewActive: true,
            draft: "INT. ROOM - NIGHT"
        ))
        XCTAssertFalse(ScreenplayProgrammaticDraftAutosavePolicy.shouldAutosave(
            hasSelectedProject: true,
            autosaveEnabled: true,
            hasUnsavedDraftChanges: true,
            isStreamingDraftPreviewActive: false,
            draft: "   "
        ))
    }

    func testAuthoritativeClementineDraftUsesPageWriteSaveIntent() {
        let draft = "FADE IN:\r\n\r\nINT. FERRY - NIGHT\r\n\r\nMara turns back for both of them."
        let committedWrite = ScreenplayCommittedWrite(
            id: UUID(),
            writeID: "page-write-1",
            projectID: "project-a",
            previousDraft: "FADE IN:",
            committedDraft: draft.replacingOccurrences(of: "\r\n", with: "\n"),
            insertedText: "INT. FERRY - NIGHT\n\nMara turns back for both of them.",
            replacementApplied: false,
            replacedWriteID: nil,
            startLine: 3,
            endLine: 5,
            committedAt: Date()
        )

        XCTAssertEqual(
            ScreenplayDraftSaveIntentPolicy.intent(
                draft: draft,
                selectedProjectID: " project-a ",
                isManualDraftEditing: false,
                committedWrite: committedWrite
            ),
            .clementinePageWrite
        )
    }

    func testPageWriteSaveIntentRejectsManualStaleAndCrossProjectDrafts() {
        let draft = "INT. FERRY - NIGHT\n\nMara turns back."
        let committedWrite = ScreenplayCommittedWrite(
            id: UUID(),
            writeID: "page-write-2",
            projectID: "project-a",
            previousDraft: "",
            committedDraft: draft,
            insertedText: draft,
            replacementApplied: false,
            replacedWriteID: nil,
            startLine: 1,
            endLine: 3,
            committedAt: Date()
        )

        XCTAssertEqual(
            ScreenplayDraftSaveIntentPolicy.intent(
                draft: draft,
                selectedProjectID: "project-a",
                isManualDraftEditing: true,
                committedWrite: committedWrite
            ),
            .autosave
        )
        XCTAssertEqual(
            ScreenplayDraftSaveIntentPolicy.intent(
                draft: draft + "\n\nA horn answers.",
                selectedProjectID: "project-a",
                isManualDraftEditing: false,
                committedWrite: committedWrite
            ),
            .autosave
        )
        XCTAssertEqual(
            ScreenplayDraftSaveIntentPolicy.intent(
                draft: draft,
                selectedProjectID: "project-b",
                isManualDraftEditing: false,
                committedWrite: committedWrite
            ),
            .autosave
        )
    }

    func testDraftSaveCompletionKeepsNewerPageDirtyUntilItIsPersisted() {
        let savedDraft = "INT. FERRY - NIGHT\n\nMara turns back."

        XCTAssertFalse(ScreenplayDraftSaveCompletionPolicy.hasUnsavedChanges(
            currentDraft: "  \(savedDraft)\r\n",
            savedDraft: savedDraft
        ))
        XCTAssertTrue(ScreenplayDraftSaveCompletionPolicy.hasUnsavedChanges(
            currentDraft: savedDraft + "\n\nA second horn answers.",
            savedDraft: savedDraft
        ))
    }

    func testDraftIntegrityFingerprintIsDeterministicAndContentSensitive() {
        XCTAssertEqual(
            ScreenplayDraftIntegrityFingerprint.value(for: "hello"),
            "a430d84680aabd0b"
        )
        XCTAssertNotEqual(
            ScreenplayDraftIntegrityFingerprint.value(for: "INT. ROOM - NIGHT\n\nHe waits."),
            ScreenplayDraftIntegrityFingerprint.value(for: "INT. ROOM - NIGHT\n\nHe waits, still.")
        )
    }

    func testDraftSaveCoalescingOnlyDropsIdenticalPendingIntent() {
        let draft = "INT. FERRY - NIGHT\n\nMara turns back."

        XCTAssertTrue(ScreenplayDraftSaveCoalescingPolicy.shouldCoalesce(
            activeDraft: draft,
            activeSource: "studio_clementine_page_write",
            activeNotes: "Saved from Clementine page write",
            activeBaseVersionOverride: nil,
            pendingDraft: "  \(draft)\r\n",
            pendingSource: "studio_clementine_page_write",
            pendingNotes: "Saved from Clementine page write",
            pendingBaseVersionOverride: ""
        ))
        XCTAssertFalse(ScreenplayDraftSaveCoalescingPolicy.shouldCoalesce(
            activeDraft: draft,
            activeSource: "studio_clementine_page_write",
            activeNotes: "Saved from Clementine page write",
            activeBaseVersionOverride: nil,
            pendingDraft: draft + "\n\nA second horn answers.",
            pendingSource: "studio_clementine_page_write",
            pendingNotes: "Saved from Clementine page write",
            pendingBaseVersionOverride: nil
        ))
        XCTAssertFalse(ScreenplayDraftSaveCoalescingPolicy.shouldCoalesce(
            activeDraft: draft,
            activeSource: "studio_snapshot",
            activeNotes: "First pass",
            activeBaseVersionOverride: "version-1",
            pendingDraft: draft,
            pendingSource: "studio_snapshot",
            pendingNotes: "Approved pass",
            pendingBaseVersionOverride: "version-2"
        ))
    }

    func testCommittedDraftAdoptionAcceptsExpectedPredecessorAndAlreadyAppliedDraft() {
        let projectID = "project-one"
        let previous = "INT. ROOM - NIGHT\n\nHe waits."
        let committed = previous + "\n\nThe door opens."

        XCTAssertTrue(ScreenplayCommittedDraftAdoptionPolicy.shouldAdopt(
            selectedProjectID: projectID,
            committedProjectID: projectID,
            currentDraft: previous,
            previousDraft: previous,
            committedDraft: committed
        ))
        XCTAssertTrue(ScreenplayCommittedDraftAdoptionPolicy.shouldAdopt(
            selectedProjectID: projectID,
            committedProjectID: projectID,
            currentDraft: committed,
            previousDraft: previous,
            committedDraft: committed
        ))
    }

    func testCommittedDraftAdoptionRejectsCrossProjectAndDivergedDrafts() {
        let previous = "INT. ROOM - NIGHT\n\nHe waits."
        let committed = previous + "\n\nThe door opens."

        XCTAssertFalse(ScreenplayCommittedDraftAdoptionPolicy.shouldAdopt(
            selectedProjectID: "project-one",
            committedProjectID: "project-two",
            currentDraft: previous,
            previousDraft: previous,
            committedDraft: committed
        ))
        XCTAssertFalse(ScreenplayCommittedDraftAdoptionPolicy.shouldAdopt(
            selectedProjectID: "project-one",
            committedProjectID: "project-one",
            currentDraft: "INT. ROOM - NIGHT\n\nA protected manual rewrite.",
            previousDraft: previous,
            committedDraft: committed
        ))
    }

    func testBridgeVersionAdoptionRequiresSameProjectNewVersionAndCommittedDraft() {
        XCTAssertTrue(ScreenplayBridgeVersionAdoptionPolicy.shouldAdoptCommittedPageWriteBase(
            selectedProjectId: " project-a ",
            preferredProjectId: "project-a",
            currentVersionId: "version-before",
            preferredVersionId: "version-after",
            committedDraft: "INT. ROOM - NIGHT"
        ))
        XCTAssertFalse(ScreenplayBridgeVersionAdoptionPolicy.shouldAdoptCommittedPageWriteBase(
            selectedProjectId: "project-a",
            preferredProjectId: "project-b",
            currentVersionId: "version-before",
            preferredVersionId: "version-after",
            committedDraft: "INT. ROOM - NIGHT"
        ))
        XCTAssertFalse(ScreenplayBridgeVersionAdoptionPolicy.shouldAdoptCommittedPageWriteBase(
            selectedProjectId: "project-a",
            preferredProjectId: "project-a",
            currentVersionId: "version-after",
            preferredVersionId: "version-after",
            committedDraft: "INT. ROOM - NIGHT"
        ))
        XCTAssertFalse(ScreenplayBridgeVersionAdoptionPolicy.shouldAdoptCommittedPageWriteBase(
            selectedProjectId: "project-a",
            preferredProjectId: "project-a",
            currentVersionId: "version-before",
            preferredVersionId: " ",
            committedDraft: "INT. ROOM - NIGHT"
        ))
        XCTAssertFalse(ScreenplayBridgeVersionAdoptionPolicy.shouldAdoptCommittedPageWriteBase(
            selectedProjectId: "project-a",
            preferredProjectId: "project-a",
            currentVersionId: "version-before",
            preferredVersionId: "version-after",
            committedDraft: "   "
        ))
    }

    func testHistoryMigrationPolicyOnlyMovesLiveDraftIntoProjectKey() {
        XCTAssertTrue(ScreenplayStudioHistoryMigrationPolicy.shouldMoveLiveDraftHistory(
            from: "live-draft",
            to: "project:project-a",
            liveDraftEntryCount: 1
        ))
        XCTAssertFalse(ScreenplayStudioHistoryMigrationPolicy.shouldMoveLiveDraftHistory(
            from: "project:old",
            to: "project:project-a",
            liveDraftEntryCount: 1
        ))
        XCTAssertFalse(ScreenplayStudioHistoryMigrationPolicy.shouldMoveLiveDraftHistory(
            from: "live-draft",
            to: "live-draft",
            liveDraftEntryCount: 1
        ))
        XCTAssertFalse(ScreenplayStudioHistoryMigrationPolicy.shouldMoveLiveDraftHistory(
            from: "live-draft",
            to: "project:project-a",
            liveDraftEntryCount: 0
        ))
        XCTAssertFalse(ScreenplayStudioHistoryMigrationPolicy.isProjectHistoryKey("project:   "))
        XCTAssertTrue(ScreenplayStudioHistoryMigrationPolicy.isProjectHistoryKey(" project:abc "))
    }

    func testHistoryKeyPolicyPrefersSelectedThenPreferredThenBindingProject() {
        XCTAssertEqual(
            ScreenplayStudioHistoryMigrationPolicy.activeHistoryKey(
                selectedProjectID: " selected-project ",
                preferredProjectID: "preferred-project",
                bindingProjectID: "binding-project"
            ),
            "project:selected-project"
        )
        XCTAssertEqual(
            ScreenplayStudioHistoryMigrationPolicy.activeHistoryKey(
                selectedProjectID: " ",
                preferredProjectID: " preferred-project ",
                bindingProjectID: "binding-project"
            ),
            "project:preferred-project"
        )
        XCTAssertEqual(
            ScreenplayStudioHistoryMigrationPolicy.activeHistoryKey(
                selectedProjectID: "",
                preferredProjectID: " ",
                bindingProjectID: " binding-project "
            ),
            "project:binding-project"
        )
    }

    func testHistoryKeyPolicyFallsBackToLiveDraftWithoutProjectContext() {
        XCTAssertEqual(
            ScreenplayStudioHistoryMigrationPolicy.activeHistoryKey(
                selectedProjectID: " ",
                preferredProjectID: "",
                bindingProjectID: "   "
            ),
            ScreenplayStudioHistoryMigrationPolicy.liveDraftKey
        )
    }

    func testLiveDraftTextPersistenceKeepsMeaningfulScreenplayExactly() {
        let draft = """

        INT. DINER - NIGHT

        CLEMENTINE
        Keep the last line alive.

        """

        XCTAssertEqual(ScreenplayLiveDraftTextPersistencePolicy.draftForStorage(draft), draft)
        XCTAssertEqual(ScreenplayLiveDraftTextPersistencePolicy.restoredDraft(from: draft), draft)
    }

    func testLiveDraftTextPersistenceClearsEmptyDrafts() {
        XCTAssertNil(ScreenplayLiveDraftTextPersistencePolicy.draftForStorage("   \n\t  "))
        XCTAssertEqual(ScreenplayLiveDraftTextPersistencePolicy.restoredDraft(from: nil), "")
        XCTAssertEqual(ScreenplayLiveDraftTextPersistencePolicy.restoredDraft(from: "   \n\t  "), "")
    }

    func testRestoredLiveDraftPromotionRequiresStudioDraftAndNoProject() {
        XCTAssertTrue(ScreenplayRestoredLiveDraftProjectPromotionPolicy.shouldCreateProject(
            isStudioSurfaceActive: true,
            draft: "INT. DINER - NIGHT",
            existingProjectID: "",
            isAutoCreatingProject: false,
            createKey: "draft-key",
            lastCreateKey: ""
        ))
        XCTAssertFalse(ScreenplayRestoredLiveDraftProjectPromotionPolicy.shouldCreateProject(
            isStudioSurfaceActive: false,
            draft: "INT. DINER - NIGHT",
            existingProjectID: "",
            isAutoCreatingProject: false,
            createKey: "draft-key",
            lastCreateKey: ""
        ))
        XCTAssertFalse(ScreenplayRestoredLiveDraftProjectPromotionPolicy.shouldCreateProject(
            isStudioSurfaceActive: true,
            draft: "   ",
            existingProjectID: "",
            isAutoCreatingProject: false,
            createKey: "draft-key",
            lastCreateKey: ""
        ))
        XCTAssertFalse(ScreenplayRestoredLiveDraftProjectPromotionPolicy.shouldCreateProject(
            isStudioSurfaceActive: true,
            draft: "INT. DINER - NIGHT",
            existingProjectID: "project-existing",
            isAutoCreatingProject: false,
            createKey: "draft-key",
            lastCreateKey: ""
        ))
        XCTAssertFalse(ScreenplayRestoredLiveDraftProjectPromotionPolicy.shouldCreateProject(
            isStudioSurfaceActive: true,
            draft: "INT. DINER - NIGHT",
            existingProjectID: "",
            isAutoCreatingProject: true,
            createKey: "draft-key",
            lastCreateKey: ""
        ))
        XCTAssertFalse(ScreenplayRestoredLiveDraftProjectPromotionPolicy.shouldCreateProject(
            isStudioSurfaceActive: true,
            draft: "INT. DINER - NIGHT",
            existingProjectID: "",
            isAutoCreatingProject: false,
            createKey: "draft-key",
            lastCreateKey: "draft-key"
        ))
    }

    func testSaveFailurePresentationDistinguishesManualAutosaveAndSnapshot() {
        XCTAssertEqual(
            ScreenplayDraftSaveRecoveryPresentationPolicy.failureStatus(source: "studio_manual"),
            "Save failed"
        )
        XCTAssertEqual(
            ScreenplayDraftSaveRecoveryPresentationPolicy.failureStatus(source: "studio_conflict_resolve"),
            "Save failed"
        )
        XCTAssertEqual(
            ScreenplayDraftSaveRecoveryPresentationPolicy.failureStatus(source: "studio_snapshot"),
            "Snapshot failed"
        )
        XCTAssertEqual(
            ScreenplayDraftSaveRecoveryPresentationPolicy.failureStatus(source: "studio_autosave"),
            "Autosave failed"
        )
    }

    func testSaveFailurePresentationExplainsLocalRecoveryAndRetry() {
        let manualInfo = ScreenplayDraftSaveRecoveryPresentationPolicy.recoveryInfo(source: "studio_manual")
        XCTAssertTrue(manualInfo.contains("local draft is preserved"))
        XCTAssertTrue(manualInfo.contains("retry Save"))

        let autosaveInfo = ScreenplayDraftSaveRecoveryPresentationPolicy.recoveryInfo(source: "studio_autosave")
        XCTAssertTrue(autosaveInfo.contains("local draft is preserved"))
        XCTAssertTrue(autosaveInfo.contains("next edit"))

        XCTAssertEqual(
            ScreenplayDraftSaveRecoveryPresentationPolicy.failureError(
                source: "studio_manual",
                underlying: "The network connection was lost."
            ),
            "Save failed: The network connection was lost."
        )
    }

    func testSuccessfulSaveClearsStaleRecoveryGuidance() {
        XCTAssertTrue(
            ScreenplayDraftSaveRecoveryPresentationPolicy.shouldClearInfoAfterSuccessfulSave(
                "Autosave did not finish. Your local draft is preserved; it will retry on the next edit or you can press Save."
            )
        )
        XCTAssertTrue(
            ScreenplayDraftSaveRecoveryPresentationPolicy.shouldClearInfoAfterSuccessfulSave(
                "Kept your manual edits on the page. Save when you're ready."
            )
        )
        XCTAssertFalse(
            ScreenplayDraftSaveRecoveryPresentationPolicy.shouldClearInfoAfterSuccessfulSave(
                "Project ready."
            )
        )
    }

    func testSceneSessionRestorePolicyClearsOnlyMissingSelections() {
        let validIDs: Set<String> = ["scene-a", "scene-b"]

        XCTAssertFalse(ScreenplaySceneSessionRestorePolicy.shouldClearSelection(" scene-a ", validIDs: validIDs))
        XCTAssertTrue(ScreenplaySceneSessionRestorePolicy.shouldClearSelection("scene-old", validIDs: validIDs))
        XCTAssertFalse(ScreenplaySceneSessionRestorePolicy.shouldClearSelection("   ", validIDs: validIDs))
    }

    private func featurePlannerActionSnapshot(
        id: String = "planner-action",
        projectId: String,
        command: ScreenplayFeatureActionCommand = .writeNextScene,
        displayText: String = "Write next feature scene",
        requestID: String = "planner-request",
        submittedAt: TimeInterval = 1_700_000_000,
        routingModeRawValue: String? = nil
    ) -> ScreenplayFeaturePlannerActionSnapshot {
        ScreenplayFeaturePlannerActionSnapshot(
            id: id,
            projectId: projectId,
            projectTitle: "The Flood Courier",
            commandRawValue: command.rawValue,
            displayText: displayText,
            prompt: "Write the next scene directly into the screenplay draft.",
            currentAct: "Act II",
            sequenceLabel: "Midpoint Pressure",
            pageRangeText: "p41-p55",
            requestID: requestID,
            submittedAt: submittedAt,
            routingModeRawValue: routingModeRawValue ?? command.routingModeRawValue
        )
    }

    private func projectSummary(
        id: String,
        activeVersionId: String? = nil,
        lastVersionId: String? = nil,
        versions: [BackendScreenplayVersion]? = nil
    ) -> BackendScreenplayProjectSummary {
        BackendScreenplayProjectSummary(
            id: id,
            title: id,
            archived: nil,
            tags: nil,
            characters: nil,
            setting: nil,
            tone: nil,
            promptSeed: nil,
            logline: nil,
            themeArgument: nil,
            centralQuestion: nil,
            protagonistWant: nil,
            protagonistNeed: nil,
            antagonisticForce: nil,
            actPosition: nil,
            endingImage: nil,
            unresolvedSetups: nil,
            createdAt: nil,
            updatedAt: nil,
            versionCount: nil,
            lastPhase: nil,
            activeVersionId: activeVersionId,
            lastVersionId: lastVersionId,
            lastVersionAt: nil,
            formatScore: nil,
            storyScore: nil,
            confidenceClass: nil,
            latestExcerpt: nil,
            actCount: nil,
            sceneCount: nil,
            beatCount: nil,
            outlineUpdatedAt: nil,
            collaboratorCount: nil,
            approvedEmails: nil,
            commentCount: nil,
            lastCommentAt: nil,
            studioThreadViewState: nil,
            studioDiffAcknowledged: nil,
            studioAskNoteHistory: nil,
            collaborators: nil,
            comments: nil,
            versions: versions,
            outline: nil
        )
    }

    private func version(
        id: String,
        source: String? = nil,
        createdAt: TimeInterval? = nil,
        updatedAt: TimeInterval? = nil,
        draft: String? = nil
    ) -> BackendScreenplayVersion {
        BackendScreenplayVersion(
            id: id,
            projectId: "project",
            phase: "scene_draft",
            source: source,
            clientRequestId: nil,
            createdAt: createdAt,
            updatedAt: updatedAt,
            prompt: nil,
            notes: nil,
            formatScore: nil,
            storyScore: nil,
            confidenceClass: nil,
            warnings: nil,
            draft: draft,
            draftExcerpt: nil,
            studioWriteAnchors: nil,
            screenplayBindings: nil
        )
    }

    private func stableFingerprint(_ value: String) -> String {
        var hash: UInt64 = 14_695_981_039_346_656_037
        for byte in value.utf8 {
            hash ^= UInt64(byte)
            hash = hash &* 1_099_511_628_211
        }
        return String(hash, radix: 16)
    }
}
