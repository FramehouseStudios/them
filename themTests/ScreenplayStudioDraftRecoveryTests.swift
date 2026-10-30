import XCTest
@testable import them

final class ScreenplayStudioDraftRecoveryTests: XCTestCase {
    @MainActor
    func testNotNowKeepsExactHeldRowDiscoverableInSameSession() {
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store)
        let held = ScreenplayDraftSaveOutboxEntry(
            id: "held-row", projectId: "project", ownerUserId: "writer",
            draft: "Exact held words", title: "Title", phase: "scene_draft",
            notes: "", source: "studio_save", studioWriteAnchors: [],
            screenplayBindings: [], baseVersionId: "server-v2", createdAt: 100,
            updatedAt: 100, status: .parked, retries: 0, nextAttemptAt: 0,
            lastError: ScreenplayDraftSaveOutbox.loadServerDeferredReason)
        model.heldDraftRecovery = held

        model.leaveHeldDraftRecoveryForLater()

        XCTAssertEqual(model.heldDraftRecovery, held)
        XCTAssertTrue(model.isHeldDraftRecoveryDeferred)
        model.reopenHeldDraftRecovery()
        XCTAssertEqual(model.heldDraftRecovery, held)
        XCTAssertFalse(model.isHeldDraftRecoveryDeferred)
    }

    @MainActor
    func testBridgeDraftAdoptionPreservesRawWhitespaceAndUnicode() async {
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store)
        model.selectedProjectID = ""
        model.fountainDraft = ""
        let raw = "\r\nINT. CAFE - NIGHT\r\nCafe\u{0301}.\r\n \t "
        model.replaceDraftFromVoiceBridgeIfNeeded(raw, draftOriginProjectID: "")
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(raw.utf8))
        await Task.yield()
    }

    func testQueuedHydrationRejectsChangedAccountSessionProjectAndNewerEdits() {
        let expected = ScreenplayStudioAuthContext(userID: "writer", sessionIntentGeneration: 7)
        for current in [ScreenplayStudioAuthContext(userID: "other", sessionIntentGeneration: 7),
                        ScreenplayStudioAuthContext(userID: "writer", sessionIntentGeneration: 8)] {
            XCTAssertFalse(ScreenplayQueuedDraftHydrationPolicy.shouldRestoreBeforeServerHydration(
                expectedAuthContext: expected, currentAuthContext: current,
                selectedProjectID: "project", queuedProjectID: "project", queuedDraft: "Writer words",
                hasUnsavedChanges: false, isManualEditing: false))
        }
        for (project, dirty, editing) in [("other", false, false), ("project", true, false), ("project", false, true)] {
            XCTAssertFalse(ScreenplayQueuedDraftHydrationPolicy.shouldRestoreBeforeServerHydration(
                expectedAuthContext: expected, currentAuthContext: expected,
                selectedProjectID: project, queuedProjectID: "project", queuedDraft: "Writer words",
                hasUnsavedChanges: dirty, isManualEditing: editing))
        }
        XCTAssertTrue(ScreenplayQueuedDraftHydrationPolicy.shouldRestoreBeforeServerHydration(
            expectedAuthContext: expected, currentAuthContext: expected,
            selectedProjectID: "project", queuedProjectID: "project", queuedDraft: "Writer words",
            hasUnsavedChanges: false, isManualEditing: false))
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

    @MainActor
    func testExactOrdinaryDeletionPreservesConflictProjectAndFutureFields() {
        let ordinary = "INT. CAFE - NIGHT\r\n\r\nCafe\u{301}.  \t"
        let preserved = "A distinct preserved scene.\n"
        store.save(ownerUserId: ownerUserID, projectId: "project", draft: ordinary,
            baseVersionId: "ordinary-base", dirty: true, savedAt: 101)
        store.savePreservedConflict(ownerUserId: ownerUserID, projectId: "project", draft: preserved,
            baseVersionId: "preserved-base", savedAt: 202)
        store.save(ownerUserId: ownerUserID, projectId: "other-project", draft: "Other",
            baseVersionId: "other-base", dirty: true, savedAt: 303)
        var payloads = store.payloads(ownerUserId: ownerUserID)
        payloads["project"]?["failedAdmissions"] = Data([0, 1, 2, 255])
        let scopedKey = ScreenplayOwnerScopedStoragePolicy.storageKey(baseKey: recoveryKey, ownerUserID: ownerUserID)
        defaults.set(payloads, forKey: scopedKey)

        XCTAssertEqual(store.deleteRecoverySlotIfMatching(
            ownerUserId: ownerUserID, projectId: " project ", slot: .ordinary,
            draft: ordinary, baseVersionId: "ordinary-base", savedAt: 101
        ), .deleted)

        let stored = store.payloads(ownerUserId: ownerUserID)
        XCTAssertNil(stored["project"]?["draft"])
        XCTAssertNil(stored["project"]?["baseVersionId"])
        XCTAssertNil(stored["project"]?["dirty"])
        XCTAssertNil(stored["project"]?["savedAt"])
        let keptConflict = stored["project"]?["preservedConflict"] as? [String: Any]
        XCTAssertEqual((keptConflict?["draft"] as? String).map { Data($0.utf8) }, Data(preserved.utf8))
        XCTAssertEqual(keptConflict?["baseVersionId"] as? String, "preserved-base")
        XCTAssertEqual(stored["project"]?["failedAdmissions"] as? Data, Data([0, 1, 2, 255]))
        XCTAssertEqual(stored["other-project"]?["draft"] as? String, "Other")
    }

    @MainActor
    func testExactPreservedDeletionPreservesOrdinaryAndFutureFields() {
        let ordinary = "Newer ordinary words.\n \t"
        let preserved = "Older preserved words.\r\n"
        store.save(ownerUserId: ownerUserID, projectId: "project", draft: ordinary,
            baseVersionId: "ordinary-base", dirty: true, savedAt: 404)
        store.savePreservedConflict(ownerUserId: ownerUserID, projectId: "project", draft: preserved,
            baseVersionId: "preserved-base", savedAt: 505)
        var payloads = store.payloads(ownerUserId: ownerUserID)
        payloads["project"]?["futureField"] = ["request": "kept"]
        let scopedKey = ScreenplayOwnerScopedStoragePolicy.storageKey(baseKey: recoveryKey, ownerUserID: ownerUserID)
        defaults.set(payloads, forKey: scopedKey)

        XCTAssertEqual(store.deleteRecoverySlotIfMatching(
            ownerUserId: ownerUserID, projectId: "project", slot: .preservedConflict,
            draft: preserved, baseVersionId: "preserved-base", savedAt: 505
        ), .deleted)

        let stored = store.payloads(ownerUserId: ownerUserID)["project"]
        XCTAssertNil(stored?["preservedConflict"])
        XCTAssertEqual((stored?["draft"] as? String).map { Data($0.utf8) }, Data(ordinary.utf8))
        XCTAssertEqual(stored?["baseVersionId"] as? String, "ordinary-base")
        XCTAssertEqual(stored?["dirty"] as? Bool, true)
        XCTAssertEqual(stored?["savedAt"] as? TimeInterval, 404)
        XCTAssertEqual((stored?["futureField"] as? [String: String])?["request"], "kept")
    }

    @MainActor
    func testStaleCandidateCannotDeleteRefreshedOrdinaryOrPreservedSlot() {
        store.save(ownerUserId: ownerUserID, projectId: "project", draft: "Same ordinary",
            baseVersionId: "base", dirty: true, savedAt: 2)
        store.savePreservedConflict(ownerUserId: ownerUserID, projectId: "project", draft: "Same preserved",
            baseVersionId: "base", savedAt: 4)

        XCTAssertEqual(store.matchRecoverySlot(
            ownerUserId: ownerUserID, projectId: "project", slot: .ordinary,
            draft: "Same ordinary", baseVersionId: "base", savedAt: 1
        ), .changed)
        XCTAssertEqual(store.matchRecoverySlot(
            ownerUserId: ownerUserID, projectId: "project", slot: .preservedConflict,
            draft: "Same preserved", baseVersionId: "base", savedAt: 4
        ), .matching)
        XCTAssertEqual(store.deleteRecoverySlotIfMatching(
            ownerUserId: ownerUserID, projectId: "project", slot: .ordinary,
            draft: "Same ordinary", baseVersionId: "base", savedAt: 1
        ), .changed)
        XCTAssertEqual(store.deleteRecoverySlotIfMatching(
            ownerUserId: ownerUserID, projectId: "project", slot: .preservedConflict,
            draft: "Same preserved", baseVersionId: "base", savedAt: 3
        ), .changed)

        let stored = store.payloads(ownerUserId: ownerUserID)["project"]
        XCTAssertEqual(stored?["draft"] as? String, "Same ordinary")
        XCTAssertEqual(stored?["savedAt"] as? TimeInterval, 2)
        let preserved = stored?["preservedConflict"] as? [String: Any]
        XCTAssertEqual(preserved?["draft"] as? String, "Same preserved")
        XCTAssertEqual(preserved?["savedAt"] as? TimeInterval, 4)
    }

    @MainActor
    func testDeletionRequiresExactDraftBytesAndBaseVersion() {
        let decomposed = "Cafe\u{301}.  \r\n"
        let composed = "Caf\u{00E9}.  \r\n"
        store.save(ownerUserId: ownerUserID, projectId: "project", draft: decomposed,
            baseVersionId: "base-a", dirty: true, savedAt: 606)

        XCTAssertEqual(store.matchRecoverySlot(
            ownerUserId: ownerUserID, projectId: "project", slot: .ordinary,
            draft: composed, baseVersionId: "base-a", savedAt: 606
        ), .changed)
        XCTAssertEqual(store.matchRecoverySlot(
            ownerUserId: ownerUserID, projectId: "project", slot: .ordinary,
            draft: decomposed, baseVersionId: "base-a", savedAt: 606
        ), .matching)
        XCTAssertEqual(store.deleteRecoverySlotIfMatching(
            ownerUserId: ownerUserID, projectId: "project", slot: .ordinary,
            draft: composed, baseVersionId: "base-a", savedAt: 606
        ), .changed)
        XCTAssertEqual(store.deleteRecoverySlotIfMatching(
            ownerUserId: ownerUserID, projectId: "project", slot: .ordinary,
            draft: decomposed, baseVersionId: "base-b", savedAt: 606
        ), .changed)
        XCTAssertEqual((store.payloads(ownerUserId: ownerUserID)["project"]?["draft"] as? String)
            .map { Data($0.utf8) }, Data(decomposed.utf8))
    }

    @MainActor
    func testExactSlotDeletionIsIsolatedByOwner() {
        let project = "shared-project"
        store.save(ownerUserId: "owner-a", projectId: project, draft: "Owner A",
            baseVersionId: "base", dirty: true, savedAt: 707)
        store.save(ownerUserId: "owner-b", projectId: project, draft: "Owner B",
            baseVersionId: "base", dirty: true, savedAt: 808)

        XCTAssertEqual(store.deleteRecoverySlotIfMatching(
            ownerUserId: "owner-a", projectId: project, slot: .ordinary,
            draft: "Owner A", baseVersionId: "base", savedAt: 707
        ), .deleted)

        XCTAssertNil(store.payloads(ownerUserId: "owner-a")[project])
        let ownerB = store.payloads(ownerUserId: "owner-b")[project]
        XCTAssertEqual(ownerB?["draft"] as? String, "Owner B")
        XCTAssertEqual(ownerB?["savedAt"] as? TimeInterval, 808)
    }

    @MainActor
    func testVacantSlotSaveRecognizesSamePageWithoutRewritingEitherSlot() {
        store.save(ownerUserId: ownerUserID, projectId: "project", draft: "Ordinary",
            baseVersionId: "base-o", dirty: true, savedAt: 10)
        store.savePreservedConflict(ownerUserId: ownerUserID, projectId: "project", draft: "Preserved",
            baseVersionId: "base-p", savedAt: 20)
        let before = store.payloads(ownerUserId: ownerUserID)

        XCTAssertEqual(store.saveInVacantRecoverySlot(
            ownerUserId: ownerUserID, projectId: "project", draft: "Ordinary",
            baseVersionId: "base-o", savedAt: 99
        ), .present(.ordinary))
        XCTAssertEqual(store.saveInVacantRecoverySlot(
            ownerUserId: ownerUserID, projectId: "project", draft: "Preserved",
            baseVersionId: "base-p", savedAt: 99
        ), .present(.preservedConflict))

        let after = store.payloads(ownerUserId: ownerUserID)
        XCTAssertTrue(NSDictionary(dictionary: after).isEqual(to: before))
        XCTAssertEqual(after["project"]?["savedAt"] as? TimeInterval, 10)
        XCTAssertEqual((after["project"]?["preservedConflict"] as? [String: Any])?["savedAt"] as? TimeInterval, 20)
    }

    @MainActor
    func testVacantSlotSaveUsesPreservedWithoutReplacingOrdinary() {
        let ordinary = "Existing ordinary.\r\n"
        let newer = "Current page.\n \t"
        store.save(ownerUserId: ownerUserID, projectId: "project", draft: ordinary,
            baseVersionId: "base-o", dirty: true, savedAt: 30)
        var payloads = store.payloads(ownerUserId: ownerUserID)
        payloads["project"]?["futureField"] = "keep"
        let scopedKey = ScreenplayOwnerScopedStoragePolicy.storageKey(baseKey: recoveryKey, ownerUserID: ownerUserID)
        defaults.set(payloads, forKey: scopedKey)

        XCTAssertEqual(store.saveInVacantRecoverySlot(
            ownerUserId: ownerUserID, projectId: "project", draft: newer,
            baseVersionId: "base-new", savedAt: 40
        ), .stored(.preservedConflict))

        let stored = store.payloads(ownerUserId: ownerUserID)["project"]
        XCTAssertEqual((stored?["draft"] as? String).map { Data($0.utf8) }, Data(ordinary.utf8))
        XCTAssertEqual(stored?["baseVersionId"] as? String, "base-o")
        XCTAssertEqual(stored?["savedAt"] as? TimeInterval, 30)
        let preserved = stored?["preservedConflict"] as? [String: Any]
        XCTAssertEqual((preserved?["draft"] as? String).map { Data($0.utf8) }, Data(newer.utf8))
        XCTAssertEqual(preserved?["baseVersionId"] as? String, "base-new")
        XCTAssertEqual(preserved?["savedAt"] as? TimeInterval, 40)
        XCTAssertEqual(stored?["futureField"] as? String, "keep")
    }

    @MainActor
    func testVacantSlotSaveUsesOrdinaryWithoutReplacingPreserved() {
        let preserved = "Existing preserved.\n"
        let current = "Current page.\r\n"
        store.savePreservedConflict(ownerUserId: ownerUserID, projectId: "project", draft: preserved,
            baseVersionId: "base-p", savedAt: 50)

        XCTAssertEqual(store.saveInVacantRecoverySlot(
            ownerUserId: ownerUserID, projectId: "project", draft: current,
            baseVersionId: "base-current", savedAt: 60
        ), .stored(.ordinary))

        let stored = store.payloads(ownerUserId: ownerUserID)["project"]
        XCTAssertEqual((stored?["draft"] as? String).map { Data($0.utf8) }, Data(current.utf8))
        let kept = stored?["preservedConflict"] as? [String: Any]
        XCTAssertEqual((kept?["draft"] as? String).map { Data($0.utf8) }, Data(preserved.utf8))
        XCTAssertEqual(kept?["savedAt"] as? TimeInterval, 50)
    }

    @MainActor
    func testVacantSlotSaveRefusesByteDistinctOccupiedAndMalformedSlots() {
        store.save(ownerUserId: ownerUserID, projectId: "occupied", draft: "Ordinary",
            baseVersionId: "base-o", dirty: true, savedAt: 70)
        store.savePreservedConflict(ownerUserId: ownerUserID, projectId: "occupied", draft: "Preserved",
            baseVersionId: "base-p", savedAt: 80)
        var payloads = store.payloads(ownerUserId: ownerUserID)
        payloads["malformed"] = [
            "draft": "Partial ordinary",
            "preservedConflict": [
                "draft": "Valid preserved",
                "baseVersionId": "base-p",
                "dirty": true,
                "savedAt": 90.0,
            ],
        ]
        payloads["malformed-preserved"] = [
            "draft": "Valid ordinary",
            "baseVersionId": "base-o",
            "dirty": true,
            "savedAt": 95.0,
            "preservedConflict": "unreadable",
        ]
        let scopedKey = ScreenplayOwnerScopedStoragePolicy.storageKey(baseKey: recoveryKey, ownerUserID: ownerUserID)
        defaults.set(payloads, forKey: scopedKey)
        let before = store.payloads(ownerUserId: ownerUserID)

        XCTAssertEqual(store.saveInVacantRecoverySlot(
            ownerUserId: ownerUserID, projectId: "occupied", draft: "Byte-distinct",
            baseVersionId: "new-base", savedAt: 100
        ), .occupied)
        XCTAssertEqual(store.saveInVacantRecoverySlot(
            ownerUserId: ownerUserID, projectId: "malformed", draft: "New page",
            baseVersionId: "new-base", savedAt: 100
        ), .occupied)
        XCTAssertEqual(store.saveInVacantRecoverySlot(
            ownerUserId: ownerUserID, projectId: "malformed-preserved", draft: "New page",
            baseVersionId: "new-base", savedAt: 100
        ), .occupied)

        XCTAssertTrue(NSDictionary(dictionary: store.payloads(ownerUserId: ownerUserID)).isEqual(to: before))
    }

    @MainActor
    func testVacantSlotSaveIsIsolatedByOwner() {
        let project = "shared-project"
        store.save(ownerUserId: "owner-b", projectId: project, draft: "Owner B",
            baseVersionId: "base-b", dirty: true, savedAt: 110)

        XCTAssertEqual(store.saveInVacantRecoverySlot(
            ownerUserId: "owner-a", projectId: project, draft: "Owner A",
            baseVersionId: "base-a", savedAt: 120
        ), .stored(.ordinary))

        XCTAssertEqual(store.payloads(ownerUserId: "owner-a")[project]?["draft"] as? String, "Owner A")
        let ownerB = store.payloads(ownerUserId: "owner-b")[project]
        XCTAssertEqual(ownerB?["draft"] as? String, "Owner B")
        XCTAssertEqual(ownerB?["baseVersionId"] as? String, "base-b")
        XCTAssertEqual(ownerB?["savedAt"] as? TimeInterval, 110)
    }

    func testConditionalRecoveryCleanupPreservesNewerOtherOwnerAndDistinctConflict() {
        store.save(ownerUserId: ownerUserID, projectId: "project", draft: "Scene\n", baseVersionId: "v1", dirty: true)
        store.savePreservedConflict(ownerUserId: ownerUserID, projectId: "project", draft: "Different scene", baseVersionId: "v1")
        store.save(ownerUserId: "other", projectId: "project", draft: "Scene\n", baseVersionId: "v1", dirty: true)
        store.clearMatchingRecovery(ownerUserId: ownerUserID, projectId: "project", draft: "Scene", baseVersionId: "v1")
        XCTAssertNotNil(store.payloads(ownerUserId: ownerUserID)["project"]?["draft"])
        store.clearMatchingRecovery(ownerUserId: ownerUserID, projectId: "project", draft: "Scene\n", baseVersionId: "v1")
        let payload = store.payloads(ownerUserId: ownerUserID)["project"]
        XCTAssertNil(payload?["draft"])
        XCTAssertEqual((payload?["preservedConflict"] as? [String: Any])?["draft"] as? String, "Different scene")
        XCTAssertEqual(store.payloads(ownerUserId: "other")["project"]?["draft"] as? String, "Scene\n")
    }

    func testConditionalRecoveryCleanupChecksBaseAndBothExactCopies() {
        store.save(ownerUserId: ownerUserID, projectId: "project", draft: "Local", baseVersionId: "new", dirty: true)
        store.savePreservedConflict(ownerUserId: ownerUserID, projectId: "project", draft: "Local", baseVersionId: "old")
        store.clearMatchingRecovery(ownerUserId: ownerUserID, projectId: "project", draft: "Local", baseVersionId: "old")
        let payload = store.payloads(ownerUserId: ownerUserID)["project"]
        XCTAssertEqual(payload?["baseVersionId"] as? String, "new")
        XCTAssertNil(payload?["preservedConflict"])
    }

    @MainActor
    func testRetiredConflictDoesNotOverwriteConcurrentSaveOutcome() {
        let owner = "recovery-fixture-owner"
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store,
            studioAuthContextProvider: { .init(userID: owner, sessionIntentGeneration: 1) })
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        defer { ScreenplayLiveDraftSyncService.shared.detach() }
        let project = "overlap-save"
        let newer = "Newer cafe\u{301}.  \r\n"
        model.selectedProjectID = project
        model.fountainDraft = newer
        model.latestVersionID = "saved-version"
        model.hasUnsavedDraftChanges = false
        model.autosaveStatusText = "Saved"
        model.infoText = "Save completed."
        model.errorText = ""
        model.conflictState = .init(projectId: project, baseVersionId: "old", serverVersionId: "remote",
            serverDraft: "Remote", serverDraftExcerpt: "Remote", serverUpdatedAt: 1)
        store.save(ownerUserId: owner, projectId: project, draft: newer, baseVersionId: "saved-version", dirty: false)
        let before = store.payloads(ownerUserId: owner)[project]!
        XCTAssertTrue(model.reconcileRetiredServerChoice(selectedPage: "Earlier", saveFlightChanged: true,
            ownerUserID: owner, projectID: project))
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(newer.utf8))
        XCTAssertEqual(model.latestVersionID, "saved-version")
        XCTAssertFalse(model.hasUnsavedDraftChanges)
        XCTAssertEqual(model.autosaveStatusText, "Saved")
        XCTAssertEqual(model.infoText, "Save completed.")
        XCTAssertEqual(store.payloads(ownerUserId: owner)[project]?["savedAt"] as? TimeInterval, before["savedAt"] as? TimeInterval)
        XCTAssertEqual(store.payloads(ownerUserId: owner)[project]?["dirty"] as? Bool, false)
        XCTAssertNil(model.conflictState)
    }

    @MainActor
    func testRetiredConflictKeepsNewerUnsubmittedPage() {
        let owner = "recovery-fixture-owner"
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store,
            studioAuthContextProvider: { .init(userID: owner, sessionIntentGeneration: 1) })
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        defer { ScreenplayLiveDraftSyncService.shared.detach() }
        let project = "overlap-edit"
        let newer = "Newer words.\r\n \t"
        model.selectedProjectID = project
        model.latestVersionID = "old-base"
        model.fountainDraft = newer
        model.conflictState = .init(projectId: project, baseVersionId: "old-base", serverVersionId: "remote",
            serverDraft: "Remote", serverDraftExcerpt: "Remote", serverUpdatedAt: 1)
        XCTAssertTrue(model.reconcileRetiredServerChoice(selectedPage: "Earlier", saveFlightChanged: false,
            ownerUserID: owner, projectID: project))
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(newer.utf8))
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        let stored = store.payloads(ownerUserId: owner)[project]
        XCTAssertEqual((stored?["draft"] as? String).map { Data($0.utf8) }, Data(newer.utf8))
        XCTAssertEqual(stored?["baseVersionId"] as? String, "old-base")
        XCTAssertEqual(stored?["dirty"] as? Bool, true)
        XCTAssertNil(model.conflictState)
    }

    @MainActor
    func testRetiredConflictDoesNotReplaceOtherRecoveryOrUnrelatedError() {
        let owner = "recovery-fixture-owner"
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store,
            studioAuthContextProvider: { .init(userID: owner, sessionIntentGeneration: 1) })
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        defer { ScreenplayLiveDraftSyncService.shared.detach() }
        let project = "occupied-recovery"
        model.selectedProjectID = project
        model.latestVersionID = "base"
        model.fountainDraft = "New page"
        model.errorText = "Another operation failed."
        model.conflictState = .init(projectId: project, baseVersionId: "base", serverVersionId: "remote",
            serverDraft: "Remote", serverDraftExcerpt: "Remote", serverUpdatedAt: 1)
        store.save(ownerUserId: owner, projectId: project, draft: "Other recovery", baseVersionId: "other", dirty: true)
        store.savePreservedConflict(ownerUserId: owner, projectId: project, draft: "Preserved conflict", baseVersionId: "v1")
        XCTAssertTrue(model.reconcileRetiredServerChoice(selectedPage: "Earlier", saveFlightChanged: false,
            ownerUserID: owner, projectID: project))
        let payload = store.payloads(ownerUserId: owner)[project]
        XCTAssertEqual(payload?["draft"] as? String, "Other recovery")
        XCTAssertEqual((payload?["preservedConflict"] as? [String: Any])?["draft"] as? String, "Preserved conflict")
        XCTAssertEqual(model.errorText, "Another operation failed.")
        XCTAssertTrue(model.infoText.contains("Export"))
        XCTAssertEqual(model.fountainDraft, "New page")
        XCTAssertTrue(model.hasUnsavedDraftChanges)
    }

    @MainActor
    func testRetiredConflictRejectsWrongOwnerWithoutMutation() {
        let owner = "recovery-fixture-owner"
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store,
            studioAuthContextProvider: { .init(userID: owner, sessionIntentGeneration: 1) })
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        defer { ScreenplayLiveDraftSyncService.shared.detach() }
        model.selectedProjectID = "project"
        model.fountainDraft = "Current page"
        model.conflictState = .init(projectId: "project", baseVersionId: "base", serverVersionId: "remote",
            serverDraft: "Remote", serverDraftExcerpt: "Remote", serverUpdatedAt: 1)
        let wrongOwner = owner + "-different"
        XCTAssertTrue(model.reconcileRetiredServerChoice(selectedPage: "Earlier", saveFlightChanged: false,
            ownerUserID: wrongOwner, projectID: "project"))
        XCTAssertNil(store.payloads(ownerUserId: wrongOwner)["project"])
        XCTAssertNotNil(model.conflictState)
        XCTAssertEqual(model.fountainDraft, "Current page")
    }

    @MainActor
    func testConditionalRecoveryDoesNotMistakeMalformedStorageForAnOccupiedCopy() {
        store.save(ownerUserId: ownerUserID, projectId: "bad", draft: "Old", baseVersionId: "base", dirty: true)
        var payloads = store.payloads(ownerUserId: ownerUserID)
        payloads["bad"]?["baseVersionId"] = 123
        let key = ScreenplayOwnerScopedStoragePolicy.storageKey(baseKey: recoveryKey, ownerUserID: ownerUserID)
        defaults.set(payloads, forKey: key)
        let result = store.saveIfOrdinaryVacantOrMatching(ownerUserId: ownerUserID, projectId: "bad",
            draft: "New", baseVersionId: "base")
        guard case .unconfirmed = result else { return XCTFail("Malformed recovery must remain unconfirmed") }
        XCTAssertEqual(store.payloads(ownerUserId: ownerUserID)["bad"]?["draft"] as? String, "Old")
    }

    @MainActor
    func testEmptyPageDoesNotEraseDistinctRecoveryCopies() async {
        let owner = "empty-page-owner"
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store,
            studioAuthContextProvider: { .init(userID: owner, sessionIntentGeneration: 1) })
        model.autosaveEnabled = false
        model.selectedProjectID = "empty-page-project"
        model.applyStructuralUITestDraft("Previously saved scene", versionID: "base")
        store.save(ownerUserId: owner, projectId: model.selectedProjectID,
            draft: "Earlier recovery", baseVersionId: "older", dirty: true)
        store.savePreservedConflict(ownerUserId: owner, projectId: model.selectedProjectID,
            draft: "Another recovery", baseVersionId: "other")
        model.fountainDraft = ""
        await model.handleDraftDebouncedChange("")
        let payload = store.payloads(ownerUserId: owner)[model.selectedProjectID]
        XCTAssertEqual(payload?["draft"] as? String, "Earlier recovery")
        XCTAssertEqual((payload?["preservedConflict"] as? [String: Any])?["draft"] as? String, "Another recovery")
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertEqual(model.autosaveStatusText, "Empty page - unsaved")
        XCTAssertTrue(model.infoText.localizedCaseInsensitiveContains("export"))
    }

    @MainActor
    func testEmptyPageRetainsUnsavedDeletionWhenRecoveryIsVacant() async {
        let owner = "empty-page-owner"
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store,
            studioAuthContextProvider: { .init(userID: owner, sessionIntentGeneration: 1) })
        model.autosaveEnabled = false
        model.selectedProjectID = "empty-page-vacant"
        model.applyStructuralUITestDraft("Previously saved scene", versionID: "base")
        model.fountainDraft = ""
        await model.handleDraftDebouncedChange("")
        let snapshot = store.recoverySnapshot(ownerUserId: owner, projectId: model.selectedProjectID,
            serverDraft: "Previously saved scene")
        XCTAssertNotNil(snapshot)
        XCTAssertEqual(snapshot?.draft, "")
        XCTAssertTrue(model.hasUnsavedDraftChanges)
    }

    @MainActor
    func testDiscardRecoveryRemovesOnlyVisibleSlotAndShowsRemainingCopy() {
        let owner = "slot-owner"
        let project = "slot-project"
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store,
            studioAuthContextProvider: { .init(userID: owner, sessionIntentGeneration: 1) })
        model.selectedProjectID = project
        store.save(ownerUserId: owner, projectId: project, draft: "Ordinary words", baseVersionId: "old", dirty: true)
        store.savePreservedConflict(ownerUserId: owner, projectId: project, draft: "Preserved words", baseVersionId: "other")
        model.applyServerDraft("Server words", versionId: "server")
        XCTAssertEqual(model.recoveryCandidate?.draft, "Preserved words")
        model.discardLocalRecoveryCopy()
        let payload = store.payloads(ownerUserId: owner)[project]
        XCTAssertNil(payload?["preservedConflict"])
        XCTAssertEqual(payload?["draft"] as? String, "Ordinary words")
        XCTAssertEqual(model.recoveryCandidate?.draft, "Ordinary words")
        XCTAssertEqual(model.fountainDraft, "Server words")
    }

    @MainActor
    func testServerDebouncePreservesBothCopiesWhilePreservedRecoveryIsVisible() async {
        let owner = "visible-preserved-owner"
        let project = "visible-preserved-project"
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store,
            studioAuthContextProvider: { .init(userID: owner, sessionIntentGeneration: 1) })
        model.autosaveEnabled = false
        model.selectedProjectID = project
        store.save(ownerUserId: owner, projectId: project, draft: "Ordinary words", baseVersionId: "old", dirty: true, savedAt: 100)
        store.savePreservedConflict(ownerUserId: owner, projectId: project, draft: "Preserved words", baseVersionId: "other", savedAt: 200)
        model.applyServerDraft("Server words", versionId: "server")
        XCTAssertEqual(model.recoveryCandidate?.draft, "Preserved words")
        await model.handleDraftDebouncedChange("Server words")
        let payload = store.payloads(ownerUserId: owner)[project]
        XCTAssertEqual(payload?["draft"] as? String, "Ordinary words")
        XCTAssertEqual(payload?["baseVersionId"] as? String, "old")
        XCTAssertEqual(payload?["dirty"] as? Bool, true)
        XCTAssertEqual(payload?["savedAt"] as? TimeInterval, 100)
        let preserved = payload?["preservedConflict"] as? [String: Any]
        XCTAssertEqual(preserved?["draft"] as? String, "Preserved words")
        XCTAssertEqual(preserved?["baseVersionId"] as? String, "other")
        XCTAssertEqual(preserved?["savedAt"] as? TimeInterval, 200)
        XCTAssertEqual(model.recoveryCandidate?.draft, "Preserved words")
        XCTAssertEqual(model.fountainDraft, "Server words")
    }

    @MainActor
    func testChangedPageDoesNotOverwriteEitherVisibleRecoveryCopy() async {
        let owner = "visible-preserved-owner"
        let project = "visible-preserved-edit"
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let overflow = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let origin = ScreenplayDraftSaveOrigin(documentID: "test-document", backendURL: URL(string: "https://example.test")!)
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store, overflowRecoveryStore: overflow,
            recoveryOriginProvider: { _ in origin }, studioAuthContextProvider: { .init(userID: owner, sessionIntentGeneration: 1) })
        model.autosaveEnabled = false
        model.selectedProjectID = project
        store.save(ownerUserId: owner, projectId: project, draft: "Ordinary words", baseVersionId: "old", dirty: true, savedAt: 100)
        store.savePreservedConflict(ownerUserId: owner, projectId: project, draft: "Preserved words", baseVersionId: "other", savedAt: 200)
        model.applyServerDraft("Server words", versionId: "server")
        _ = overflow.saveIfVacant(ownerUserID: owner, projectID: project, backendURL: origin.backendURL, documentID: origin.documentID, draft: "Third copy", baseVersionID: "c")
        model.fountainDraft = "New page"
        model.noteManualDraftEdit()
        await model.handleDraftDebouncedChange("New page")
        let payload = store.payloads(ownerUserId: owner)[project]
        XCTAssertEqual(payload?["draft"] as? String, "Ordinary words")
        XCTAssertEqual(payload?["baseVersionId"] as? String, "old")
        XCTAssertEqual(payload?["savedAt"] as? TimeInterval, 100)
        let preserved = payload?["preservedConflict"] as? [String: Any]
        XCTAssertEqual(preserved?["draft"] as? String, "Preserved words")
        XCTAssertEqual(preserved?["baseVersionId"] as? String, "other")
        XCTAssertEqual(preserved?["savedAt"] as? TimeInterval, 200)
        XCTAssertEqual(model.recoveryCandidate?.draft, "Preserved words")
        XCTAssertEqual(model.fountainDraft, "New page")
        XCTAssertTrue(model.infoText.contains("Export"))
    }

    @MainActor
    func testRestoreRecoveryLeavesDistinctHiddenCopyIntact() async {
        let owner = "slot-owner"
        let project = "slot-restore"
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store,
            studioAuthContextProvider: { .init(userID: owner, sessionIntentGeneration: 1) })
        model.selectedProjectID = project
        store.save(ownerUserId: owner, projectId: project, draft: "Ordinary words", baseVersionId: "old", dirty: true)
        store.savePreservedConflict(ownerUserId: owner, projectId: project, draft: "Preserved words", baseVersionId: "other")
        model.applyServerDraft("Server words", versionId: "server")
        model.restoreDraftFromRecovery()
        await model.handleDraftDebouncedChange("Preserved words")
        let payload = store.payloads(ownerUserId: owner)[project]
        XCTAssertEqual(model.fountainDraft, "Preserved words")
        XCTAssertEqual(payload?["draft"] as? String, "Ordinary words")
        XCTAssertEqual((payload?["preservedConflict"] as? [String: Any])?["draft"] as? String, "Preserved words")
        XCTAssertEqual(model.recoveryCandidate?.draft, "Ordinary words")
    }

    @MainActor
    func testRestoreDoesNotReplaceDirtyPageWhenBothRecoverySlotsAreOccupied() {
        let owner = "slot-owner"
        let project = "slot-full"
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let overflow = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let origin = ScreenplayDraftSaveOrigin(documentID: "test-document", backendURL: URL(string: "https://example.test")!)
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store, overflowRecoveryStore: overflow,
            recoveryOriginProvider: { _ in origin }, studioAuthContextProvider: { .init(userID: owner, sessionIntentGeneration: 1) })
        model.selectedProjectID = project
        store.save(ownerUserId: owner, projectId: project, draft: "Ordinary words", baseVersionId: "old", dirty: true)
        store.savePreservedConflict(ownerUserId: owner, projectId: project, draft: "Preserved words", baseVersionId: "other")
        model.applyServerDraft("Server words", versionId: "server")
        _ = overflow.saveIfVacant(ownerUserID: owner, projectID: project, backendURL: origin.backendURL, documentID: origin.documentID, draft: "Third copy", baseVersionID: "c")
        model.fountainDraft = "New unsaved words"
        model.hasUnsavedDraftChanges = true
        model.restoreDraftFromRecovery()
        let payload = store.payloads(ownerUserId: owner)[project]
        XCTAssertEqual(model.fountainDraft, "New unsaved words")
        XCTAssertEqual(payload?["draft"] as? String, "Ordinary words")
        XCTAssertEqual((payload?["preservedConflict"] as? [String: Any])?["draft"] as? String, "Preserved words")
        XCTAssertEqual(model.recoveryCandidate?.draft, "Preserved words")
        XCTAssertTrue(model.errorText.contains("Export"))
    }

    @MainActor
    func testStaleRecoveryChoiceCannotDeleteRefreshedSlot() {
        let owner = "slot-owner"
        let project = "slot-stale"
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store,
            studioAuthContextProvider: { .init(userID: owner, sessionIntentGeneration: 1) })
        model.selectedProjectID = project
        store.savePreservedConflict(ownerUserId: owner, projectId: project,
            draft: "First copy", baseVersionId: "old", savedAt: 100)
        model.applyServerDraft("Server words", versionId: "server")
        store.savePreservedConflict(ownerUserId: owner, projectId: project,
            draft: "Replacement copy", baseVersionId: "old", savedAt: 101)
        model.discardLocalRecoveryCopy()
        let payload = store.payloads(ownerUserId: owner)[project]
        XCTAssertEqual((payload?["preservedConflict"] as? [String: Any])?["draft"] as? String, "Replacement copy")
        XCTAssertEqual(model.recoveryCandidate?.draft, "Replacement copy")
        XCTAssertTrue(model.errorText.contains("changed"))
    }

    @MainActor
    func testRemoteVersionAcknowledgementKeepsDistinctOrdinaryRecovery() {
        let owner = "remote-owner"
        let project = "remote-ack"
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store,
            studioAuthContextProvider: { .init(userID: owner, sessionIntentGeneration: 1) })
        model.selectedProjectID = project
        model.fountainDraft = "Remote saved page"
        store.save(ownerUserId: owner, projectId: project, draft: "Distinct local recovery", baseVersionId: "old", dirty: true)
        model.adoptRemoteLiveVersion("new-version", projectID: project,
            draftChecksum: LiveDraftText.checksum("Remote saved page"))
        XCTAssertEqual(store.payloads(ownerUserId: owner)[project]?["draft"] as? String, "Distinct local recovery")
        XCTAssertEqual(model.recoveryCandidate?.draft, "Distinct local recovery")
        XCTAssertEqual(model.fountainDraft, "Remote saved page")
    }

    @MainActor
    func testClearPageDoesNotDeleteRecoveryCopies() async {
        let owner = "clear-page-owner"
        let project = "clear-page-project"
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store,
            studioAuthContextProvider: { .init(userID: owner, sessionIntentGeneration: 1) })
        model.selectedProjectID = project
        model.applyStructuralUITestDraft("Saved page", versionID: "base")
        store.save(ownerUserId: owner, projectId: project, draft: "Ordinary copy", baseVersionId: "old", dirty: true)
        store.savePreservedConflict(ownerUserId: owner, projectId: project, draft: "Preserved copy", baseVersionId: "other")
        let cleared = await model.clearDraft()
        XCTAssertTrue(cleared)
        XCTAssertEqual(model.fountainDraft, "")
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        let payload = store.payloads(ownerUserId: owner)[project]
        XCTAssertEqual(payload?["draft"] as? String, "Ordinary copy")
        XCTAssertEqual((payload?["preservedConflict"] as? [String: Any])?["draft"] as? String, "Preserved copy")
    }

    @MainActor
    func testClearPageRefusesUnresolvedConflict() async {
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store)
        model.selectedProjectID = "conflicted"
        model.fountainDraft = "Writer words"
        model.conflictState = .init(projectId: "conflicted", baseVersionId: "old", serverVersionId: "remote",
            serverDraft: "Remote", serverDraftExcerpt: "Remote", serverUpdatedAt: 1)
        let cleared = await model.clearDraft()
        XCTAssertFalse(cleared)
        XCTAssertEqual(model.fountainDraft, "Writer words")
        XCTAssertNotNil(model.conflictState)
    }

    @MainActor
    func testKeepingMatchingPageDoesNotRollBackConfirmedVersion() {
        let owner = "same-page-owner"
        let project = "same-page-project"
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store,
            studioAuthContextProvider: { .init(userID: owner, sessionIntentGeneration: 1) })
        model.selectedProjectID = project
        model.applyStructuralUITestDraft("Exact page", versionID: "new-version")
        store.save(ownerUserId: owner, projectId: project, draft: "Exact page",
                   baseVersionId: "old-version", dirty: true, savedAt: 100)
        model.recoveryCandidate = .init(owner: .init(userID: owner, sessionIntentGeneration: 1),
            projectId: project, draft: "Exact page", baseVersionId: "old-version", savedAt: 100,
            isPreservedConflict: false)
        let status = model.autosaveStatusText
        model.restoreDraftFromRecovery()
        XCTAssertEqual(model.fountainDraft, "Exact page")
        XCTAssertEqual(model.latestVersionID, "new-version")
        XCTAssertFalse(model.hasUnsavedDraftChanges)
        XCTAssertEqual(model.autosaveStatusText, status)
        XCTAssertNil(model.recoveryCandidate)
        XCTAssertEqual(store.payloads(ownerUserId: owner)[project]?["baseVersionId"] as? String, "old-version")
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
            serverDraft: "INT. MOTEL ROOM - NIGHT"
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
            serverDraft: "INT. MOTEL ROOM - NIGHT"
        )

        XCTAssertNil(snapshot)
        XCTAssertNil(store.payloads(ownerUserId: ownerUserID)["project-recovery"])
    }

    func testRecoveryPreservesExactFormattingUnicodeAndEmptyEdits() {
        let examples: [(String, String)] = [
            ("Scene\n", "Scene"),
            ("e\u{301}", "\u{e9}"),
            ("", "A deleted scene")
        ]
        for (index, pair) in examples.enumerated() {
            let project = "exact-\(index)"
            store.save(ownerUserId: ownerUserID, projectId: project, draft: pair.0, baseVersionId: "v1", dirty: true)
            let reopened = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: recoveryKey)
            let snapshot = reopened.recoverySnapshot(ownerUserId: ownerUserID, projectId: project, serverDraft: pair.1)
            XCTAssertEqual(Array(snapshot?.draft.utf8 ?? "".utf8), Array(pair.0.utf8))
            XCTAssertNotNil(snapshot)
            XCTAssertNotNil(reopened.payloads(ownerUserId: ownerUserID)[project]?["draft"])
        }
    }

    func testPreservedConflictRetainsExactEmptyAndWhitespaceEdits() {
        for (index, pair) in [("", "Server"), ("Scene\n", "Scene")].enumerated() {
            let project = "preserved-exact-\(index)"
            store.savePreservedConflict(ownerUserId: ownerUserID, projectId: project, draft: pair.0, baseVersionId: "v1")
            let snapshot = store.recoverySnapshot(ownerUserId: ownerUserID, projectId: project, serverDraft: pair.1)
            XCTAssertNotNil(snapshot)
            XCTAssertEqual(Array(snapshot?.draft.utf8 ?? "".utf8), Array(pair.0.utf8))
            XCTAssertEqual(snapshot?.isPreservedConflict, true)
        }
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
            serverDraft: remote
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
            serverDraft: remote
        )

        XCTAssertEqual(snapshot?.draft, local)
        XCTAssertEqual(snapshot?.baseVersionId, "version-before-edit")
        XCTAssertEqual(snapshot?.isPreservedConflict, true)
        let payload = relaunchedStore.payloads(ownerUserId: ownerUserID)["project-recovery"]
        XCTAssertNil(payload?["draft"])
        XCTAssertNotNil(payload?["preservedConflict"])
    }

    @MainActor
    func testLoadingSnapshotKeepsOriginalWriterBytesAndDurableRecovery() {
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store)
        model.autosaveEnabled = false
        model.selectedProjectID = "project"
        model.applyServerDraft("INT. ROOM - DAY\n\nA door opens.", versionId: "current")
        let snapshot = "\r\nINT. CAFE - NIGHT\r\n\r\nA cafe\u{0301} waits.\r\n \t "
        model.loadSnapshot(version(id: "historical", draft: snapshot))
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(snapshot.utf8))
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let persisted = store.payloads(ownerUserId: owner)["project"]?["draft"] as? String
        XCTAssertEqual(persisted.map { Data($0.utf8) }, Data(snapshot.utf8))
        XCTAssertEqual(model.latestVersionID, "current", "Restoring a snapshot remains an unsaved edit, not a server acknowledgement.")
    }

    @MainActor
    func testUnchangedRawServerDraftStaysCleanAndWhitespaceEditStaysDirty() async {
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store)
        model.autosaveEnabled = false
        model.selectedProjectID = "raw-fingerprint-\(UUID().uuidString)"
        let saved = "\r\nINT. CAFE - NIGHT\r\n\r\nA cafe\u{0301} stays open.\r\n \t "
        model.applyServerDraft(saved, versionId: "raw-version")
        await model.handleDraftDebouncedChange(saved)
        XCTAssertFalse(model.hasUnsavedDraftChanges, "Loading identical raw bytes must not trigger a duplicate autosave.")
        XCTAssertTrue(model.fountainDraft.utf8.elementsEqual(saved.utf8))
        model.fountainDraft = saved + " "
        model.noteManualDraftEdit()
        XCTAssertTrue(model.hasUnsavedDraftChanges, "A whitespace-only change still belongs to the writer.")
        await model.handleDraftDebouncedChange(model.fountainDraft)
        XCTAssertTrue(model.hasUnsavedDraftChanges)
    }

    @MainActor
    func testStaleBlankObserverCannotClearActiveWriterRecoveryOrDirtyState() async {
        // Adapt 636ddfc4 to the existing injected recovery owner at this
        // earlier boundary; no later queue-injection framework is required.
        let projectID = "stale-observer-\(UUID().uuidString)"
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store)
        model.autosaveEnabled = false
        model.selectedProjectID = projectID
        model.applyServerDraft("", versionId: "base")
        let writer = "INT. ROOM - NIGHT\n\nThe writer's exact cafe\u{0301} words.  \n"
        model.fountainDraft = writer
        model.noteManualDraftEdit()
        await model.handleDraftDebouncedChange("")
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertTrue(model.isManualDraftEditing)
        XCTAssertTrue(model.fountainDraft.utf8.elementsEqual(writer.utf8))
        let persisted = store.payloads(ownerUserId: owner)[projectID]?["draft"] as? String
        XCTAssertTrue(persisted?.utf8.elementsEqual(writer.utf8) == true,
                      "An obsolete blank callback must never erase the durable writer copy.")
    }

    @MainActor
    func testByteDistinctStaleObserverCannotReplaceUnicodeWriterRecovery() async {
        let projectID = "unicode-observer-\(UUID().uuidString)"
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store)
        model.autosaveEnabled = false
        model.selectedProjectID = projectID
        model.applyServerDraft("", versionId: "base")
        let writer = "INT. CAFE - NIGHT\n\nA cafe\u{0301} stays open.  \n"
        let stale = "INT. CAFE - NIGHT\n\nA caf\u{00e9} stays open.  \n"
        XCTAssertEqual(writer, stale, "String equality alone cannot identify this obsolete snapshot.")
        XCTAssertFalse(writer.utf8.elementsEqual(stale.utf8))
        model.fountainDraft = writer
        model.noteManualDraftEdit()
        await model.handleDraftDebouncedChange(stale)
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertTrue(model.fountainDraft.utf8.elementsEqual(writer.utf8))
        let persisted = store.payloads(ownerUserId: owner)[projectID]?["draft"] as? String
        XCTAssertTrue(persisted?.utf8.elementsEqual(writer.utf8) == true)
    }

    @MainActor
    func testLoadServerWithoutVerifiedHeadKeepsWriterWordsAndRecovery() async {
        let projectID = "unavailable-server-\(UUID().uuidString)"
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store)
        model.autosaveEnabled = false
        model.selectedProjectID = projectID
        model.applyServerDraft("Server baseline", versionId: "base")
        let writer = "Writer cafe\u{0301} words.  \r\n"
        model.fountainDraft = writer
        model.hasUnsavedDraftChanges = true
        store.save(ownerUserId: owner, projectId: projectID, draft: writer, baseVersionId: "base", dirty: true)
        model.conflictState = .init(projectId: projectID, baseVersionId: "base", serverVersionId: "new",
            serverDraft: "", serverDraftExcerpt: "", serverUpdatedAt: 0)
        await model.applyServerVersionFromConflict()
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(writer.utf8))
        XCTAssertNotNil(model.conflictState)
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertEqual((store.payloads(ownerUserId: owner)[projectID]?["draft"] as? String).map { Data($0.utf8) }, Data(writer.utf8))
        XCTAssertFalse(model.errorText.isEmpty)
        XCTAssertNotEqual(model.infoText, "Loaded latest server draft.")

        // A nonempty cached snapshot may also be stale, and queued conflict
        // requests have not yet been retired. It must not replace the page.
        model.conflictState = .init(projectId: projectID, baseVersionId: "base", serverVersionId: "new",
            serverDraft: "A stale server snapshot", serverDraftExcerpt: "A stale server snapshot", serverUpdatedAt: 1)
        await model.applyServerVersionFromConflict()
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(writer.utf8))
        XCTAssertNotNil(model.conflictState)
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertEqual((store.payloads(ownerUserId: owner)[projectID]?["draft"] as? String).map { Data($0.utf8) }, Data(writer.utf8))
        XCTAssertFalse(model.errorText.isEmpty)
    }

    @MainActor
    func testBackgroundMatchingDraftCannotDismissUnresolvedConflict() {
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store)
        model.autosaveEnabled = false
        model.selectedProjectID = "conflicted-project"
        let writer = "Exact local words.  \r\n"
        model.applyServerDraft(writer, versionId: "old")
        model.hasUnsavedDraftChanges = true
        let conflict = ScreenplayStudioViewModel.SaveConflictState(projectId: "conflicted-project",
            baseVersionId: "old", serverVersionId: "new", serverDraft: "Server words",
            serverDraftExcerpt: "Server words", serverUpdatedAt: 0)
        model.conflictState = conflict
        model.applyServerDraft(writer, versionId: "later")
        XCTAssertEqual(model.conflictState, conflict)
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(writer.utf8))
        XCTAssertTrue(model.hasUnsavedDraftChanges)
    }

    @MainActor
    func testManualSaveAndSnapshotDoNotBypassConflictOrEraseSnapshotLabel() async {
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store)
        model.autosaveEnabled = false
        model.selectedProjectID = "conflicted-project"
        let writer = "Exact local words.  \r\n"
        model.fountainDraft = writer
        model.hasUnsavedDraftChanges = true
        let conflict = ScreenplayStudioViewModel.SaveConflictState(projectId: "conflicted-project",
            baseVersionId: "old", serverVersionId: "new", serverDraft: "Server words",
            serverDraftExcerpt: "Server words", serverUpdatedAt: 0)
        model.conflictState = conflict
        model.snapshotLabel = "Do not lose this note"
        await model.manualSaveDraft()
        XCTAssertEqual(model.conflictState, conflict)
        XCTAssertFalse(model.errorText.isEmpty)
        await model.createRevisionSnapshot()
        XCTAssertEqual(model.conflictState, conflict)
        XCTAssertEqual(model.snapshotLabel, "Do not lose this note")
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(writer.utf8))
    }

    @MainActor
    func testKeepMineWithoutWritableProjectPreservesConflictAndWords() async {
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store)
        model.autosaveEnabled = false
        model.selectedProjectID = "unavailable-project"
        let writer = "Writer's exact words.  \r\n"
        model.fountainDraft = writer
        model.hasUnsavedDraftChanges = true
        let conflict = ScreenplayStudioViewModel.SaveConflictState(projectId: "unavailable-project",
            baseVersionId: "old", serverVersionId: "new", serverDraft: "Server words",
            serverDraftExcerpt: "Server words", serverUpdatedAt: 0)
        model.conflictState = conflict
        await model.keepLocalDraftAfterConflict()
        XCTAssertEqual(model.conflictState, conflict)
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(writer.utf8))
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertFalse(model.errorText.isEmpty)
    }

    @MainActor
    func testSameVersionPollKeepsActiveEditsWithoutRecoveryModalAndRetainsRelaunchRecovery() {
        let projectID = "active-poll-\(UUID().uuidString)"
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let server = "INT. ROOM - NIGHT\n\nA lamp dims."
        let local = server + "\nA cafe\u{0301} stays open.  \n"
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store)
        model.selectedProjectID = projectID
        model.applyServerDraft(server, versionId: "base")
        model.fountainDraft = local
        model.hasUnsavedDraftChanges = true
        store.save(ownerUserId: owner, projectId: projectID, draft: local,
                   baseVersionId: "base", dirty: true)
        model.applyServerDraft(server, versionId: "base")
        XCTAssertTrue(model.fountainDraft.utf8.elementsEqual(local.utf8))
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertNil(model.conflictState)
        XCTAssertNil(model.recoveryCandidate, "Polling must not block controls for edits already on the page.")

        let relaunchedStore = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: recoveryKey)
        let relaunched = ScreenplayStudioViewModel(localDraftRecoveryStore: relaunchedStore)
        relaunched.selectedProjectID = projectID
        relaunched.applyServerDraft(server, versionId: "base")
        XCTAssertTrue(relaunched.recoveryCandidate?.draft.utf8.elementsEqual(local.utf8) == true,
                      "Suppressing a redundant modal must not erase the durable recovery copy.")
        relaunched.restoreDraftFromRecovery()
        XCTAssertTrue(relaunched.fountainDraft.utf8.elementsEqual(local.utf8))
    }

    @MainActor
    func testNewServerVersionStillRequiresConflictDecisionForActiveEdits() {
        let projectID = "changed-poll-\(UUID().uuidString)"
        let server = "INT. ROOM - NIGHT\n\nA lamp dims."
        let local = server + "\nMy unfinished line."
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store)
        model.selectedProjectID = projectID
        model.applyServerDraft(server, versionId: "base")
        model.fountainDraft = local
        model.hasUnsavedDraftChanges = true
        model.applyServerDraft(server + "\nAnother device's line.", versionId: "new-version")
        XCTAssertEqual(model.fountainDraft, local)
        XCTAssertEqual(model.conflictState?.serverVersionId, "new-version")
        XCTAssertEqual(model.recoveryCandidate?.draft, local)
    }

    @MainActor
    func testLiveSyncDoesNotOverwriteOccupiedRecoveryCopies() {
        let owner = "live-recovery-owner"
        let project = "live-recovery-full"
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let overflow = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let origin = ScreenplayDraftSaveOrigin(documentID: "test-document", backendURL: URL(string: "https://example.test")!)
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store, overflowRecoveryStore: overflow,
            recoveryOriginProvider: { _ in origin }, studioAuthContextProvider: { .init(userID: owner, sessionIntentGeneration: 1) })
        model.selectedProjectID = project
        store.save(ownerUserId: owner, projectId: project, draft: "Ordinary words", baseVersionId: "a", dirty: true, savedAt: 100)
        store.savePreservedConflict(ownerUserId: owner, projectId: project, draft: "Preserved words", baseVersionId: "b", savedAt: 200)
        _ = overflow.saveIfVacant(ownerUserID: owner, projectID: project, backendURL: origin.backendURL, documentID: origin.documentID, draft: "Third copy", baseVersionID: "c")
        model.fountainDraft = "New local words"
        XCTAssertFalse(model.preserveLocalDraftForLiveSyncRecovery("New local words", projectID: project))
        let payload = store.payloads(ownerUserId: owner)[project]
        XCTAssertEqual(payload?["draft"] as? String, "Ordinary words")
        XCTAssertEqual((payload?["preservedConflict"] as? [String: Any])?["draft"] as? String, "Preserved words")
        XCTAssertEqual(model.fountainDraft, "New local words")
        XCTAssertTrue(model.errorText.contains("Live sync paused"))
    }

    @MainActor
    func testOverflowCopySurvivesRelaunchAndKeepsEarlierCopies() {
        let owner = "overflow-owner"
        let project = "overflow-project"
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let overflow = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let origin = ScreenplayDraftSaveOrigin(documentID: "test-document", backendURL: URL(string: "https://example.test")!)
        let identity: () -> ScreenplayStudioAuthContext = { .init(userID: owner, sessionIntentGeneration: 1) }
        store.save(ownerUserId: owner, projectId: project, draft: "Ordinary words", baseVersionId: "a", dirty: true)
        store.savePreservedConflict(ownerUserId: owner, projectId: project, draft: "Preserved words", baseVersionId: "b")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store, overflowRecoveryStore: overflow,
            recoveryOriginProvider: { _ in origin }, studioAuthContextProvider: identity)
        model.selectedProjectID = project
        model.fountainDraft = "Third page"
        XCTAssertTrue(model.preserveLocalDraftForLiveSyncRecovery("Third page", projectID: project))
        guard case .present(let persisted) = overflow.load(ownerUserID: owner, projectID: project, backendURL: origin.backendURL, documentID: origin.documentID) else {
            return XCTFail("Overflow copy must be persisted")
        }
        XCTAssertEqual(Data(persisted.draft.utf8), Data("Third page".utf8))
        let reopenedOrigin = ScreenplayDraftSaveOrigin(documentID: "new-document-after-switch", backendURL: origin.backendURL)
        let reopened = ScreenplayStudioViewModel(localDraftRecoveryStore: store, overflowRecoveryStore: overflow,
            recoveryOriginProvider: { _ in reopenedOrigin }, studioAuthContextProvider: identity)
        reopened.selectedProjectID = project
        reopened.applyServerDraft("Server page", versionId: "server")
        XCTAssertEqual(reopened.recoveryCandidate?.overflowSnapshot?.recordID, persisted.recordID)
        reopened.restoreDraftFromRecovery()
        XCTAssertEqual(reopened.fountainDraft, "Third page")
        XCTAssertEqual(reopened.recoveryCandidate?.draft, "Preserved words")
        reopened.restoreDraftFromRecovery()
        XCTAssertEqual(reopened.fountainDraft, "Preserved words")
        XCTAssertEqual(reopened.recoveryCandidate?.draft, "Ordinary words")
        reopened.restoreDraftFromRecovery()
        XCTAssertEqual(reopened.fountainDraft, "Ordinary words")
        XCTAssertNil(reopened.recoveryCandidate, "Reviewed copies must not loop back into the banner")
        let payload = store.payloads(ownerUserId: owner)[project]
        XCTAssertEqual(payload?["draft"] as? String, "Ordinary words")
        XCTAssertEqual((payload?["preservedConflict"] as? [String: Any])?["draft"] as? String, "Preserved words")
        guard case .present = overflow.load(ownerUserID: owner, projectID: project, backendURL: origin.backendURL, documentID: origin.documentID) else {
            return XCTFail("Restoring must retain the overflow copy")
        }
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
            serverDraft: remote
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
            serverDraft: local
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

    @MainActor
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
        XCTAssertTrue(store.payloads(ownerUserId: "").isEmpty)
        let retained = defaults.dictionary(forKey: recoveryKey)
        XCTAssertEqual((retained?["legacy-project"] as? [String: Any])?["draft"] as? String,
                       "Legacy draft without owner metadata")
        let inventory = UnassignedLegacyRecoveryDefaultsAdapter(defaults: defaults, baseKey: recoveryKey).inventory()
        XCTAssertTrue(inventory.records.contains { $0.projectKey == "legacy-project" })
        let relaunched = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: recoveryKey)
        XCTAssertTrue(relaunched.payloads(ownerUserId: "").isEmpty)
        XCTAssertNotNil(defaults.object(forKey: recoveryKey))
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
        XCTAssertNil(quarantined["legacy-only"])
        let retained = defaults.dictionary(forKey: recoveryKey)
        XCTAssertEqual((retained?["shared-project"] as? [String: Any])?["draft"] as? String, "Older legacy draft")
        XCTAssertEqual((retained?["legacy-only"] as? [String: Any])?["draft"] as? String, "Legacy-only draft")
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

    func testEmptyBaseSaveRequiresConfirmedServerHeadOrExplicitEmptyProject() throws {
        func project(_ fields: [String: Any]) throws -> BackendScreenplayProjectSummary {
            var payload: [String: Any] = ["id": "project", "title": "Test"]
            fields.forEach { payload[$0.key] = $0.value }
            return try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
                from: JSONSerialization.data(withJSONObject: payload))
        }
        let missingHead = try project(["activeVersionId": "active", "lastVersionId": "old",
            "versionCount": 2, "versions": [["id": "old", "draft": "Historical text"]]])
        guard case .unverified = ScreenplaySaveHeadPreflight.evaluate(missingHead) else {
            return XCTFail("Missing active head must not authorize a historical fallback")
        }
        let missingDraft = try project(["activeVersionId": "active", "versionCount": 1,
            "versions": [["id": "active"]]])
        guard case .unverified = ScreenplaySaveHeadPreflight.evaluate(missingDraft) else {
            return XCTFail("Missing draft must not be treated as empty")
        }
        let omittedVersions = try project(["versionCount": 0])
        guard case .unverified = ScreenplaySaveHeadPreflight.evaluate(omittedVersions) else {
            return XCTFail("An omitted version list is not an empty list")
        }
        let noHead = try project(["versionCount": 1, "versions": [["id": "old", "draft": "Old"]]])
        guard case .unverified = ScreenplaySaveHeadPreflight.evaluate(noHead) else {
            return XCTFail("A historical version without a declared head is not authoritative")
        }
        let foreignHead = try project(["activeVersionId": "active", "versionCount": 1,
            "versions": [["id": "active", "projectId": "other-project", "draft": "Foreign"]]])
        guard case .unverified = ScreenplaySaveHeadPreflight.evaluate(foreignHead) else {
            return XCTFail("A version from another project is not an authoritative head")
        }
        let empty = try project(["versionCount": 0, "versions": []])
        guard case .versionless = ScreenplaySaveHeadPreflight.evaluate(empty) else {
            return XCTFail("Explicitly empty projects must remain writable")
        }
        let current = try project(["activeVersionId": "active", "versionCount": 1,
            "versions": [["id": "active", "draft": ""]]])
        guard case .current(let version) = ScreenplaySaveHeadPreflight.evaluate(current) else {
            return XCTFail("An explicitly empty current draft is a valid head")
        }
        XCTAssertEqual(version.id, "active")
        XCTAssertEqual(version.draft, "")
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
        for changed in [draft + " ", draft.replacingOccurrences(of: "\r\n", with: "\n")] {
            XCTAssertEqual(ScreenplayDraftSaveIntentPolicy.intent(
                draft: changed, selectedProjectID: "project-a", isManualDraftEditing: false,
                committedWrite: committedWrite), .autosave)
        }
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
            pendingDraft: draft,
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

    func testRawSavePoliciesKeepByteDistinctPendingDraftsDirty() {
        let saved = "\r\nINT. CAFE - NIGHT\r\n\r\nA cafe\u{0301} waits.\r\n \t "
        XCTAssertFalse(ScreenplayDraftSaveCompletionPolicy.hasUnsavedChanges(currentDraft: saved, savedDraft: saved))
        for pending in [saved + " ", saved.replacingOccurrences(of: "\r\n", with: "\n"),
                        saved.precomposedStringWithCanonicalMapping] {
            XCTAssertFalse(pending.utf8.elementsEqual(saved.utf8))
            XCTAssertTrue(ScreenplayDraftSaveCompletionPolicy.hasUnsavedChanges(currentDraft: pending, savedDraft: saved))
            XCTAssertFalse(ScreenplayDraftSaveCoalescingPolicy.shouldCoalesce(
                activeDraft: saved, activeSource: "studio_autosave", activeNotes: "", activeBaseVersionOverride: "v1",
                pendingDraft: pending, pendingSource: "studio_autosave", pendingNotes: "", pendingBaseVersionOverride: "v1"))
        }
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

    func testCommittedWriteRevertRequiresCurrentProjectAndExactBytes() {
        let committed = "INT. CAFÉ - NIGHT\r\n\r\nShe waits."
        XCTAssertTrue(ScreenplayCommittedDraftAdoptionPolicy.canRevert(selectedProjectID: "project-a", committedProjectID: "project-a", currentDraft: committed, committedDraft: committed))
        for (project, draft) in [
            ("project-b", committed),
            ("project-a", committed + "\nA new line."),
            ("project-a", committed.replacingOccurrences(of: "\r\n", with: "\n")),
            ("project-a", committed.replacingOccurrences(of: "É", with: "E\u{0301}")),
        ] {
            XCTAssertFalse(ScreenplayCommittedDraftAdoptionPolicy.canRevert(selectedProjectID: project, committedProjectID: "project-a", currentDraft: draft, committedDraft: committed))
        }
        XCTAssertFalse(ScreenplayCommittedDraftAdoptionPolicy.canRevert(selectedProjectID: "project-a", committedProjectID: "", currentDraft: committed, committedDraft: committed))
        XCTAssertTrue(ScreenplayCommittedDraftAdoptionPolicy.canRevert(selectedProjectID: "", committedProjectID: "", currentDraft: committed, committedDraft: committed))
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
}
