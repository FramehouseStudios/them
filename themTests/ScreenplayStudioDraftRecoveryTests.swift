import XCTest
@testable import them

final class ScreenplayStudioDraftRecoveryTests: XCTestCase {
    @MainActor
    func testClearDraftRetainsUnresolvedConflictAndPriorWriterCopy() async {
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store)
        model.autosaveEnabled = false
        model.selectedProjectID = "clear-conflict"
        model.applyStructuralUITestDraft("Saved words", versionID: "base")
        model.fountainDraft = "Unsaved writer words"
        model.noteManualDraftEdit()
        let conflict = ScreenplayStudioViewModel.SaveConflictState(projectId: "clear-conflict",
            baseVersionId: "base", serverVersionId: "remote", serverDraft: "Collaborator words",
            serverDraftExcerpt: "Collaborator words", serverUpdatedAt: 1)
        model.conflictState = conflict
        model.clearDraft()
        XCTAssertEqual(model.fountainDraft, "")
        XCTAssertTrue(model.hasIntentionalBlankDraft)
        XCTAssertEqual(model.conflictState, conflict)
        let modelOwner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        XCTAssertEqual(store.firstPreservedConflict(ownerUserId: modelOwner,
            projectId: "clear-conflict")?.draft, "Unsaved writer words")
        try? await Task.sleep(nanoseconds: 1_100_000_000)
        XCTAssertEqual(model.conflictState, conflict)
        XCTAssertEqual(model.autosaveStatusText, "Conflict detected")
    }

    @MainActor
    func testRemoteLiveAdoptionCannotReuseWriterDeletionIntent() async {
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store)
        model.autosaveEnabled = false
        model.selectedProjectID = "remote-intent"
        model.applyStructuralUITestDraft("Saved words", versionID: "base")
        model.fountainDraft = ""
        model.noteManualDraftEdit()
        XCTAssertTrue(model.hasIntentionalBlankDraft)
        XCTAssertTrue(model.applyRemoteLiveDraft("Remote words", projectID: "remote-intent", sourceDeviceID: "other"))
        XCTAssertTrue(model.applyRemoteLiveDraft("", projectID: "remote-intent", sourceDeviceID: "other"))
        XCTAssertFalse(model.hasIntentionalBlankDraft)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    func testBlankRecoveryRequiresExplicitIntentAndExistingBase() {
        store.save(ownerUserId: ownerUserID, projectId: "blank", draft: "", baseVersionId: "base", dirty: true)
        XCTAssertNil(store.dirtyOrdinarySnapshot(ownerUserId: ownerUserID, projectId: "blank"))
        store.save(ownerUserId: ownerUserID, projectId: "blank", draft: "", baseVersionId: "base",
                   dirty: true, allowEmptyDraft: true)
        let reopened = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: recoveryKey)
        XCTAssertEqual(reopened.recoverySnapshot(ownerUserId: ownerUserID, projectId: "blank",
            serverDraft: "Server words", fingerprint: { $0 })?.draft, "")
        XCTAssertNil(reopened.dirtyOrdinarySnapshot(ownerUserId: "other", projectId: "blank"))
        store.save(ownerUserId: ownerUserID, projectId: "versionless", draft: "", baseVersionId: "",
                   dirty: true, allowEmptyDraft: true)
        XCTAssertNil(store.dirtyOrdinarySnapshot(ownerUserId: ownerUserID, projectId: "versionless"))
    }

    @MainActor
    func testIncidentalEmptyDraftDoesNotAcquireWriterDeletionIntent() async {
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store)
        model.autosaveEnabled = false
        model.selectedProjectID = "project"
        model.applyStructuralUITestDraft("Writer words", versionID: "base")
        model.fountainDraft = ""
        XCTAssertFalse(model.hasIntentionalBlankDraft)
        model.noteManualDraftEdit()
        XCTAssertTrue(model.hasIntentionalBlankDraft)
        model.selectedProjectID = "other-project"
        XCTAssertFalse(model.hasIntentionalBlankDraft)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    func testSaveConfirmationRequiresExactReturnedWriterText() {
        let draft = "  café\r\n"
        XCTAssertTrue(ScreenplayDraftSaveCompletionPolicy.confirmsSavedDraft(
            requestedDraft: draft, returnedDraft: draft))
        for returned in [nil, "café", "  café\n", "  cafe\u{0301}\r\n"] as [String?] {
            XCTAssertFalse(ScreenplayDraftSaveCompletionPolicy.confirmsSavedDraft(
                requestedDraft: draft, returnedDraft: returned))
        }
        XCTAssertFalse(ScreenplayDraftSaveRetryPolicy.shouldRetry(
            BackendMemoryAPIError.server(status: 409, message: "unconfirmed_exact_text")))
    }

    func testRecoveryDoesNotDiscardDistinctTextWhenFingerprintsCollide() {
        store.save(ownerUserId: ownerUserID, projectId: "collision", draft: "Writer words",
                   baseVersionId: "base", dirty: true)
        let recovered = store.recoverySnapshot(ownerUserId: ownerUserID, projectId: "collision",
            serverDraft: "Server words", fingerprint: { _ in "constant" })
        XCTAssertEqual(recovered?.draft, "Writer words")
        store.savePreservedConflict(ownerUserId: ownerUserID, projectId: "collision",
            draft: "Preserved words", baseVersionId: "base")
        XCTAssertEqual(store.recoverySnapshot(ownerUserId: ownerUserID, projectId: "collision",
            serverDraft: "Server words", fingerprint: { _ in "constant" })?.draft, "Preserved words")
    }

    func testUnicodeDistinctRecoveryCopiesSurviveRelaunchAndSpecificRemoval() {
        let composed = "café", decomposed = "cafe\u{0301}"
        for draft in [composed, decomposed] {
            store.savePreservedConflict(ownerUserId: ownerUserID, projectId: "unicode",
                draft: draft, baseVersionId: "base", savedAt: 1)
        }
        let reopened = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: recoveryKey)
        XCTAssertEqual(Array(reopened.firstPreservedConflict(ownerUserId: ownerUserID,
            projectId: "unicode")!.draft.utf8), Array(composed.utf8))
        XCTAssertEqual(Array(reopened.nextPreservedConflict(ownerUserId: ownerUserID,
            projectId: "unicode", after: composed, savedAt: 1)!.draft.utf8), Array(decomposed.utf8))
        reopened.clearPreservedConflict(ownerUserId: ownerUserID, projectId: "unicode", draft: decomposed)
        XCTAssertEqual(Array(reopened.firstPreservedConflict(ownerUserId: ownerUserID,
            projectId: "unicode")!.draft.utf8), Array(composed.utf8))
        XCTAssertNil(reopened.nextPreservedConflict(ownerUserId: ownerUserID,
            projectId: "unicode", after: composed, savedAt: 1))
    }

    @MainActor
    func testHydrationPreservesDirtyUnicodeDistinctLocalDraft() async {
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store)
        model.selectedProjectID = "unicode"
        model.autosaveEnabled = false
        model.applyStructuralUITestDraft("café", versionID: "base")
        model.fountainDraft = "cafe\u{0301}"
        model.noteManualDraftEdit()
        model.hydrateDraft(from: projectSummary(id: "unicode", activeVersionId: "remote",
            versions: [version(id: "remote", draft: "café")]))
        XCTAssertEqual(Array(model.fountainDraft.utf8), Array("cafe\u{0301}".utf8))
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertNotNil(model.conflictState)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testSnapshotRestoresRawBoundaryAndUnicodeBytes() async {
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store)
        model.selectedProjectID = "snapshot"
        model.autosaveEnabled = false
        model.applyStructuralUITestDraft("Saved draft", versionID: "base")
        let raw = "  \tINT. ROOM - NIGHT\r\n\ncafe\u{0301}\t \r\n"
        model.loadSnapshot(version(id: "historic", draft: raw))
        XCTAssertEqual(Array(model.fountainDraft.utf8), Array(raw.utf8))
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    func testCommittedPageCannotOverwriteByteDistinctManualEdit() {
        for edited in ["cafe\u{0301}", "café\n"] {
            XCTAssertFalse(ScreenplayCommittedDraftAdoptionPolicy.shouldAdopt(
                selectedProjectID: "project", committedProjectID: "project",
                currentDraft: edited, previousDraft: "café", committedDraft: "New page"))
        }
    }

    @MainActor
    func testExplicitLoadServerChoiceAllowsNormalLiveFollowingAgain() async {
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store)
        model.selectedProjectID = "resolved-choice"
        model.fountainDraft = "Writer draft"
        model.hasUnsavedDraftChanges = true
        model.conflictState = ScreenplayStudioViewModel.SaveConflictState(
            projectId: model.selectedProjectID, baseVersionId: "base", serverVersionId: "remote",
            serverDraft: "Chosen server draft", serverDraftExcerpt: "Chosen server draft",
            serverUpdatedAt: 1
        )

        model.applyServerVersionFromConflict()
        XCTAssertNil(model.conflictState)
        XCTAssertEqual(model.fountainDraft, "Chosen server draft")
        XCTAssertEqual(model.latestVersionID, "remote")
        XCTAssertFalse(model.hasUnsavedDraftChanges)
        XCTAssertTrue(model.applyRemoteLiveDraft("Next live revision",
            projectID: model.selectedProjectID, sourceDeviceID: "other-device"))
        model.adoptRemoteLiveVersion("next", projectID: model.selectedProjectID,
                                    draftChecksum: LiveDraftText.checksum("Next live revision"))
        XCTAssertEqual(model.latestVersionID, "next")
        XCTAssertFalse(model.hasUnsavedDraftChanges)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testRemoteLiveDraftCannotDismissAnUnresolvedWriterChoice() async {
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store)
        let local = "INT. ROOM - NIGHT\n\nThe writer's offline words.\n"
        let conflict = ScreenplayStudioViewModel.SaveConflictState(
            projectId: "pending-choice", baseVersionId: "base", serverVersionId: "remote",
            serverDraft: "Collaborator revision", serverDraftExcerpt: "Collaborator revision",
            serverUpdatedAt: 1
        )
        model.selectedProjectID = conflict.projectId
        model.fountainDraft = local
        model.hasUnsavedDraftChanges = true
        model.conflictState = conflict
        model.autosaveStatusText = "Conflict detected"

        XCTAssertFalse(model.applyRemoteLiveDraft(conflict.serverDraft,
            projectID: conflict.projectId, sourceDeviceID: "other-device"))
        XCTAssertEqual(model.fountainDraft, local)
        XCTAssertEqual(model.conflictState, conflict)
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertEqual(model.autosaveStatusText, "Conflict detected")
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testRemoteVersionReceiptCannotResolveConflictEvenWhenTextMatches() async {
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store)
        let local = "INT. ROOM - NIGHT\n\nThe writer's offline words."
        let conflict = ScreenplayStudioViewModel.SaveConflictState(
            projectId: "pending-receipt-choice", baseVersionId: "base", serverVersionId: "remote",
            serverDraft: local, serverDraftExcerpt: local, serverUpdatedAt: 1
        )
        model.selectedProjectID = conflict.projectId
        model.fountainDraft = local
        model.latestVersionID = "base"
        model.hasUnsavedDraftChanges = true
        model.conflictState = conflict
        model.autosaveStatusText = "Conflict detected"
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        store.save(ownerUserId: owner, projectId: conflict.projectId, draft: local,
                   baseVersionId: "base", dirty: true)

        model.adoptRemoteLiveVersion("remote", projectID: conflict.projectId,
                                    draftChecksum: LiveDraftText.checksum(local))
        XCTAssertEqual(model.latestVersionID, "base")
        XCTAssertEqual(model.conflictState, conflict)
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertEqual(model.autosaveStatusText, "Conflict detected")
        XCTAssertEqual(store.payloads(ownerUserId: owner)[conflict.projectId]?["draft"] as? String, local)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    func test_queuedDraftHydratesBeforeServerAndOnlyForItsOwnCleanProject() {
        XCTAssertTrue(ScreenplayQueuedDraftHydrationPolicy.shouldRestoreBeforeServerHydration(
            selectedProjectID: " project-1 ",
            queuedProjectID: "project-1",
            queuedDraft: "INT. ROOM - NIGHT\n\nRecovered writer text.",
            hasUnsavedChanges: false,
            isManualEditing: false
        ))

        XCTAssertFalse(ScreenplayQueuedDraftHydrationPolicy.shouldRestoreBeforeServerHydration(
            selectedProjectID: "project-2",
            queuedProjectID: "project-1",
            queuedDraft: "Recovered writer text.",
            hasUnsavedChanges: false,
            isManualEditing: false
        ))
        XCTAssertFalse(ScreenplayQueuedDraftHydrationPolicy.shouldRestoreBeforeServerHydration(
            selectedProjectID: "project-1",
            queuedProjectID: "project-1",
            queuedDraft: "Recovered writer text.",
            hasUnsavedChanges: true,
            isManualEditing: true
        ))
    }

    func test_queuedDraftAdoptionRestoresOnlyWhenEditorStillMatchesItsBase() {
        XCTAssertTrue(ScreenplayQueuedDraftAdoptionPolicy.shouldAdopt(
            selectedProjectID: " project-1 ",
            loadedProjectID: "project-1",
            latestVersionID: "version-4",
            queuedProjectID: "project-1",
            queuedBaseVersionID: "version-4",
            hasUnsavedChanges: false,
            isManualEditing: false,
            currentDraftFingerprint: "same-draft",
            lastSavedDraftFingerprint: "same-draft"
        ))

        XCTAssertFalse(ScreenplayQueuedDraftAdoptionPolicy.shouldAdopt(
            selectedProjectID: "project-1",
            loadedProjectID: "project-1",
            latestVersionID: "version-5",
            queuedProjectID: "project-1",
            queuedBaseVersionID: "version-4",
            hasUnsavedChanges: false,
            isManualEditing: false,
            currentDraftFingerprint: "same-draft",
            lastSavedDraftFingerprint: "same-draft"
        ), "A queued save based on an older server version must not replace the current editor silently.")

        XCTAssertFalse(ScreenplayQueuedDraftAdoptionPolicy.shouldAdopt(
            selectedProjectID: "project-1",
            loadedProjectID: "project-1",
            latestVersionID: "version-4",
            queuedProjectID: "project-1",
            queuedBaseVersionID: "version-4",
            hasUnsavedChanges: true,
            isManualEditing: true,
            currentDraftFingerprint: "writer-edit",
            lastSavedDraftFingerprint: "same-draft"
        ), "A newer in-editor writer edit must outrank an older queued draft.")

        XCTAssertFalse(ScreenplayQueuedDraftAdoptionPolicy.shouldAdopt(
            selectedProjectID: "project-2",
            loadedProjectID: "project-2",
            latestVersionID: "version-4",
            queuedProjectID: "project-1",
            queuedBaseVersionID: "version-4",
            hasUnsavedChanges: false,
            isManualEditing: false,
            currentDraftFingerprint: "same-draft",
            lastSavedDraftFingerprint: "same-draft"
        ), "A queue entry from another project must never be applied to the selected editor.")
    }

    private let defaultsSuiteName = "io.them.ScreenplayStudioDraftRecoveryTests"
    private let recoveryKey = "screenplay.studio.localDraftRecovery.tests"
    private let ownerUserID = "user-recovery"
    private var defaults: UserDefaults!
    private var store: ScreenplayLocalDraftRecoveryStore!

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: defaultsSuiteName)!
        defaults.removePersistentDomain(forName: defaultsSuiteName)
        store = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: recoveryKey)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: defaultsSuiteName)
        store = nil
        defaults = nil
        super.tearDown()
    }

    func testNavigatorRootUsesDedicatedApplicationSupportFolderOnMacOS() {
        let applicationSupport = URL(fileURLWithPath: "/tmp/io-them-application-support", isDirectory: true)
        let documents = URL(fileURLWithPath: "/tmp/io-them-documents", isDirectory: true)
        let temporary = URL(fileURLWithPath: "/tmp", isDirectory: true)

        XCTAssertEqual(
            ScreenplayNavigatorRootPolicy.preferredRootURL(
                isMacOS: true,
                applicationSupportURL: applicationSupport,
                documentsURL: documents,
                temporaryURL: temporary
            ),
            applicationSupport
                .appendingPathComponent("io.them", isDirectory: true)
                .appendingPathComponent("Screenplays", isDirectory: true)
        )
    }

    func testNavigatorRootKeepsTheAppDocumentsFolderOnIOS() {
        let applicationSupport = URL(fileURLWithPath: "/tmp/io-them-application-support", isDirectory: true)
        let documents = URL(fileURLWithPath: "/tmp/io-them-documents", isDirectory: true)

        XCTAssertEqual(
            ScreenplayNavigatorRootPolicy.preferredRootURL(
                isMacOS: false,
                applicationSupportURL: applicationSupport,
                documentsURL: documents,
                temporaryURL: URL(fileURLWithPath: "/tmp", isDirectory: true)
            ),
            documents
        )
    }

    func testSaveWritesLocalRecoverySnapshot() {
        let draft = """
        INT. MOTEL ROOM - NIGHT

        CLEMENTINE watches the rain make tiny rivers down the glass.
        """

        store.save(
            ownerUserId: ownerUserID,
            projectId: " project-recovery ",
            draft: draft,
            baseVersionId: "version-before-edit",
            dirty: true,
            savedAt: 1_700_000_000
        )

        let payload = store.payloads(ownerUserId: ownerUserID)["project-recovery"]
        XCTAssertEqual(payload?["draft"] as? String, draft)
        XCTAssertEqual(payload?["baseVersionId"] as? String, "version-before-edit")
        XCTAssertEqual(payload?["dirty"] as? Bool, true)
        XCTAssertEqual(payload?["savedAt"] as? TimeInterval, 1_700_000_000)
    }

    func testClearRemovesOnlyRequestedProjectRecoverySnapshot() {
        store.save(ownerUserId: ownerUserID, projectId: "project-a", draft: "A", baseVersionId: "v-a", dirty: true)
        store.save(ownerUserId: ownerUserID, projectId: "project-b", draft: "B", baseVersionId: "v-b", dirty: true)

        store.clear(ownerUserId: ownerUserID, projectId: " project-a ")

        let payloads = store.payloads(ownerUserId: ownerUserID)
        XCTAssertNil(payloads["project-a"])
        XCTAssertEqual(payloads["project-b"]?["draft"] as? String, "B")
    }

    func testRecoverySnapshotPreservesUnsavedDraftBasedOnCurrentServerVersion() {
        store.save(
            ownerUserId: ownerUserID,
            projectId: "project-recovery",
            draft: "INT. MOTEL ROOM - NIGHT\n\nShe adds the line she cannot forget.",
            baseVersionId: "server-current",
            dirty: true,
            savedAt: 1_700_000_123
        )

        let snapshot = store.recoverySnapshot(
            ownerUserId: ownerUserID,
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
            ownerUserId: ownerUserID,
            projectId: "project-recovery",
            draft: "INT. MOTEL ROOM - NIGHT",
            baseVersionId: "server-current",
            dirty: true,
            savedAt: 1_700_000_123
        )

        let snapshot = store.recoverySnapshot(
            ownerUserId: ownerUserID,
            projectId: "project-recovery",
            serverDraft: "INT. MOTEL ROOM - NIGHT",
            fingerprint: stableFingerprint
        )

        XCTAssertNil(snapshot)
        XCTAssertNil(store.payloads(ownerUserId: ownerUserID)["project-recovery"])
    }

    func testPreservedLiveSyncConflictSurvivesRemoteRecoveryWritesAndStoreReinitialization() {
        let local = "INT. DINER - NIGHT\n\nShe waits.\n\nA phone BUZZES."
        let remote = "INT. DINER - NIGHT\n\nShe waits."
        store.save(
            ownerUserId: ownerUserID,
            projectId: "project-recovery",
            draft: local,
            baseVersionId: "version-before-edit",
            dirty: true,
            savedAt: 1_700_000_123
        )

        store.savePreservedConflict(
            ownerUserId: ownerUserID,
            projectId: "project-recovery",
            draft: local,
            baseVersionId: "version-before-edit",
            savedAt: 1_700_000_123
        )
        // The normal live-sync debounce is allowed to persist and later mark
        // the remote text clean, but it must not replace the separate copy.
        store.save(
            ownerUserId: ownerUserID,
            projectId: "project-recovery",
            draft: remote,
            baseVersionId: "version-remote",
            dirty: false,
            savedAt: 1_700_000_456
        )

        let relaunchedStore = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: recoveryKey)
        let snapshot = relaunchedStore.recoverySnapshot(
            ownerUserId: ownerUserID,
            projectId: "project-recovery",
            serverDraft: remote,
            fingerprint: stableFingerprint
        )

        XCTAssertEqual(snapshot?.draft, local)
        XCTAssertEqual(snapshot?.baseVersionId, "version-before-edit")
        XCTAssertEqual(snapshot?.savedAt, 1_700_000_123)
        XCTAssertEqual(snapshot?.isPreservedConflict, true)
    }

    func testRemoteVersionConfirmationClearsOrdinaryDraftButKeepsPreservedConflict() {
        let local = "INT. DINER - NIGHT\n\nShe waits.\n\nA phone BUZZES."
        let remote = "INT. DINER - NIGHT\n\nShe waits."
        store.save(
            ownerUserId: ownerUserID,
            projectId: "project-recovery",
            draft: local,
            baseVersionId: "version-before-edit",
            dirty: true,
            savedAt: 1_700_000_123
        )
        store.savePreservedConflict(
            ownerUserId: ownerUserID,
            projectId: "project-recovery",
            draft: local,
            baseVersionId: "version-before-edit",
            savedAt: 1_700_000_123
        )

        // The remote live draft is written to the ordinary cache, then its
        // server version is acknowledged. That acknowledgement must not erase
        // the different local recovery copy.
        store.save(
            ownerUserId: ownerUserID,
            projectId: "project-recovery",
            draft: remote,
            baseVersionId: "version-remote",
            dirty: true,
            savedAt: 1_700_000_456
        )
        store.clearOrdinaryDraft(ownerUserId: ownerUserID, projectId: "project-recovery")

        let relaunchedStore = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: recoveryKey)
        let snapshot = relaunchedStore.recoverySnapshot(
            ownerUserId: ownerUserID,
            projectId: "project-recovery",
            serverDraft: remote,
            fingerprint: stableFingerprint
        )

        XCTAssertEqual(snapshot?.draft, local)
        XCTAssertEqual(snapshot?.baseVersionId, "version-before-edit")
        XCTAssertEqual(snapshot?.isPreservedConflict, true)
        let payload = relaunchedStore.payloads(ownerUserId: ownerUserID)["project-recovery"]
        XCTAssertNil(payload?["draft"])
        XCTAssertNotNil(payload?["preservedConflicts"])
    }

    func testSuccessivePreservedConflictsSurviveAcknowledgementAndAreRecoverableInOrder() {
        let remote = "INT. DINER - NIGHT\n\nShe waits."
        let first = remote + "\n\nA phone BUZZES."
        let second = first + "\n\nShe lets it ring."

        store.savePreservedConflict(
            ownerUserId: ownerUserID,
            projectId: "project-recovery",
            draft: first,
            baseVersionId: "version-before-first-conflict",
            savedAt: 1_700_000_123
        )
        store.savePreservedConflict(
            ownerUserId: ownerUserID,
            projectId: "project-recovery",
            draft: second,
            baseVersionId: "version-before-second-conflict",
            savedAt: 1_700_000_456
        )

        // A remote save acknowledgement may clear the ordinary recovery slot,
        // but must not erase either local conflict snapshot.
        store.save(
            ownerUserId: ownerUserID,
            projectId: "project-recovery",
            draft: remote,
            baseVersionId: "version-remote",
            dirty: true,
            savedAt: 1_700_000_789
        )
        store.clearOrdinaryDraft(ownerUserId: ownerUserID, projectId: "project-recovery")

        let relaunchedStore = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: recoveryKey)
        let firstSnapshot = relaunchedStore.recoverySnapshot(
            ownerUserId: ownerUserID,
            projectId: "project-recovery",
            serverDraft: remote,
            fingerprint: stableFingerprint
        )
        XCTAssertEqual(firstSnapshot?.draft, first)
        XCTAssertEqual(firstSnapshot?.baseVersionId, "version-before-first-conflict")

        let secondSnapshot = relaunchedStore.nextPreservedConflict(
            ownerUserId: ownerUserID,
            projectId: "project-recovery",
            after: first,
            savedAt: 1_700_000_123
        )
        XCTAssertEqual(secondSnapshot?.draft, second)
        XCTAssertEqual(secondSnapshot?.baseVersionId, "version-before-second-conflict")

        // Choosing the second snapshot replaces the ordinary editing slot,
        // not the protected history. Both remain recoverable until the writer
        // explicitly saves a chosen draft or discards the recovery copies.
        relaunchedStore.save(
            ownerUserId: ownerUserID,
            projectId: "project-recovery",
            draft: second,
            baseVersionId: "version-before-second-conflict",
            dirty: true,
            savedAt: 1_700_000_999
        )
        relaunchedStore.clearOrdinaryDraft(ownerUserId: ownerUserID, projectId: "project-recovery")
        let afterSecondAcknowledgement = relaunchedStore.recoverySnapshot(
            ownerUserId: ownerUserID,
            projectId: "project-recovery",
            serverDraft: remote,
            fingerprint: stableFingerprint
        )
        XCTAssertEqual(afterSecondAcknowledgement?.draft, first)
        XCTAssertEqual(
            relaunchedStore.nextPreservedConflict(
                ownerUserId: ownerUserID,
                projectId: "project-recovery",
                after: first,
                savedAt: 1_700_000_123
            )?.draft,
            second
        )
    }

    func testLegacySingleConflictMigratesWithoutDroppingWhenAnotherConflictArrives() {
        let ownerKey = ScreenplayOwnerScopedStoragePolicy.storageKey(
            baseKey: recoveryKey,
            ownerUserID: ownerUserID
        )
        let legacyDraft = "INT. DINER - NIGHT\n\nShe waits."
        let nextDraft = legacyDraft + "\n\nA phone BUZZES."
        defaults.set([
            "project-recovery": [
                "preservedConflict": [
                    "draft": legacyDraft,
                    "baseVersionId": "legacy-base",
                    "dirty": true,
                    "savedAt": 1_700_000_123,
                ],
            ],
        ], forKey: ownerKey)

        store.savePreservedConflict(
            ownerUserId: ownerUserID,
            projectId: "project-recovery",
            draft: nextDraft,
            baseVersionId: "new-base",
            savedAt: 1_700_000_456
        )

        let payload = store.payloads(ownerUserId: ownerUserID)["project-recovery"]
        let conflicts = payload?["preservedConflicts"] as? [[String: Any]]
        XCTAssertEqual(conflicts?.count, 2)
        XCTAssertNil(payload?["preservedConflict"])
        XCTAssertEqual(
            store.firstPreservedConflict(ownerUserId: ownerUserID, projectId: "project-recovery")?.draft,
            legacyDraft
        )
        XCTAssertEqual(
            store.nextPreservedConflict(
                ownerUserId: ownerUserID,
                projectId: "project-recovery",
                after: legacyDraft,
                savedAt: 1_700_000_123
            )?.draft,
            nextDraft
        )
    }

    @MainActor
    func testViewModelAdvancesRecoveryWithoutDeletingEarlierUnresolvedDrafts() async {
        let projectID = "project-successive-live-conflicts-\(UUID().uuidString)"
        let authOwnerID = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let first = "INT. DINER - NIGHT\n\nShe waits."
        let second = first + "\n\nA phone BUZZES."
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store)
        model.selectedProjectID = projectID
        model.fountainDraft = first

        model.preserveLocalDraftForLiveSyncRecovery(first, projectID: projectID)
        model.preserveLocalDraftForLiveSyncRecovery(second, projectID: projectID)
        XCTAssertEqual(model.recoveryCandidate?.draft, first)

        model.restoreDraftFromRecovery()
        XCTAssertEqual(model.fountainDraft, first)
        XCTAssertEqual(model.recoveryCandidate?.draft, second)

        model.restoreDraftFromRecovery()
        XCTAssertEqual(model.fountainDraft, second)
        XCTAssertNil(model.recoveryCandidate)

        let archived = store.firstPreservedConflict(ownerUserId: authOwnerID, projectId: projectID)
        XCTAssertEqual(archived?.draft, first)
        XCTAssertEqual(
            store.nextPreservedConflict(
                ownerUserId: authOwnerID,
                projectId: projectID,
                after: first,
                savedAt: archived?.savedAt ?? 0
            )?.draft,
            second
        )
        // Let the editor's debounced draft observer drain before this test's
        // temporary ViewModel is released.
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testLiveSyncVersionAdoptionKeepsExactLocalDraftAvailableToRecover() async {
        let local = "INT. DINER - NIGHT\n\nShe waits.\n\nA phone BUZZES."
        let remote = "INT. DINER - NIGHT\n\nShe waits."
        let projectID = "project-live-sync-recovery-\(UUID().uuidString)"
        let authOwnerID = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store)
        model.selectedProjectID = projectID
        model.fountainDraft = local
        model.preserveLocalDraftForLiveSyncRecovery(local, projectID: projectID)

        XCTAssertTrue(model.applyRemoteLiveDraft(remote, projectID: projectID, sourceDeviceID: "other-device"))
        try? await Task.sleep(nanoseconds: 1_100_000_000)
        model.adoptRemoteLiveVersion(
            "version-remote",
            projectID: projectID,
            draftChecksum: LiveDraftText.checksum(remote)
        )

        XCTAssertEqual(model.fountainDraft, remote)
        XCTAssertEqual(model.recoveryCandidate?.draft, local)
        XCTAssertEqual(model.recoveryCandidate?.baseVersionId, "")
        XCTAssertEqual(model.recoveryCandidate?.isPreservedConflict, true)

        let relaunchedStore = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: recoveryKey)
        let relaunchedSnapshot = relaunchedStore.recoverySnapshot(
            ownerUserId: authOwnerID,
            projectId: projectID,
            serverDraft: remote,
            fingerprint: stableFingerprint
        )
        XCTAssertEqual(relaunchedSnapshot?.draft, local)
        XCTAssertEqual(relaunchedSnapshot?.isPreservedConflict, true)

        model.restoreDraftFromRecovery()
        XCTAssertEqual(model.fountainDraft, local)
        XCTAssertNil(model.recoveryCandidate)
    }

    func testPreservedLiveSyncConflictCanBeResolvedWithoutLeavingFalseRecovery() {
        let local = "Local unsaved scene"
        store.savePreservedConflict(
            ownerUserId: ownerUserID,
            projectId: "project-recovery",
            draft: local,
            baseVersionId: "version-before-edit"
        )
        store.save(
            ownerUserId: ownerUserID,
            projectId: "project-recovery",
            draft: local,
            baseVersionId: "version-before-edit",
            dirty: true
        )
        store.clearPreservedConflict(ownerUserId: ownerUserID, projectId: "project-recovery")

        let snapshot = store.recoverySnapshot(
            ownerUserId: ownerUserID,
            projectId: "project-recovery",
            serverDraft: local,
            fingerprint: stableFingerprint
        )

        XCTAssertNil(snapshot)
    }

    func testRecoverySnapshotsAreIsolatedByAuthenticatedOwner() {
        store.save(
            ownerUserId: "user-a",
            projectId: "shared-project-id",
            draft: "A private draft",
            baseVersionId: "version-a",
            dirty: true
        )
        store.save(
            ownerUserId: "user-b",
            projectId: "shared-project-id",
            draft: "B private draft",
            baseVersionId: "version-b",
            dirty: true
        )

        XCTAssertEqual(
            store.payloads(ownerUserId: "user-a")["shared-project-id"]?["draft"] as? String,
            "A private draft"
        )
        XCTAssertEqual(
            store.payloads(ownerUserId: "user-b")["shared-project-id"]?["draft"] as? String,
            "B private draft"
        )
    }

    func testLegacyRecoveryPayloadIsQuarantinedFromAuthenticatedAccounts() {
        defaults.set([
            "legacy-project": [
                "draft": "Legacy draft without owner metadata",
                "baseVersionId": "legacy-version",
                "dirty": true,
                "savedAt": 1_700_000_999,
            ],
        ], forKey: recoveryKey)

        XCTAssertTrue(store.payloads(ownerUserId: "user-a").isEmpty)
        XCTAssertTrue(store.payloads(ownerUserId: "user-b").isEmpty)
        XCTAssertEqual(
            store.payloads(ownerUserId: "")["legacy-project"]?["draft"] as? String,
            "Legacy draft without owner metadata"
        )
        XCTAssertNil(defaults.object(forKey: recoveryKey))
    }

    func testLegacyRecoveryQuarantinePreservesExistingAnonymousWork() {
        let anonymousKey = ScreenplayOwnerScopedStoragePolicy.storageKey(
            baseKey: recoveryKey,
            ownerUserID: ""
        )
        defaults.set([
            "shared-project": ["draft": "Existing anonymous draft", "dirty": true],
        ], forKey: anonymousKey)
        defaults.set([
            "shared-project": ["draft": "Older legacy draft", "dirty": true],
            "legacy-only": ["draft": "Legacy-only draft", "dirty": true],
        ], forKey: recoveryKey)

        XCTAssertTrue(store.payloads(ownerUserId: "user-a").isEmpty)
        let quarantined = store.payloads(ownerUserId: "")
        XCTAssertEqual(quarantined["shared-project"]?["draft"] as? String, "Existing anonymous draft")
        XCTAssertEqual(quarantined["legacy-only"]?["draft"] as? String, "Legacy-only draft")
        XCTAssertNil(defaults.object(forKey: recoveryKey))
    }

    func testAuthContextRejectsAccountAndInteractiveSessionChanges() {
        let expected = ScreenplayStudioAuthContext(userID: "user-a", sessionIntentGeneration: 7)
        XCTAssertTrue(ScreenplayStudioAuthContextPolicy.matches(
            expected: expected,
            current: ScreenplayStudioAuthContext(userID: " user-a ", sessionIntentGeneration: 7)
        ))
        XCTAssertFalse(ScreenplayStudioAuthContextPolicy.matches(
            expected: expected,
            current: ScreenplayStudioAuthContext(userID: "user-b", sessionIntentGeneration: 7)
        ))
        XCTAssertFalse(ScreenplayStudioAuthContextPolicy.matches(
            expected: expected,
            current: ScreenplayStudioAuthContext(userID: "user-a", sessionIntentGeneration: 8)
        ))
    }

    func testOwnerScopedStorageKeysSeparateAccountsAndAnonymousState() {
        let userA = ScreenplayOwnerScopedStoragePolicy.storageKey(
            baseKey: "draft",
            ownerUserID: "user-a"
        )
        let userB = ScreenplayOwnerScopedStoragePolicy.storageKey(
            baseKey: "draft",
            ownerUserID: "user-b"
        )
        let anonymous = ScreenplayOwnerScopedStoragePolicy.storageKey(
            baseKey: "draft",
            ownerUserID: ""
        )

        XCTAssertNotEqual(userA, userB)
        XCTAssertNotEqual(userA, anonymous)
        XCTAssertNotEqual(userB, anonymous)
        XCTAssertEqual(
            anonymous,
            ScreenplayOwnerScopedStoragePolicy.storageKey(
                baseKey: "draft",
                ownerUserID: " anonymous "
            )
        )
    }

    func testStudioAccountTransitionResetsAcrossSignOutAndDifferentAccount() {
        XCTAssertFalse(ScreenplayStudioAccountTransitionPolicy.requiresStudioStateReset(
            previousOwnerUserID: nil,
            previousWasAuthenticated: nil,
            nextOwnerUserID: "user-a",
            nextIsAuthenticated: true,
            nextAccessExpired: false
        ))
        XCTAssertTrue(ScreenplayStudioAccountTransitionPolicy.requiresStudioStateReset(
            previousOwnerUserID: "user-a",
            previousWasAuthenticated: true,
            nextOwnerUserID: "",
            nextIsAuthenticated: false,
            nextAccessExpired: false
        ))
        XCTAssertTrue(ScreenplayStudioAccountTransitionPolicy.requiresStudioStateReset(
            previousOwnerUserID: "",
            previousWasAuthenticated: false,
            nextOwnerUserID: "user-b",
            nextIsAuthenticated: true,
            nextAccessExpired: false
        ))
        XCTAssertFalse(ScreenplayStudioAccountTransitionPolicy.requiresStudioStateReset(
            previousOwnerUserID: "user-b",
            previousWasAuthenticated: true,
            nextOwnerUserID: " user-b ",
            nextIsAuthenticated: true,
            nextAccessExpired: false
        ))
        XCTAssertTrue(ScreenplayStudioAccountTransitionPolicy.requiresStudioStateReset(
            previousOwnerUserID: "user-b",
            previousWasAuthenticated: true,
            nextOwnerUserID: "user-b",
            nextIsAuthenticated: false,
            nextAccessExpired: true
        ))
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
            committedDraft: draft,
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
        XCTAssertEqual(ScreenplayDraftSaveIntentPolicy.intent(
            draft: draft.replacingOccurrences(of: "\r\n", with: "\n"),
            selectedProjectID: "project-a", isManualDraftEditing: false,
            committedWrite: committedWrite), .autosave)
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

        XCTAssertTrue(ScreenplayDraftSaveCompletionPolicy.hasUnsavedChanges(
            currentDraft: "  \(savedDraft)\r\n",
            savedDraft: savedDraft
        ))
        XCTAssertFalse(ScreenplayDraftSaveCompletionPolicy.hasUnsavedChanges(currentDraft: savedDraft, savedDraft: savedDraft))
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

        XCTAssertFalse(ScreenplayDraftSaveCoalescingPolicy.shouldCoalesce(
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
