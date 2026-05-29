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

    func testRestorePolicyKeepsBackendActiveProjectEvenWhenListPageOmitsIt() {
        let selectedProjectId = ScreenplayProjectSelectionRestorePolicy.selectedProjectId(
            activeProjectId: " legacy-active-project ",
            projects: [
                projectSummary(id: "recent-project"),
                projectSummary(id: "another-recent-project"),
            ]
        )

        XCTAssertEqual(selectedProjectId, "legacy-active-project")
    }

    func testRestorePolicyFallsBackToFirstProjectWhenNoActiveProjectExists() {
        let selectedProjectId = ScreenplayProjectSelectionRestorePolicy.selectedProjectId(
            activeProjectId: " ",
            projects: [
                projectSummary(id: "first-project"),
                projectSummary(id: "second-project"),
            ]
        )

        XCTAssertEqual(selectedProjectId, "first-project")
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
