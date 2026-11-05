import XCTest
@testable import them

final class ScreenplayDraftSaveOutboxTests: XCTestCase {
    @MainActor
    func testStaleBlankObserverCannotClearQueuedWriterAuthorityOrRecovery() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let suite = "them.stale-draft-observer.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        model.applyStructuralUITestDraft("", versionID: "server-v1")
        let writer = "INT. ROOM - NIGHT\n\nThe writer's exact offline words."
        model.fountainDraft = writer
        model.noteManualDraftEdit()
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "writer", draft: writer), with: owner))

        // A queued Combine callback can start after a newer manual edit.
        // Exercise the production observer, not a duplicate policy/fake save.
        await model.handleDraftDebouncedChange("")
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertTrue(model.isManualDraftEditing)
        XCTAssertEqual(recovery.payloads(ownerUserId: owner)["project-1"]?["draft"] as? String, writer)
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Script",
            "activeVersionId": "server-v1", "versions": [["id": "server-v1", "draft": ""]]])
        model.hydrateDraft(from: try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
        XCTAssertEqual(model.fountainDraft, writer)
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        let retained = try await queue.entriesForTesting()
        XCTAssertEqual(retained.map(\.draft), [writer])
        try? await Task.sleep(for: .milliseconds(1_100))
    }

    @MainActor
    func testOlderConflictAndNewerPageRemainAvailableWhenRecoveryNamesServerHead() async throws {
        // Adapt original #962's authority regression to this earlier model's
        // existing injected queue; no later transport framework is required.
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let context = ScreenplayStudioAuthContext.current()
        for textRestoredFirst in [false, true] {
            let owner = context.userID
            let directory = storageDirectory.appendingPathComponent("metadata-\(textRestoredFirst)", isDirectory: true)
            let queue = ScreenplayDraftSaveOutbox(storageDirectory: directory)
            let submitted = "Earlier submitted writer words"
            var old = replacingOwner(of: makeEntry(id: "retained", draft: submitted), with: owner)
            old.deliveryOrigin = .init(documentID: "older-conflict-document-\(textRestoredFirst)", backendURL: BackendAuthClient.resolvedBackendBaseURL())
            XCTAssertTrue(ScreenplayLiveDraftBridge.shared.adoptLoadedProjectDraft(submitted, projectID: old.projectId,
                versionID: old.baseVersionId, owner: context, queuedEntry: old))
            try await queue.enqueue(old)
            _ = try await queue.retainConflict(old)
            let suite = "them.parked-authority.\(UUID().uuidString)"
            let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
            defer { defaults.removePersistentDomain(forName: suite) }
            let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
            let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
            model.autosaveEnabled = false
            model.selectedProjectID = "project-1"
            model.applyStructuralUITestDraft("Collaborator words", versionID: "remote")
            let raw = "  Newer writer words cafe\u{0301}\r\n\t "
            if textRestoredFirst {
                model.fountainDraft = raw
                model.noteManualDraftEdit()
            }
            // The bridge and durable recovery agree on the newer page.
            ScreenplayLiveDraftBridge.shared.draftText = raw
            ScreenplayLiveDraftSyncService.shared.attach(to: model)
            recovery.save(ownerUserId: owner, projectId: "project-1", draft: raw,
                baseVersionId: "remote", dirty: true, savedAt: 200)
            let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Script",
                "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Collaborator words"]]])
            let applied = await model.hydrateDraftRestoringQueuedSaves(from:
                try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
            XCTAssertFalse(applied, "The earlier conflict requires review, not automatic replacement")
            XCTAssertEqual(Array(model.fountainDraft.utf8), Array(raw.utf8))
            XCTAssertTrue(model.hasUnsavedDraftChanges)
            XCTAssertEqual(model.heldDraftRecovery?.id, old.id)
            XCTAssertEqual(model.heldDraftRecovery?.draft, submitted)
            XCTAssertEqual(recovery.dirtyOrdinarySnapshot(ownerUserId: owner, projectId: "project-1")?.draft, raw)
            await model.resumeQueuedDraftSavesIfNeeded(force: true)
            let retained = try await ScreenplayDraftSaveOutbox(storageDirectory: directory).entriesForTesting()
            XCTAssertEqual(retained.count, 1)
            XCTAssertEqual(retained.first?.draft, submitted)
            XCTAssertEqual(retained.first?.baseVersionId, "server-v1")
            XCTAssertEqual(retained.first?.status, .parked)
            try? await Task.sleep(nanoseconds: 1_100_000_000)
        }
    }

    @MainActor
    func testConflictChoiceSurvivesOrdinaryHydrationUntilExplicitServerChoice() async throws {
        try await exerciseDelayedServerChoice(representConflict: false, completeChoice: true, verifyHydration: true)
    }

    @MainActor
    func testProjectHydrationRestoresParkedWriterSaveBeforeRemoteDraft() async throws {
        // Original #928's real-model regression, seeded through the existing
        // parked-entry API so it also executes before #925 is ported here.
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let owner = ScreenplayStudioAuthContext.current()
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let local = "  Writer words cafe\u{0301}\r\n"
        var entry = replacingOwner(of: makeEntry(id: "parked", draft: local), with: owner.userID)
        entry.deliveryOrigin = .init(documentID: "parked-hydration-document", backendURL: BackendAuthClient.resolvedBackendBaseURL())
        XCTAssertTrue(ScreenplayLiveDraftBridge.shared.adoptLoadedProjectDraft(local, projectID: entry.projectId,
            versionID: entry.baseVersionId, owner: owner, queuedEntry: entry))
        try await queue.enqueue(entry)
        try await queue.markParked(id: "parked", error: ScreenplayDraftSaveOutbox.conflictReason)
        let suite = "them.parked-project-hydration.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        XCTAssertTrue(recovery.save(ownerUserId: owner.userID, projectId: entry.projectId, draft: local,
                                    baseVersionId: entry.baseVersionId, dirty: true))
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Collaborator words"]]])
        await model.hydrateDraftRestoringQueuedSaves(from:
            try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
        XCTAssertEqual(Array(model.fountainDraft.utf8), Array(local.utf8))
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertNotNil(model.conflictState)
        let copies = try await queue.entriesForTesting()
        XCTAssertEqual(copies.map(\.draft), [local])
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testUnscopedPendingDraftIsVisibleWithoutBlockingProvenSave() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let owner = ScreenplayStudioAuthContext.current()
        XCTAssertTrue(ScreenplayLiveDraftBridge.shared.adoptLoadedProjectDraft("Visible words", projectID: "project-1",
                                                                             versionID: "local-base", owner: owner))
        let documentID = try XCTUnwrap(ScreenplayLiveDraftBridge.shared.draftOrigin.documentID)
        let origin = ScreenplayDraftSaveOrigin(documentID: documentID, backendURL: BackendAuthClient.resolvedBackendBaseURL())
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let legacy = replacingOwner(of: makeEntry(id: "legacy-pending", draft: "Exact unscoped writer words\r\n"), with: owner.userID)
        var later = replacingOwner(of: makeDeliverableEntry(id: "later", draft: "Later scoped words", createdAt: 200), with: owner.userID)
        later.deliveryOrigin = origin
        try await queue.enqueue(legacy)
        try await queue.enqueue(later)
        let suite = "them.unscoped-pending-visible.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: .init(defaults: defaults, key: "recovery"), draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = legacy.projectId
        model.applyStructuralUITestDraft("Visible words", versionID: "local-base")
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
            from: JSONSerialization.data(withJSONObject: ["id": legacy.projectId, "title": "Test",
                "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Server words"]]]))
        let applied = await model.hydrateDraftRestoringQueuedSaves(from: project)
        XCTAssertFalse(applied)
        XCTAssertEqual(model.fountainDraft, "Visible words")
        XCTAssertEqual(model.heldDraftRecovery?.id, legacy.id)
        XCTAssertEqual(Data(try XCTUnwrap(model.heldDraftRecovery?.draft).utf8), Data(legacy.draft.utf8))
        XCTAssertTrue(model.errorText.contains("no recorded document or backend"))
        let reviewResult = await model.confirmedHeldDraftRecoveryForReview()
        let review = try XCTUnwrap(reviewResult)
        XCTAssertEqual(model.heldDraftRecoveryForReview(review)?.draft, legacy.draft)
        let next = try await queue.beginNext(projectId: legacy.projectId, ownerUserId: owner.userID,
                                             deliveryOrigin: origin, force: true)
        XCTAssertEqual(next?.id, later.id)
        let reopened = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let rows = try await reopened.entriesForTesting()
        XCTAssertEqual(rows.first(where: { $0.id == legacy.id })?.draft, legacy.draft)
        XCTAssertEqual(rows.first(where: { $0.id == later.id })?.draft, later.draft)
        XCTAssertEqual(rows.first(where: { $0.id == later.id })?.status, .pending, "Interrupted proven delivery returns to pending on relaunch")
    }

    @MainActor
    func testUnreadableQueueBlocksHydrationWithoutDiscardingPageAndValidRetryRecovers() async throws {
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let corruptData = Data("{not-json".utf8)
        try corruptData.write(to: manifestURL)
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let suite = "them.unreadable-hydration.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(
            localDraftRecoveryStore: ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"),
            draftSaveOutbox: queue
        )
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        let visible = "INT. ROOM - NIGHT\n\nThe visible writer words.\n"
        model.applyStructuralUITestDraft(visible, versionID: "visible-base")
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Collaborator words"]]])
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data)
        for _ in 0..<2 {
            let applied = await model.hydrateDraftRestoringQueuedSaves(from: project)
            XCTAssertFalse(applied, "An unreadable queue is not evidence that no local saves exist.")
            XCTAssertEqual(Array(model.fountainDraft.utf8), Array(visible.utf8))
            XCTAssertEqual(model.latestVersionID, "visible-base")
            XCTAssertFalse(model.errorText.isEmpty, "The writer must be told why server text was not loaded.")
            XCTAssertEqual(try Data(contentsOf: manifestURL), corruptData)
        }

        // Only this test repairs its owned fixture. Production must never
        // replace an unreadable manifest with an empty queue automatically.
        try Data("[]".utf8).write(to: manifestURL, options: .atomic)
        let recovered = await model.hydrateDraftRestoringQueuedSaves(from: project)
        XCTAssertTrue(recovered)
        XCTAssertEqual(model.fountainDraft, "Collaborator words")
        XCTAssertEqual(model.latestVersionID, "remote")
        XCTAssertTrue(model.errorText.isEmpty, "A successful retry must clear the queue-read warning.")
        model.errorText = "Unrelated failure"
        let repeated = await model.hydrateDraftRestoringQueuedSaves(from: project)
        XCTAssertTrue(repeated)
        XCTAssertEqual(model.errorText, "Unrelated failure")
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testProjectHydrationRestoresQueuedWriterSaveBeforeRemoteDraft() async throws {
        // Adapt original #928's parked-copy regression to this earlier
        // parent's active outbox, alongside the parked-conflict regression above.
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let owner = ScreenplayStudioAuthContext.current()
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let local = "Writer words cafe\u{0301}\n"
        var entry = replacingOwner(of: makeEntry(id: "queued", draft: local), with: owner.userID)
        entry.deliveryOrigin = .init(documentID: "queued-hydration-document", backendURL: BackendAuthClient.resolvedBackendBaseURL())
        XCTAssertTrue(ScreenplayLiveDraftBridge.shared.adoptLoadedProjectDraft(local, projectID: entry.projectId,
            versionID: entry.baseVersionId, owner: owner, queuedEntry: entry))
        try await queue.enqueue(entry)
        let suite = "them.project-hydration.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Collaborator words"]]])
        let applied = await model.hydrateDraftRestoringQueuedSaves(from:
            try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
        XCTAssertTrue(applied)
        XCTAssertEqual(Array(model.fountainDraft.utf8), Array(local.utf8))
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertNotNil(model.conflictState)
        let copies = try await queue.entriesForTesting()
        XCTAssertEqual(copies.map(\.draft), [local])
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testWhitespaceEditRemainsDirtyImmediatelyAndAfterDebounce() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let suite = "them.whitespace-dirty.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        model.applyStructuralUITestDraft("Writer words", versionID: "saved")
        let edited = "Writer words\n"
        model.fountainDraft = edited
        model.noteManualDraftEdit()
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertTrue(recovery.dirtyOrdinarySnapshot(ownerUserId: owner, projectId: "project-1")?.draft.utf8
            .elementsEqual(edited.utf8) == true)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertTrue(model.fountainDraft.utf8.elementsEqual(edited.utf8))
    }

    @MainActor
    func testLiveSyncRecoveryPreservesNewlineOnlyLocalEdit() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let suite = "them.live-exact-recovery.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery,
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory))
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        model.applyStructuralUITestDraft("Writer words", versionID: "saved")
        let edited = "Writer words\n"
        model.fountainDraft = edited
        model.noteManualDraftEdit()
        XCTAssertTrue(model.preserveLocalDraftForLiveSyncRecovery(edited, projectID: "project-1"))
        let reopened = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let snapshot = reopened.recoverySnapshot(ownerUserId: owner, projectId: "project-1", serverDraft: "Writer words")
        XCTAssertTrue(snapshot?.draft.utf8.elementsEqual(edited.utf8) == true)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testUnicodeDistinctPreservedCopyRemainsVisibleWhenSavedTextReturns() async throws {
        let suite = "them.unicode-recovery.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery,
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory))
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        let saved = "Caf\u{00E9}"
        let local = "Cafe\u{0301}"
        model.applyStructuralUITestDraft(saved, versionID: "saved")
        model.fountainDraft = local
        model.noteManualDraftEdit()
        model.preserveLocalDraftForLiveSyncRecovery(local, projectID: "project-1")
        XCTAssertTrue(model.recoveryCandidate?.draft.utf8.elementsEqual(local.utf8) == true)
        model.fountainDraft = saved
        model.noteManualDraftEdit()
        XCTAssertFalse(model.hasUnsavedDraftChanges)
        XCTAssertTrue(model.recoveryCandidate?.draft.utf8.elementsEqual(local.utf8) == true)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testBlankManualEditsAreRecoverableAfterStoreReinitialization() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let suite = "them.manual-blank-recovery.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery,
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory))
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        model.applyStructuralUITestDraft("Writer words", versionID: "saved")
        for edited in ["", " \n"] {
            model.fountainDraft = edited
            model.noteManualDraftEdit()
            XCTAssertTrue(model.hasUnsavedDraftChanges)
            await model.handleDraftDebouncedChange(edited)
            XCTAssertTrue(model.hasUnsavedDraftChanges)
            XCTAssertEqual(model.autosaveStatusText, edited.isEmpty ? "Empty page - unsaved" : "Create project to save")
            let reloaded = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
            let snapshot = reloaded.recoverySnapshot(ownerUserId: owner, projectId: "project-1",
                serverDraft: "Writer words")
            XCTAssertTrue(snapshot?.draft.utf8.elementsEqual(edited.utf8) == true)
        }
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testLiveSyncRecoveryPreservesIntentionallyClearedDraft() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let suite = "them.live-cleared-recovery.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery,
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory))
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        model.applyStructuralUITestDraft("Writer words", versionID: "saved")
        model.fountainDraft = ""
        model.noteManualDraftEdit()
        XCTAssertTrue(model.preserveLocalDraftForLiveSyncRecovery("", projectID: "project-1"))
        let reopened = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let snapshot = reopened.recoverySnapshot(ownerUserId: owner, projectId: "project-1", serverDraft: "Writer words")
        XCTAssertEqual(snapshot?.draft, "")
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testAccountSwitchDoesNotReuseOtherAccountSavedBaseline() async throws {
        let suite = "them.account-baseline-scope.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        var owner = "account-a"
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery,
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory),
            studioAuthContextProvider: { ScreenplayStudioAuthContext(userID: owner, sessionIntentGeneration: 1) })
        model.autosaveEnabled = false
        model.selectedProjectID = "same-project-id"
        model.applyStructuralUITestDraft("Writer words", versionID: "saved-a")
        owner = "account-b"
        let writerDraft = "Writer words\n"
        model.fountainDraft = writerDraft
        model.noteManualDraftEdit()
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertTrue(recovery.dirtyOrdinarySnapshot(ownerUserId: owner, projectId: "same-project-id")?.draft.utf8
            .elementsEqual(writerDraft.utf8) == true)
        XCTAssertNil(recovery.dirtyOrdinarySnapshot(ownerUserId: "account-a", projectId: "same-project-id"))
        try? await Task.sleep(nanoseconds: 1_100_000_000)
        XCTAssertTrue(model.hasUnsavedDraftChanges)
    }

    @MainActor
    func testClearedManualEditRemainsDirtyWhenAccountBaselineIsUnknown() async throws {
        let suite = "them.account-cleared-baseline.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        var owner = "account-a"
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery,
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory),
            studioAuthContextProvider: { ScreenplayStudioAuthContext(userID: owner, sessionIntentGeneration: 1) })
        model.autosaveEnabled = false
        model.selectedProjectID = "same-project-id"
        model.applyStructuralUITestDraft("Writer words", versionID: "saved-a")
        owner = "account-b"
        model.fountainDraft = ""
        model.noteManualDraftEdit()
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertEqual(recovery.dirtyOrdinarySnapshot(ownerUserId: owner, projectId: "same-project-id")?.draft, "")
        XCTAssertNil(recovery.dirtyOrdinarySnapshot(ownerUserId: "account-a", projectId: "same-project-id"))
        try? await Task.sleep(nanoseconds: 1_100_000_000)
        XCTAssertTrue(model.hasUnsavedDraftChanges)
    }

    @MainActor
    func testUnknownProjectBaselineDoesNotTreatNormalizedMatchAsSaved() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let suite = "them.unknown-project-baseline.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        model.applyStructuralUITestDraft("Writer words", versionID: "saved")
        model.selectedProjectID = "project-2"
        let edited = "Writer words\n"
        model.fountainDraft = edited
        model.noteManualDraftEdit()
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertTrue(recovery.dirtyOrdinarySnapshot(ownerUserId: owner, projectId: "project-2")?.draft.utf8
            .elementsEqual(edited.utf8) == true)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
        XCTAssertTrue(model.hasUnsavedDraftChanges)
    }

    @MainActor
    func testRevertingToSavedRawTextDoesNotBecomeDirtyAfterDebounce() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let suite = "them.save-revert.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"), draftSaveOutbox: queue)
        model.selectedProjectID = "project-1"
        let saved = "  INT. ROOM - NIGHT\r\n\r\nWriter words.\r\n"
        model.applyStructuralUITestDraft(saved, versionID: "saved")
        model.fountainDraft = "Changed writer words"
        model.noteManualDraftEdit()
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        model.fountainDraft = saved
        model.noteManualDraftEdit()
        try? await Task.sleep(nanoseconds: 1_100_000_000)
        XCTAssertEqual(model.fountainDraft, saved)
        XCTAssertFalse(model.hasUnsavedDraftChanges)
        let copies = try await queue.entriesForTesting()
        XCTAssertTrue(copies.isEmpty)
    }

    @MainActor
    func testEmptyProjectHydrationDoesNotKeepAnotherProjectsCleanPage() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let suite = "them.empty-project.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"), draftSaveOutbox: queue)
        model.selectedProjectID = "old-project"
        model.applyStructuralUITestDraft("Old project words", versionID: "old")
        model.selectedProjectID = "new-project"
        let data = try JSONSerialization.data(withJSONObject: ["id": "new-project", "title": "New", "versions": []])
        model.hydrateDraft(from: try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
        XCTAssertEqual(model.fountainDraft, "")
        XCTAssertEqual(model.latestVersionID, "")
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    private final class DeferredConflictProject {
        let started = XCTestExpectation(description: "Canonical fetch started")
        var continuation: CheckedContinuation<BackendScreenplayProjectSummary, Never>?
        func load() async -> BackendScreenplayProjectSummary {
            await withCheckedContinuation { continuation in
                self.continuation = continuation
                started.fulfill()
            }
        }
    }

    @MainActor
    func testTypingDuringServerChoiceFetchPreservesNewerEditorAndQueuedCopy() async throws {
        try await exerciseDelayedServerChoice(representConflict: false)
    }

    @MainActor
    func testVerifiedLoadServerChoiceAllowsLiveFollowingAgain() async throws {
        try await exerciseDelayedServerChoice(representConflict: false, completeChoice: true)
    }

    @MainActor
    func testRepeatedConflictInvalidatesOlderServerChoiceFetch() async throws {
        try await exerciseDelayedServerChoice(representConflict: true)
    }

    @MainActor
    private func exerciseDelayedServerChoice(representConflict: Bool, failRead: Bool = false, completeChoice: Bool = false,
                                             preserveSeparate: Bool = false, verifyHydration: Bool = false) async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let owner = ScreenplayStudioAuthContext.current()
        let previousSharedID = BackendAuthClient.sharedUserID()
        XCTAssertTrue(BackendAuthClient.persistSharedUserID(owner.userID))
        defer {
            if let previousSharedID { _ = BackendAuthClient.persistSharedUserID(previousSharedID) }
            else { BackendAuthClient.clearSharedUserID() }
        }
        let identity = BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false)
        let backend = BackendAuthClient.resolvedBackendBaseURL()
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        var entry = replacingOwner(of: makeEntry(id: "writer", draft: "Draft one"), with: owner.userID)
        entry.deliveryOrigin = .init(documentID: "delayed-conflict-document", backendURL: backend)
        let bridge = ScreenplayLiveDraftBridge.shared
        XCTAssertTrue(bridge.adoptLoadedProjectDraft(entry.draft, projectID: entry.projectId,
            versionID: entry.baseVersionId, owner: owner, queuedEntry: entry))
        try await queue.enqueue(entry)
        let retainedRow = try await queue.retainConflict(entry)
        let retained = try XCTUnwrap(retainedRow)
        let suite = "them.delayed-choice-http.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let box = DelayedConflictFetchBox()
        DelayedConflictFetchProtocol.install { transport, request in
            if request.url?.path == "/session", request.httpMethod == "POST" {
                do { try transport.respond(["user_id": owner.userID, "authenticated": true,
                                            "client_token": "test-client", "expires_in": 3600,
                                            "remembered_names": []]) }
                catch { transport.fail(error) }
            } else if request.url?.path == "/screenplay/projects/\(entry.projectId)", request.httpMethod == "GET" {
                box.receive(transport, request: request)
            } else {
                transport.fail(URLError(.unsupportedURL))
            }
        }
        defer { DelayedConflictFetchProtocol.uninstall() }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [DelayedConflictFetchProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let api = BackendMemoryAPI(session: session, baseURL: backend, requestIdentityProvider: { _ in identity })
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue,
                                               projectSelectionAPI: api)
        model.autosaveEnabled = false
        model.selectedProjectID = entry.projectId
        model.fountainDraft = entry.draft
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        let conflict = ScreenplayStudioViewModel.SaveConflictState(projectId: entry.projectId,
            baseVersionId: entry.baseVersionId, serverVersionId: "remote", serverDraft: "",
            serverDraftExcerpt: "", serverUpdatedAt: 1, retainedRequest: retained)
        model.conflictState = conflict
        if preserveSeparate {
            XCTAssertTrue(recovery.save(ownerUserId: owner.userID, projectId: entry.projectId, draft: entry.draft,
                                        baseVersionId: entry.baseVersionId, dirty: true))
            recovery.savePreservedConflict(ownerUserId: owner.userID, projectId: entry.projectId,
                                           draft: "Other preserved words\n", baseVersionId: "older")
        }
        if verifyHydration {
            let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
                from: JSONSerialization.data(withJSONObject: ["id": entry.projectId, "title": "Test",
                    "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Server words"]]]))
            model.hydrateDraft(from: project)
            XCTAssertEqual(model.conflictState, conflict, "A refresh cannot resolve the writer's choice")
            XCTAssertEqual(model.fountainDraft, entry.draft)
        }
        let task = Task { await model.applyServerVersionFromConflict() }
        let received = await XCTWaiter.fulfillment(of: [box.started], timeout: 5)
        guard received == .completed, let transport = box.transport() else {
            task.cancel()
            XCTFail("The document-scoped server read did not reach HTTP. Error: \(model.errorText); owns editor: \(ScreenplayLiveDraftSyncService.shared.ownsEditor(model)); document: \(bridge.draftOrigin.documentID ?? "missing"); conflict visible: \(model.conflictState != nil)")
            return
        }
        if failRead {
            recovery.save(ownerUserId: owner.userID, projectId: entry.projectId, draft: entry.draft,
                          baseVersionId: entry.baseVersionId, dirty: true)
            transport.fail(URLError(.notConnectedToInternet))
            await task.value
            XCTAssertEqual(model.fountainDraft, entry.draft)
            XCTAssertEqual(model.conflictState, conflict)
            XCTAssertFalse(model.errorText.isEmpty)
            XCTAssertEqual(recovery.dirtyOrdinarySnapshot(ownerUserId: owner.userID, projectId: entry.projectId)?.draft, entry.draft)
            let rows = try await queue.entriesForTesting()
            XCTAssertEqual(rows.map(\.draft), [entry.draft])
            XCTAssertEqual(rows.first?.status, .parked)
            return
        }
        if completeChoice {
            try transport.respond(["project": ["id": entry.projectId, "title": "Test",
                "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Server words"]]]])
            await task.value
            XCTAssertNil(model.conflictState, "Server-choice error: \(model.errorText)")
            XCTAssertEqual(model.fountainDraft, "Server words")
            XCTAssertEqual(model.latestVersionID, "remote")
            XCTAssertFalse(model.hasUnsavedDraftChanges)
            let rows = try await queue.entriesForTesting()
            XCTAssertTrue(rows.isEmpty, "Only the explicitly selected row should be retired.")
            if preserveSeparate {
                XCTAssertEqual(recovery.currentPreservedConflict(ownerUserId: owner.userID, projectId: entry.projectId)?.draft,
                               "Other preserved words\n")
                XCTAssertEqual(model.recoveryCandidate?.draft, "Other preserved words\n")
            }
            XCTAssertTrue(model.applyRemoteLiveDraft("Next live revision", projectID: entry.projectId,
                                                      sourceDeviceID: "other-device"))
            model.adoptRemoteLiveVersion("next", projectID: entry.projectId,
                                         draftChecksum: LiveDraftText.checksum("Next live revision"))
            XCTAssertEqual(model.latestVersionID, "next")
            XCTAssertFalse(model.hasUnsavedDraftChanges)
            return
        }
        if representConflict { model.conflictState = conflict }
        else { model.fountainDraft = "Newer words typed during fetch\n" }
        model.hasUnsavedDraftChanges = true
        recovery.save(ownerUserId: owner.userID, projectId: entry.projectId, draft: model.fountainDraft,
                      baseVersionId: entry.baseVersionId, dirty: true)
        try transport.respond(["project": ["id": entry.projectId, "title": "Test",
            "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Server words"]]]])
        await task.value
        let expected = representConflict ? entry.draft : "Newer words typed during fetch\n"
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(expected.utf8))
        XCTAssertEqual(model.conflictState, conflict)
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertEqual(recovery.dirtyOrdinarySnapshot(ownerUserId: owner.userID, projectId: entry.projectId)?.draft, expected)
        let rows = try await queue.entriesForTesting()
        XCTAssertEqual(rows.map(\.draft), [entry.draft])
        XCTAssertEqual(rows.first?.status, .parked)
    }

    @MainActor
    func testLoadServerKeepsSeparatePreservedConflictDraft() async throws {
        try await exerciseDelayedServerChoice(representConflict: false, completeChoice: true, preserveSeparate: true)
    }

    @MainActor
    func testDismissingOneRecoveryCopyKeepsOtherCopies() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let suite = "them.dismiss-one-copy.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        recovery.savePreservedConflict(ownerUserId: owner, projectId: "project-1", draft: "First",
                                       baseVersionId: "one", savedAt: 100)
        recovery.savePreservedConflict(ownerUserId: owner, projectId: "project-1", draft: "Second",
                                       baseVersionId: "two", savedAt: 101)
        recovery.save(ownerUserId: owner, projectId: "project-1", draft: "Ordinary",
                      baseVersionId: "three", dirty: true, savedAt: 102)
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery,
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory))
        model.selectedProjectID = "project-1"
        model.recoveryCandidate = .init(owner: .current(), projectId: "project-1", draft: "First", baseVersionId: "one",
                                        savedAt: 100, isPreservedConflict: true)
        // A stale decision must not delete the older archived copy or the newer current copy.
        model.discardLocalRecoveryCopy()
        XCTAssertEqual(model.recoveryCandidate?.draft, "Second")
        XCTAssertEqual(recovery.currentPreservedConflict(ownerUserId: owner, projectId: "project-1")?.draft, "Second")
        XCTAssertEqual(recovery.firstPreservedConflict(ownerUserId: owner, projectId: "project-1")?.draft, "First")
        XCTAssertEqual(recovery.dirtyOrdinarySnapshot(ownerUserId: owner, projectId: "project-1")?.draft, "Ordinary")
        model.discardLocalRecoveryCopy()
        XCTAssertEqual(model.recoveryCandidate?.draft, "First")
        XCTAssertEqual(recovery.currentPreservedConflict(ownerUserId: owner, projectId: "project-1")?.draft, "First")
        XCTAssertEqual(recovery.dirtyOrdinarySnapshot(ownerUserId: owner, projectId: "project-1")?.draft, "Ordinary")
        model.keepServerDraft()
        XCTAssertEqual(model.recoveryCandidate?.draft, "Ordinary")
        XCTAssertNil(recovery.currentPreservedConflict(ownerUserId: owner, projectId: "project-1"))
        XCTAssertEqual(recovery.dirtyOrdinarySnapshot(ownerUserId: owner, projectId: "project-1")?.draft, "Ordinary")
    }

    @MainActor
    func testDismissingStaleOrdinaryCopyKeepsNewerOrdinaryText() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let suite = "them.dismiss-stale-copy.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        recovery.save(ownerUserId: owner, projectId: "project-1", draft: "Newer",
                      baseVersionId: "base", dirty: true, savedAt: 101)
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery,
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory))
        model.selectedProjectID = "project-1"
        model.recoveryCandidate = .init(owner: .current(), projectId: "project-1", draft: "Earlier", baseVersionId: "base",
                                        savedAt: 100, isPreservedConflict: false)
        model.discardLocalRecoveryCopy()
        XCTAssertEqual(model.recoveryCandidate?.draft, "Newer")
        XCTAssertEqual(recovery.dirtyOrdinarySnapshot(ownerUserId: owner, projectId: "project-1")?.draft, "Newer")
    }

    @MainActor
    private final class DeferredFailingSavePreflight {
        let started = XCTestExpectation(description: "Save preflight started")
        var continuation: CheckedContinuation<BackendScreenplayProjectSummary, Error>?
        func load() async throws -> BackendScreenplayProjectSummary {
            try await withCheckedThrowingContinuation { continuation in
                self.continuation = continuation
                started.fulfill()
            }
        }
    }

    @MainActor
    func testSaveQueueWriteFailureDoesNotPromiseAutomaticRetry() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let context = ScreenplayStudioAuthContext.current()
        let previousSharedID = BackendAuthClient.sharedUserID()
        XCTAssertTrue(BackendAuthClient.persistSharedUserID(context.userID))
        defer {
            if let previousSharedID { _ = BackendAuthClient.persistSharedUserID(previousSharedID) }
            else { BackendAuthClient.clearSharedUserID() }
        }
        XCTAssertTrue(ScreenplayLiveDraftBridge.shared.adoptLoadedProjectDraft("", projectID: "project-1", versionID: "", owner: context))
        let documentID = try XCTUnwrap(ScreenplayLiveDraftBridge.shared.draftOrigin.documentID)
        let origin = ScreenplayDraftSaveOrigin(documentID: documentID, backendURL: BackendAuthClient.resolvedBackendBaseURL())
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let suite = "them.queue-write-failure.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let deferred = DeferredFailingSavePreflight()
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery,
            recoveryOriginProvider: { $0 == "project-1" ? origin : nil }, draftSaveOutbox: queue,
            savePreflightProjectLoader: { _ in try await deferred.load() })
        model.autosaveEnabled = false
        model.selectedProject = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
            from: JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "First"]))
        model.selectedProjectID = "project-1"
        model.applyStructuralUITestDraft("", versionID: "")
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        let words = "Keep these exact words\n"
        model.fountainDraft = words
        model.noteManualDraftEdit()
        let save = Task { await model.manualSaveDraft() }
        await fulfillment(of: [deferred.started], timeout: 2)
        let manifest = storageDirectory.appendingPathComponent("queue.json")
        try FileManager.default.moveItem(at: manifest, to: storageDirectory.appendingPathComponent("original-queue.json"))
        try FileManager.default.createDirectory(at: manifest, withIntermediateDirectories: false)
        deferred.continuation?.resume(throwing: URLError(.notConnectedToInternet))
        await save.value
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(words.utf8))
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertEqual(model.autosaveStatusText, "Save needs attention")
        XCTAssertTrue(model.errorText.contains("Automatic retry is not confirmed"))
        XCTAssertTrue(model.infoText.contains("export a copy"))
        let retained = try await queue.entriesForTesting()
        XCTAssertEqual(retained.first?.draft, words)
    }

    @MainActor
    func testFailedSaveAfterProjectSwitchPreservesOriginalProjectText() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let context = ScreenplayStudioAuthContext.current()
        let previousSharedID = BackendAuthClient.sharedUserID()
        XCTAssertTrue(BackendAuthClient.persistSharedUserID(context.userID))
        defer {
            if let previousSharedID { _ = BackendAuthClient.persistSharedUserID(previousSharedID) }
            else { BackendAuthClient.clearSharedUserID() }
        }
        let owner = context.userID
        XCTAssertTrue(ScreenplayLiveDraftBridge.shared.adoptLoadedProjectDraft("", projectID: "project-1", versionID: "", owner: context))
        let documentID = try XCTUnwrap(ScreenplayLiveDraftBridge.shared.draftOrigin.documentID)
        let origin = ScreenplayDraftSaveOrigin(documentID: documentID, backendURL: BackendAuthClient.resolvedBackendBaseURL())
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let suite = "them.save-switch-scope.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let deferred = DeferredFailingSavePreflight()
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery,
            recoveryOriginProvider: { $0 == "project-1" ? origin : nil }, draftSaveOutbox: queue,
            savePreflightProjectLoader: { _ in try await deferred.load() })
        model.autosaveEnabled = false
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "First"])
        model.selectedProject = try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data)
        model.selectedProjectID = "project-1"
        model.applyStructuralUITestDraft("", versionID: "")
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        model.fountainDraft = "Original project words\n"
        model.noteManualDraftEdit()
        let save = Task { await model.manualSaveDraft() }
        await fulfillment(of: [deferred.started], timeout: 2)
        model.selectedProjectID = "project-2"
        model.fountainDraft = "Different project words"
        deferred.continuation?.resume(throwing: URLError(.notConnectedToInternet))
        await save.value
        let reopenedRecovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let preserved = reopenedRecovery.dirtyOrdinarySnapshot(ownerUserId: owner, projectId: "project-1")
        XCTAssertTrue(preserved?.draft.utf8.elementsEqual("Original project words\n".utf8) == true)
        XCTAssertEqual(model.fountainDraft, "Different project words")
        let reopened = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let retained = try await reopened.entriesForTesting()
        XCTAssertEqual(retained.first?.projectId, "project-1")
        XCTAssertTrue(retained.first?.draft.utf8.elementsEqual("Original project words\n".utf8) == true)
        XCTAssertEqual(retained.first?.status, .pending)
        XCTAssertEqual(retained.first?.ownerUserId, owner)
        XCTAssertEqual(retained.first?.deliveryOrigin, origin)
        let wrongProject = try await reopened.beginNext(projectId: "project-2", ownerUserId: owner,
                                                        deliveryOrigin: origin, force: true)
        XCTAssertNil(wrongProject)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testSuccessfulPreflightAfterProjectSwitchCannotChangeSelectedProject() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let context = ScreenplayStudioAuthContext.current()
        let previousSharedID = BackendAuthClient.sharedUserID()
        XCTAssertTrue(BackendAuthClient.persistSharedUserID(context.userID))
        defer {
            if let previousSharedID { _ = BackendAuthClient.persistSharedUserID(previousSharedID) }
            else { BackendAuthClient.clearSharedUserID() }
        }
        let owner = context.userID
        XCTAssertTrue(ScreenplayLiveDraftBridge.shared.adoptLoadedProjectDraft("", projectID: "project-1", versionID: "", owner: context))
        let documentID = try XCTUnwrap(ScreenplayLiveDraftBridge.shared.draftOrigin.documentID)
        let origin = ScreenplayDraftSaveOrigin(documentID: documentID, backendURL: BackendAuthClient.resolvedBackendBaseURL())
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let suite = "them.save-switch-success.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let deferred = DeferredFailingSavePreflight()
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery,
            recoveryOriginProvider: { $0 == "project-1" ? origin : nil }, draftSaveOutbox: queue,
            savePreflightProjectLoader: { _ in try await deferred.load() })
        model.autosaveEnabled = false
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "First",
            "activeVersionId": "server-v1", "versions": [["id": "server-v1", "draft": "Original words"]]])
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data)
        model.selectedProject = project
        model.selectedProjectID = "project-1"
        model.applyStructuralUITestDraft("", versionID: "")
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        model.fountainDraft = "Original words"
        model.noteManualDraftEdit()
        let save = Task { await model.manualSaveDraft() }
        await fulfillment(of: [deferred.started], timeout: 2)
        model.selectedProjectID = "project-2"
        model.latestVersionID = "project-2-version"
        model.fountainDraft = "Different project words"
        deferred.continuation?.resume(returning: project)
        await save.value
        XCTAssertEqual(model.selectedProjectID, "project-2")
        XCTAssertEqual(model.latestVersionID, "project-2-version")
        XCTAssertEqual(model.fountainDraft, "Different project words")
        let reopenedRecovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let preserved = reopenedRecovery.dirtyOrdinarySnapshot(ownerUserId: owner, projectId: "project-1")
        XCTAssertEqual(preserved?.draft, "Original words")
        let reopened = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let retained = try await reopened.entriesForTesting()
        XCTAssertEqual(retained.first?.projectId, "project-1")
        XCTAssertEqual(retained.first?.ownerUserId, owner)
        XCTAssertEqual(retained.first?.deliveryOrigin, origin)
        XCTAssertEqual(retained.first?.draft, "Original words")
        XCTAssertEqual(retained.first?.status, .parked)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testPendingSaveDuringDrainConflictRemainsDiscoverableAfterRelaunch() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let context = ScreenplayStudioAuthContext.current()
        let previousSharedID = BackendAuthClient.sharedUserID()
        XCTAssertTrue(BackendAuthClient.persistSharedUserID(context.userID))
        defer {
            if let previousSharedID { _ = BackendAuthClient.persistSharedUserID(previousSharedID) }
            else { BackendAuthClient.clearSharedUserID() }
        }
        let owner = context.userID
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        var first = replacingOwner(of: makeEntry(id: "first", draft: "Original draft"), with: owner)
        first.baseVersionId = ""
        first.deliveryOrigin = .init(documentID: "drain-conflict-document", backendURL: BackendAuthClient.resolvedBackendBaseURL())
        XCTAssertTrue(ScreenplayLiveDraftBridge.shared.adoptLoadedProjectDraft(first.draft, projectID: first.projectId,
            versionID: "", owner: context, queuedEntry: first))
        try await queue.enqueue(first)
        let suite = "them.drain-conflict-pending.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let deferred = DeferredFailingSavePreflight()
        let origin = try XCTUnwrap(first.deliveryOrigin)
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery,
            recoveryOriginProvider: { $0 == first.projectId ? origin : nil }, draftSaveOutbox: queue,
            savePreflightProjectLoader: { _ in try await deferred.load() })
        model.autosaveEnabled = false
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Script",
            "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Server draft"]]])
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data)
        model.selectedProjectID = project.id
        model.selectedProject = project
        model.applyStructuralUITestDraft("Original draft", versionID: "")
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        let drain = Task { await model.resumeQueuedDraftSavesIfNeeded(force: true) }
        await fulfillment(of: [deferred.started], timeout: 2)
        let newest = "Newer writer words\n"
        model.fountainDraft = newest
        model.noteManualDraftEdit()
        await model.manualSaveDraft()
        deferred.continuation?.resume(returning: project)
        await drain.value
        XCTAssertNotNil(model.conflictState)
        let reopened = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let rows = try await reopened.entriesForTesting()
        let restored = rows.first { $0.draft.utf8.elementsEqual(newest.utf8) }
        XCTAssertNotNil(restored, "The newer writer text must survive reopening the outbox")
        XCTAssertEqual(restored?.status, .parked)
        XCTAssertEqual(restored?.lastError, "The earlier save needs review.")
        let earlier = rows.first { $0.id == first.id }
        XCTAssertEqual(earlier?.draft, "Original draft")
        XCTAssertEqual(earlier?.status, .parked)
        XCTAssertEqual(earlier?.lastError, ScreenplayDraftSaveOutbox.conflictReason)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testEmptyBasePreflightDoesNotAcknowledgeWhitespaceDifferentDraft() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let context = ScreenplayStudioAuthContext.current()
        let previousSharedID = BackendAuthClient.sharedUserID()
        XCTAssertTrue(BackendAuthClient.persistSharedUserID(context.userID))
        defer {
            if let previousSharedID { _ = BackendAuthClient.persistSharedUserID(previousSharedID) }
            else { BackendAuthClient.clearSharedUserID() }
        }
        let owner = context.userID
        XCTAssertTrue(ScreenplayLiveDraftBridge.shared.adoptLoadedProjectDraft("", projectID: "project-1", versionID: "", owner: context))
        let documentID = try XCTUnwrap(ScreenplayLiveDraftBridge.shared.draftOrigin.documentID)
        let origin = ScreenplayDraftSaveOrigin(documentID: documentID, backendURL: BackendAuthClient.resolvedBackendBaseURL())
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let suite = "them.empty-base-exact-preflight.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Script",
            "activeVersionId": "server-v2", "versions": [["id": "server-v2", "draft": "Writer words"]]])
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data)
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery,
            recoveryOriginProvider: { $0 == "project-1" ? origin : nil }, draftSaveOutbox: queue,
            savePreflightProjectLoader: { _ in project })
        model.autosaveEnabled = false
        model.selectedProjectID = project.id
        model.selectedProject = project
        model.applyStructuralUITestDraft("", versionID: "")
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        let writerDraft = "Writer words\n"
        model.fountainDraft = writerDraft
        model.noteManualDraftEdit()
        await model.manualSaveDraft()
        XCTAssertEqual(model.conflictState?.serverVersionId, "server-v2")
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        let saved = try await ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory).entriesForTesting()
        XCTAssertEqual(saved.count, 1)
        XCTAssertTrue(saved.first?.draft.utf8.elementsEqual(writerDraft.utf8) == true)
        XCTAssertEqual(saved.first?.status, .parked)
        XCTAssertTrue(recovery.dirtyOrdinarySnapshot(ownerUserId: owner, projectId: project.id)?.draft.utf8
            .elementsEqual(writerDraft.utf8) == true)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testParkedConflictChoiceReopensWhenServerVersionIsUnchanged() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let owner = ScreenplayStudioAuthContext.current()
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let draft = "Exact writer text\n"
        var entry = replacingOwner(of: makeEntry(id: "choice", draft: draft,
            source: "studio_conflict_resolve"), with: owner.userID)
        entry.baseVersionId = "server-v1"
        entry.status = .parked
        entry.lastError = ScreenplayDraftSaveOutbox.conflictReason
        entry.deliveryOrigin = .init(documentID: "unchanged-conflict-document", backendURL: BackendAuthClient.resolvedBackendBaseURL())
        XCTAssertTrue(ScreenplayLiveDraftBridge.shared.adoptLoadedProjectDraft(draft, projectID: entry.projectId,
            versionID: entry.baseVersionId, owner: owner, queuedEntry: entry))
        try await queue.enqueue(entry)
        let suite = "them.same-version-conflict.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        XCTAssertTrue(recovery.save(ownerUserId: owner.userID, projectId: entry.projectId, draft: draft,
                                    baseVersionId: entry.baseVersionId, dirty: true))
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Script",
            "activeVersionId": "server-v1", "versions": [["id": "server-v1", "draft": "Server words"]]])
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data)
        let applied = await model.hydrateDraftRestoringQueuedSaves(from: project)
        XCTAssertTrue(applied)
        XCTAssertEqual(model.conflictState?.serverVersionId, "server-v1")
        XCTAssertTrue(model.fountainDraft.utf8.elementsEqual(draft.utf8))
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        let saved = try await ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory).entriesForTesting()
        XCTAssertEqual(saved.first?.status, .parked)
        XCTAssertTrue(saved.first?.draft.utf8.elementsEqual(draft.utf8) == true)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testRestoringHeldCopyKeepsNewerUnsavedPageInRecovery() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let owner = ScreenplayStudioAuthContext.current()
        XCTAssertTrue(ScreenplayLiveDraftBridge.shared.adoptLoadedProjectDraft("Server words", projectID: "project-1",
                                                                             versionID: "remote", owner: owner))
        let documentID = try XCTUnwrap(ScreenplayLiveDraftBridge.shared.draftOrigin.documentID)
        let origin = ScreenplayDraftSaveOrigin(documentID: documentID, backendURL: BackendAuthClient.resolvedBackendBaseURL())
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        var held = replacingOwner(of: makeEntry(id: "held", draft: "Earlier held words\n"), with: owner.userID)
        held.deliveryOrigin = origin
        held.status = .parked
        held.lastError = ScreenplayDraftSaveOutbox.loadServerDeferredReason
        try await queue.enqueue(held)
        let suite = "them.held-copy-preserves-page.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery,
            recoveryOriginProvider: { $0 == "project-1" ? origin : nil }, draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        model.selectedProject = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
            from: JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
                "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Server words"]]]))
        model.applyStructuralUITestDraft("Server words", versionID: "remote")
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        let newer = "  Newer page words\r\n"
        model.fountainDraft = newer
        model.noteManualDraftEdit()
        model.heldDraftRecovery = held
        await model.recoverHeldDraftSave()
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(held.draft.utf8))
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        let reopened = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        XCTAssertEqual(reopened.dirtyOrdinarySnapshot(ownerUserId: owner.userID, projectId: held.projectId)?.draft, newer)
        XCTAssertEqual(reopened.currentPreservedConflict(ownerUserId: owner.userID, projectId: held.projectId)?.draft, held.draft)
        let retained = try await ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory).entriesForTesting()
        XCTAssertEqual(retained.first?.draft, held.draft)
        XCTAssertEqual(retained.first?.status, .parked)
    }

    @MainActor
    func testRestoringHeldCopyWaitsForActiveSave() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let owner = ScreenplayStudioAuthContext.current()
        XCTAssertTrue(ScreenplayLiveDraftBridge.shared.adoptLoadedProjectDraft("Server words", projectID: "project-1",
                                                                             versionID: "remote", owner: owner))
        let documentID = try XCTUnwrap(ScreenplayLiveDraftBridge.shared.draftOrigin.documentID)
        let origin = ScreenplayDraftSaveOrigin(documentID: documentID, backendURL: BackendAuthClient.resolvedBackendBaseURL())
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        var held = replacingOwner(of: makeEntry(id: "held", draft: "Earlier held words\n"), with: owner.userID)
        held.deliveryOrigin = origin
        held.status = .parked
        held.lastError = ScreenplayDraftSaveOutbox.loadServerDeferredReason
        let suite = "them.held-copy-preserves-page.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let deferred = DeferredFailingSavePreflight()
        let previousSharedID = BackendAuthClient.sharedUserID()
        XCTAssertTrue(BackendAuthClient.persistSharedUserID(owner.userID))
        defer {
            if let previousSharedID { _ = BackendAuthClient.persistSharedUserID(previousSharedID) }
            else { BackendAuthClient.clearSharedUserID() }
        }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery,
            recoveryOriginProvider: { $0 == "project-1" ? origin : nil }, draftSaveOutbox: queue,
            savePreflightProjectLoader: { _ in try await deferred.load() })
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        model.selectedProject = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
            from: JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
                "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Server words"]]]))
        model.applyStructuralUITestDraft("Server words", versionID: "")
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        let newer = "  Newer page words\r\n"
        model.fountainDraft = newer
        model.noteManualDraftEdit()
        let save = Task { await model.manualSaveDraft() }
        await fulfillment(of: [deferred.started], timeout: 2)
        try await queue.enqueue(held)
        model.heldDraftRecovery = held
        await model.recoverHeldDraftSave()
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(newer.utf8))
        XCTAssertEqual(model.heldDraftRecovery, held)
        XCTAssertTrue(model.errorText.contains("save is still in progress"))
        deferred.continuation?.resume(throwing: URLError(.notConnectedToInternet))
        await save.value
        let retained = try await queue.entriesForTesting()
        XCTAssertTrue(retained.contains { $0.id == held.id && $0.draft == held.draft })
    }

    @MainActor
    func testRestoringHeldCopyStopsWhenRecoveryStorageIsFull() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let owner = ScreenplayStudioAuthContext.current()
        XCTAssertTrue(ScreenplayLiveDraftBridge.shared.adoptLoadedProjectDraft("Server words", projectID: "project-1",
                                                                             versionID: "remote", owner: owner))
        let documentID = try XCTUnwrap(ScreenplayLiveDraftBridge.shared.draftOrigin.documentID)
        let origin = ScreenplayDraftSaveOrigin(documentID: documentID, backendURL: BackendAuthClient.resolvedBackendBaseURL())
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        var held = replacingOwner(of: makeEntry(id: "held", draft: "Earlier held words\n"), with: owner.userID)
        held.deliveryOrigin = origin
        held.status = .parked
        held.lastError = ScreenplayDraftSaveOutbox.loadServerDeferredReason
        try await queue.enqueue(held)
        let suite = "them.held-copy-preserves-page.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let blockedRoot = storageDirectory.appendingPathComponent("blocked-overflow")
        try Data("occupied".utf8).write(to: blockedRoot)
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery,
            overflowRecoveryStore: ScreenplayRecoveryOverflowStore(rootDirectory: blockedRoot),
            recoveryOriginProvider: { $0 == "project-1" ? origin : nil }, draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        model.selectedProject = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
            from: JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
                "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Server words"]]]))
        model.applyStructuralUITestDraft("Server words", versionID: "remote")
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        let newer = "  Newer page words\r\n"
        model.fountainDraft = newer
        model.noteManualDraftEdit()
        recovery.savePreservedConflict(ownerUserId: owner.userID, projectId: held.projectId,
                                       draft: "Another preserved draft", baseVersionId: "other")
        model.heldDraftRecovery = held
        await model.recoverHeldDraftSave()
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(newer.utf8))
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertEqual(model.heldDraftRecovery, held)
        XCTAssertTrue(model.errorText.contains("could not be secured"))
        let reopened = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        XCTAssertEqual(reopened.dirtyOrdinarySnapshot(ownerUserId: owner.userID, projectId: held.projectId)?.draft, newer)
        XCTAssertEqual(reopened.currentPreservedConflict(ownerUserId: owner.userID, projectId: held.projectId)?.draft, "Another preserved draft")
        let retained = try await ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory).entriesForTesting()
        XCTAssertEqual(retained.first?.draft, held.draft)
        XCTAssertEqual(retained.first?.status, .parked)
    }

    @MainActor
    func testWhitespaceOnlyServerDifferenceCannotDiscardRawWriterCopy() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let owner = ScreenplayStudioAuthContext.current()
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let raw = "Writer words\n"
        var entry = replacingOwner(of: makeEntry(id: "writer", draft: raw), with: owner.userID)
        entry.deliveryOrigin = .init(documentID: "whitespace-document", backendURL: BackendAuthClient.resolvedBackendBaseURL())
        XCTAssertTrue(ScreenplayLiveDraftBridge.shared.adoptLoadedProjectDraft(raw, projectID: entry.projectId,
            versionID: entry.baseVersionId, owner: owner, queuedEntry: entry))
        try await queue.enqueue(entry)
        _ = try await queue.retainConflict(entry)
        let suite = "them.whitespace-conflict.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        XCTAssertTrue(recovery.save(ownerUserId: owner.userID, projectId: entry.projectId, draft: raw,
                                    baseVersionId: entry.baseVersionId, dirty: true))
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.selectedProjectID = "project-1"
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Writer words"]]])
        let applied = await model.hydrateDraftRestoringQueuedSaves(from: try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
        XCTAssertTrue(applied)
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(raw.utf8))
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertNotNil(model.conflictState)
        let copies = try await queue.entriesForTesting()
        XCTAssertEqual(copies.map(\.draft), [raw])
        XCTAssertEqual(copies.first?.status, .parked)
    }

    @MainActor
    func testMissingServerFetchFailurePreservesConflictAndDurableWords() async throws {
        try await exerciseDelayedServerChoice(representConflict: false, failRead: true)
    }

    @MainActor
    func testMatchingServerTextDoesNotRetireUnscopedParkedCopy() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let owner = ScreenplayStudioAuthContext.current().userID
        XCTAssertTrue(ScreenplayLiveDraftBridge.shared.adoptLoadedProjectDraft("Current page", projectID: "project-1",
            versionID: "current", owner: .current()))
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let raw = "  Writer words\r\n"
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "writer", draft: raw), with: owner))
        _ = try await queue.retainConflict(projectId: "project-1", ownerUserId: owner, deliveryOrigin: nil)
        let suite = "them.confirmed-conflict.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"), draftSaveOutbox: queue)
        model.selectedProjectID = "project-1"
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "confirmed", "versions": [["id": "confirmed", "draft": raw]]])
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data)
        let applied = await model.hydrateDraftRestoringQueuedSaves(from: project)
        XCTAssertFalse(applied)
        XCTAssertEqual(model.heldDraftRecovery?.draft, raw)
        let reviewResult = await model.confirmedHeldDraftRecoveryForReview()
        let review = try XCTUnwrap(reviewResult)
        XCTAssertEqual(model.heldDraftRecoveryForReview(review)?.draft, raw)
        let copies = try await ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory).entriesForTesting()
        XCTAssertEqual(copies.first?.draft, raw)
        XCTAssertEqual(copies.first?.status, .parked)
    }

    func testFailedConflictPersistenceAndDiscardNeverDropTheInMemoryCopies() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let origin = ScreenplayDraftSaveOrigin(documentID: "writer-doc", backendURL: URL(string: "https://save.test")!)
        let writer = makeEntry(id: "writer", origin: origin)
        try await store.enqueue(writer)
        _ = try await store.retainConflict(writer)
        let selection = try await store.captureLoadServerSelection(projectId: "project-1", ownerUserId: "user-1",
            deliveryOrigin: origin, explicitRequests: [writer])
        let before = try await store.entriesForTesting()
        let manifest = storageDirectory.appendingPathComponent("queue.json")
        try FileManager.default.moveItem(at: manifest, to: storageDirectory.appendingPathComponent("original.json"))
        try FileManager.default.createDirectory(at: manifest, withIntermediateDirectories: false)
        do {
            _ = try await store.retainConflict(writer)
            XCTFail("Writing over a directory should fail")
        } catch {}
        do {
            _ = try await store.resolveLoadServerSelection(selection, serverVersionID: "confirmed")
            XCTFail("Discard must not report durability when the manifest cannot be written")
        } catch {}
        do {
            try await store.markSucceeded(id: "writer", serverVersionId: "confirmed", supersedesEarlierSaves: true)
            XCTFail("Acknowledgement cleanup must not report durability when the manifest cannot be written")
        } catch {}
        let after = try await store.entriesForTesting()
        XCTAssertEqual(after, before)
    }

    @MainActor
    func testConflictHandlerRejectsAnotherProjectOwnerAndSignInGeneration() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "private"), with: owner))
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: ScreenplayLocalDraftRecoveryStore(), draftSaveOutbox: queue)
        model.selectedProjectID = "project-1"
        let conflict = ScreenplayStudioViewModel.SaveConflictState(projectId: "project-1",
            baseVersionId: "base", serverVersionId: "remote", serverDraft: "Remote",
            serverDraftExcerpt: "Remote", serverUpdatedAt: 1)
        await model.handleDraftSaveConflict(conflict, ownerUserId: owner + "-other")
        XCTAssertNil(model.conflictState)
        let stale = ScreenplayStudioAuthContext(userID: owner,
            sessionIntentGeneration: BackendAuthClient.currentAuthSessionIntentGeneration() + 1)
        await model.handleDraftSaveConflict(conflict, ownerUserId: owner, expectedContext: stale)
        XCTAssertNil(model.conflictState)
        model.selectedProjectID = "other-project"
        await model.handleDraftSaveConflict(conflict, ownerUserId: owner)
        XCTAssertNil(model.conflictState)
        let entries = try await queue.entriesForTesting()
        XCTAssertEqual(entries.first?.status, .pending)
    }

    @MainActor
    func testUnscopedRelaunchKeepsBothCopiesWithoutAutomaticAdoption() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "older", draft: "Submitted words", createdAt: 100), with: owner))
        _ = try await queue.retainConflict(projectId: "project-1", ownerUserId: owner, deliveryOrigin: nil)
        let suite = "them.conflict-relaunch.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        recovery.save(ownerUserId: owner, projectId: "project-1", draft: "  Newer writer words\r\n",
                      baseVersionId: "base-newer", dirty: true, savedAt: 200)
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.selectedProjectID = "project-1"
        model.fountainDraft = ""
        let applied = await model.restorePendingDraftSaveBeforeProjectHydration()
        XCTAssertTrue(applied, "The initial load may continue to the verified server read.")
        XCTAssertEqual(model.autosaveStatusText, "Restoring save conflict")
        XCTAssertEqual(model.fountainDraft, "")
        XCTAssertEqual(model.latestVersionID, "")
        XCTAssertEqual(recovery.payloads(ownerUserId: owner)["project-1"]?["draft"] as? String, "  Newer writer words\r\n")
        let copies = try await queue.entriesForTesting()
        XCTAssertEqual(copies.map(\.draft), ["Submitted words"])
        XCTAssertEqual(copies.first?.status, .parked)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testRealConflictHandlerRecoversQueuedWordsWhenEditorWasHydratedFromServer() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let context = ScreenplayStudioAuthContext.current()
        let owner = context.userID
        XCTAssertTrue(ScreenplayLiveDraftBridge.shared.adoptLoadedProjectDraft("Collaborator draft", projectID: "project-1", versionID: "remote", owner: context))
        let documentID = try XCTUnwrap(ScreenplayLiveDraftBridge.shared.draftOrigin.documentID)
        let origin = ScreenplayDraftSaveOrigin(documentID: documentID, backendURL: BackendAuthClient.resolvedBackendBaseURL())
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let local = "  INT. ROOM - NIGHT\r\n\r\nWriter words.\r\n"
        var entry = replacingOwner(of: makeEntry(id: "writer", draft: local), with: owner)
        entry.deliveryOrigin = origin
        try await queue.enqueue(entry)
        let suite = "them.conflict-handler.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery,
            recoveryOriginProvider: { $0 == "project-1" ? origin : nil }, draftSaveOutbox: queue)
        model.selectedProjectID = "project-1"
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        model.applyStructuralUITestDraft("Collaborator draft", versionID: "remote")
        let conflict = ScreenplayStudioViewModel.SaveConflictState(projectId: "project-1",
            baseVersionId: "server-v1", serverVersionId: "remote", serverDraft: "Collaborator draft",
            serverDraftExcerpt: "Collaborator draft", serverUpdatedAt: 1)
        await model.handleDraftSaveConflict(conflict, ownerUserId: owner)
        XCTAssertEqual(model.fountainDraft, local)
        XCTAssertEqual(model.conflictState, conflict)
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertEqual(model.parkedDraftSaveCount, 1)
        XCTAssertEqual(recovery.payloads(ownerUserId: owner)["project-1"]?["draft"] as? String, local)
        let relaunched = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let copies = try await relaunched.entriesForTesting()
        XCTAssertEqual(copies.map(\.draft), [local])
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testRealConflictHandlerKeepsNewerEditorWorkAndAllSubmittedCopies() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let context = ScreenplayStudioAuthContext.current()
        let owner = context.userID
        XCTAssertTrue(ScreenplayLiveDraftBridge.shared.adoptLoadedProjectDraft("Collaborator draft", projectID: "project-1", versionID: "remote", owner: context))
        let documentID = try XCTUnwrap(ScreenplayLiveDraftBridge.shared.draftOrigin.documentID)
        let origin = ScreenplayDraftSaveOrigin(documentID: documentID, backendURL: BackendAuthClient.resolvedBackendBaseURL())
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        var entry = replacingOwner(of: makeEntry(id: "submitted", draft: "Submitted words"), with: owner)
        entry.deliveryOrigin = origin
        try await queue.enqueue(entry)
        let suite = "them.conflict-handler.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery,
            recoveryOriginProvider: { $0 == "project-1" ? origin : nil }, draftSaveOutbox: queue)
        model.selectedProjectID = "project-1"
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        model.applyStructuralUITestDraft("Collaborator draft", versionID: "remote")
        model.fountainDraft = "Newer writer edits"
        model.noteManualDraftEdit()
        let conflict = ScreenplayStudioViewModel.SaveConflictState(projectId: "project-1",
            baseVersionId: "server-v1", serverVersionId: "remote", serverDraft: "Collaborator draft",
            serverDraftExcerpt: "Collaborator draft", serverUpdatedAt: 1)
        await model.handleDraftSaveConflict(conflict, ownerUserId: owner)
        XCTAssertEqual(model.fountainDraft, "Newer writer edits")
        XCTAssertEqual(recovery.payloads(ownerUserId: owner)["project-1"]?["draft"] as? String, "Newer writer edits")
        let copies = try await queue.entriesForTesting()
        XCTAssertEqual(copies.map(\.draft), ["Submitted words"])
        XCTAssertEqual(copies.first?.status, .parked)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    func testConflictRetainsEveryDraftAcrossRelaunchWithoutAutomaticReplay() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let first = makeEntry(id: "first", draft: "  First draft\r\n", createdAt: 100)
        let newest = makeEntry(id: "newest", draft: "Newest draft\n", createdAt: 101)
        try await store.enqueue(first)
        try await store.enqueue(newest)
        let retained = try await store.retainConflict(projectId: "project-1", ownerUserId: "user-1", deliveryOrigin: nil)
        XCTAssertEqual(retained?.draft, newest.draft)
        let relaunched = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entries = try await relaunched.entriesForTesting()
        XCTAssertEqual(entries.map(\.draft), [first.draft, newest.draft])
        XCTAssertTrue(entries.allSatisfy { $0.status == .parked })
        let retry = try await relaunched.beginNext(projectId: "project-1", ownerUserId: "user-1", force: true)
        XCTAssertNil(retry)
        let runnable = try await relaunched.pendingEntry(projectId: "project-1", ownerUserId: "user-1")
        XCTAssertNil(runnable, "Parked unscoped drafts cannot be delivered automatically.")
        let held = try await relaunched.parkedConflictEntries(projectId: "project-1", ownerUserId: "user-1")
        XCTAssertEqual(held.map { Data($0.draft.utf8) }, [Data(first.draft.utf8), Data(newest.draft.utf8)])
    }

    func testLegacyBroadAcknowledgementCannotRetireOrRebaseUnrelatedCopies() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "old", createdAt: 100))
        try await store.enqueue(replacingOwner(of: makeEntry(id: "private", createdAt: 100), with: "user-2"))
        _ = try await store.retainConflict(projectId: "project-1", ownerUserId: "user-1", deliveryOrigin: nil)
        try await store.enqueue(makeEntry(id: "choice", draft: "Chosen draft", createdAt: 102))
        try await store.enqueue(makeEntry(id: "newer-edit", draft: "Newer edit", createdAt: 103))
        let before = try await store.entriesForTesting()
        XCTAssertEqual(before.count, 4)
        try await store.markSucceeded(id: "choice", serverVersionId: "confirmed",
                                      supersedesEarlierSaves: true)
        let after = try await store.entriesForTesting()
        XCTAssertEqual(Set(after.map(\.id)), ["old", "private", "newer-edit"])
        XCTAssertEqual(after.first { $0.id == "old" }?.status, .parked)
        XCTAssertEqual(after.first { $0.id == "newer-edit" }?.baseVersionId, "server-v1")
        XCTAssertEqual(after.first { $0.id == "newer-edit" }?.status, .parked,
                       "A legacy follower without proven lineage requires review.")
    }

    func testStaleAcknowledgementCannotRetireNewlyParkedConflict() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let older = makeEntry(id: "older", draft: "Original writer words", createdAt: 100)
        let choice = makeEntry(id: "choice", draft: "Chosen writer words", createdAt: 101,
                               source: "studio_conflict_resolve")
        try await store.enqueue(older)
        try await store.enqueue(choice)
        try await store.markInflight(id: choice.id)
        _ = try await store.retainConflict(projectId: choice.projectId, ownerUserId: choice.ownerUserId, deliveryOrigin: nil)
        let retired = try await store.markSucceeded(id: choice.id, serverVersionId: "server-v2",
                                                     supersedesEarlierSaves: true, requireInflight: true)
        XCTAssertFalse(retired)
        let reopened = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entries = try await reopened.entriesForTesting()
        XCTAssertEqual(entries.map(\.draft), [older.draft, choice.draft])
        XCTAssertTrue(entries.allSatisfy { $0.status == .parked })
    }

    func testExplicitServerChoiceCannotDiscardOtherOwnerOrLaterConflict() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let origin = ScreenplayDraftSaveOrigin(documentID: "selection-doc", backendURL: URL(string: "https://save.test")!)
        let old = makeEntry(id: "old", createdAt: 100, origin: origin)
        try await store.enqueue(old)
        try await store.enqueue(makeEntry(id: "later", draft: "Later writer text", createdAt: 200, origin: origin))
        try await store.enqueue(replacingOwner(of: makeEntry(id: "private", createdAt: 100, origin: origin), with: "user-2"))
        _ = try await store.retainConflict(projectId: "project-1", ownerUserId: "user-1", deliveryOrigin: origin)
        let selection = try await store.captureLoadServerSelection(projectId: "project-1", ownerUserId: "user-1",
            deliveryOrigin: origin, explicitRequests: [old])
        _ = try await store.resolveLoadServerSelection(selection, serverVersionID: "server-v2")
        let after = try await store.entriesForTesting()
        XCTAssertEqual(Set(after.map(\.id)), ["private", "later"])
    }

    func testHeldSaveIsPersistedSeparatelyFromAnIdenticalRunnableSave() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let active = makeDeliverableEntry(id: "active", draft: "Exact writer words", createdAt: 100)
        var held = makeEntry(id: "held", draft: active.draft, createdAt: 101)
        held.deliveryOrigin = active.deliveryOrigin
        held.status = .parked
        held.nextAttemptAt = 0
        held.lastError = "Writer choice required"
        try await queue.enqueue(active)
        try await queue.enqueue(held)

        let reopened = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let stored = try await reopened.entriesForTesting()
        XCTAssertEqual(stored, [active, held], "Same text is not permission to drop a separate held intent.")
        let next = try await reopened.beginNext(projectId: active.projectId, ownerUserId: active.ownerUserId, deliveryOrigin: active.deliveryOrigin, force: true)
        XCTAssertEqual(next?.id, active.id)
        try await reopened.remove(id: active.id)
        let replay = try await reopened.beginNext(projectId: held.projectId, ownerUserId: held.ownerUserId, force: true)
        XCTAssertNil(replay, "Even force-reconnect must not automatically submit held writer words.")
    }

    func testExistingIdentifierCanBeHeldInOneDurableWrite() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        var held = makeEntry(id: "existing")
        try await queue.enqueue(held)
        held.status = .parked
        held.nextAttemptAt = 0
        held.lastError = "Writer choice required"
        try await queue.enqueue(held)
        let reopened = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let stored = try await reopened.entriesForTesting()
        XCTAssertEqual(stored, [held])
        let replay = try await reopened.beginNext(projectId: held.projectId, ownerUserId: held.ownerUserId, force: true)
        XCTAssertNil(replay)
    }

    func testFailedHeldWriteDoesNotLeaveAnInMemorySaveThatWasNeverPersisted() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let active = makeEntry(id: "active")
        try await queue.enqueue(active)
        let manifest = storageDirectory.appendingPathComponent("queue.json")
        // Break only this test's owned destination; exercise a real write failure.
        try FileManager.default.removeItem(at: manifest)
        try FileManager.default.createDirectory(at: manifest, withIntermediateDirectories: false)
        var held = makeEntry(id: "held", draft: "Held writer words")
        held.status = .parked
        do {
            try await queue.enqueue(held)
            XCTFail("A failed disk write must not report durable retention.")
        } catch {}
        let stored = try await queue.entriesForTesting()
        XCTAssertEqual(stored, [active], "Memory must roll back when durable admission fails.")
    }

    func testFailedQueueTransitionsRollBackInMemory() async throws {
        for operation in ["begin", "inflight", "retry", "park", "remove", "removeAll"] {
            let directory = storageDirectory.appendingPathComponent(operation, isDirectory: true)
            let queue = ScreenplayDraftSaveOutbox(storageDirectory: directory)
            let original = makeDeliverableEntry(id: "writer", draft: "Exact writer words")
            try await queue.enqueue(original)
            let manifest = directory.appendingPathComponent("queue.json")
            try FileManager.default.removeItem(at: manifest)
            try FileManager.default.createDirectory(at: manifest, withIntermediateDirectories: false)
            do {
                switch operation {
                case "begin": _ = try await queue.beginNext(projectId: original.projectId,
                    ownerUserId: original.ownerUserId, deliveryOrigin: original.deliveryOrigin, force: true)
                case "inflight": try await queue.markInflight(id: original.id)
                case "retry": try await queue.markRetryable(id: original.id, error: "offline")
                case "park": try await queue.markParked(id: original.id, error: "held")
                case "remove": try await queue.remove(id: original.id)
                default: try await queue.removeAll(projectId: original.projectId, ownerUserId: original.ownerUserId)
                }
                XCTFail("\(operation) must report its failed durable write")
            } catch {}
            let retained = try await queue.entriesForTesting()
            XCTAssertEqual(retained, [original], "\(operation) must not mutate the in-memory queue on write failure")
        }
    }

    func testQueuedConflictChoiceIsParkedInsteadOfReplayed() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entry = makeEntry(id: "choice", draft: "Exact local words", source: "studio_conflict_resolve")
        try await queue.enqueue(entry)
        let next = try await queue.beginNext(projectId: entry.projectId, ownerUserId: entry.ownerUserId, force: true)
        XCTAssertNil(next)
        let reopened = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let saved = try await reopened.entriesForTesting()
        XCTAssertEqual(saved.first?.status, .parked)
        XCTAssertEqual(saved.first?.draft, entry.draft)
        XCTAssertEqual(saved.first?.baseVersionId, entry.baseVersionId)
        let recoverable = try await reopened.pendingEntry(projectId: entry.projectId, ownerUserId: entry.ownerUserId)
        XCTAssertNil(recoverable, "A held decision cannot be automatically replayed")
        let held = try await reopened.parkedConflictEntries(projectId: entry.projectId, ownerUserId: entry.ownerUserId)
        XCTAssertEqual(held.map { Data($0.draft.utf8) }, [Data(entry.draft.utf8)])
    }

    func testNewerUnscopedConflictFencesEarlierScopedSaveBeforeRelaunch() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let earlier = makeDeliverableEntry(id: "earlier", draft: "Earlier writer words", createdAt: 100)
        let legacy = makeEntry(id: "legacy-choice", draft: "Newer conflict words\n", createdAt: 200,
                               source: "studio_conflict_resolve")
        try await queue.enqueue(earlier)
        try await queue.enqueue(legacy)
        let next = try await queue.beginNext(projectId: earlier.projectId, ownerUserId: earlier.ownerUserId,
                                             deliveryOrigin: earlier.deliveryOrigin, force: true)
        XCTAssertNil(next)
        let reopened = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let rows = try await reopened.entriesForTesting()
        XCTAssertEqual(rows.first(where: { $0.id == earlier.id })?.status, .pending)
        XCTAssertEqual(rows.first(where: { $0.id == earlier.id })?.draft, earlier.draft)
        XCTAssertEqual(rows.first(where: { $0.id == legacy.id })?.status, .parked)
        XCTAssertEqual(rows.first(where: { $0.id == legacy.id })?.draft, legacy.draft)
    }

    func testFailedUnscopedConflictFenceDoesNotClaimOrMutateQueue() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let earlier = makeDeliverableEntry(id: "earlier", draft: "Earlier words", createdAt: 100)
        let legacy = makeEntry(id: "legacy-choice", draft: "Conflict words", createdAt: 200,
                               source: "studio_conflict_resolve")
        try await queue.enqueue(earlier)
        try await queue.enqueue(legacy)
        let before = try await queue.entriesForTesting()
        let manifest = storageDirectory.appendingPathComponent("queue.json")
        try FileManager.default.moveItem(at: manifest, to: storageDirectory.appendingPathComponent("original-queue.json"))
        try FileManager.default.createDirectory(at: manifest, withIntermediateDirectories: false)
        do {
            _ = try await queue.beginNext(projectId: earlier.projectId, ownerUserId: earlier.ownerUserId,
                                          deliveryOrigin: earlier.deliveryOrigin, force: true)
            XCTFail("A failed conflict hold must be reported")
        } catch {}
        let after = try await queue.entriesForTesting()
        XCTAssertEqual(after, before)
    }

    func testUnscopedPendingConflictChoiceFencesLaterScopedSaveAfterRelaunch() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let legacy = makeEntry(id: "legacy-choice", draft: "Original conflict words\n", source: "studio_conflict_resolve")
        let later = makeDeliverableEntry(id: "later", draft: "Later writer words", createdAt: 200)
        try await queue.enqueue(legacy)
        try await queue.enqueue(later)
        let reopened = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let next = try await reopened.beginNext(projectId: later.projectId, ownerUserId: later.ownerUserId,
                                                deliveryOrigin: later.deliveryOrigin, force: true)
        XCTAssertNil(next)
        let rows = try await reopened.entriesForTesting()
        XCTAssertEqual(rows.first(where: { $0.id == legacy.id })?.status, .parked)
        XCTAssertEqual(rows.first(where: { $0.id == legacy.id })?.draft, legacy.draft)
        XCTAssertEqual(rows.first(where: { $0.id == later.id })?.status, .pending)
        XCTAssertEqual(rows.first(where: { $0.id == later.id })?.draft, later.draft)
    }

    func testInterruptedConflictChoiceIsParkedOnRelaunch() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entry = makeEntry(id: "choice", source: "studio_conflict_resolve")
        try await queue.enqueue(entry)
        try await queue.markInflight(id: entry.id)
        let reopened = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let saved = try await reopened.entriesForTesting()
        XCTAssertEqual(saved.first?.status, .parked)
        let recoverable = try await reopened.pendingEntry(projectId: entry.projectId, ownerUserId: entry.ownerUserId)
        XCTAssertNil(recoverable, "A held decision cannot be automatically replayed")
        let held = try await reopened.parkedConflictEntries(projectId: entry.projectId, ownerUserId: entry.ownerUserId)
        XCTAssertEqual(held.map { Data($0.draft.utf8) }, [Data(entry.draft.utf8)])
        let next = try await reopened.beginNext(projectId: entry.projectId, ownerUserId: entry.ownerUserId, force: true)
        XCTAssertNil(next)
    }

    func testFailedConflictChoiceRequiresRenewedConfirmation() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entry = makeEntry(id: "choice", source: "studio_conflict_resolve")
        try await queue.enqueue(entry)
        try await queue.markRetryable(id: entry.id, error: "offline")
        let saved = try await queue.entriesForTesting()
        XCTAssertEqual(saved.first?.status, .parked)
        let reopened = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let recoverable = try await reopened.pendingEntry(projectId: entry.projectId, ownerUserId: entry.ownerUserId)
        XCTAssertNil(recoverable, "A held decision cannot be automatically replayed")
        let held = try await reopened.parkedConflictEntries(projectId: entry.projectId, ownerUserId: entry.ownerUserId)
        XCTAssertEqual(held.map { Data($0.draft.utf8) }, [Data(entry.draft.utf8)])
        let next = try await queue.beginNext(projectId: entry.projectId, ownerUserId: entry.ownerUserId, force: true)
        XCTAssertNil(next)
    }

    @MainActor
    func testClearedManualPageIsRecoverableBeforeDebounce() async throws {
        let owner = ScreenplayStudioAuthContext.current()
        let suite = "them.immediate-clear.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store,
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory))
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        model.applyStructuralUITestDraft("Server baseline", versionID: "base")
        model.fountainDraft = ""
        model.noteManualDraftEdit()
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        let reloaded = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        XCTAssertEqual(reloaded.recoverySnapshot(ownerUserId: owner.userID, projectId: "project-1",
            serverDraft: "Server baseline")?.draft, "")
    }

    @MainActor
    func testHydrationRestoresAcknowledgedEmptyVersion() async throws {
        let suite = "them.empty-version-hydration.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: .init(defaults: defaults, key: "recovery"),
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory))
        model.autosaveEnabled = false
        model.selectedProjectID = "empty-project"
        let payload = try JSONSerialization.data(withJSONObject: ["id": "empty-project", "title": "Test",
            "activeVersionId": "empty-version", "versionCount": 2,
            "versions": [["id": "empty-version", "projectId": "empty-project", "draft": ""],
                         ["id": "old-version", "projectId": "empty-project", "draft": "Old words"]]])
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: payload)
        let hydrated = await model.hydrateDraftRestoringQueuedSaves(from: project)
        XCTAssertTrue(hydrated)
        XCTAssertEqual(model.fountainDraft, "")
        XCTAssertEqual(model.latestVersionID, "empty-version")
        XCTAssertFalse(model.hasUnsavedDraftChanges)
    }

    @MainActor
    func testInitialQueueWriteFailureDoesNotOverwriteDifferentRecovery() async throws {
        let owner = ScreenplayStudioAuthContext.current()
        let suite = "them.admission-failure.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let writeAttempt = storageDirectory.appendingPathComponent("write-attempt")
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory,
            manifestWriter: { _, _ in
                try Data().write(to: writeAttempt)
                throw NSError(domain: "queue-write-fixture", code: 1)
            })
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store, draftSaveOutbox: queue)
        model.autosaveEnabled = false
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
            from: Data("{\"id\":\"project-1\",\"title\":\"Test\"}".utf8))
        model.selectedProjectID = project.id
        model.selectedProject = project
        model.applyStructuralUITestDraft("Server baseline", versionID: "base")
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        defer { ScreenplayLiveDraftSyncService.shared.detach() }
        let page = "Newer page cafe\u{301}. \r\n"
        model.fountainDraft = page
        model.hasUnsavedDraftChanges = true
        store.save(ownerUserId: owner.userID, projectId: project.id,
            draft: "Earlier distinct recovery", baseVersionId: "other-base", dirty: true)
        store.savePreservedConflict(ownerUserId: owner.userID, projectId: project.id,
            draft: "Another preserved copy", baseVersionId: "preserved-base")
        await model.manualSaveDraft()
        XCTAssertTrue(FileManager.default.fileExists(atPath: writeAttempt.path), "The injected manifest write was not reached")
        let saved = store.payloads(ownerUserId: owner.userID)[project.id]
        XCTAssertEqual(saved?["draft"] as? String, "Earlier distinct recovery")
        XCTAssertEqual((saved?["preservedConflict"] as? [String: Any])?["draft"] as? String, "Another preserved copy")
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(page.utf8))
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertEqual(model.autosaveStatusText, "Save needs attention")
        XCTAssertTrue(model.infoText.contains("may not survive"))
        XCTAssertTrue(model.errorText.contains("could not be secured"))
    }

    @MainActor
    func testClearPageRefusesDurableQueuedSave() async throws {
        let owner = ScreenplayStudioAuthContext.current()
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entry = replacingOwner(of: makeEntry(id: "queued-before-clear", draft: "Queued writer words"), with: owner.userID)
        try await queue.enqueue(entry)
        let suite = "them.clear-queued.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: .init(defaults: defaults, key: "recovery"),
            draftSaveOutbox: queue)
        model.selectedProjectID = entry.projectId
        model.fountainDraft = "Current writer words"
        let cleared = await model.clearDraft()
        XCTAssertFalse(cleared)
        XCTAssertEqual(model.fountainDraft, "Current writer words")
        let retained = try await queue.entriesForTesting()
        XCTAssertEqual(retained.map(\.id), [entry.id])
        XCTAssertTrue(model.errorText.contains("local save"))
    }

    func testAnonymousLegacyConflictCanOnlyParkAnExactDurableRow() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entry = replacingOwner(of: makeEntry(id: "anonymous-conflict", draft: "Exact local words"), with: "")
        do {
            _ = try await queue.retainConflict(entry)
            XCTFail("An absent anonymous row must not be manufactured")
        } catch {}
        try await queue.enqueue(entry)
        let retained = try await queue.retainConflict(entry)
        XCTAssertEqual(retained?.status, .parked)
        XCTAssertEqual(retained.map { Data($0.draft.utf8) }, Data(entry.draft.utf8))
        var different = entry
        different.baseVersionId = "different-base"
        do {
            _ = try await queue.retainConflict(different)
            XCTFail("A changed anonymous row must not be parked by stale authority")
        } catch {}
        for foreignOwner in ["other-owner", " "] {
            let foreign = replacingOwner(of: entry, with: foreignOwner)
            do {
                _ = try await queue.retainConflict(foreign)
                XCTFail("A different owner must not park this row")
            } catch {}
        }
        do {
            _ = try await queue.captureInteractiveLoadServerSelection(root: entry)
            XCTFail("Anonymous legacy rows must not authorize deletion")
        } catch {}
        let rows = try await queue.entriesForTesting()
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows.first?.ownerUserId, "")
        XCTAssertEqual(rows.first?.baseVersionId, entry.baseVersionId)
        XCTAssertEqual(rows.first?.status, .parked)
    }

    @MainActor
    func testUnassignedRecoveryInventoryPreservesManifestAndExactWords() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let words = "\r\nINT. CAFE - NIGHT\r\nCafe\u{301} stays.  \t"
        var payload = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(
            makeEntry(id: "held", draft: words, authority: .init(id: UUID(), generation: 7)))) as? [String: Any])
        payload["notes"] = "Writer note  \r\n"
        payload["source"] = "studio_manual"
        payload["studioWriteAnchors"] = [["writeId": "write-1", "anchorLine": 2]]
        payload["screenplayBindings"] = [["draftSceneId": "scene-1", "outlineSceneId": "outline-1"]]
        var held = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: payload))
        held.status = .parked
        held.retries = 3
        held.lastError = "Held for recovery"
        held.supersededConflictRequests = [.init(requestID: "older", projectId: held.projectId,
            ownerUserId: held.ownerUserId, deliveryOrigin: nil, requestAuthority: nil,
            requestDigest: String(repeating: "a", count: 64))]
        let valid = makeDeliverableEntry(id: "valid", draft: "Current page", createdAt: 101)
        try await queue.enqueue(held)
        try await queue.enqueue(valid)
        let manifest = storageDirectory.appendingPathComponent("queue.json")
        let before = try Data(contentsOf: manifest)
        let records = try await queue.unassignedRecoveryEntries()
        XCTAssertEqual(records.map(\.id), [held.id])
        XCTAssertEqual(records.first.map { Data($0.draft.utf8) }, Data(words.utf8))
        XCTAssertEqual(try Data(contentsOf: manifest), before)
        guard case .available(let sources, let unconfirmed) = await queue.captureUnassignedRecoverySources() else {
            return XCTFail("Held evidence should be capturable")
        }
        XCTAssertEqual(unconfirmed, 0)
        XCTAssertEqual(sources.count, 1)
        XCTAssertEqual(sources.first?.slot, .draftSaveOutbox)
        let decoded = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: try XCTUnwrap(sources.first?.payload))
        XCTAssertEqual(Data(decoded.draft.utf8), Data(words.utf8))
        XCTAssertEqual(decoded, held)
        let vault = UnassignedLegacyRecoveryVault(rootDirectory: storageDirectory.appendingPathComponent("held-vault"))
        let source = try XCTUnwrap(sources.first)
        let descriptor: UnassignedLegacyRecoveryDescriptor
        switch vault.preserve(source) {
        case .verified(let saved), .alreadyVerified(let saved): descriptor = saved
        case .unconfirmed: return XCTFail("Held evidence was not secured")
        }
        XCTAssertEqual(descriptor.provenance, "unassigned_draft_save_origin")
        guard case .available(let artifact) = vault.export(recordID: descriptor.recordID) else {
            return XCTFail("Secured evidence must be exportable")
        }
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: artifact.data) as? [String: Any])
        XCTAssertEqual(json["provenance"] as? String, "unassigned_draft_save_origin")
        let encodedPayload = try XCTUnwrap(json["sourcePayload"] as? String)
        let exportedPayload = try XCTUnwrap(Data(base64Encoded: encodedPayload))
        XCTAssertEqual(exportedPayload, source.payload)
        let exported = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self, from: exportedPayload)
        XCTAssertEqual(Data(exported.draft.utf8), Data(words.utf8))
        XCTAssertEqual(exported, held)
        XCTAssertEqual(try Data(contentsOf: manifest), before)
    }

    func testUnassignedCaptureReportsMissingAndCorruptManifest() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        guard case .missing = await queue.captureUnassignedRecoverySources() else { return XCTFail("Missing queue must be distinct") }
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let manifest = storageDirectory.appendingPathComponent("queue.json")
        let corrupt = Data("not a queue".utf8)
        try corrupt.write(to: manifest)
        guard case .unconfirmed = await queue.captureUnassignedRecoverySources() else { return XCTFail("Unreadable queue must not be treated as empty") }
        XCTAssertEqual(try Data(contentsOf: manifest), corrupt)
    }

    func testDamagedRetirementMarkerIsUnconfirmedAndCannotLoadAsSave() async throws {
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let entry = makeDeliverableEntry(id: "damaged-marker", draft: "Retained evidence")
        var raw = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(entry)) as? [String: Any])
        raw["projectId"] = "load-server-retirement"
        let original = try JSONSerialization.data(withJSONObject: [raw], options: [.sortedKeys])
        let manifest = storageDirectory.appendingPathComponent("queue.json")
        try original.write(to: manifest)
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        guard case .available(let sources, let unconfirmed) = await queue.captureUnassignedRecoverySources() else {
            return XCTFail("A decoded marker-like row must remain unconfirmed")
        }
        XCTAssertTrue(sources.isEmpty)
        XCTAssertEqual(unconfirmed, 1)
        do {
            _ = try await queue.entriesForTesting()
            XCTFail("A damaged marker must not load as an ordinary save")
        } catch { }
        XCTAssertEqual(try Data(contentsOf: manifest), original)
    }

    func testOriginlessRowsStayLocalAndDoNotBlockProvenSaves() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let old = makeEntry(id: "legacy", draft: "Older unassigned words", createdAt: 100)
        let origin = ScreenplayDraftSaveOrigin(documentID: "document-a", backendURL: URL(string: "https://save.test")!)
        let proven = makeEntry(id: "proven", draft: "Current writer words", createdAt: 101, origin: origin)
        try await queue.enqueue(old)
        try await queue.enqueue(proven)
        let pending = try await queue.pendingEntry(projectId: old.projectId, ownerUserId: old.ownerUserId)
        XCTAssertEqual(pending?.id, proven.id)
        let snapshot = await queue.snapshot(ownerUserId: old.ownerUserId)
        XCTAssertEqual(snapshot.pendingCount, 1)
        XCTAssertEqual(snapshot.parkedCount, 1)
        let next = try await queue.beginNext(projectId: old.projectId, ownerUserId: old.ownerUserId, force: true)
        XCTAssertEqual(next?.id, proven.id)
        let kept = try await queue.entriesForTesting()
        XCTAssertEqual(kept.first(where: { $0.id == old.id })?.draft, old.draft)
        let delivery = try await queue.beginDelivery(old)
        guard case .parked(let held) = delivery else { return XCTFail("Originless row must not be delivered") }
        XCTAssertEqual(held.id, old.id)
    }

    func testMalformedOriginIsHeldWithoutBlockingValidSave() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let invalidOrigin = ScreenplayDraftSaveOrigin(documentID: "", backendURL: URL(string: "https://save.test")!)
        let validOrigin = ScreenplayDraftSaveOrigin(documentID: "document-a", backendURL: URL(string: "https://save.test")!)
        let held = makeEntry(id: "invalid", draft: "Keep these words", createdAt: 100, origin: invalidOrigin)
        let valid = makeEntry(id: "valid", draft: "Current words", createdAt: 101, origin: validOrigin)
        try await queue.enqueue(held)
        try await queue.enqueue(valid)
        let snapshot = await queue.snapshot(ownerUserId: held.ownerUserId)
        XCTAssertEqual(snapshot.parkedCount, 1)
        XCTAssertEqual(snapshot.pendingCount, 1)
        let pending = try await queue.pendingEntry(projectId: held.projectId, ownerUserId: held.ownerUserId)
        XCTAssertEqual(pending?.id, valid.id)
        let next = try await queue.beginNext(projectId: held.projectId, ownerUserId: held.ownerUserId, force: true)
        XCTAssertEqual(next?.id, valid.id)
        let delivery = try await queue.beginDelivery(held)
        guard case .parked(let preserved) = delivery else { return XCTFail("Invalid origin must be held") }
        XCTAssertEqual(preserved.draft, held.draft)
    }

    func testUnscopedConflictFencesLaterSaveWithoutDeletingEitherCopy() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let conflict = makeEntry(id: "legacy-conflict", draft: "Unassigned conflict words", createdAt: 100)
        let origin = ScreenplayDraftSaveOrigin(documentID: "document-a", backendURL: URL(string: "https://save.test")!)
        let later = makeEntry(id: "later", draft: "Later writer words", createdAt: 101, origin: origin)
        try await queue.enqueue(conflict)
        _ = try await queue.retainConflict(conflict)
        try await queue.enqueue(later)
        let next = try await queue.beginNext(projectId: conflict.projectId, ownerUserId: conflict.ownerUserId, force: true)
        XCTAssertNil(next)
        guard case .parked = try await queue.beginDelivery(later) else {
            return XCTFail("Direct delivery must not bypass an unscoped conflict")
        }
        let rows = try await queue.entriesForTesting()
        XCTAssertEqual(rows.map(\.draft), [conflict.draft, later.draft])
    }

    func testLaterUnscopedConflictDoesNotStrandEarlierClaimInflight() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let valid = makeDeliverableEntry(id: "earlier", draft: "Earlier words", createdAt: 100)
        let conflict = makeEntry(id: "later-conflict", draft: "Other words", createdAt: 101)
        try await queue.enqueue(valid)
        try await queue.enqueue(conflict)
        _ = try await queue.retainConflict(conflict)
        let next = try await queue.beginNext(projectId: valid.projectId, ownerUserId: valid.ownerUserId, force: true)
        XCTAssertNil(next)
        let rows = try await queue.entriesForTesting()
        XCTAssertEqual(rows.first(where: { $0.id == valid.id })?.status, .pending)
        XCTAssertEqual(rows.first(where: { $0.id == conflict.id })?.draft, conflict.draft)
    }

    func testConflictAppearingAfterClaimReturnsClaimToPending() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let valid = makeDeliverableEntry(id: "claimed", draft: "Claimed words", createdAt: 100)
        try await queue.enqueue(valid)
        let candidate = try await queue.beginNext(projectId: valid.projectId, ownerUserId: valid.ownerUserId, force: true)
        let claimed = try XCTUnwrap(candidate)
        let conflict = makeEntry(id: "new-conflict", draft: "Other words", createdAt: 101)
        try await queue.enqueue(conflict)
        _ = try await queue.retainConflict(conflict)
        guard case .parked = try await queue.beginDelivery(claimed, continuingInflightID: claimed.id) else {
            return XCTFail("A newly discovered unassigned conflict must block delivery")
        }
        let rows = try await queue.entriesForTesting()
        XCTAssertEqual(rows.first(where: { $0.id == valid.id })?.status, .pending)
        XCTAssertEqual(rows.first(where: { $0.id == valid.id })?.draft, valid.draft)
    }

    func testDirectDeliveryRespectsScopedConflictLineage() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let conflict = makeDeliverableEntry(id: "conflict", draft: "Conflict words", createdAt: 100)
        try await queue.enqueue(conflict)
        _ = try await queue.retainConflict(conflict)
        let unrelated = makeDeliverableEntry(id: "unrelated", draft: "Other words", createdAt: 103)
        guard case .parked = try await queue.beginDelivery(unrelated) else {
            return XCTFail("Unrelated direct save must not cross a parked conflict")
        }
        let references = try await queue.conflictResolutionReferences(for: conflict)
        var resolution = makeDeliverableEntry(id: "resolution", draft: "Chosen words", createdAt: 102)
        resolution.supersededConflictRequests = references
        guard case .deliver = try await queue.beginDelivery(resolution) else {
            return XCTFail("Exact linked resolution must be deliverable")
        }
        let rows = try await queue.entriesForTesting()
        XCTAssertEqual(rows.first(where: { $0.id == conflict.id })?.draft, conflict.draft)
        XCTAssertEqual(rows.first(where: { $0.id == unrelated.id })?.status, .pending)
    }

    func testDirectDeliveryCannotSkipEarlierPendingOrInflightSave() async throws {
        for earlierInflight in [false, true] {
            let directory = storageDirectory.appendingPathComponent("ordering-\(earlierInflight)")
            let queue = ScreenplayDraftSaveOutbox(storageDirectory: directory)
            let earlier = makeDeliverableEntry(id: "earlier", draft: "Earlier words", createdAt: 100)
            let later = makeDeliverableEntry(id: "later", draft: "Later words", createdAt: 101)
            try await queue.enqueue(earlier)
            if earlierInflight { try await queue.markInflight(id: earlier.id) }
            guard case .waiting = try await queue.beginDelivery(later) else {
                return XCTFail("Later words must wait for the earlier save")
            }
            let rows = try await queue.entriesForTesting()
            XCTAssertEqual(rows.first(where: { $0.id == earlier.id })?.status, earlierInflight ? .inflight : .pending)
            XCTAssertEqual(rows.first(where: { $0.id == later.id })?.status, .pending)
        }
    }

    func testNewerInflightSaveBlocksOlderDirectSave() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let inflight = makeDeliverableEntry(id: "inflight", draft: "Running words", createdAt: 101)
        let older = makeDeliverableEntry(id: "older", draft: "Earlier words", createdAt: 100)
        try await queue.enqueue(inflight)
        try await queue.markInflight(id: inflight.id)
        guard case .waiting = try await queue.beginDelivery(older) else {
            return XCTFail("A second save must wait while this document is inflight")
        }
        let next = try await queue.beginNext(projectId: older.projectId, ownerUserId: older.ownerUserId, force: true)
        XCTAssertNil(next)
        let rows = try await queue.entriesForTesting()
        XCTAssertEqual(rows.first(where: { $0.id == older.id })?.status, .pending)
        XCTAssertEqual(rows.first(where: { $0.id == inflight.id })?.status, .inflight)
    }

    func testDrainSelectsOnlyRequestedOriginAndReleasesExactClaim() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let other = ScreenplayDraftSaveOrigin(documentID: "other-doc", backendURL: URL(string: "https://other.test")!)
        let current = ScreenplayDraftSaveOrigin(documentID: "current-doc", backendURL: URL(string: "https://save.test")!)
        let foreign = makeDeliverableEntry(id: "foreign", draft: "Other document words", createdAt: 100, origin: other)
        let owned = makeDeliverableEntry(id: "owned", draft: "Current document words", createdAt: 101, origin: current)
        try await queue.enqueue(foreign)
        try await queue.enqueue(owned)
        let candidate = try await queue.beginNext(projectId: owned.projectId, ownerUserId: owned.ownerUserId,
                                                  deliveryOrigin: current, force: true)
        let claimed = try XCTUnwrap(candidate)
        XCTAssertEqual(claimed.id, owned.id)
        var different = claimed
        different.baseVersionId = "different-base"
        try await queue.releaseInflightClaim(different)
        let afterMismatch = try await queue.entriesForTesting()
        XCTAssertEqual(afterMismatch.first(where: { $0.id == owned.id })?.status, .inflight)
        try await queue.releaseInflightClaim(claimed)
        let rows = try await queue.entriesForTesting()
        XCTAssertEqual(rows.first(where: { $0.id == owned.id })?.status, .pending)
        XCTAssertEqual(rows.first(where: { $0.id == foreign.id })?.status, .pending)
        XCTAssertEqual(rows.first(where: { $0.id == foreign.id })?.draft, foreign.draft)
    }

    func testScopedConflictFencesDifferentDocumentAndBackendWithoutDeletingEitherDraft() async throws {
        let original = ScreenplayDraftSaveOrigin(documentID: "document-a", backendURL: URL(string: "https://save.test")!)
        let others = [ScreenplayDraftSaveOrigin(documentID: "document-b", backendURL: original.backendURL),
                      ScreenplayDraftSaveOrigin(documentID: "document-a", backendURL: URL(string: "https://other.test")!)]
        for (index, origin) in others.enumerated() {
            let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory.appendingPathComponent("scope-\(index)"))
            let conflict = makeDeliverableEntry(id: "conflict", draft: "Original words", createdAt: 100, origin: original)
            let independent = makeDeliverableEntry(id: "independent", draft: "Independent words", createdAt: 101, origin: origin)
            try await queue.enqueue(conflict)
            _ = try await queue.retainConflict(conflict)
            guard case .parked = try await queue.beginDelivery(independent) else {
                return XCTFail("A different origin must not bypass an unresolved project conflict")
            }
            let rows = try await queue.entriesForTesting()
            XCTAssertEqual(rows.first(where: { $0.id == conflict.id })?.draft, conflict.draft)
            XCTAssertEqual(rows.first(where: { $0.id == independent.id })?.draft, independent.draft)
            XCTAssertEqual(rows.first(where: { $0.id == independent.id })?.status, .pending)
            let resumed = try await queue.beginNext(projectId: independent.projectId,
                ownerUserId: independent.ownerUserId, deliveryOrigin: origin, force: true)
            XCTAssertNil(resumed, "Background resume must honor the same project-wide conflict fence")
        }
    }

    @MainActor
    func testSupersededHydrationCannotReplaceCurrentWriterPage() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: .init(), draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        model.fountainDraft = "Writer's current page"
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        defer { ScreenplayLiveDraftSyncService.shared.detach() }
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Older server page"]]])
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data)
        var checks = 0
        let applied = await model.hydrateDraftRestoringQueuedSaves(from: project, isCurrent: {
            checks += 1
            return checks < 3
        })
        XCTAssertFalse(applied)
        XCTAssertEqual(model.fountainDraft, "Writer's current page")
        XCTAssertGreaterThanOrEqual(checks, 3)
    }

    @MainActor
    func testProjectHydrationRestoresQueuedWriterBeforeRemoteDraft() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let local = "\r\nWriter words cafe\u{0301}\r\n \t "
        var entry = replacingOwner(of: makeEntry(id: "queued", draft: local), with: ScreenplayStudioAuthContext.current().userID)
        entry.deliveryOrigin = .init(documentID: "queued-document", backendURL: BackendAuthClient.resolvedBackendBaseURL())
        var queuedPayload = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(entry)) as? [String: Any])
        queuedPayload["screenplayBindings"] = [["draftSceneId": "queued-scene", "outlineSceneId": "writer-outline", "updatedAt": 100]]
        queuedPayload["studioWriteAnchors"] = [["writeId": "queued-writer-annotation", "anchorLine": 4]]
        let queued = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: queuedPayload))
        try await queue.enqueue(queued)
        let suite = "them.queued-hydration.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        ScreenplayLiveDraftBridge.shared.draftText = local
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Collaborator words"]]])
        let applied = await model.hydrateDraftRestoringQueuedSaves(from: try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
        XCTAssertTrue(applied)
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(local.utf8))
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertNotNil(model.conflictState)
        XCTAssertEqual(model.screenplayBindings, queued.screenplayBindings, "Protected local words lost their queued binding metadata")
        XCTAssertEqual(model.studioWriteAnchors, queued.studioWriteAnchors, "Server hydration replaced unresolved local annotations")
        let retained = try await queue.entriesForTesting()
        XCTAssertEqual(retained.map { Data($0.draft.utf8) }, [Data(local.utf8)])
    }

    @MainActor
    func testQueuedOriginHydrationReportsItsProvenDocument() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let owner = ScreenplayStudioAuthContext.current()
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let local = "Queued writer words"
        var entry = replacingOwner(of: makeEntry(id: "proven-queued", draft: local), with: owner.userID)
        entry.deliveryOrigin = .init(documentID: "queued-document", backendURL: BackendAuthClient.resolvedBackendBaseURL())
        try await queue.enqueue(entry)
        let suite = "them.queued-proof.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let bridge = ScreenplayLiveDraftBridge.shared
        let oldDraft = bridge.draftText
        defer { bridge.draftText = oldDraft; ScreenplayLiveDraftSyncService.shared.detach() }
        bridge.draftText = local
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: .init(defaults: defaults, key: "recovery"), draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = entry.projectId
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
            from: JSONSerialization.data(withJSONObject: ["id": entry.projectId, "title": entry.title,
                "activeVersionId": "server-v2", "versions": [["id": "server-v2", "draft": "Server words"]]]))
        var adoptedDocumentID: String?
        let applied = await model.hydrateDraftRestoringQueuedSaves(from: project,
            onHydrated: { adoptedDocumentID = $0 })
        XCTAssertTrue(applied)
        XCTAssertEqual(adoptedDocumentID, "queued-document")
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(local.utf8))
        XCTAssertEqual(bridge.draftOrigin.documentID, "queued-document")
    }

    @MainActor
    func testPreviouslyRestoredQueuedDraftStillReportsProvenDocument() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let owner = ScreenplayStudioAuthContext.current()
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let local = "Queued writer words"
        var entry = replacingOwner(of: makeEntry(id: "proven-queued", draft: local), with: owner.userID)
        entry.deliveryOrigin = .init(documentID: "queued-document", backendURL: BackendAuthClient.resolvedBackendBaseURL())
        try await queue.enqueue(entry)
        let suite = "them.queued-proof.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let bridge = ScreenplayLiveDraftBridge.shared
        let oldDraft = bridge.draftText
        defer { bridge.draftText = oldDraft; ScreenplayLiveDraftSyncService.shared.detach() }
        bridge.draftText = local
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: .init(defaults: defaults, key: "recovery"), draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = entry.projectId
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        let preloaded = await model.restorePendingDraftSaveBeforeProjectHydration()
        XCTAssertTrue(preloaded)
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(local.utf8))
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
            from: JSONSerialization.data(withJSONObject: ["id": entry.projectId, "title": entry.title,
                "activeVersionId": "server-v2", "versions": [["id": "server-v2", "draft": "Server words"]]]))
        var adoptedDocumentID: String?
        let applied = await model.hydrateDraftRestoringQueuedSaves(from: project,
            onHydrated: { adoptedDocumentID = $0 })
        XCTAssertTrue(applied)
        XCTAssertEqual(adoptedDocumentID, "queued-document")
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(local.utf8))
        XCTAssertEqual(bridge.draftOrigin.documentID, "queued-document")
    }

    @MainActor
    func testChangedQueuedBaseCannotReportEarlierDocumentProof() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let owner = ScreenplayStudioAuthContext.current()
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let local = "Queued writer words"
        var entry = replacingOwner(of: makeEntry(id: "proven-queued", draft: local), with: owner.userID)
        entry.deliveryOrigin = .init(documentID: "queued-document", backendURL: BackendAuthClient.resolvedBackendBaseURL())
        try await queue.enqueue(entry)
        let suite = "them.queued-proof.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let bridge = ScreenplayLiveDraftBridge.shared
        let oldDraft = bridge.draftText
        defer { bridge.draftText = oldDraft; ScreenplayLiveDraftSyncService.shared.detach() }
        bridge.draftText = local
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: .init(defaults: defaults, key: "recovery"), draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = entry.projectId
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        let preloaded = await model.restorePendingDraftSaveBeforeProjectHydration()
        XCTAssertTrue(preloaded)
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(local.utf8))
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        model.latestVersionID = "changed-base"
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
            from: JSONSerialization.data(withJSONObject: ["id": entry.projectId, "title": entry.title,
                "activeVersionId": "server-v2", "versions": [["id": "server-v2", "draft": "Server words"]]]))
        var adoptedDocumentID: String?
        let applied = await model.hydrateDraftRestoringQueuedSaves(from: project,
            onHydrated: { adoptedDocumentID = $0 })
        XCTAssertTrue(applied)
        XCTAssertNil(adoptedDocumentID, "A changed base cannot reuse the old queued-row proof")
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(local.utf8))
        XCTAssertEqual(bridge.draftOrigin.documentID, "queued-document")
    }

    @MainActor
    func testLegacyConflictExposesNewerRecoveryWithoutSendingOldSave() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let owner = ScreenplayStudioAuthContext.current()
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let old = replacingOwner(of: makeEntry(id: "legacy-held", draft: "Submitted words", createdAt: 100), with: owner.userID)
        try await queue.enqueue(old)
        _ = try await queue.retainConflict(projectId: old.projectId, ownerUserId: owner.userID, deliveryOrigin: nil)
        let suite = "them.legacy-review-relaunch.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let newer = "  Newer writer words\r\n"
        XCTAssertTrue(recovery.save(ownerUserId: owner.userID, projectId: old.projectId, draft: newer,
                                    baseVersionId: "base-newer", dirty: true, savedAt: 200))
        let bridge = ScreenplayLiveDraftBridge.shared
        XCTAssertTrue(bridge.adoptLoadedProjectDraft("", projectID: old.projectId, versionID: "remote", owner: owner))
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = old.projectId
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
            from: JSONSerialization.data(withJSONObject: ["id": old.projectId, "title": "Test",
                "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Server words"]]]))
        let applied = await model.hydrateDraftRestoringQueuedSaves(from: project)
        XCTAssertFalse(applied)
        XCTAssertEqual(model.recoveryCandidate?.draft, newer)
        model.restoreDraftFromRecovery()
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(newer.utf8))
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        let rows = try await queue.entriesForTesting()
        XCTAssertEqual(rows.first?.status, .parked)
        XCTAssertEqual(rows.first?.draft, "Submitted words")
    }

    @MainActor
    func testAuthenticatedRelaunchKeepsNewerPageWhenOlderSaveIsConflicted() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let owner = ScreenplayStudioAuthContext.current()
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let old = "Submitted words"
        let newer = "  Newer writer words\r\n"
        var entry = replacingOwner(of: makeEntry(id: "older-authenticated", draft: old, createdAt: 100), with: owner.userID)
        entry.deliveryOrigin = .init(documentID: "newer-recovery-document", backendURL: BackendAuthClient.resolvedBackendBaseURL())
        let bridge = ScreenplayLiveDraftBridge.shared
        XCTAssertTrue(bridge.adoptLoadedProjectDraft(old, projectID: entry.projectId,
            versionID: entry.baseVersionId, owner: owner, queuedEntry: entry))
        bridge.draftText = newer
        try await queue.enqueue(entry)
        _ = try await queue.retainConflict(entry)
        let suite = "them.newer-authenticated-relaunch.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        XCTAssertTrue(recovery.save(ownerUserId: owner.userID, projectId: entry.projectId, draft: newer,
                                    baseVersionId: entry.baseVersionId, dirty: true, savedAt: 200))
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = entry.projectId
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
            from: JSONSerialization.data(withJSONObject: ["id": entry.projectId, "title": "Test",
                "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Server words"]]]))
        _ = await model.hydrateDraftRestoringQueuedSaves(from: project)
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(newer.utf8))
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertEqual(recovery.dirtyOrdinarySnapshot(ownerUserId: owner.userID, projectId: entry.projectId)?.draft, newer)
        let rows = try await queue.entriesForTesting()
        XCTAssertEqual(rows.map { Data($0.draft.utf8) }, [Data(old.utf8)])
        XCTAssertEqual(rows.first?.status, .parked)
    }

    @MainActor
    func testRelaunchRestoresExactParkedWriterAfterServerPageWasPersisted() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let owner = ScreenplayStudioAuthContext.current()
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let local = "Exact queued writer words cafe\u{0301}.  \r\n"
        let server = "Server collaborator words."
        var entry = replacingOwner(of: makeEntry(id: "server-first-conflict", draft: local), with: owner.userID)
        entry.deliveryOrigin = .init(documentID: "server-first-document", backendURL: BackendAuthClient.resolvedBackendBaseURL())
        let bridge = ScreenplayLiveDraftBridge.shared
        XCTAssertTrue(bridge.adoptLoadedProjectDraft(local, projectID: entry.projectId,
            versionID: entry.baseVersionId, owner: owner, queuedEntry: entry))
        bridge.draftText = server
        try await queue.enqueue(entry)
        _ = try await queue.retainConflict(entry)
        let suite = "them.conflict-server-first.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite); ScreenplayLiveDraftSyncService.shared.detach() }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        XCTAssertTrue(recovery.save(ownerUserId: owner.userID, projectId: entry.projectId, draft: local,
            baseVersionId: entry.baseVersionId, dirty: true))
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = entry.projectId
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
            from: JSONSerialization.data(withJSONObject: ["id": entry.projectId, "title": entry.title,
                "activeVersionId": "server-v2", "versions": [["id": "server-v2", "draft": server]]]))
        let restored = await model.hydrateDraftRestoringQueuedSaves(from: project)
        XCTAssertTrue(restored)
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(local.utf8))
        XCTAssertEqual(Data(bridge.draftText.utf8), Data(local.utf8))
        XCTAssertEqual(model.conflictState?.retainedRequest?.id, entry.id)
        XCTAssertEqual(model.conflictState?.serverVersionId, "server-v2")
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        let rows = try await queue.entriesForTesting()
        XCTAssertEqual(rows.first?.status, .parked)
        XCTAssertEqual(rows.first.map { Data($0.draft.utf8) }, Data(local.utf8))
    }

    @MainActor
    func testInitialProjectReceiptCannotOverwriteDifferentDirtyRecovery() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let owner = ScreenplayStudioAuthContext.current()
        let identity = BackendAuthRequestIdentity(sessionEpoch: 0, userID: owner.userID, clientToken: "", accessToken: "", sessionIntentGeneration: owner.sessionIntentGeneration)
        let backend = BackendAuthClient.resolvedBackendBaseURL()
        let current = "The current page is acknowledged."
        let earlier = "Earlier unsynced writer words.  \n"
        var entry = replacingOwner(of: makeEntry(id: "initial-receipt-copy", draft: current), with: owner.userID)
        entry.deliveryOrigin = .init(documentID: "initial-receipt-document", backendURL: backend)
        let bridge = ScreenplayLiveDraftBridge.shared
        XCTAssertTrue(bridge.adoptLoadedProjectDraft(current, projectID: entry.projectId,
            versionID: entry.baseVersionId, owner: owner, queuedEntry: entry))
        entry.initialization = .init(documentID: "initial-receipt-document", backendURL: backend, sourceProjectID: entry.projectId)
        let suite = "them.initial-receipt-existing-recovery.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        XCTAssertTrue(recovery.save(ownerUserId: owner.userID, projectId: entry.projectId,
            draft: earlier, baseVersionId: "earlier-base", dirty: true))
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery)
        model.selectedProjectID = entry.projectId
        model.fountainDraft = current
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
            from: JSONSerialization.data(withJSONObject: ["id": entry.projectId, "title": entry.title]))
        let receipt = ScreenplayInitialProjectReceipt(entry: entry, project: project,
            versionID: "new-version", owner: identity, localDraft: current)
        XCTAssertTrue(ScreenplayStudioAuthContextPolicy.matches(expected: identity.ownerContext, current: ScreenplayStudioAuthContext.current()), "owner scope")
        XCTAssertTrue(OfflineTalkRecoveryScope.sameBackend(backend, BackendAuthClient.resolvedBackendBaseURL()), "backend scope")
        XCTAssertEqual(bridge.draftOrigin.documentID, "initial-receipt-document", "document scope")
        XCTAssertEqual(model.selectedProjectID, entry.projectId, "project scope")
        XCTAssertTrue(model.fountainDraft.utf8.elementsEqual(current.utf8), "draft scope")
        XCTAssertTrue(model.adoptInitialProjectReceipt(receipt), "Receipt must be accepted before checking recovery preservation")
        let kept = recovery.dirtyOrdinarySnapshot(ownerUserId: owner.userID, projectId: entry.projectId)
        XCTAssertEqual(kept.map { Data($0.draft.utf8) }, Data(earlier.utf8))
        XCTAssertEqual(kept?.baseVersionId, "earlier-base")
    }

    @MainActor
    func testRelaunchRestoresExactSameOriginConflictAndWriterChoice() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let owner = ScreenplayStudioAuthContext.current()
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let local = "Exact conflicted cafe\u{0301} words.  \r\n"
        var entry = replacingOwner(of: makeEntry(id: "relaunch-conflict", draft: local), with: owner.userID)
        entry.deliveryOrigin = .init(documentID: "conflict-document",
            backendURL: BackendAuthClient.resolvedBackendBaseURL())
        let bridge = ScreenplayLiveDraftBridge.shared
        XCTAssertTrue(bridge.adoptLoadedProjectDraft(local, projectID: entry.projectId,
            versionID: entry.baseVersionId, owner: owner, queuedEntry: entry))
        try await queue.enqueue(entry)
        let retainedCandidate = try await queue.retainConflict(entry)
        let retained = try XCTUnwrap(retainedCandidate)
        var later = replacingOwner(of: makeEntry(id: "later-pending", draft: "Later queued words",
            createdAt: 200), with: owner.userID)
        later.deliveryOrigin = entry.deliveryOrigin
        try await queue.enqueue(later)

        let suite = "them.conflict-relaunch-same.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        recovery.save(ownerUserId: owner.userID, projectId: entry.projectId, draft: local,
            baseVersionId: entry.baseVersionId, dirty: true)
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = entry.projectId
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
            from: JSONSerialization.data(withJSONObject: ["id": entry.projectId, "title": entry.title,
                "activeVersionId": "server-v2", "versions": [["id": "server-v2", "projectId": entry.projectId,
                    "draft": "Collaborator words", "draftExcerpt": "Collaborator words", "updatedAt": 200]]]))

        let applied = await model.hydrateDraftRestoringQueuedSaves(from: project)

        XCTAssertTrue(applied)
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(local.utf8))
        XCTAssertEqual(model.conflictState?.retainedRequest?.id, retained.id)
        XCTAssertEqual(model.conflictState?.serverVersionId, "server-v2")
        XCTAssertEqual(bridge.draftOrigin.documentID, entry.deliveryOrigin?.documentID)
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        let rows = try await queue.entriesForTesting()
        XCTAssertEqual(rows.first(where: { $0.id == entry.id })?.status, .parked)
        XCTAssertEqual(rows.first(where: { $0.id == later.id })?.status, .pending)
        XCTAssertEqual(rows.first(where: { $0.id == later.id }).map { Data($0.draft.utf8) },
            Data(later.draft.utf8))
    }

    @MainActor
    func testRelaunchSameOriginConflictWithoutRecoveryProofOffersReadOnlyExactPreview() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let owner = ScreenplayStudioAuthContext.current()
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let local = "Unverified same-document cafe\u{0301} words.  \r\n"
        var entry = replacingOwner(of: makeEntry(id: "same-origin-unverified", draft: local),
            with: owner.userID)
        entry.deliveryOrigin = .init(documentID: "same-document",
            backendURL: BackendAuthClient.resolvedBackendBaseURL())
        try await queue.enqueue(entry)
        _ = try await queue.retainConflict(entry)
        let bridge = ScreenplayLiveDraftBridge.shared
        XCTAssertTrue(bridge.adoptLoadedProjectDraft(local, projectID: entry.projectId,
            versionID: entry.baseVersionId, owner: owner, queuedEntry: entry))

        let suite = "them.conflict-relaunch-same-unverified.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: .init(
            defaults: defaults, key: "recovery"), draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = entry.projectId
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
            from: JSONSerialization.data(withJSONObject: ["id": entry.projectId, "title": entry.title,
                "activeVersionId": "server-v2", "versions": [["id": "server-v2",
                    "projectId": entry.projectId, "draft": "Server words"]]]))

        let applied = await model.hydrateDraftRestoringQueuedSaves(from: project)

        XCTAssertFalse(applied)
        XCTAssertNil(model.conflictState)
        XCTAssertTrue(model.heldDraftRecoveryIsCurrentContextCopy)
        XCTAssertFalse(model.heldDraftRecoveryIsLoadServerCopy)
        XCTAssertTrue(model.errorText.contains("belongs to this document"))
        XCTAssertFalse(model.errorText.contains("another local document"))
        XCTAssertEqual(Data(bridge.draftText.utf8), Data(local.utf8))
        let confirmedToken = await model.confirmedHeldDraftRecoveryForReview()
        let token = try XCTUnwrap(confirmedToken)
        let reviewed = try XCTUnwrap(model.heldDraftRecoveryForReview(token))
        XCTAssertEqual(reviewed.id, entry.id)
        XCTAssertEqual(Data(reviewed.draft.utf8), Data(local.utf8))
        let rows = try await queue.entriesForTesting()
        XCTAssertEqual(rows.first?.status, .parked)
    }

    @MainActor
    func testRelaunchCrossBackendConflictBlocksPendingHydrationWithoutRelabeling() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let owner = ScreenplayStudioAuthContext.current()
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let conflicted = "Other backend conflict words"
        var conflict = replacingOwner(of: makeEntry(id: "other-backend-conflict", draft: conflicted),
            with: owner.userID)
        conflict.deliveryOrigin = .init(documentID: "other-backend-document",
            backendURL: URL(string: "https://cross-backend.invalid")!)
        try await queue.enqueue(conflict)
        _ = try await queue.retainConflict(conflict)

        var pending = replacingOwner(of: makeEntry(id: "current-backend-pending",
            draft: "Current backend pending words", createdAt: 200), with: owner.userID)
        pending.deliveryOrigin = .init(documentID: "current-backend-document",
            backendURL: BackendAuthClient.resolvedBackendBaseURL())
        try await queue.enqueue(pending)
        let bridge = ScreenplayLiveDraftBridge.shared
        XCTAssertTrue(bridge.adoptLoadedProjectDraft(pending.draft, projectID: pending.projectId,
            versionID: pending.baseVersionId, owner: owner, queuedEntry: pending))

        let suite = "them.conflict-relaunch-cross-backend.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        recovery.save(ownerUserId: owner.userID, projectId: conflict.projectId, draft: conflicted,
            baseVersionId: conflict.baseVersionId, dirty: true)
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = conflict.projectId
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
            from: JSONSerialization.data(withJSONObject: ["id": conflict.projectId, "title": conflict.title,
                "activeVersionId": "server-v2", "versions": [["id": "server-v2",
                    "projectId": conflict.projectId, "draft": "Server words"]]]))

        let applied = await model.hydrateDraftRestoringQueuedSaves(from: project)

        XCTAssertFalse(applied)
        XCTAssertNil(model.conflictState)
        XCTAssertEqual(bridge.draftOrigin.documentID, pending.deliveryOrigin?.documentID)
        XCTAssertEqual(Data(bridge.draftText.utf8), Data(pending.draft.utf8))
        XCTAssertTrue(model.errorText.contains("backend"))
        let rows = try await queue.entriesForTesting()
        XCTAssertEqual(rows.first(where: { $0.id == conflict.id })?.status, .parked)
        XCTAssertEqual(rows.first(where: { $0.id == pending.id })?.status, .pending)
    }

    @MainActor
    func testRelaunchChangedOriginHoldsBothDraftsAndFencesLaterSave() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let owner = ScreenplayStudioAuthContext.current()
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let conflicted = "Earlier conflicted words"
        var entry = replacingOwner(of: makeEntry(id: "old-conflict", draft: conflicted), with: owner.userID)
        entry.deliveryOrigin = .init(documentID: "old-document", backendURL: BackendAuthClient.resolvedBackendBaseURL())
        try await queue.enqueue(entry)
        _ = try await queue.retainConflict(entry)

        var current = replacingOwner(of: makeEntry(id: "new-document-save", draft: "Current document words",
            createdAt: 200), with: owner.userID)
        current.deliveryOrigin = .init(documentID: "new-document", backendURL: BackendAuthClient.resolvedBackendBaseURL())
        let bridge = ScreenplayLiveDraftBridge.shared
        XCTAssertTrue(bridge.adoptLoadedProjectDraft(current.draft, projectID: current.projectId,
            versionID: current.baseVersionId, owner: owner, queuedEntry: current))

        let suite = "them.conflict-relaunch-changed.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        recovery.save(ownerUserId: owner.userID, projectId: entry.projectId, draft: conflicted,
            baseVersionId: entry.baseVersionId, dirty: true)
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = entry.projectId
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
            from: JSONSerialization.data(withJSONObject: ["id": entry.projectId, "title": entry.title,
                "activeVersionId": "server-v2", "versions": [["id": "server-v2", "projectId": entry.projectId,
                    "draft": "Server words"]]]))

        let applied = await model.hydrateDraftRestoringQueuedSaves(from: project)

        XCTAssertFalse(applied)
        XCTAssertEqual(bridge.draftOrigin.documentID, "new-document")
        XCTAssertEqual(Data(bridge.draftText.utf8), Data(current.draft.utf8))
        XCTAssertTrue(model.errorText.contains("local save queue"))
        let held = try XCTUnwrap(model.heldDraftRecovery)
        XCTAssertEqual(held.id, entry.id)
        XCTAssertEqual(held.deliveryOrigin?.documentID, "old-document")
        XCTAssertEqual(Data(held.draft.utf8), Data(conflicted.utf8))
        let confirmedToken = await model.confirmedHeldDraftRecoveryForReview()
        let reviewToken = try XCTUnwrap(confirmedToken)
        let reviewed = try XCTUnwrap(model.heldDraftRecoveryForReview(reviewToken))
        XCTAssertEqual(Data(reviewed.draft.utf8), Data(conflicted.utf8))
        guard case .parked = try await queue.beginDelivery(current) else {
            return XCTFail("A changed-origin save must remain fenced by the unresolved conflict")
        }
        let rows = try await queue.entriesForTesting()
        XCTAssertEqual(Set(rows.map(\.id)), Set([entry.id, current.id]))
        XCTAssertEqual(rows.first(where: { $0.id == current.id })?.status, .pending)
    }

    @MainActor
    func testQueuedOriginCannotRelabelNewerPersistedWordsWhenBootstrapFlagsAreClean() async throws {
        let restoreOwner = try installAuthenticatedFixtureOwner()
        defer { restoreOwner() }
        let owner = ScreenplayStudioAuthContext.current()
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        var entry = replacingOwner(of: makeEntry(id: "older-queued", draft: "Earlier queued writer words"), with: owner.userID)
        entry.deliveryOrigin = .init(documentID: "earlier-document", backendURL: BackendAuthClient.resolvedBackendBaseURL())
        try await queue.enqueue(entry)
        let suite = "them.newer-origin.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "newer-origin"), draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = entry.projectId
        ScreenplayLiveDraftSyncService.shared.attach(to: model)
        let newer = "Newer persisted cafe\u{0301} words. \r\n"
        model.applyServerDraft(newer, versionId: "newer-local-base")
        let bridge = ScreenplayLiveDraftBridge.shared
        let origin = bridge.draftOrigin.documentID
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
            from: JSONSerialization.data(withJSONObject: ["id": entry.projectId, "title": entry.title,
                "versions": [["id": entry.baseVersionId, "draft": "Earlier server baseline"]]]))
        let applied = await model.hydrateDraftRestoringQueuedSaves(from: project)
        XCTAssertFalse(applied)
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(newer.utf8))
        XCTAssertEqual(Data(bridge.draftText.utf8), Data(newer.utf8))
        XCTAssertEqual(bridge.draftOrigin.documentID, origin)
        let kept = try await queue.entriesForTesting()
        XCTAssertEqual(kept.map(\.id), [entry.id])
    }

    @MainActor
    func testVersionlessProjectHydrationClearsThePreviousProjectsMetadata() async throws {
        let suite = "them.empty-project-metadata.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "empty-project"),
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory))
        model.autosaveEnabled = false
        model.selectedProjectID = "old-project"
        model.applyServerDraft("Earlier saved words", versionId: "old-version")
        model.screenplayBindings = [try JSONDecoder().decode(BackendScreenplayBindingRecord.self,
            from: Data("{\"draftSceneId\":\"old-scene\"}".utf8))]
        model.selectedProjectID = "new-versionless-project"
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
            from: Data("{\"id\":\"new-versionless-project\",\"title\":\"New\"}".utf8))
        let applied = await model.hydrateDraftRestoringQueuedSaves(from: project)
        XCTAssertTrue(applied)
        XCTAssertTrue(model.fountainDraft.isEmpty)
        XCTAssertTrue(model.screenplayBindings.isEmpty, "A new empty project inherited another project's binding metadata")
        XCTAssertTrue(model.studioWriteAnchors.isEmpty)
    }

    @MainActor
    func testMissingDeclaredHeadCannotHydrateAnOlderVersionOverWriterPage() async throws {
        let suite = "them.missing-head.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery,
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory))
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        let writer = "Writer cafe\u{0301} exact words.  \r\n"
        model.applyServerDraft(writer, versionId: "local-base")
        let owner = ScreenplayStudioAuthContext.current().userID
        recovery.save(ownerUserId: owner, projectId: "project-1", draft: writer,
            baseVersionId: "local-base", dirty: true)
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "missing-current", "lastVersionId": "old", "versionCount": 2,
            "versions": [["id": "old", "draft": "Older historical text"]]])
        let applied = await model.hydrateDraftRestoringQueuedSaves(from:
            try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
        XCTAssertFalse(applied)
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(writer.utf8))
        XCTAssertEqual((recovery.payloads(ownerUserId: owner)["project-1"]?["draft"] as? String)
            .map { Data($0.utf8) }, Data(writer.utf8))
        XCTAssertFalse(model.errorText.isEmpty)
    }

    @MainActor
    func testUnreadableQueueCannotReplaceCurrentPageDuringHydration() async throws {
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let file = storageDirectory.appendingPathComponent("queue.json")
        let corrupt = Data("{not-json".utf8)
        try corrupt.write(to: file)
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let suite = "them.corrupt-hydration.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"), draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        let writer = "My exact cafe\u{0301} words. \r\n"
        model.applyServerDraft(writer, versionId: "base")
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "versions": [["id": "remote", "draft": "Remote words"]]])
        let applied = await model.hydrateDraftRestoringQueuedSaves(from: try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
        XCTAssertFalse(applied)
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(writer.utf8))
        XCTAssertEqual(model.errorText, ScreenplayDraftSaveRecoveryPresentationPolicy.unreadableQueueError)
        XCTAssertEqual(try Data(contentsOf: file), corrupt)
    }

    private var storageDirectory: URL!

    override func setUp() {
        super.setUp()
        storageDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("ScreenplayDraftSaveOutboxTests-\(UUID().uuidString)", isDirectory: true)
    }

    override func tearDown() {
        if let storageDirectory {
            try? FileManager.default.removeItem(at: storageDirectory)
        }
        storageDirectory = nil
        super.tearDown()
    }

    func testOnlyExactInflightClaimCanBeReturnedToQueue() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let origin = ScreenplayDraftSaveOrigin(documentID: "claimed-document", backendURL: URL(string: "https://save.test")!)
        var entry = makeEntry(id: "claimed", draft: "Cafe\u{301}  ")
        entry.deliveryOrigin = origin
        try await store.enqueue(entry)
        let next = try await store.beginNext(projectId: "project-1", ownerUserId: "user-1", deliveryOrigin: origin, force: true)
        let claimed = try XCTUnwrap(next)
        var mismatched = claimed
        mismatched.baseVersionId = "different-base"
        try await store.releaseInflightClaim(mismatched)
        var rows = try await store.entriesForTesting()
        XCTAssertEqual(rows.first?.status, .inflight)
        try await store.releaseInflightClaim(claimed)
        rows = try await store.entriesForTesting()
        XCTAssertEqual(rows.first?.status, .pending)
        XCTAssertEqual(rows.first.map { Data($0.draft.utf8) }, Data("Cafe\u{301}  ".utf8))
    }

    func testQueuePersistsAndRecoversInterruptedInflightSave() async throws {
        let firstStore = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entry = makeEntry(id: "save-1")

        try await firstStore.enqueue(entry)
        try await firstStore.markInflight(id: entry.id, now: Date(timeIntervalSince1970: 101))

        let restoredStore = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let restored = try await restoredStore.entriesForTesting()
        XCTAssertEqual(restored.count, 1)
        XCTAssertEqual(restored.first?.id, "save-1")
        XCTAssertEqual(restored.first?.status, .pending)
        XCTAssertEqual(restored.first?.lastError, "Interrupted while saving.")
    }

    func testUnadmittedOrParkedSaveCannotBecomeInflight() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let original = makeEntry(id: "original", draft: "Exact writer text")
        let duplicate = makeEntry(id: "duplicate", draft: original.draft)
        try await queue.enqueue(original)
        try await queue.enqueue(duplicate)
        do {
            try await queue.markInflight(id: duplicate.id)
            XCTFail("A coalesced identifier has no durable entry and must not become inflight")
        } catch {}
        try await queue.markParked(id: original.id, error: "Writer choice required")
        do {
            try await queue.markInflight(id: original.id)
            XCTFail("A parked writer choice must not become inflight")
        } catch {}
        let reopened = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entries = try await reopened.entriesForTesting()
        XCTAssertEqual(entries.count, 1)
        XCTAssertEqual(entries.first?.id, original.id)
        XCTAssertEqual(entries.first?.status, .parked)
        XCTAssertTrue(entries.first?.draft.utf8.elementsEqual(original.draft.utf8) == true)
    }

    func testQueueKeepsWhitespaceDifferentDraftsAndRejectsReusedIdentifier() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let first = makeEntry(id: "first", draft: "Writer words", createdAt: 100)
        let second = makeEntry(id: "second", draft: "Writer words\n", createdAt: 101)
        try await queue.enqueue(first)
        try await queue.enqueue(second)
        let reopened = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let retained = try await reopened.entriesForTesting()
        XCTAssertEqual(retained.count, 2)
        XCTAssertTrue(retained[0].draft.utf8.elementsEqual(first.draft.utf8))
        XCTAssertTrue(retained[1].draft.utf8.elementsEqual(second.draft.utf8))
        let reused = makeEntry(id: first.id, draft: second.draft, createdAt: 101)
        do {
            try await queue.enqueue(reused)
            XCTFail("Reusing an identifier for byte-different text must fail")
        } catch {}
        let after = try await queue.entriesForTesting()
        XCTAssertEqual(after.count, 2)
        XCTAssertTrue(after[0].draft.utf8.elementsEqual(first.draft.utf8))
        XCTAssertTrue(after[1].draft.utf8.elementsEqual(second.draft.utf8))
    }

    func testPreLineageManifestDecodesSavesAndRelaunchesWithEmptyLineage() async throws {
        let legacyEntry = makeEntry(id: "pre-lineage")
        let priorShape = try JSONDecoder().decode(PriorDraftSaveOutboxEntry.self,
            from: JSONEncoder().encode(legacyEntry))
        let legacyData = try JSONEncoder().encode([priorShape])
        let legacyObject = try XCTUnwrap(JSONSerialization.jsonObject(with: legacyData) as? [[String: Any]])
        XCTAssertNil(legacyObject.first?["supersededConflictRequests"])
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        try legacyData.write(to: storageDirectory.appendingPathComponent("queue.json"), options: .atomic)

        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let restoredLegacy = try await store.entriesForTesting()
        XCTAssertEqual(restoredLegacy.map(\.id), [legacyEntry.id])
        XCTAssertEqual(restoredLegacy.first?.supersededConflictRequests, [])

        let newEntry = makeEntry(id: "post-lineage", draft: "Later draft", createdAt: 101)
        try await store.enqueue(newEntry)
        let relaunched = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let saved = try await relaunched.entriesForTesting()
        XCTAssertEqual(saved.map(\.id), [legacyEntry.id, newEntry.id])
        XCTAssertTrue(saved.allSatisfy { $0.supersededConflictRequests.isEmpty })
    }

    func testPresentNullConflictLineageFailsClosedWithoutRewritingManifest() async throws {
        let entry = makeEntry(id: "null-lineage")
        var payload = try XCTUnwrap(JSONSerialization.jsonObject(
            with: JSONEncoder().encode(entry)) as? [String: Any])
        payload["supersededConflictRequests"] = NSNull()
        let malformed = try JSONSerialization.data(withJSONObject: [payload], options: [.sortedKeys])
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        try malformed.write(to: manifestURL, options: .atomic)

        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let firstRead = await store.snapshot(ownerUserId: entry.ownerUserId)
        let secondRead = await store.snapshot(ownerUserId: entry.ownerUserId)

        XCTAssertFalse(firstRead.lastError.isEmpty)
        XCTAssertFalse(secondRead.lastError.isEmpty)
        XCTAssertEqual(try Data(contentsOf: manifestURL), malformed)
    }

    func testLineageManifestRejectsArrayOnlyDowngradeAndRestoresExactRetry() async throws {
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let conflict = makeEntry(id: "parked-conflict", draft: "Exact local words", createdAt: 100,
            origin: origin, authority: .init(id: UUID(), generation: 1))
        try await store.enqueue(conflict)
        _ = try await store.retainConflict(conflict)
        var resolution = makeEntry(id: "keep-mine", draft: conflict.draft, createdAt: 101,
            origin: origin, authority: .init(id: UUID(), generation: 2))
        resolution.supersededConflictRequests = try await store.conflictResolutionReferences(for: conflict)
        try await store.enqueue(resolution)
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let protectedBytes = try Data(contentsOf: manifestURL)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: protectedBytes) as? [String: Any])

        XCTAssertEqual(object["schemaVersion"] as? Int, 2)
        XCTAssertEqual((object["entries"] as? [[String: Any]])?.count, 2)
        XCTAssertThrowsError(try JSONDecoder().decode([PriorDraftSaveOutboxEntry].self,
            from: protectedBytes), "An array-only build must fail before it can drop lineage")
        XCTAssertEqual(try Data(contentsOf: manifestURL), protectedBytes)
        let isDurable = try await store.hasDurableTarget(id: resolution.id, matching: resolution)
        XCTAssertTrue(isDurable, "Durable readback must understand the protected envelope")

        let relaunched = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let next = try await relaunched.beginNext(projectId: conflict.projectId,
            ownerUserId: conflict.ownerUserId, force: true)
        XCTAssertEqual(next?.id, resolution.id)
        XCTAssertEqual(next?.supersededConflictRequests, resolution.supersededConflictRequests)
        XCTAssertNotNil(try JSONSerialization.jsonObject(
            with: Data(contentsOf: manifestURL)) as? [String: Any])
    }

    func testDeferredReferenceManifestUsesNewSchemaAndRejectsSchemaTwoDowngrade() async throws {
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a", backendURL: URL(string: "https://save.test")!)
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let conflict = makeEntry(id: "conflict", createdAt: 100, origin: origin,
            authority: .init(id: UUID(), generation: 1))
        let pending = makeEntry(id: "pending", draft: "Newer exact words", createdAt: 101,
            origin: origin, authority: .init(id: UUID(), generation: 2))
        try await store.enqueue(conflict)
        _ = try await store.retainConflict(conflict)
        try await store.enqueue(pending)
        let plan = try await store.conflictResolutionPlan(for: conflict)
        var resolution = makeEntry(id: "resolution", createdAt: 102, origin: origin,
            authority: .init(id: UUID(), generation: 3))
        resolution.supersededConflictRequests = plan.supersededConflictRequests
        resolution.deferredConflictRequests = plan.deferredConflictRequests
        try await store.enqueue(resolution)

        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let protected = try XCTUnwrap(JSONSerialization.jsonObject(
            with: Data(contentsOf: manifestURL)) as? [String: Any])
        XCTAssertEqual(protected["schemaVersion"] as? Int, 3)

        var downgraded = protected
        downgraded["schemaVersion"] = 2
        let downgradedBytes = try JSONSerialization.data(withJSONObject: downgraded, options: [.sortedKeys])
        let downgradeDirectory = storageDirectory.appendingPathComponent("schema-two", isDirectory: true)
        try FileManager.default.createDirectory(at: downgradeDirectory, withIntermediateDirectories: true)
        let downgradeURL = downgradeDirectory.appendingPathComponent("queue.json")
        try downgradedBytes.write(to: downgradeURL, options: .atomic)
        let downgradedStore = ScreenplayDraftSaveOutbox(storageDirectory: downgradeDirectory)
        let snapshot = await downgradedStore.snapshot(ownerUserId: conflict.ownerUserId)
        XCTAssertFalse(snapshot.isStorageReadable)
        XCTAssertEqual(try Data(contentsOf: downgradeURL), downgradedBytes)
    }

    func testLineageEnvelopeTransitionWriteFailureRollsBackToExactLegacyArray() async throws {
        let failMarker = storageDirectory.appendingPathComponent("fail-next-write")
        let store = ScreenplayDraftSaveOutbox(
            storageDirectory: storageDirectory,
            manifestWriter: { data, url in
                if FileManager.default.fileExists(atPath: failMarker.path) {
                    throw NSError(domain: "ScreenplayDraftSaveOutboxTests", code: 4)
                }
                try data.write(to: url, options: .atomic)
            }
        )
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let conflict = makeEntry(id: "legacy-parked", draft: "Exact local words", createdAt: 100,
            origin: origin, authority: .init(id: UUID(), generation: 1))
        try await store.enqueue(conflict)
        _ = try await store.retainConflict(conflict)
        var resolution = makeEntry(id: "protected-resolution", draft: conflict.draft, createdAt: 101,
            origin: origin, authority: .init(id: UUID(), generation: 2))
        resolution.supersededConflictRequests = try await store.conflictResolutionReferences(for: conflict)
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let legacyBytes = try Data(contentsOf: manifestURL)
        XCTAssertNotNil(try JSONSerialization.jsonObject(with: legacyBytes) as? [[String: Any]])
        try Data().write(to: failMarker)

        do {
            try await store.enqueue(resolution)
            XCTFail("A failed envelope write reported a durable resolution")
        } catch {}

        XCTAssertEqual(try Data(contentsOf: manifestURL), legacyBytes)
        let retained = try await store.entriesForTesting()
        XCTAssertEqual(retained.map(\.id), [conflict.id])
    }

    func testUnknownOrMalformedLineageManifestFailsClosedWithoutRewrite() async throws {
        let entry = makeEntry(id: "protected")
        let encodedEntry = try XCTUnwrap(JSONSerialization.jsonObject(
            with: JSONEncoder().encode(entry)) as? [String: Any])
        let payloads: [[String: Any]] = [
            ["schemaVersion": 99, "entries": [encodedEntry]],
            ["schemaVersion": 2, "entries": "not-an-array"],
            ["schemaVersion": 2, "entries": [encodedEntry]],
        ]

        for (index, payload) in payloads.enumerated() {
            let directory = storageDirectory.appendingPathComponent("invalid-\(index)", isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let manifestURL = directory.appendingPathComponent("queue.json")
            let original = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
            try original.write(to: manifestURL, options: .atomic)
            let store = ScreenplayDraftSaveOutbox(storageDirectory: directory)

            let first = await store.snapshot(ownerUserId: entry.ownerUserId)
            let second = await store.snapshot(ownerUserId: entry.ownerUserId)

            XCTAssertFalse(first.lastError.isEmpty)
            XCTAssertFalse(second.lastError.isEmpty)
            do {
                _ = try await store.hasDurableTarget(id: entry.id, matching: entry)
                XCTFail("Malformed or unknown storage was accepted by durable readback")
            } catch {}
            XCTAssertEqual(try Data(contentsOf: manifestURL), original)
        }
    }

    @MainActor
    func testRequestCreationTimeSurvivesMaterializationRebaseAndRelaunch() {
        let context = ScreenplayStudioAuthContext(userID: "writer", sessionIntentGeneration: 1)
        let authority = ScreenplayDraftSaveRequestAuthority(id: UUID(), generation: 0)
        let reference = ScreenplayDraftConflictRequestReference(requestID: "older", projectId: "project",
            ownerUserId: "writer", deliveryOrigin: nil, requestAuthority: nil,
            requestDigest: String(repeating: "a", count: 64))
        let request = ScreenplayStudioViewModel.DraftSaveRequest(id: "request", createdAt: 123,
            projectId: "project", ownerUserId: "writer", draft: "Writer words", title: "Title",
            phase: "scene_draft", source: "studio_manual", notes: "", studioWriteAnchors: [],
            screenplayBindings: [], baseVersionId: "base", authContext: context, requestAuthority: authority,
            supersededConflictRequests: [reference])
        XCTAssertEqual(request.outboxEntry.supersededConflictRequests, [reference])
        XCTAssertEqual(request.rebased(on: "new-base").outboxEntry.supersededConflictRequests, [reference])
        XCTAssertEqual(ScreenplayStudioViewModel.DraftSaveRequest(entry: request.outboxEntry,
            authContext: context).supersededConflictRequests, [reference])
        XCTAssertEqual(request.outboxEntry.requestAuthority, authority)
        XCTAssertEqual(request.rebased(on: "new-base").outboxEntry.requestAuthority, authority)
        XCTAssertEqual(ScreenplayStudioViewModel.DraftSaveRequest(entry: request.outboxEntry,
            authContext: context).requestAuthority, authority)
        XCTAssertEqual(request.outboxEntry.createdAt, 123)
        XCTAssertEqual(request.outboxEntry.createdAt, 123)
        XCTAssertEqual(request.rebased(on: "new-base").outboxEntry.createdAt, 123)
        let restored = ScreenplayStudioViewModel.DraftSaveRequest(entry: request.outboxEntry, authContext: context)
        XCTAssertEqual(restored.outboxEntry.createdAt, 123)
        XCTAssertEqual(restored.rebased(on: "later").outboxEntry.createdAt, 123)
    }

    func testFailedQueueClaimKeepsTheSavePendingInMemoryAndOnDisk() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entry = makeDeliverableEntry(id: "claim-persist-failure")
        try await store.enqueue(entry)
        let backup = storageDirectory.appendingPathExtension("saved")
        defer { try? FileManager.default.removeItem(at: backup) }
        try FileManager.default.moveItem(at: storageDirectory, to: backup)
        XCTAssertTrue(FileManager.default.createFile(atPath: storageDirectory.path, contents: Data()))
        do {
            _ = try await store.beginNext(projectId: entry.projectId, ownerUserId: entry.ownerUserId, force: true)
            XCTFail("Claim should fail when the queue directory cannot be written")
        } catch { }
        let inMemory = try await store.entriesForTesting()
        XCTAssertEqual(inMemory.first?.status, .pending)
        let restarted = ScreenplayDraftSaveOutbox(storageDirectory: backup)
        let onDisk = try await restarted.entriesForTesting()
        XCTAssertEqual(onDisk.first?.status, .pending)
        XCTAssertEqual(onDisk.first?.id, entry.id)
    }

    func testQueueDeduplicatesSameSaveIdentifier() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entry = makeEntry(id: "save-once")

        try await store.enqueue(entry)
        try await store.enqueue(entry)

        let stored = try await store.entriesForTesting()
        XCTAssertEqual(stored.map(\.id), ["save-once"])
    }

    func testQueuePreservesByteDistinctDraftsAcrossRestartAndAcknowledgement() async throws {
        let raw = "\r\nINT. CAFE - NIGHT\r\n\r\nA cafe\u{0301} waits.\r\n \t "
        let drafts = [raw, raw + " ", raw.replacingOccurrences(of: "\r\n", with: "\n"),
                      raw.precomposedStringWithCanonicalMapping]
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        var first = makeDeliverableEntry(id: "raw-0", draft: raw)
        first.saveOrderingVersion = 1
        var predecessor = try await store.admitPendingSave(first, following: nil)
        guard case .deliver = try await store.beginDelivery(predecessor) else {
            return XCTFail("The first exact draft did not begin delivery")
        }
        for index in 1..<drafts.count {
            var follower = makeDeliverableEntry(id: "raw-\(index)", draft: drafts[index],
                createdAt: TimeInterval(100 + index))
            follower.saveOrderingVersion = 1
            predecessor = try await store.admitPendingSave(follower, following: predecessor)
        }
        let relaunched = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let restored = try await relaunched.entriesForTesting()
        XCTAssertEqual(restored.count, drafts.count, "Normalized equality must not discard later writer bytes.")
        XCTAssertEqual(restored.map { Data($0.draft.utf8) }, drafts.map { Data($0.utf8) })
        for index in drafts.indices {
            let next = try await relaunched.beginNext(projectId: "project-1", ownerUserId: "user-1", force: true)
            XCTAssertEqual(next?.id, "raw-\(index)")
            XCTAssertEqual(next?.baseVersionId, index == 0 ? "server-v1" : "ack-\(index - 1)")
            XCTAssertEqual(next.map { Data($0.draft.utf8) }, Data(drafts[index].utf8))
            guard let next else { return }
            try await relaunched.markSucceeded(id: next.id, serverVersionId: "ack-\(index)",
                mayRebaseDeclaredFollowers: true)
        }
        let remaining = try await relaunched.entriesForTesting()
        XCTAssertTrue(remaining.isEmpty)
    }

    func testQueueRejectsSameIdentifierWithDifferentRawBytes() async throws {
        let raw = "\r\nINT. CAFE - NIGHT\r\n\r\nA cafe\u{0301} waits.\r\n \t "
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "raw-once", draft: raw))
        for changed in [raw + " ", raw.replacingOccurrences(of: "\r\n", with: "\n"),
                        raw.precomposedStringWithCanonicalMapping] {
            do {
                try await store.enqueue(makeEntry(id: "raw-once", draft: changed))
                XCTFail("A request ID cannot acknowledge different draft bytes.")
            } catch BackendMemoryAPIError.server(let status, let message) {
                XCTAssertEqual(status, 409)
                XCTAssertEqual(message, "screenplay_save_id_reused")
            }
        }
        try await store.enqueue(makeEntry(id: "same-bytes-other-id", draft: raw))
        let retained = try await store.entriesForTesting()
        XCTAssertEqual(retained.count, 1, "An exactly identical queued draft still coalesces.")
        XCTAssertEqual(retained.first.map { Data($0.draft.utf8) }, Data(raw.utf8))
    }

    func testSameIDRejectsByteDistinctMetadataButKeepsDurableRebase() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let original = makeEntry(id: "same-id", draft: "Same words")
        var payload = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(original)) as? [String: Any])
        payload["notes"] = "caf\u{00e9}"
        let first = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: payload))
        try await store.enqueue(first)
        payload["notes"] = "cafe\u{0301}"
        let changed = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: payload))
        do {
            _ = try await store.enqueueForDelivery(changed)
            XCTFail("A reused ID must reject byte-distinct notes")
        } catch BackendMemoryAPIError.server(let status, let message) {
            XCTAssertEqual(status, 409)
            XCTAssertEqual(message, "screenplay_save_id_reused")
        }
        var staleBase = first
        staleBase.baseVersionId = "older-client-base"
        let retained = try await store.enqueueForDelivery(staleBase)
        XCTAssertEqual(retained.baseVersionId, first.baseVersionId)
        XCTAssertEqual(Data(retained.notes.utf8), Data(first.notes.utf8))
    }

    func testDifferentIDsDoNotCoalesceByteDistinctMetadata() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let original = makeEntry(id: "first", draft: "Same words")
        var payload = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(original)) as? [String: Any])
        payload["title"] = "caf\u{00e9}"
        let first = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: payload))
        try await store.enqueue(first)
        payload["id"] = "second"
        payload["title"] = "cafe\u{0301}"
        let second = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: payload))
        let retained = try await store.enqueueForDelivery(second)
        XCTAssertEqual(retained.id, second.id)
        let rows = try await store.entriesForTesting()
        XCTAssertEqual(Set(rows.map(\.id)), Set([first.id, second.id]))
    }

    func testCoalescedDeliveryUsesTheDurableRequestIdentifierAcrossRestart() async throws {
        let original = makeEntry(id: "durable-request")
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(original)
        let restarted = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let duplicate = makeEntry(id: "fresh-caller-request")
        let delivery = try await restarted.enqueueForDelivery(duplicate)
        XCTAssertEqual(delivery.id, original.id)
        XCTAssertEqual(delivery.baseVersionId, original.baseVersionId)
        XCTAssertEqual(Data(delivery.draft.utf8), Data(original.draft.utf8))
        try await restarted.markInflight(id: delivery.id)
        try await restarted.markSucceeded(id: delivery.id, serverVersionId: "confirmed-version")
        let remaining = try await restarted.entriesForTesting()
        XCTAssertTrue(remaining.isEmpty, "An acknowledged coalesced request must retire its durable row")
    }

    func testIdenticalTextDoesNotCoalesceDistinctWriterIntentOrBindings() async throws {
        let original = makeEntry(id: "original-intent")
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(original)
        let changes: [[String: Any]] = [
            ["title": "Retitled"], ["phase": "rewrite"],
            ["source": "studio_conflict_resolve"], ["notes": "Explicit writer choice"],
            ["studioWriteAnchors": [["writeId": "new-anchor", "anchorLine": 4]]],
            ["screenplayBindings": [["draftSceneId": "new-scene", "outlineSceneId": "beat-2"]]]
        ]
        for (index, patch) in changes.enumerated() {
            var payload = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(original)) as? [String: Any])
            payload["id"] = "distinct-intent-\(index)"
            for (key, value) in patch { payload[key] = value }
            let changed = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
                from: JSONSerialization.data(withJSONObject: payload))
            let retained = try await store.enqueueForDelivery(changed)
            XCTAssertEqual(retained, changed, "Canonical delivery silently replaced writer intent: \(patch.keys)")
        }
        let rows = try await store.entriesForTesting()
        XCTAssertEqual(rows.count, changes.count + 1)
    }

    func testDistinctManualCheckpointsWithIdenticalBytesSurviveRelaunch() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let sample = makeEntry(id: "manual-first", draft: "Same exact words")
        var payload = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(sample)) as? [String: Any])
        payload["source"] = "studio_manual"
        let first = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self, from: JSONSerialization.data(withJSONObject: payload))
        payload["id"] = "manual-second"
        let second = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self, from: JSONSerialization.data(withJSONObject: payload))
        _ = try await store.enqueueForDelivery(first)
        let retained = try await store.enqueueForDelivery(second)
        XCTAssertEqual(retained.id, second.id)
        let restarted = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let rows = try await restarted.entriesForTesting()
        XCTAssertEqual(Set(rows.map(\.id)), Set([first.id, second.id]))
        XCTAssertTrue(rows.allSatisfy { $0.draft.utf8.elementsEqual(first.draft.utf8) })
    }

    func testPassiveDeliveryKeepsTheExistingExplicitIntentAndRequestIdentifier() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        var payload = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(makeEntry(id: "explicit-save"))) as? [String: Any])
        payload["source"] = "studio_manual"; payload["notes"] = "Writer checkpoint"
        payload["deliveryOrigin"] = ["documentID": "exact-document", "backendURL": "https://save.test"]
        let explicit = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: payload))
        try await store.enqueue(explicit)
        var passive = makeEntry(id: "passive-repeat"); passive.deliveryOrigin = explicit.deliveryOrigin
        guard case .deliver(let delivery) = try await store.beginDelivery(passive) else {
            return XCTFail("The pending explicit request was not claimed")
        }
        XCTAssertEqual(delivery.id, explicit.id)
        XCTAssertEqual(delivery.source, "studio_manual")
        XCTAssertEqual(delivery.notes, "Writer checkpoint")
        XCTAssertEqual(delivery.status, .inflight)
        let rows = try await store.entriesForTesting()
        XCTAssertEqual(rows.count, 1, "Housekeeping manufactured a second explicit save")
    }

    func testJoiningAnInflightSaveDoesNotGrantASecondDelivery() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entry = makeDeliverableEntry(id: "claimed-once")
        guard case .deliver = try await store.beginDelivery(entry) else { return XCTFail("First claim failed") }
        guard case .alreadyInflight(let retained) = try await store.beginDelivery(entry) else {
            return XCTFail("An already inflight request was granted a second delivery")
        }
        XCTAssertEqual(retained.id, entry.id)
        let rows = try await store.entriesForTesting()
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows.first?.status, .inflight)
    }

    func testDeliveryCannotReactivateAParkedRequest() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entry = makeEntry(id: "needs-choice")
        try await store.enqueue(entry)
        try await store.markParked(id: entry.id, error: "Requires a writer choice")
        guard case .parked(let retained) = try await store.beginDelivery(entry) else {
            return XCTFail("A parked conflict was silently retried")
        }
        XCTAssertEqual(retained.id, entry.id)
        let rows = try await store.entriesForTesting()
        XCTAssertEqual(rows.map(\.status), [.parked])
        XCTAssertEqual(rows.map(\.draft), [entry.draft])
    }

    func testLoadServerRetiresOnlyExactSelectedRequestsAndKeepsUnrelatedOlderRows() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let lineage = UUID()
        let selected = makeEntry(id: "selected", draft: "Selected words", createdAt: 100,
            origin: origin, authority: .init(id: lineage, generation: 4))
        let unrelatedPending = makeEntry(id: "unrelated-pending", draft: "Distinct pending words", createdAt: 90,
            origin: origin, authority: .init(id: lineage, generation: 3))
        let unrelatedInflight = makeEntry(id: "unrelated-inflight", draft: "Distinct inflight words", createdAt: 80,
            origin: origin, authority: .init(id: lineage, generation: 2))
        try await store.enqueue(selected)
        try await store.enqueue(unrelatedPending)
        try await store.enqueue(unrelatedInflight)
        try await store.markInflight(id: unrelatedInflight.id)
        _ = try await store.retainConflict(selected)

        let selection = try await store.captureLoadServerSelection(
            projectId: selected.projectId,
            ownerUserId: selected.ownerUserId,
            deliveryOrigin: origin,
            explicitRequests: [selected]
        )
        let resolution = try await store.resolveLoadServerSelection(selection)

        XCTAssertEqual(selection.requests.map(\.id), [selected.id])
        XCTAssertEqual(resolution.retiredRequestIDs, [selected.id])
        let remaining = try await store.entriesForTesting()
        XCTAssertEqual(Set(remaining.map(\.id)), Set([unrelatedPending.id, unrelatedInflight.id]))
        XCTAssertEqual(remaining.first(where: { $0.id == unrelatedPending.id })?.status, .pending)
        XCTAssertEqual(remaining.first(where: { $0.id == unrelatedInflight.id })?.status, .inflight)
        let markers = try await store.retirementMarkersForTesting()
        XCTAssertEqual(markers.map(\.id), [selected.id])
    }

    func testInteractiveLoadServerCapturesExactRootAndFlattenedParkedLineage() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let otherOrigin = ScreenplayDraftSaveOrigin(
            documentID: "document-b",
            backendURL: origin.backendURL
        )
        let authority = UUID()
        let original = makeEntry(id: "original-conflict", draft: "Original exact words",
            createdAt: 100, origin: origin, authority: .init(id: authority, generation: 1))
        try await store.enqueue(original)
        _ = try await store.retainConflict(original)

        var firstResolution = makeEntry(id: "first-resolution", draft: "First kept words",
            createdAt: 101, origin: origin, authority: .init(id: authority, generation: 2))
        firstResolution.supersededConflictRequests = try await store.conflictResolutionReferences(
            for: original)
        try await store.enqueue(firstResolution)
        _ = try await store.retainConflict(firstResolution)

        var selectedRoot = makeEntry(id: "selected-root", draft: "Latest kept words",
            createdAt: 102, origin: origin, authority: .init(id: authority, generation: 3))
        selectedRoot.supersededConflictRequests = try await store.conflictResolutionReferences(
            for: firstResolution)
        try await store.enqueue(selectedRoot)
        _ = try await store.retainConflict(selectedRoot)

        let unrelated = makeEntry(id: "unrelated-other-document", draft: "Keep these words",
            createdAt: 103, origin: otherOrigin, authority: .init(id: UUID(), generation: 1))
        try await store.enqueue(unrelated)
        _ = try await store.retainConflict(unrelated)

        let selection = try await store.captureInteractiveLoadServerSelection(root: selectedRoot)
        XCTAssertEqual(selection.requests.map(\.id),
            [firstResolution.id, original.id, selectedRoot.id].sorted())
        let resolution = try await store.resolveLoadServerSelection(selection)

        XCTAssertEqual(resolution.retiredRequestIDs,
            [firstResolution.id, original.id, selectedRoot.id].sorted())
        let remaining = try await store.entriesForTesting()
        XCTAssertEqual(remaining.map(\.id), [unrelated.id])
        XCTAssertEqual(remaining.first.map { Data($0.draft.utf8) }, Data(unrelated.draft.utf8))
        let markers = try await store.retirementMarkersForTesting()
        XCTAssertEqual(markers.map(\.id).sorted(),
            [firstResolution.id, original.id, selectedRoot.id].sorted())
    }

    func testParkedConflictLineageTipFindsSecondConflictResolutionAfterRelaunch() async throws {
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let page = "Same exact writer page\r\n"
        let original = makeEntry(id: "original-conflict", draft: page, createdAt: 100,
            origin: origin, authority: .init(id: UUID(), generation: 1))
        try await store.enqueue(original)
        _ = try await store.retainConflict(original)
        var secondConflict = makeEntry(id: "keep-mine-conflicted", draft: page, createdAt: 101,
            origin: origin, authority: .init(id: UUID(), generation: 2))
        secondConflict.supersededConflictRequests = try await store.conflictResolutionReferences(
            for: original)
        try await store.enqueue(secondConflict)
        _ = try await store.retainConflict(secondConflict)

        let relaunched = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let tip = try await relaunched.parkedConflictLineageTip(projectId: original.projectId,
            ownerUserId: original.ownerUserId, deliveryOrigin: origin, draft: page)

        XCTAssertEqual(tip?.id, secondConflict.id)
        let exactTip = try XCTUnwrap(tip)
        let references = try await relaunched.conflictResolutionReferences(for: exactTip)
        XCTAssertEqual(Set(references.map(\.requestID)), Set([original.id, secondConflict.id]))
    }

    func testParkedConflictLineageTipRejectsUnrelatedSamePageAmbiguity() async throws {
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let page = "Identical visible words"
        let first = makeEntry(id: "unrelated-one", draft: page, createdAt: 100,
            origin: origin, authority: .init(id: UUID(), generation: 1))
        let second = makeEntry(id: "unrelated-two", draft: page, createdAt: 101,
            origin: origin, authority: .init(id: UUID(), generation: 2))
        for entry in [first, second] {
            try await store.enqueue(entry)
            _ = try await store.retainConflict(entry)
        }

        do {
            _ = try await store.parkedConflictLineageTip(projectId: first.projectId,
                ownerUserId: first.ownerUserId, deliveryOrigin: origin, draft: page)
            XCTFail("Queue order selected one of two unrelated same-page conflicts")
        } catch BackendMemoryAPIError.invalidResponse {}
        let retained = try await store.entriesForTesting()
        XCTAssertEqual(Set(retained.map(\.id)), Set([first.id, second.id]))
    }

    func testParkedConflictLineageTipRejectsMalformedFlattenedLineage() async throws {
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let page = "Exact page"
        let ancestor = makeEntry(id: "ancestor", draft: page, createdAt: 100,
            origin: origin, authority: .init(id: UUID(), generation: 1))
        try await store.enqueue(ancestor)
        _ = try await store.retainConflict(ancestor)
        var malformed = makeEntry(id: "malformed-tip", draft: page, createdAt: 101,
            origin: origin, authority: .init(id: UUID(), generation: 2))
        malformed.supersededConflictRequests = [ScreenplayDraftConflictRequestReference(
            requestID: ancestor.id,
            projectId: ancestor.projectId,
            ownerUserId: ancestor.ownerUserId,
            deliveryOrigin: origin,
            requestAuthority: ancestor.requestAuthority,
            requestDigest: String(repeating: "a", count: 64)
        )]
        try await store.enqueue(malformed)
        _ = try await store.retainConflict(malformed)

        do {
            _ = try await store.parkedConflictLineageTip(projectId: ancestor.projectId,
                ownerUserId: ancestor.ownerUserId, deliveryOrigin: origin, draft: page)
            XCTFail("Malformed lineage selected a relaunch root")
        } catch BackendMemoryAPIError.invalidResponse {}
        let markers = try await store.retirementMarkersForTesting()
        XCTAssertTrue(markers.isEmpty)
    }

    func testParkedConflictLineageTipRejectsValidButNonFlattenedChain() async throws {
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let page = "Same page through three conflicts"
        let original = makeEntry(id: "chain-original", draft: page, createdAt: 100,
            origin: origin, authority: .init(id: UUID(), generation: 1))
        try await store.enqueue(original)
        _ = try await store.retainConflict(original)
        var middle = makeEntry(id: "chain-middle", draft: page, createdAt: 101,
            origin: origin, authority: .init(id: UUID(), generation: 2))
        middle.supersededConflictRequests = try await store.conflictResolutionReferences(for: original)
        try await store.enqueue(middle)
        _ = try await store.retainConflict(middle)
        let middleReferences = try await store.conflictResolutionReferences(for: middle)
        let middleReference = try XCTUnwrap(
            middleReferences.first(where: { $0.requestID == middle.id }))
        var partialTip = makeEntry(id: "chain-partial-tip", draft: page, createdAt: 102,
            origin: origin, authority: .init(id: UUID(), generation: 3))
        // The reference itself is exact, but the original inherited reference
        // is intentionally omitted. A canonical flattened tip must reject it.
        partialTip.supersededConflictRequests = [middleReference]
        try await store.enqueue(partialTip)
        _ = try await store.retainConflict(partialTip)

        do {
            _ = try await store.parkedConflictLineageTip(projectId: original.projectId,
                ownerUserId: original.ownerUserId, deliveryOrigin: origin, draft: page)
            XCTFail("A partial non-flattened chain selected a relaunch root")
        } catch BackendMemoryAPIError.invalidResponse {}
        let retained = try await store.entriesForTesting()
        XCTAssertEqual(Set(retained.map(\.id)), Set([original.id, middle.id, partialTip.id]))
    }

    func testInteractiveLoadServerRejectsUnknownOriginInFlattenedLineage() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let legacy = makeEntry(id: "legacy-unknown-origin", draft: "Legacy exact words")
        try await store.enqueue(legacy)
        _ = try await store.retainConflict(legacy)
        do {
            _ = try await store.captureInteractiveLoadServerSelection(root: legacy)
            XCTFail("An unknown-origin root acquired interactive retirement authority")
        } catch BackendMemoryAPIError.invalidResponse {}
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "known-document",
            backendURL: URL(string: "https://save.test")!
        )
        var selectedRoot = makeEntry(id: "known-root", draft: "Current exact words",
            createdAt: 101, origin: origin, authority: .init(id: UUID(), generation: 2))
        selectedRoot.supersededConflictRequests = try await store.conflictResolutionReferences(
            for: legacy)
        try await store.enqueue(selectedRoot)
        _ = try await store.retainConflict(selectedRoot)

        do {
            _ = try await store.captureInteractiveLoadServerSelection(root: selectedRoot)
            XCTFail("Unknown-origin lineage acquired interactive retirement authority")
        } catch BackendMemoryAPIError.invalidResponse {}

        let retained = try await store.entriesForTesting()
        XCTAssertEqual(Set(retained.map(\.id)), Set([legacy.id, selectedRoot.id]))
        XCTAssertTrue(retained.allSatisfy { $0.status == .parked })
        let markers = try await store.retirementMarkersForTesting()
        XCTAssertTrue(markers.isEmpty)
    }

    func testInteractiveLoadServerHoldsExactPendingRowsAndRejectsInflightOrUncapturedRows() async throws {
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let captureStore = ScreenplayDraftSaveOutbox(
            storageDirectory: storageDirectory.appendingPathComponent("capture", isDirectory: true))
        let captureRoot = makeEntry(id: "capture-root", origin: origin,
            authority: .init(id: UUID(), generation: 1))
        let captureBlocker = makeEntry(id: "capture-blocker", draft: "Active words",
            createdAt: 101, origin: origin, authority: .init(id: UUID(), generation: 2))
        try await captureStore.enqueue(captureRoot)
        _ = try await captureStore.retainConflict(captureRoot)
        try await captureStore.enqueue(captureBlocker)
        let captured = try await captureStore.captureInteractiveLoadServerSelection(root: captureRoot)
        XCTAssertEqual(captured.deferredRequests, [captureBlocker])
        let capturedResolution = try await captureStore.resolveLoadServerSelection(
            captured, serverVersionID: "server-v2")
        XCTAssertEqual(capturedResolution.retainedRequests.map(\.id), [captureBlocker.id])
        XCTAssertEqual(capturedResolution.retainedRequests.first?.draft, captureBlocker.draft)
        XCTAssertEqual(capturedResolution.retainedRequests.first?.baseVersionId, "server-v2")
        XCTAssertEqual(capturedResolution.retainedRequests.first?.status, .parked)
        XCTAssertEqual(capturedResolution.retainedRequests.first?.lastError,
                       ScreenplayDraftSaveOutbox.loadServerDeferredReason)

        let inflightStore = ScreenplayDraftSaveOutbox(
            storageDirectory: storageDirectory.appendingPathComponent("inflight", isDirectory: true))
        try await inflightStore.enqueue(captureRoot)
        _ = try await inflightStore.retainConflict(captureRoot)
        try await inflightStore.enqueue(captureBlocker)
        try await inflightStore.markInflight(id: captureBlocker.id)
        do {
            _ = try await inflightStore.captureInteractiveLoadServerSelection(root: captureRoot)
            XCTFail("An inflight same-scope write did not block capture")
        } catch BackendMemoryAPIError.invalidResponse {}

        let resolveStore = ScreenplayDraftSaveOutbox(
            storageDirectory: storageDirectory.appendingPathComponent("resolve", isDirectory: true))
        let resolveRoot = makeEntry(id: "resolve-root", origin: origin,
            authority: .init(id: UUID(), generation: 3))
        let resolveBlocker = makeEntry(id: "resolve-blocker", draft: "Late active words",
            createdAt: 101, origin: origin, authority: .init(id: UUID(), generation: 4))
        try await resolveStore.enqueue(resolveRoot)
        _ = try await resolveStore.retainConflict(resolveRoot)
        let selection = try await resolveStore.captureInteractiveLoadServerSelection(root: resolveRoot)
        try await resolveStore.enqueue(resolveBlocker)
        do {
            _ = try await resolveStore.resolveLoadServerSelection(selection)
            XCTFail("A pending same-scope write did not block resolution")
        } catch BackendMemoryAPIError.invalidResponse {}
        try await resolveStore.markInflight(id: resolveBlocker.id)
        do {
            _ = try await resolveStore.resolveLoadServerSelection(selection)
            XCTFail("An inflight same-scope write did not block resolution")
        } catch BackendMemoryAPIError.invalidResponse {}
        let resolveRows = try await resolveStore.entriesForTesting()
        let resolveMarkers = try await resolveStore.retirementMarkersForTesting()
        XCTAssertEqual(Set(resolveRows.map(\.id)), Set([resolveRoot.id, resolveBlocker.id]))
        XCTAssertTrue(resolveMarkers.isEmpty)
    }

    func testInteractiveLoadServerFailsClosedWhenSelectionDisappearsOrMutates() async throws {
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let otherOrigin = ScreenplayDraftSaveOrigin(
            documentID: "document-b",
            backendURL: origin.backendURL
        )
        let disappearedStore = ScreenplayDraftSaveOutbox(
            storageDirectory: storageDirectory.appendingPathComponent("disappeared", isDirectory: true))
        let ancestor = makeEntry(id: "ancestor", origin: origin,
            authority: .init(id: UUID(), generation: 1))
        try await disappearedStore.enqueue(ancestor)
        _ = try await disappearedStore.retainConflict(ancestor)
        var root = makeEntry(id: "root", createdAt: 101, origin: origin,
            authority: .init(id: UUID(), generation: 2))
        root.supersededConflictRequests = try await disappearedStore.conflictResolutionReferences(
            for: ancestor)
        let unrelated = makeEntry(id: "unrelated", draft: "Unrelated exact words",
            createdAt: 102, origin: otherOrigin, authority: .init(id: UUID(), generation: 1))
        try await disappearedStore.enqueue(root)
        _ = try await disappearedStore.retainConflict(root)
        try await disappearedStore.enqueue(unrelated)
        let disappearedSelection = try await disappearedStore
            .captureInteractiveLoadServerSelection(root: root)
        try await disappearedStore.remove(id: ancestor.id)
        do {
            _ = try await disappearedStore.resolveLoadServerSelection(disappearedSelection)
            XCTFail("A disappeared selected ancestor was silently retired")
        } catch BackendMemoryAPIError.invalidResponse {}
        let disappearedRows = try await disappearedStore.entriesForTesting()
        let disappearedMarkers = try await disappearedStore.retirementMarkersForTesting()
        XCTAssertEqual(Set(disappearedRows.map(\.id)), Set([root.id, unrelated.id]))
        XCTAssertTrue(disappearedMarkers.isEmpty)

        let mutatedStore = ScreenplayDraftSaveOutbox(
            storageDirectory: storageDirectory.appendingPathComponent("mutated", isDirectory: true))
        let authority = ScreenplayDraftSaveRequestAuthority(id: UUID(), generation: 1)
        let original = makeEntry(id: "mutable-root", draft: "Original bytes", origin: origin,
            authority: authority)
        try await mutatedStore.enqueue(original)
        _ = try await mutatedStore.retainConflict(original)
        let mutatedSelection = try await mutatedStore.captureInteractiveLoadServerSelection(root: original)
        try await mutatedStore.remove(id: original.id)
        let replacement = makeEntry(id: original.id, draft: "Different bytes", origin: origin,
            authority: authority)
        _ = try await mutatedStore.retainConflict(replacement)
        do {
            _ = try await mutatedStore.resolveLoadServerSelection(mutatedSelection)
            XCTFail("A byte-distinct replacement was retired by stale selection authority")
        } catch BackendMemoryAPIError.invalidResponse {}
        let mutatedRows = try await mutatedStore.entriesForTesting()
        let retainedReplacement = try XCTUnwrap(mutatedRows.first)
        XCTAssertEqual(Data(retainedReplacement.draft.utf8), Data(replacement.draft.utf8))
        let mutatedMarkers = try await mutatedStore.retirementMarkersForTesting()
        XCTAssertTrue(mutatedMarkers.isEmpty)
    }

    func testLoadServerDoesNotInferConsentForAnotherParkedDraftInTheSameDocument() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "shared-document",
            backendURL: URL(string: "https://save.test")!
        )
        let lineage = UUID()
        let selected = makeEntry(id: "discard-this", draft: "Writer explicitly discarded these words",
            createdAt: 100, origin: origin, authority: .init(id: lineage, generation: 1))
        let preserved = makeEntry(id: "preserve-this", draft: "Different writer words must remain",
            createdAt: 101, origin: origin, authority: .init(id: lineage, generation: 2))
        try await store.enqueue(selected)
        try await store.enqueue(preserved)
        _ = try await store.retainConflict(projectId: selected.projectId,
            ownerUserId: selected.ownerUserId, deliveryOrigin: origin)

        let parkedBeforeChoice = try await store.entriesForTesting()
        XCTAssertEqual(Set(parkedBeforeChoice.map(\.id)), Set([selected.id, preserved.id]))
        XCTAssertTrue(parkedBeforeChoice.allSatisfy { $0.status == .parked })
        let selection = try await store.captureLoadServerSelection(projectId: selected.projectId,
            ownerUserId: selected.ownerUserId, deliveryOrigin: origin, explicitRequests: [selected])
        let resolution = try await store.resolveLoadServerSelection(selection)

        XCTAssertEqual(resolution.retiredRequestIDs, [selected.id])
        let afterChoice = try await store.entriesForTesting()
        XCTAssertEqual(afterChoice.map(\.id), [preserved.id])
        XCTAssertEqual(afterChoice.first?.status, .parked)
        XCTAssertEqual(afterChoice.first.map { Data($0.draft.utf8) }, Data(preserved.draft.utf8))

        try await store.markRetryable(id: preserved.id, error: "Writer chose Keep Mine")
        guard case .deliver(let deliverable)? = try await store.beginDeliveryUnlessRetiredByLoadServer(preserved) else {
            return XCTFail("The unselected parked draft was fenced by another request's Load Server choice")
        }
        XCTAssertEqual(deliverable.id, preserved.id)
        XCTAssertEqual(Data(deliverable.draft.utf8), Data(preserved.draft.utf8))
    }

    func testRetiredRequestUsesStableIdentityNotCreatedAtAndSurvivesRelaunch() async throws {
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let authority = ScreenplayDraftSaveRequestAuthority(id: UUID(), generation: 7)
        let original = makeEntry(id: "late-request", draft: "Exact late words", createdAt: 100,
            origin: origin, authority: authority)
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let selection = try await store.captureLoadServerSelection(
            projectId: original.projectId,
            ownerUserId: original.ownerUserId,
            deliveryOrigin: origin,
            explicitRequests: [original]
        )
        _ = try await store.resolveLoadServerSelection(selection)

        let relaunched = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let rematerialized = makeEntry(id: original.id, draft: original.draft, createdAt: 999,
            origin: origin, authority: authority)
        let rejected = try await relaunched.beginDeliveryUnlessRetiredByLoadServer(rematerialized)
        XCTAssertNil(rejected, "A reconstructed wall clock must not revive an exact retired request")
        let queued = try await relaunched.enqueueUnlessRetiredByLoadServer(rematerialized)
        XCTAssertFalse(queued, "A retired request must not be reported as queued")
        let afterRejection = try await relaunched.entriesForTesting()
        XCTAssertTrue(afterRejection.isEmpty, "A retired request must not reappear as active work")
        let independent = makeEntry(id: "independent", draft: "Independent words", createdAt: 50,
            origin: origin, authority: authority)
        guard case .deliver(let admitted)? = try await relaunched.beginDeliveryUnlessRetiredByLoadServer(independent) else {
            return XCTFail("A different request ID was swept by another request's authority")
        }
        XCTAssertEqual(admitted.id, independent.id)
    }

    func testSameRequestIDWithDifferentAuthorityIsRejectedNotSilentlyRetired() async throws {
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let original = makeEntry(id: "stable-id", origin: origin,
            authority: .init(id: UUID(), generation: 1))
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let selection = try await store.captureLoadServerSelection(projectId: original.projectId,
            ownerUserId: original.ownerUserId, deliveryOrigin: origin, explicitRequests: [original])
        _ = try await store.resolveLoadServerSelection(selection)
        let reused = makeEntry(id: original.id, origin: origin,
            authority: .init(id: UUID(), generation: 1))

        do {
            _ = try await store.beginDeliveryUnlessRetiredByLoadServer(reused)
            XCTFail("A reused ID with different authority was silently treated as the retired request")
        } catch BackendMemoryAPIError.server(let status, let message) {
            XCTAssertEqual(status, 409)
            XCTAssertEqual(message, "screenplay_save_id_reused")
        }
    }

    func testLoadServerResolutionWriteFailureKeepsRowsAndDoesNotInstallFence() async throws {
        let failMarker = storageDirectory.appendingPathComponent("fail-next-write")
        let store = ScreenplayDraftSaveOutbox(
            storageDirectory: storageDirectory,
            manifestWriter: { data, url in
                if FileManager.default.fileExists(atPath: failMarker.path) {
                    throw NSError(domain: "ScreenplayDraftSaveOutboxTests", code: 1)
                }
                try data.write(to: url, options: .atomic)
            }
        )
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let request = makeEntry(id: "kept", origin: origin,
            authority: .init(id: UUID(), generation: 1))
        try await store.enqueue(request)
        _ = try await store.retainConflict(request)
        let selection = try await store.captureLoadServerSelection(projectId: request.projectId,
            ownerUserId: request.ownerUserId, deliveryOrigin: origin, explicitRequests: [request])
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let before = try Data(contentsOf: manifestURL)
        try Data().write(to: failMarker)

        do {
            _ = try await store.resolveLoadServerSelection(selection)
            XCTFail("A failed atomic write reported a durable Load Server resolution")
        } catch {
            XCTAssertFalse(error.localizedDescription.isEmpty)
        }
        try FileManager.default.removeItem(at: failMarker)
        XCTAssertEqual(try Data(contentsOf: manifestURL), before)
        let retainedRows = try await store.entriesForTesting()
        let retainedMarkers = try await store.retirementMarkersForTesting()
        XCTAssertEqual(retainedRows.map(\.id), [request.id])
        XCTAssertTrue(retainedMarkers.isEmpty)
    }

    func testArrayOnlyDowngradeMarkerFailsClosedAndSurvivesPriorNormalCleanup() async throws {
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let request = makeEntry(id: "retired-id", draft: "Retired words", origin: origin,
            authority: .init(id: UUID(), generation: 12))
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let selection = try await store.captureLoadServerSelection(projectId: request.projectId,
            ownerUserId: request.ownerUserId, deliveryOrigin: origin, explicitRequests: [request])
        _ = try await store.resolveLoadServerSelection(selection)
        let data = try Data(contentsOf: storageDirectory.appendingPathComponent("queue.json"))
        var priorRows = try JSONDecoder().decode([PriorDraftSaveOutboxEntry].self, from: data)
        let marker = try XCTUnwrap(priorRows.first(where: { $0.id == request.id }))

        XCTAssertEqual(marker.status, .parked)
        XCTAssertTrue(marker.draft.isEmpty)
        XCTAssertTrue(marker.title.isEmpty)
        XCTAssertTrue(marker.phase.isEmpty)
        XCTAssertTrue(marker.studioWriteAnchors.isEmpty)
        XCTAssertTrue(marker.screenplayBindings.isEmpty)
        XCTAssertTrue(marker.baseVersionId.isEmpty)
        XCTAssertNotEqual(marker.projectId, request.projectId)
        XCTAssertNotEqual(marker.ownerUserId, request.ownerUserId)
        XCTAssertNotEqual(marker.deliveryOrigin, request.deliveryOrigin)
        XCTAssertEqual(priorRows.filter { $0.status == .parked }.count, 1,
            "The prior global snapshot reports one conservative parked item after downgrade")
        XCTAssertTrue(priorRows.filter { $0.ownerUserId == request.ownerUserId && $0.status == .parked }.isEmpty)

        let ordinarySuccess = makeEntry(id: "ordinary-success", draft: "Other saved words", createdAt: 200,
            origin: origin, authority: .init(id: UUID(), generation: 13))
        let priorOrdinarySuccess = try JSONDecoder().decode(PriorDraftSaveOutboxEntry.self,
            from: JSONEncoder().encode(ordinarySuccess))
        priorRows.append(priorOrdinarySuccess)
        let priorBeginNextHead = priorRows.first { row in
            row.projectId == request.projectId && row.ownerUserId == request.ownerUserId &&
                row.initialization == nil
        }
        XCTAssertEqual(priorBeginNextHead?.id, ordinarySuccess.id,
            "The sentinel marker must not block the prior app's owner/project drain")
        let completedIndex = try XCTUnwrap(priorRows.firstIndex(where: { $0.id == ordinarySuccess.id }))
        let priorCompleted = priorRows.remove(at: completedIndex)
        priorRows.removeAll { row in
            row.projectId == priorCompleted.projectId &&
                row.ownerUserId == priorCompleted.ownerUserId &&
                row.deliveryOrigin == priorCompleted.deliveryOrigin && row.status == .parked &&
                row.createdAt <= priorCompleted.createdAt
        }
        XCTAssertNotNil(priorRows.first(where: { $0.id == request.id }),
            "The prior markSucceeded cleanup would remove the downgrade fence")
        priorRows.removeAll { $0.projectId == request.projectId && $0.ownerUserId == request.ownerUserId }
        XCTAssertNotNil(priorRows.first(where: { $0.id == request.id }),
            "The prior project removeAll would remove the sentinel-scoped fence")
        XCTAssertFalse(marker.projectId == request.projectId && marker.ownerUserId == request.ownerUserId &&
            marker.deliveryOrigin == request.deliveryOrigin && marker.draft.utf8.elementsEqual(request.draft.utf8),
            "The prior same-ID admission guard must fail closed on the sentinel marker")

        var priorRetriedMarker = marker
        priorRetriedMarker.status = .pending
        priorRetriedMarker.lastError = "Interrupted while saving."
        try JSONEncoder().encode([priorRetriedMarker]).write(
            to: storageDirectory.appendingPathComponent("queue.json"), options: .atomic)
        let upgradedAgain = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let stillRejected = try await upgradedAgain.beginDeliveryUnlessRetiredByLoadServer(request)
        let normalizedMarkers = try await upgradedAgain.retirementMarkersForTesting()
        XCTAssertNil(stillRejected)
        XCTAssertEqual(normalizedMarkers.map(\.status), [.parked],
            "A prior retry mutation must not erase the fence when the new app returns")
    }

    func testRetirementMarkerKeepsOnlyScopeAuthorityAndCanonicalDigest() async throws {
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-private",
            backendURL: URL(string: "https://save.test")!
        )
        let privateDraft = "PRIVATE RETIRED WORDS\r\nCafe\u{0301}\t"
        let request = makeEntry(id: "privacy-fence", draft: privateDraft, origin: origin,
            authority: .init(id: UUID(), generation: 21))
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let selection = try await store.captureLoadServerSelection(projectId: request.projectId,
            ownerUserId: request.ownerUserId, deliveryOrigin: origin, explicitRequests: [request])
        _ = try await store.resolveLoadServerSelection(selection)

        let privacyMarkers = try await store.retirementMarkersForTesting()
        let marker = try XCTUnwrap(privacyMarkers.first)
        XCTAssertTrue(marker.draft.isEmpty)
        XCTAssertTrue(marker.title.isEmpty)
        XCTAssertTrue(marker.phase.isEmpty)
        XCTAssertTrue(marker.studioWriteAnchors.isEmpty)
        XCTAssertTrue(marker.screenplayBindings.isEmpty)
        XCTAssertTrue(marker.baseVersionId.isEmpty)
        XCTAssertNil(marker.loadServerRetirement?.source)
        XCTAssertNil(marker.loadServerRetirement?.notes)
        XCTAssertEqual(marker.loadServerRetirement?.requestDigest?.count, 64)
        let manifest = try Data(contentsOf: storageDirectory.appendingPathComponent("queue.json"))
        XCTAssertNil(manifest.range(of: Data(privateDraft.utf8)),
            "A retirement fence must not retain screenplay bytes")
    }

    func testUnreleasedV1MarkerIsRewrittenWithoutItsScreenplayContent() async throws {
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let authority = ScreenplayDraftSaveRequestAuthority(id: UUID(), generation: 22)
        let privateDraft = "LEGACY PRIVATE RETIRED WORDS"
        let request = makeEntry(id: "legacy-v1-marker", draft: privateDraft, origin: origin,
            authority: authority)
        let retirement = ScreenplayDraftLoadServerRetirement(
            requestID: request.id,
            projectId: request.projectId,
            ownerUserId: request.ownerUserId,
            deliveryOrigin: origin,
            requestAuthority: authority,
            requestDigest: nil,
            source: request.source,
            notes: request.notes
        )
        let retirementNotes = "load-server-retirement-v1:" +
            (try JSONEncoder().encode(retirement)).base64EncodedString()
        var marker = ScreenplayDraftSaveOutboxEntry(
            id: request.id,
            projectId: "load-server-retirement",
            ownerUserId: "load-server-retirement",
            draft: request.draft,
            title: request.title,
            phase: request.phase,
            notes: retirementNotes,
            source: "studio_load_server_retirement",
            studioWriteAnchors: request.studioWriteAnchors,
            screenplayBindings: request.screenplayBindings,
            baseVersionId: request.baseVersionId,
            createdAt: request.createdAt,
            updatedAt: request.updatedAt,
            status: .parked,
            retries: request.retries,
            nextAttemptAt: 0,
            lastError: "old marker"
        )
        marker.deliveryOrigin = .init(
            documentID: "retired-\(authority.id.uuidString.lowercased())-\(authority.generation)",
            backendURL: origin.backendURL
        )
        marker.requestAuthority = authority
        marker.loadServerRetirement = retirement
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        try JSONEncoder().encode([marker]).write(to: manifestURL, options: .atomic)

        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let migratedMarkers = try await store.retirementMarkersForTesting()
        let migrated = try XCTUnwrap(migratedMarkers.first)
        XCTAssertTrue(migrated.draft.isEmpty)
        XCTAssertTrue(migrated.notes.hasPrefix("load-server-retirement-v2:"))
        XCTAssertNotNil(migrated.loadServerRetirement?.requestDigest)
        XCTAssertNil(try Data(contentsOf: manifestURL).range(of: Data(privateDraft.utf8)))
    }

    func testCanonicalDigestLengthPrefixesEveryExactField() async throws {
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let authority = ScreenplayDraftSaveRequestAuthority(id: UUID(), generation: 30)
        let seed = makeEntry(id: "boundary-safe", draft: "Exact\r\nCafe\u{0301}", origin: origin,
            authority: authority)
        var originalPayload = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(seed)) as? [String: Any]
        )
        originalPayload["title"] = "ab"
        originalPayload["phase"] = "c"
        let original = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: originalPayload))
        var boundaryCollisionPayload = originalPayload
        boundaryCollisionPayload["title"] = "a"
        boundaryCollisionPayload["phase"] = "bc"
        let boundaryCollision = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: boundaryCollisionPayload))

        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let selection = try await store.captureLoadServerSelection(projectId: original.projectId,
            ownerUserId: original.ownerUserId, deliveryOrigin: origin, explicitRequests: [original])
        _ = try await store.resolveLoadServerSelection(selection)
        do {
            _ = try await store.beginDeliveryUnlessRetiredByLoadServer(boundaryCollision)
            XCTFail("Adjacent field concatenation collided with the retired request")
        } catch BackendMemoryAPIError.server(let status, let message) {
            XCTAssertEqual(status, 409)
            XCTAssertEqual(message, "screenplay_save_id_reused")
        }

        var byteDistinctPayload = originalPayload
        byteDistinctPayload["draft"] = original.draft.precomposedStringWithCanonicalMapping
        let byteDistinct = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: byteDistinctPayload))
        do {
            _ = try await store.beginDeliveryUnlessRetiredByLoadServer(byteDistinct)
            XCTFail("Unicode-normalized screenplay bytes collided with the retired request")
        } catch BackendMemoryAPIError.server(let status, let message) {
            XCTAssertEqual(status, 409)
            XCTAssertEqual(message, "screenplay_save_id_reused")
        }
    }

    func testExactConflictRetentionPreservesDistinctLegacyNilOriginDrafts() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let selected = makeEntry(id: "legacy-selected", draft: "First writer's words")
        let other = makeEntry(id: "legacy-other", draft: "Different writer's words")
        try await store.enqueue(selected)
        try await store.enqueue(other)
        let retained = try await store.retainConflict(selected)
        XCTAssertEqual(retained?.id, selected.id)
        let relaunched = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let rows = try await relaunched.entriesForTesting()
        XCTAssertEqual(rows.first(where: { $0.id == selected.id })?.status, .parked)
        XCTAssertEqual(rows.first(where: { $0.id == other.id })?.status, .pending)
        XCTAssertEqual(rows.first(where: { $0.id == other.id })?.draft, other.draft)

        let absent = makeEntry(id: "absent", draft: "Not on disk",
            authority: .init(id: UUID(), generation: 0))
        do {
            _ = try await relaunched.retainConflict(absent)
            XCTFail("A nil-origin request must not be manufactured as a conflict")
        } catch BackendMemoryAPIError.invalidResponse {}
        let after = try await relaunched.entriesForTesting()
        XCTAssertFalse(after.contains { $0.id == absent.id })
    }

    func testAcknowledgedSaveDoesNotDeleteOrRebaseDistinctParkedDrafts() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let origin = ScreenplayDraftSaveOrigin(documentID: "same-document", backendURL: URL(string: "https://save.test")!)
        let older = makeEntry(id: "parked-older", draft: "Older distinct draft", createdAt: 100, origin: origin)
        let completed = makeEntry(id: "acknowledged", draft: "Saved draft", createdAt: 101, origin: origin)
        let newer = makeEntry(id: "parked-newer", draft: "Newer distinct draft", createdAt: 102, origin: origin)
        try await store.enqueue(older)
        try await store.enqueue(completed)
        try await store.enqueue(newer)
        _ = try await store.retainConflict(older)
        _ = try await store.retainConflict(newer)
        try await store.markSucceeded(id: completed.id, serverVersionId: "new-server-head")
        let relaunched = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let remaining = try await relaunched.parkedConflictEntries(projectId: older.projectId, ownerUserId: older.ownerUserId)
        XCTAssertEqual(Set(remaining.map(\.id)), Set([older.id, newer.id]))
        XCTAssertEqual(remaining.first(where: { $0.id == older.id })?.draft, older.draft)
        XCTAssertEqual(remaining.first(where: { $0.id == newer.id })?.draft, newer.draft)
        XCTAssertTrue(remaining.allSatisfy { $0.baseVersionId == "server-v1" })
    }

    func testConflictLineageReferencesExactLegacyNilOriginWithoutWriterContent() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let legacy = makeEntry(id: "legacy-nil-origin", draft: "Private exact writer words")
        try await store.enqueue(legacy)
        _ = try await store.retainConflict(legacy)

        let references = try await store.conflictResolutionReferences(for: legacy)

        let reference = try XCTUnwrap(references.first)
        XCTAssertEqual(reference.requestID, legacy.id)
        XCTAssertNil(reference.deliveryOrigin)
        XCTAssertNil(reference.requestAuthority)
        XCTAssertEqual(reference.requestDigest.count, 64)
        let payload = try XCTUnwrap(JSONSerialization.jsonObject(
            with: JSONEncoder().encode(reference)) as? [String: Any])
        XCTAssertNil(payload["draft"])
        XCTAssertNil(payload["title"])
        XCTAssertNil(payload["notes"])
        XCTAssertNil(payload["source"])
        XCTAssertFalse(String(data: try JSONEncoder().encode(reference), encoding: .utf8)?
            .contains(legacy.draft) == true)
    }

    func testDifferentConflictLineagesNeverCoalesce() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let first = makeEntry(id: "conflict-one", draft: "First private draft", createdAt: 100)
        let second = makeEntry(id: "conflict-two", draft: "Second private draft", createdAt: 101)
        for conflict in [first, second] {
            try await store.enqueue(conflict)
            _ = try await store.retainConflict(conflict)
        }
        let firstReferences = try await store.conflictResolutionReferences(for: first)
        let secondReferences = try await store.conflictResolutionReferences(for: second)
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        var firstResolution = makeEntry(id: "resolution-one", draft: "Same replacement", createdAt: 102,
            origin: origin, authority: .init(id: UUID(), generation: 1))
        firstResolution.supersededConflictRequests = firstReferences
        var secondResolution = makeEntry(id: "resolution-two", draft: "Same replacement", createdAt: 103,
            origin: origin, authority: .init(id: UUID(), generation: 2))
        secondResolution.supersededConflictRequests = secondReferences

        let firstAdmitted = try await store.enqueueForDelivery(firstResolution)
        let secondAdmitted = try await store.enqueueForDelivery(secondResolution)
        XCTAssertEqual(firstAdmitted.id, firstResolution.id)
        XCTAssertEqual(secondAdmitted.id, secondResolution.id)
        let rows = try await store.entriesForTesting()
        XCTAssertTrue(rows.contains { $0.id == firstResolution.id })
        XCTAssertTrue(rows.contains { $0.id == secondResolution.id })
    }

    func testOnlyExactLinkedResolutionMayCrossItsParkedConflictBarrier() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let conflict = makeDeliverableEntry(id: "parked", draft: "Original", createdAt: 100)
        try await store.enqueue(conflict)
        _ = try await store.retainConflict(conflict)
        let references = try await store.conflictResolutionReferences(for: conflict)
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        var resolution = makeDeliverableEntry(id: "resolution", draft: "Replacement", createdAt: 101,
            origin: origin, authority: .init(id: UUID(), generation: 3))
        resolution.supersededConflictRequests = references
        try await store.enqueue(resolution)
        try await store.enqueue(makeDeliverableEntry(id: "later-unrelated", draft: "Later", createdAt: 102,
            origin: origin, authority: .init(id: UUID(), generation: 4)))

        let next = try await store.beginNext(projectId: conflict.projectId,
            ownerUserId: conflict.ownerUserId, force: true)
        XCTAssertEqual(next?.id, resolution.id)

        let blockedDirectory = storageDirectory.appendingPathComponent("unrelated-barrier", isDirectory: true)
        let blockedStore = ScreenplayDraftSaveOutbox(storageDirectory: blockedDirectory)
        let unrelatedConflict = makeDeliverableEntry(id: "unrelated-conflict", draft: "Other", createdAt: 99)
        try await blockedStore.enqueue(unrelatedConflict)
        _ = try await blockedStore.retainConflict(unrelatedConflict)
        try await blockedStore.enqueue(resolution)
        let blocked = try await blockedStore.beginNext(projectId: conflict.projectId,
            ownerUserId: conflict.ownerUserId, force: true)
        XCTAssertNil(blocked)
    }

    func testLinkedResolutionCannotSkipAnEarlierUnrelatedPendingEdit() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let conflict = makeDeliverableEntry(id: "parked", draft: "Original", createdAt: 100)
        try await store.enqueue(conflict)
        _ = try await store.retainConflict(conflict)
        let references = try await store.conflictResolutionReferences(for: conflict)
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        try await store.enqueue(makeDeliverableEntry(id: "unrelated-pending", draft: "Independent edit",
            createdAt: 101, origin: origin, authority: .init(id: UUID(), generation: 5)))
        var resolution = makeDeliverableEntry(id: "resolution", draft: "Replacement", createdAt: 102,
            origin: origin, authority: .init(id: UUID(), generation: 6))
        resolution.supersededConflictRequests = references
        try await store.enqueue(resolution)

        let next = try await store.beginNext(projectId: conflict.projectId,
            ownerUserId: conflict.ownerUserId, force: true)

        XCTAssertNil(next)
        let rows = try await store.entriesForTesting()
        XCTAssertEqual(rows.first(where: { $0.id == "unrelated-pending" })?.status, .pending)
        XCTAssertEqual(rows.first(where: { $0.id == resolution.id })?.status, .pending)
    }

    func testKeepMineBypassesOnlyCapturedPendingRowThenRebasesItsExactWords() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let conflict = makeDeliverableEntry(id: "parked", draft: "Conflict words", createdAt: 100,
            origin: origin, authority: .init(id: UUID(), generation: 1))
        let pending = makeDeliverableEntry(id: "pending-newer", draft: "Exact newer words", createdAt: 101,
            origin: origin, authority: .init(id: UUID(), generation: 2))
        try await store.enqueue(conflict)
        _ = try await store.retainConflict(conflict)
        try await store.enqueue(pending)
        let plan = try await store.conflictResolutionPlan(for: conflict)
        XCTAssertEqual(plan.deferredConflictRequests.map(\.requestID), [pending.id])

        var resolution = makeDeliverableEntry(id: "resolution", draft: conflict.draft, createdAt: 102,
            origin: origin, authority: .init(id: UUID(), generation: 3))
        resolution.supersededConflictRequests = plan.supersededConflictRequests
        resolution.deferredConflictRequests = plan.deferredConflictRequests
        try await store.enqueue(resolution)

        let claimed = try await store.beginNext(projectId: conflict.projectId,
            ownerUserId: conflict.ownerUserId, deliveryOrigin: origin, force: true)
        XCTAssertEqual(claimed?.id, resolution.id)
        try await store.completeConfirmedConflictResolution(
            resolution,
            evidence: try makeOrdinaryEvidence(for: resolution, versionID: "server-v2"),
            echoedRequestID: resolution.id)

        let remaining = try await store.entriesForTesting()
        let retained = try XCTUnwrap(remaining.first(where: { $0.id == pending.id }))
        XCTAssertEqual(Data(retained.draft.utf8), Data(pending.draft.utf8))
        XCTAssertEqual(retained.baseVersionId, "server-v2")
        XCTAssertEqual(retained.status, .pending)
        let next = try await store.beginNext(projectId: conflict.projectId,
            ownerUserId: conflict.ownerUserId, deliveryOrigin: origin, force: true)
        XCTAssertEqual(next?.id, pending.id)
    }

    func testKeepMineFailsClosedWhenCapturedPendingRowChangesBeforeAdmission() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let conflict = makeDeliverableEntry(id: "parked", draft: "Conflict words", createdAt: 100,
            origin: origin, authority: .init(id: UUID(), generation: 1))
        let pending = makeDeliverableEntry(id: "pending", draft: "Original pending bytes", createdAt: 101,
            origin: origin, authority: .init(id: UUID(), generation: 2))
        try await store.enqueue(conflict)
        _ = try await store.retainConflict(conflict)
        try await store.enqueue(pending)
        let plan = try await store.conflictResolutionPlan(for: conflict)
        try await store.remove(id: pending.id)
        let replacement = makeDeliverableEntry(id: pending.id, draft: "Changed pending bytes", createdAt: 101,
            origin: origin, authority: pending.requestAuthority)
        try await store.enqueue(replacement)

        var resolution = makeDeliverableEntry(id: "resolution", draft: conflict.draft, createdAt: 102,
            origin: origin, authority: .init(id: UUID(), generation: 3))
        resolution.supersededConflictRequests = plan.supersededConflictRequests
        resolution.deferredConflictRequests = plan.deferredConflictRequests
        try await store.enqueue(resolution)

        let claimed = try await store.beginNext(projectId: conflict.projectId,
            ownerUserId: conflict.ownerUserId, deliveryOrigin: origin, force: true)
        XCTAssertNil(claimed)
        let rows = try await store.entriesForTesting()
        XCTAssertEqual(rows.first(where: { $0.id == pending.id })?.draft, replacement.draft)
        XCTAssertEqual(rows.first(where: { $0.id == resolution.id })?.status, .pending)
    }

    func testConfirmedConflictCompletionIsAtomicAndPreservesUnrelatedRows() async throws {
        let failMarker = storageDirectory.appendingPathComponent("fail-next-write")
        let store = ScreenplayDraftSaveOutbox(
            storageDirectory: storageDirectory,
            manifestWriter: { data, url in
                if FileManager.default.fileExists(atPath: failMarker.path) {
                    throw NSError(domain: "ScreenplayDraftSaveOutboxTests", code: 3)
                }
                try data.write(to: url, options: .atomic)
            }
        )
        let conflict = makeEntry(id: "original", draft: "Original private words", createdAt: 100)
        try await store.enqueue(conflict)
        _ = try await store.retainConflict(conflict)
        let references = try await store.conflictResolutionReferences(for: conflict)
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        var resolution = makeEntry(id: "resolution", draft: "Kept writer words", createdAt: 101,
            origin: origin, authority: .init(id: UUID(), generation: 5))
        resolution.supersededConflictRequests = references
        let unrelated = replacingOwner(of: makeEntry(id: "unrelated", draft: "Other owner words",
            createdAt: 102, origin: origin), with: "user-2")
        try await store.enqueue(resolution)
        try await store.enqueue(unrelated)
        try await store.markInflight(id: resolution.id)
        let evidence = try makeOrdinaryEvidence(for: resolution, versionID: "server-v2")
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let before = try Data(contentsOf: manifestURL)
        XCTAssertNotNil(try JSONSerialization.jsonObject(with: before) as? [String: Any])
        try Data().write(to: failMarker)

        do {
            try await store.completeConfirmedConflictResolution(resolution, evidence: evidence,
                echoedRequestID: resolution.id)
            XCTFail("A failed atomic manifest write reported completion")
        } catch {}
        XCTAssertEqual(try Data(contentsOf: manifestURL), before)
        let rolledBack = try await store.entriesForTesting()
        XCTAssertEqual(Set(rolledBack.map(\.id)), Set([conflict.id, resolution.id, unrelated.id]))

        try FileManager.default.removeItem(at: failMarker)
        try await store.completeConfirmedConflictResolution(resolution, evidence: evidence,
            echoedRequestID: resolution.id)
        let remaining = try await store.entriesForTesting()
        XCTAssertEqual(remaining.map(\.id), [unrelated.id])
        XCTAssertEqual(remaining.first?.draft, unrelated.draft)
        XCTAssertNotNil(try JSONSerialization.jsonObject(
            with: Data(contentsOf: manifestURL)) as? [[String: Any]])
    }

    func testConfirmedConflictCompletionReturnsToLegacyArrayAndPreservesRetirementMarker() async throws {
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let retired = makeEntry(id: "retired-load-server", draft: "Retired words", createdAt: 90,
            origin: origin, authority: .init(id: UUID(), generation: 1))
        let selection = try await store.captureLoadServerSelection(projectId: retired.projectId,
            ownerUserId: retired.ownerUserId, deliveryOrigin: origin, explicitRequests: [retired])
        _ = try await store.resolveLoadServerSelection(selection)

        let conflict = makeEntry(id: "original-conflict", draft: "Original words", createdAt: 100,
            origin: origin, authority: .init(id: UUID(), generation: 2))
        try await store.enqueue(conflict)
        _ = try await store.retainConflict(conflict)
        var resolution = makeEntry(id: "confirmed-keep-mine", draft: "Kept words", createdAt: 101,
            origin: origin, authority: .init(id: UUID(), generation: 3))
        resolution.supersededConflictRequests = try await store.conflictResolutionReferences(for: conflict)
        let unrelated = makeEntry(id: "unrelated-pending", draft: "Later words", createdAt: 102,
            origin: origin, authority: .init(id: UUID(), generation: 4))
        try await store.enqueue(resolution)
        try await store.enqueue(unrelated)
        try await store.markInflight(id: resolution.id)
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        XCTAssertNotNil(try JSONSerialization.jsonObject(
            with: Data(contentsOf: manifestURL)) as? [String: Any])

        try await store.completeConfirmedConflictResolution(resolution,
            evidence: try makeOrdinaryEvidence(for: resolution, versionID: "server-v2"),
            echoedRequestID: resolution.id)

        let legacyBytes = try Data(contentsOf: manifestURL)
        let priorRows = try JSONDecoder().decode([PriorDraftSaveOutboxEntry].self, from: legacyBytes)
        XCTAssertEqual(Set(priorRows.map(\.id)), Set([retired.id, unrelated.id]))
        let relaunched = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let restoredEntries = try await relaunched.entriesForTesting()
        let restoredMarkers = try await relaunched.retirementMarkersForTesting()
        XCTAssertEqual(restoredEntries.map(\.id), [unrelated.id])
        XCTAssertEqual(restoredMarkers.map(\.id), [retired.id])
    }

    func testParkedConflictCopiesRemainSeparateAndOwnerScopedAfterRelaunch() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let first = makeEntry(id: "copy-one", draft: "First writer's words")
        let second = makeEntry(id: "copy-two", draft: "Different writer's words")
        let otherOwner = replacingOwner(of: makeEntry(id: "other-owner", draft: "Private other owner"), with: "user-2")
        try await store.enqueue(first)
        try await store.enqueue(second)
        try await store.enqueue(otherOwner)
        _ = try await store.retainConflict(first)
        _ = try await store.retainConflict(second)
        _ = try await store.retainConflict(otherOwner)
        let relaunched = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let copies = try await relaunched.parkedConflictEntries(projectId: first.projectId, ownerUserId: first.ownerUserId)
        XCTAssertEqual(Set(copies.map(\.id)), Set([first.id, second.id]))
        XCTAssertEqual(Set(copies.map(\.draft)), Set([first.draft, second.draft]))
        let otherCopies = try await relaunched.parkedConflictEntries(projectId: first.projectId, ownerUserId: otherOwner.ownerUserId)
        XCTAssertEqual(otherCopies.map(\.id), [otherOwner.id])
    }

    func testConflictSelectionRejectsCanonicallyEqualButByteDistinctMetadata() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let original = makeEntry(id: "exact-metadata", draft: "Same writer words")
        var payload = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(original)) as? [String: Any])
        payload["notes"] = "caf\u{00e9}"
        let stored = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: payload))
        payload["notes"] = "cafe\u{0301}"
        let changed = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: payload))
        XCTAssertFalse(stored.notes.utf8.elementsEqual(changed.notes.utf8))
        try await store.enqueue(stored)
        _ = try await store.retainConflict(stored)
        do {
            _ = try await store.conflictResolutionReferences(for: changed)
            XCTFail("Byte-distinct metadata must not authorize a different stored conflict")
        } catch BackendMemoryAPIError.invalidResponse {}
        let rows = try await store.entriesForTesting()
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows.first?.status, .parked)
    }

    func testLegacyDurableParkedConflictCanRetireWithoutManufacturedAuthority() async throws {
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let legacy = makeEntry(id: "legacy", origin: origin)
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(legacy)
        _ = try await store.retainConflict(projectId: legacy.projectId,
            ownerUserId: legacy.ownerUserId, deliveryOrigin: origin)

        let selection = try await store.captureLoadServerSelection(projectId: legacy.projectId,
            ownerUserId: legacy.ownerUserId, deliveryOrigin: origin, explicitRequests: [legacy])
        _ = try await store.resolveLoadServerSelection(selection)
        let legacyEntries = try await store.entriesForTesting()
        let legacyMarkers = try await store.retirementMarkersForTesting()
        XCTAssertTrue(legacyEntries.isEmpty)
        let marker = try XCTUnwrap(legacyMarkers.first)
        XCTAssertNil(marker.requestAuthority)
        XCTAssertNil(marker.loadServerRetirement?.requestAuthority)
        XCTAssertNotNil(marker.loadServerRetirement?.requestDigest)
        let legacyDelivery = try await store.beginDeliveryUnlessRetiredByLoadServer(legacy)
        XCTAssertNil(legacyDelivery)

        let absentDirectory = storageDirectory.appendingPathComponent("absent-legacy", isDirectory: true)
        let absentStore = ScreenplayDraftSaveOutbox(storageDirectory: absentDirectory)
        do {
            _ = try await absentStore.captureLoadServerSelection(projectId: legacy.projectId,
                ownerUserId: legacy.ownerUserId, deliveryOrigin: origin, explicitRequests: [legacy])
            XCTFail("An in-memory legacy request acquired deletion authority")
        } catch BackendMemoryAPIError.invalidResponse {}
        do {
            _ = try await absentStore.retainConflict(legacy)
            XCTFail("An absent legacy request was synthesized as a durable conflict")
        } catch BackendMemoryAPIError.invalidResponse {}
    }

    func testProjectRemovalPurgesExactMarkersAndRollsBackEveryCollectionOnFailure() async throws {
        let failMarker = storageDirectory.appendingPathComponent("fail-next-write")
        let store = ScreenplayDraftSaveOutbox(
            storageDirectory: storageDirectory,
            manifestWriter: { data, url in
                if FileManager.default.fileExists(atPath: failMarker.path) {
                    throw NSError(domain: "ScreenplayDraftSaveOutboxTests", code: 2)
                }
                try data.write(to: url, options: .atomic)
            }
        )
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let mine = makeEntry(id: "mine-marker", draft: "Mine", origin: origin,
            authority: .init(id: UUID(), generation: 40))
        let theirs = replacingOwner(of: makeEntry(id: "their-marker", draft: "Theirs", origin: origin,
            authority: .init(id: UUID(), generation: 41)), with: "user-2")
        for request in [mine, theirs] {
            let selection = try await store.captureLoadServerSelection(projectId: request.projectId,
                ownerUserId: request.ownerUserId, deliveryOrigin: origin, explicitRequests: [request])
            _ = try await store.resolveLoadServerSelection(selection)
        }
        let activeMine = makeEntry(id: "mine-active", draft: "Active", createdAt: 200, origin: origin,
            authority: .init(id: UUID(), generation: 42))
        try await store.enqueue(activeMine)
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let before = try Data(contentsOf: manifestURL)
        try Data().write(to: failMarker)

        do {
            try await store.removeAll(projectId: mine.projectId, ownerUserId: mine.ownerUserId)
            XCTFail("A failed project purge reported success")
        } catch {
            XCTAssertEqual(try Data(contentsOf: manifestURL), before)
            let entriesAfterFailure = try await store.entriesForTesting()
            let markersAfterFailure = try await store.retirementMarkersForTesting()
            XCTAssertEqual(entriesAfterFailure.map(\.id), [activeMine.id])
            XCTAssertEqual(Set(markersAfterFailure.map(\.id)), Set([mine.id, theirs.id]))
        }
        try FileManager.default.removeItem(at: failMarker)
        try await store.removeAll(projectId: mine.projectId, ownerUserId: mine.ownerUserId)
        let entriesAfterRemoval = try await store.entriesForTesting()
        let markersAfterRemoval = try await store.retirementMarkersForTesting()
        XCTAssertTrue(entriesAfterRemoval.isEmpty)
        XCTAssertEqual(markersAfterRemoval.map(\.id), [theirs.id])
    }

    func testPassiveAbsorptionRequiresTheFreshAcknowledgementsExactTargetAndBase() {
        var passive = makeEntry(id: "passive-after-ack")
        passive.deliveryOrigin = .init(documentID: "exact-document", backendURL: URL(string: "https://save.test")!)
        let saved = passive
        XCTAssertTrue(passive.isSatisfiedByAcknowledgement(of: saved, versionID: "fresh-ack"))
        var projection = try! XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(passive)) as? [String: Any])
        projection["screenplayBindings"] = [["draftSceneId": "restored-projection"]]
        let projected = try! JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: projection))
        XCTAssertFalse(projected.hasSameTarget(as: saved), "Queue equality must still preserve different metadata")
        XCTAssertTrue(projected.isSatisfiedByAcknowledgement(of: saved, versionID: "fresh-ack"),
            "Restoring derived metadata must not create another screenplay version after a fresh same-flight acknowledgement")
        projection["source"] = "studio_snapshot"
        let explicit = try! JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: projection))
        XCTAssertFalse(explicit.isSatisfiedByAcknowledgement(of: saved, versionID: "fresh-ack"))
        passive.baseVersionId = "fresh-ack"
        XCTAssertTrue(passive.isSatisfiedByAcknowledgement(of: saved, versionID: "fresh-ack"))
        passive.baseVersionId = "other-captured-base"
        XCTAssertFalse(passive.isSatisfiedByAcknowledgement(of: saved, versionID: "fresh-ack"))
        passive.baseVersionId = saved.baseVersionId
        passive.deliveryOrigin = .init(documentID: "another-document", backendURL: URL(string: "https://save.test")!)
        XCTAssertFalse(passive.isSatisfiedByAcknowledgement(of: saved, versionID: "fresh-ack"))
        passive.deliveryOrigin = nil
        XCTAssertFalse(passive.isSatisfiedByAcknowledgement(of: saved, versionID: "fresh-ack"))
    }

    func testPreviouslyAdmittedDeliveryUsesDurablyRebasedRow() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let authority = ScreenplayDraftSaveRequestAuthority(id: UUID(), generation: 1)
        let root = try makeOrderedManualEntry(id: "causal-root", draft: "Earlier words",
            createdAt: 100, authority: authority)
        try await store.enqueue(root)
        let follower = try makeOrderedManualEntry(id: "causal-follower", draft: "Newer words",
            createdAt: 101, authority: authority)
        let admitted = try await store.admitPendingSave(follower, following: root)

        try await store.markSucceeded(id: root.id, serverVersionId: "server-v2",
            mayRebaseDeclaredFollowers: true)
        guard case .deliver(let delivery)? = try await store
            .beginPreviouslyAdmittedDeliveryUnlessRetiredByLoadServer(admitted) else {
            return XCTFail("The admitted follower was not deliverable")
        }
        XCTAssertEqual(delivery.id, follower.id)
        XCTAssertEqual(delivery.baseVersionId, "server-v2")
        XCTAssertEqual(Data(delivery.draft.utf8), Data(follower.draft.utf8))
    }

    func testPreviouslyAdmittedDeliveryDoesNotResurrectConsumedFollower() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let authority = ScreenplayDraftSaveRequestAuthority(id: UUID(), generation: 1)
        let root = try makeOrderedManualEntry(id: "satisfied-root", createdAt: 100,
            authority: authority)
        try await store.enqueue(root)
        let follower = try makeOrderedManualEntry(id: "satisfied-follower", createdAt: 101,
            authority: authority)
        let admitted = try await store.admitPendingSave(follower, following: root)

        try await store.markSucceeded(id: root.id, serverVersionId: "server-v2",
            mayRebaseDeclaredFollowers: true)
        let delivery = try await store
            .beginPreviouslyAdmittedDeliveryUnlessRetiredByLoadServer(admitted)
        XCTAssertNil(delivery)
        let rows = try await store.entriesForTesting()
        XCTAssertTrue(rows.isEmpty, "A volatile handoff recreated a causally satisfied save")
    }

    func testFailureAbsorptionNeedsAnExactRowActuallyStoredOnDisk() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entry = makeEntry(id: "durable-before-failure")
        let absent = try await store.hasDurableTarget(id: entry.id, matching: entry)
        XCTAssertFalse(absent)
        try await store.enqueue(entry)
        let present = try await store.hasDurableTarget(id: entry.id, matching: entry)
        XCTAssertTrue(present)
        let different = makeEntry(id: "different", draft: entry.draft + " ")
        let mismatch = try await store.hasDurableTarget(id: entry.id, matching: different)
        XCTAssertFalse(mismatch)
    }

    func testSnapshotCountsOnlyTheCurrentAccount() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeDeliverableEntry(id: "my-save"))
        let otherOwner = replacingOwner(of: makeDeliverableEntry(id: "other-save"), with: "user-2")
        try await store.enqueue(otherOwner)

        let mine = await store.snapshot(ownerUserId: "user-1")
        let theirs = await store.snapshot(ownerUserId: "user-2")
        let all = await store.snapshot()

        XCTAssertEqual(mine.pendingCount, 1)
        XCTAssertEqual(theirs.pendingCount, 1)
        XCTAssertEqual(all.pendingCount, 2)
    }

    func testFirstDurableReadProtectsLegacyArrayWithLineage() async throws {
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        var entry = makeEntry(id: "linked-resolution")
        entry.supersededConflictRequests = [.init(requestID: "parked", projectId: entry.projectId,
            ownerUserId: entry.ownerUserId, deliveryOrigin: nil, requestAuthority: nil,
            requestDigest: String(repeating: "a", count: 64))]
        let manifest = storageDirectory.appendingPathComponent("queue.json")
        try JSONEncoder().encode([entry]).write(to: manifest)
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let present = try await store.hasDurableTarget(id: entry.id, matching: entry)
        XCTAssertTrue(present)
        let protected = try JSONSerialization.jsonObject(with: Data(contentsOf: manifest)) as? [String: Any]
        XCTAssertEqual(protected?["schemaVersion"] as? Int, 2)
    }

    func testDurableReadRejectsEnvelopeWithMalformedRetirementMarker() async throws {
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        var entry = makeEntry(id: "linked-resolution")
        entry.supersededConflictRequests = [.init(requestID: "parked", projectId: entry.projectId,
            ownerUserId: entry.ownerUserId, deliveryOrigin: nil, requestAuthority: nil,
            requestDigest: String(repeating: "a", count: 64))]
        var marker = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(makeEntry(id: "marker"))) as? [String: Any])
        marker["projectId"] = "load-server-retirement"
        marker["ownerUserId"] = "load-server-retirement"
        marker["source"] = "studio_load_server_retirement"
        marker["notes"] = "load-server-retirement-v2:invalid"
        let resolution = try JSONSerialization.jsonObject(with: JSONEncoder().encode(entry))
        let corrupt = try JSONSerialization.data(withJSONObject: ["schemaVersion": 2, "entries": [resolution, marker]], options: [.sortedKeys])
        let manifest = storageDirectory.appendingPathComponent("queue.json")
        try corrupt.write(to: manifest)
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        do {
            _ = try await store.hasDurableTarget(id: entry.id, matching: entry)
            XCTFail("A malformed marker must prevent durable proof")
        } catch {}
        XCTAssertEqual(try Data(contentsOf: manifest), corrupt)
    }

    func testCorruptManifestIsNotSilentlyReplacedByAnEmptyQueue() async throws {
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let corruptData = Data("{not-json".utf8)
        try corruptData.write(to: manifestURL)
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)

        let firstRead = await store.snapshot(ownerUserId: "user-1")
        let secondRead = await store.snapshot(ownerUserId: "user-1")

        XCTAssertFalse(firstRead.lastError.isEmpty)
        XCTAssertFalse(secondRead.lastError.isEmpty)
        XCTAssertFalse(firstRead.isStorageReadable)
        XCTAssertFalse(secondRead.isStorageReadable)
        XCTAssertEqual(try Data(contentsOf: manifestURL), corruptData)
    }

    @MainActor
    func testStatusRefreshWarnsWhenQueueIsUnreadableWithoutReplacingPage() async throws {
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let corrupt = Data("{not-json".utf8)
        let manifest = storageDirectory.appendingPathComponent("queue.json")
        try corrupt.write(to: manifest)
        let suite = "them.unreadable-status.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"),
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory))
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        model.fountainDraft = "Writer words remain"
        await model.refreshDraftSaveOutboxStatus()
        XCTAssertEqual(model.errorText, ScreenplayDraftSaveRecoveryPresentationPolicy.unreadableQueueError)
        XCTAssertEqual(model.autosaveStatusText, ScreenplayDraftSaveRecoveryPresentationPolicy.unreadableQueueStatus)
        XCTAssertEqual(model.fountainDraft, "Writer words remain")
        XCTAssertEqual(try Data(contentsOf: manifest), corrupt)
    }

    func testSuccessfulSaveParksLegacyRowsWithoutGuessingTheirAncestry() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "save-1", draft: "Draft one", createdAt: 100))
        try await store.enqueue(makeEntry(id: "save-2", draft: "Draft two", createdAt: 101))
        try await store.enqueue(makeEntry(id: "save-3", draft: "Draft three", createdAt: 102))

        try await store.markSucceeded(
            id: "save-1",
            serverVersionId: "server-v2",
            now: Date(timeIntervalSince1970: 103)
        )

        let stored = try await store.entriesForTesting()
        XCTAssertEqual(stored.map(\.id), ["save-2", "save-3"])
        XCTAssertEqual(stored.map(\.baseVersionId), ["server-v1", "server-v1"])
        XCTAssertTrue(stored.allSatisfy { $0.status == .parked })
        XCTAssertTrue(stored.allSatisfy {
            $0.lastError == ScreenplayDraftSaveOutbox.unprovenPredecessorReason
        })
        let surfaced = try await store.parkedConflictEntries(
            projectId: "project-1", ownerUserId: "user-1")
        XCTAssertEqual(surfaced.map(\.id), ["save-2", "save-3"])
    }

    func testArrayOnlyOrderingDowngradeFailsClosedWithoutRewrite() async throws {
        var ordered = makeDeliverableEntry(id: "ordered-array-downgrade")
        ordered.saveOrderingVersion = 1
        let original = try JSONEncoder().encode([ordered])
        try FileManager.default.createDirectory(at: storageDirectory,
            withIntermediateDirectories: true)
        let manifest = storageDirectory.appendingPathComponent("queue.json")
        try original.write(to: manifest, options: .atomic)

        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let snapshot = await store.snapshot(ownerUserId: ordered.ownerUserId)
        XCTAssertFalse(snapshot.isStorageReadable)
        XCTAssertEqual(try Data(contentsOf: manifest), original)
    }

    func testSchemaTwoCannotCarryOrderingFields() async throws {
        var ordered = makeDeliverableEntry(id: "schema-two-ordered")
        ordered.saveOrderingVersion = 1
        ordered.supersededConflictRequests = [.init(
            requestID: "older", projectId: ordered.projectId,
            ownerUserId: ordered.ownerUserId, deliveryOrigin: ordered.deliveryOrigin,
            requestAuthority: nil, requestDigest: String(repeating: "a", count: 64))]
        let encoded = try XCTUnwrap(JSONSerialization.jsonObject(
            with: JSONEncoder().encode(ordered)) as? [String: Any])
        let original = try JSONSerialization.data(withJSONObject:
            ["schemaVersion": 2, "entries": [encoded]], options: [.sortedKeys])
        try FileManager.default.createDirectory(at: storageDirectory,
            withIntermediateDirectories: true)
        let manifest = storageDirectory.appendingPathComponent("queue.json")
        try original.write(to: manifest, options: .atomic)

        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let snapshot = await store.snapshot(ownerUserId: ordered.ownerUserId)
        XCTAssertFalse(snapshot.isStorageReadable)
        XCTAssertEqual(try Data(contentsOf: manifest), original)
    }

    func testAcknowledgementRollbackRestoresWholeCausalChainAfterWriteFailure() async throws {
        let failMarker = storageDirectory.appendingPathComponent("fail-next-write")
        let store = ScreenplayDraftSaveOutbox(
            storageDirectory: storageDirectory,
            manifestWriter: { data, url in
                if FileManager.default.fileExists(atPath: failMarker.path) {
                    throw NSError(domain: "ScreenplayDraftSaveOutboxTests", code: 11)
                }
                try data.write(to: url, options: .atomic)
            })
        var root = makeDeliverableEntry(id: "rollback-root", draft: "Root", createdAt: 100)
        root.saveOrderingVersion = 1
        let admittedRoot = try await store.admitPendingSave(root, following: nil)
        var child = makeDeliverableEntry(id: "rollback-child", draft: "Child", createdAt: 101)
        child.saveOrderingVersion = 1
        let admittedChild = try await store.admitPendingSave(child, following: admittedRoot)
        var grandchild = makeDeliverableEntry(id: "rollback-grandchild", draft: "Grandchild",
            createdAt: 102)
        grandchild.saveOrderingVersion = 1
        _ = try await store.admitPendingSave(grandchild, following: admittedChild)
        let beforeRows = try await store.entriesForTesting()
        let manifest = storageDirectory.appendingPathComponent("queue.json")
        let beforeBytes = try Data(contentsOf: manifest)
        try Data().write(to: failMarker)

        do {
            try await store.markSucceeded(id: root.id, serverVersionId: "server-v2",
                mayRebaseDeclaredFollowers: true)
            XCTFail("A failed acknowledgement write reported success")
        } catch {}
        try FileManager.default.removeItem(at: failMarker)
        let afterRows = try await store.entriesForTesting()
        XCTAssertEqual(afterRows, beforeRows)
        XCTAssertEqual(try Data(contentsOf: manifest), beforeBytes)
    }

    func testDeclaredFollowerRebasesButIndependentAndExplicitBaseRequestsDoNot() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        var first = makeDeliverableEntry(id: "ordered-first", draft: "First", createdAt: 100)
        first.saveOrderingVersion = 1
        _ = try await store.admitPendingSave(first, following: nil)
        guard case .deliver(let active) = try await store.beginDelivery(first) else {
            return XCTFail("Expected the predecessor to begin delivery")
        }

        var follower = makeDeliverableEntry(id: "ordered-follower", draft: "Follower", createdAt: 101)
        follower.saveOrderingVersion = 1
        _ = try await store.admitPendingSave(follower, following: active)
        var independent = makeDeliverableEntry(id: "ordered-independent", draft: "Independent", createdAt: 102)
        independent.saveOrderingVersion = 1
        _ = try await store.admitPendingSave(independent, following: nil)
        var explicit = makeDeliverableEntry(id: "ordered-explicit", draft: "Explicit", createdAt: 103)
        explicit.saveOrderingVersion = 1
        explicit.hasExplicitBaseSelection = true
        _ = try await store.admitPendingSave(explicit, following: nil)

        try await store.markSucceeded(id: active.id, serverVersionId: "verified-v2",
            mayRebaseDeclaredFollowers: true)
        let rows = try await store.entriesForTesting()
        XCTAssertEqual(rows.first { $0.id == follower.id }?.baseVersionId, "verified-v2")
        XCTAssertEqual(rows.first { $0.id == independent.id }?.baseVersionId, follower.baseVersionId)
        XCTAssertEqual(rows.first { $0.id == explicit.id }?.baseVersionId, explicit.baseVersionId)
    }

    func testMissingOrUnprovenPredecessorParksExactFollower() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        var first = makeDeliverableEntry(id: "proof-first", draft: "First exact", createdAt: 100)
        first.saveOrderingVersion = 1
        var missingFollower = makeDeliverableEntry(id: "missing-follower", draft: "Keep missing exact", createdAt: 101)
        missingFollower.saveOrderingVersion = 1
        let missing = try await store.admitPendingSave(missingFollower, following: first)
        XCTAssertEqual(missing.status, .parked)
        XCTAssertEqual(missing.draft, missingFollower.draft)

        _ = try await store.admitPendingSave(first, following: nil)
        guard case .deliver(let active) = try await store.beginDelivery(first) else {
            return XCTFail("Expected the predecessor to begin delivery")
        }
        var unprovenFollower = makeDeliverableEntry(id: "unproven-follower", draft: "Keep unproven exact", createdAt: 102)
        unprovenFollower.saveOrderingVersion = 1
        _ = try await store.admitPendingSave(unprovenFollower, following: active)
        try await store.markSucceeded(id: active.id, serverVersionId: "unproven-v2")

        let relaunched = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let rows = try await relaunched.entriesForTesting()
        let unproven = try XCTUnwrap(rows.first { $0.id == unprovenFollower.id })
        XCTAssertEqual(unproven.status, .parked)
        XCTAssertEqual(unproven.baseVersionId, unprovenFollower.baseVersionId)
        XCTAssertEqual(unproven.draft, unprovenFollower.draft)
        let surfaced = try await relaunched.parkedConflictEntries(
            projectId: unproven.projectId, ownerUserId: unproven.ownerUserId)
        XCTAssertTrue(surfaced.contains { $0.id == unproven.id })
    }

    func testDeclaredFollowersFormAnExactAcknowledgementChain() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        var first = makeDeliverableEntry(id: "chain-first", draft: "First", createdAt: 100)
        first.saveOrderingVersion = 1
        _ = try await store.admitPendingSave(first, following: nil)
        guard case .deliver(let activeFirst) = try await store.beginDelivery(first) else {
            return XCTFail("Expected first delivery")
        }
        var second = makeDeliverableEntry(id: "chain-second", draft: "Second", createdAt: 101)
        second.saveOrderingVersion = 1
        let admittedSecond = try await store.admitPendingSave(second, following: activeFirst)
        var third = makeDeliverableEntry(id: "chain-third", draft: "Third", createdAt: 102)
        third.saveOrderingVersion = 1
        _ = try await store.admitPendingSave(third, following: admittedSecond)

        try await store.markSucceeded(id: activeFirst.id, serverVersionId: "chain-v2",
            mayRebaseDeclaredFollowers: true)
        let nextSecond = try await store.beginNext(projectId: second.projectId,
            ownerUserId: second.ownerUserId, deliveryOrigin: second.deliveryOrigin, force: true)
        let activeSecond = try XCTUnwrap(nextSecond)
        XCTAssertEqual(activeSecond.baseVersionId, "chain-v2")
        try await store.markSucceeded(id: activeSecond.id, serverVersionId: "chain-v3",
            mayRebaseDeclaredFollowers: true)
        let rows = try await store.entriesForTesting()
        XCTAssertEqual(rows.first { $0.id == third.id }?.baseVersionId, "chain-v3")
    }

    func testReverseAdmissionParksReservedFollowerInsteadOfReorderingIt() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        var first = makeDeliverableEntry(id: "reverse-first", draft: "First", createdAt: 100)
        first.saveOrderingVersion = 1
        _ = try await store.admitPendingSave(first, following: nil)
        guard case .deliver(let activeFirst) = try await store.beginDelivery(first) else {
            return XCTFail("Expected first delivery")
        }

        // This is the exact actor-hop inversion: the third request reaches the
        // outbox before its synchronously reserved second-request predecessor.
        var reservedSecond = makeDeliverableEntry(id: "reverse-second", draft: "Second", createdAt: 101)
        reservedSecond.saveOrderingVersion = 1
        var third = makeDeliverableEntry(id: "reverse-third", draft: "Third exact", createdAt: 102)
        third.saveOrderingVersion = 1
        let reversedThird = try await store.admitPendingSave(third, following: reservedSecond)
        XCTAssertEqual(reversedThird.status, .parked)
        XCTAssertEqual(reversedThird.draft, third.draft)

        let admittedSecond = try await store.admitPendingSave(reservedSecond, following: activeFirst)
        XCTAssertEqual(admittedSecond.status, .pending)
        let rows = try await store.entriesForTesting()
        XCTAssertEqual(rows.first { $0.id == third.id }?.status, .parked)
        XCTAssertEqual(rows.first { $0.id == reservedSecond.id }?.status, .pending)
    }

    func testLaterDraftCannotSkipOlderBackedOffSave() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeDeliverableEntry(id: "save-1", draft: "Draft one", createdAt: 100))
        try await store.markRetryable(
            id: "save-1",
            error: "offline",
            now: Date(timeIntervalSince1970: 100)
        )
        try await store.enqueue(makeDeliverableEntry(id: "save-2", draft: "Draft two", createdAt: 101))

        let skipped = try await store.beginNext(
            projectId: "project-1",
            ownerUserId: "user-1",
            now: Date(timeIntervalSince1970: 101),
            force: false
        )
        XCTAssertNil(skipped)

        let forced = try await store.beginNext(
            projectId: "project-1",
            ownerUserId: "user-1",
            now: Date(timeIntervalSince1970: 101),
            force: true
        )
        XCTAssertEqual(forced?.id, "save-1")
    }

    func testAnotherAccountsOlderSaveDoesNotBlockCurrentAccount() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        var otherOwner = makeDeliverableEntry(id: "other-save", draft: "Other draft", createdAt: 99)
        otherOwner = replacingOwner(of: otherOwner, with: "user-2")
        try await store.enqueue(otherOwner)
        try await store.enqueue(makeDeliverableEntry(id: "my-save", createdAt: 100))

        let next = try await store.beginNext(
            projectId: "project-1",
            ownerUserId: "user-1",
            now: Date(timeIntervalSince1970: 101),
            force: true
        )

        XCTAssertEqual(next?.id, "my-save")
    }

    func testSuccessfulSaveDoesNotRebaseAnotherAccountsProject() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "my-save", createdAt: 100))
        var otherOwner = makeEntry(id: "other-save", draft: "Other draft", createdAt: 101)
        otherOwner = replacingOwner(of: otherOwner, with: "user-2")
        try await store.enqueue(otherOwner)

        try await store.markSucceeded(id: "my-save", serverVersionId: "my-server-v2")

        let stored = try await store.entriesForTesting()
        XCTAssertEqual(stored.count, 1)
        XCTAssertEqual(stored.first?.id, "other-save")
        XCTAssertEqual(stored.first?.baseVersionId, "server-v1")
    }

    func testConflictCleanupRemovesTheWholeProjectChainOnlyForCurrentOwner() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "save-1", draft: "Draft one", createdAt: 100))
        try await store.enqueue(makeEntry(id: "save-2", draft: "Draft two", createdAt: 101))
        var otherOwner = makeEntry(id: "save-other", draft: "Other draft", createdAt: 102)
        otherOwner = replacingOwner(of: otherOwner, with: "user-2")
        try await store.enqueue(otherOwner)

        try await store.removeAll(projectId: "project-1", ownerUserId: "user-1")

        let stored = try await store.entriesForTesting()
        XCTAssertEqual(stored.map(\.id), ["save-other"])
    }

    func testRetryBackoffEventuallyParksWithoutDroppingDraft() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "save-retry"))

        for retry in 1...6 {
            try await store.markRetryable(
                id: "save-retry",
                error: "offline \(retry)",
                now: Date(timeIntervalSince1970: TimeInterval(200 + retry))
            )
        }

        let stored = try await store.entriesForTesting()
        XCTAssertEqual(stored.first?.status, .parked)
        XCTAssertEqual(stored.first?.retries, 6)
        XCTAssertEqual(stored.first?.draft, "Draft one")
        XCTAssertEqual(stored.first?.lastError, "offline 6")
    }

    func testUITestResetRemovesPersistedDraftSaveQueue() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "stale-ui-save"))
        XCTAssertTrue(FileManager.default.fileExists(atPath: storageDirectory.path))

        ScreenplayDraftSaveOutbox.resetStoredQueueForUITesting(at: storageDirectory)

        XCTAssertFalse(FileManager.default.fileExists(atPath: storageDirectory.path))
    }

    @MainActor
    private func installAuthenticatedFixtureOwner() throws -> @MainActor () -> Void {
        let defaults = UserDefaults.standard
        let keys = ["auth_user_payload", "auth_signed_in", "auth_session_token_deletion_pending"]
        let original = keys.map { defaults.object(forKey: $0) }
        let user = BackendAuthUser(userId: "queue-fixture-\(UUID().uuidString)", email: "fixture@example.invalid",
            authProvider: nil, emailVerified: true, emailVerifiedAt: nil, createdAt: nil, updatedAt: nil)
        defaults.set(try JSONEncoder().encode(user), forKey: keys[0])
        defaults.set(true, forKey: keys[1])
        defaults.set(false, forKey: keys[2])
        ScreenplayLiveDraftBridge.shared.reconcileAccountStorage()
        return {
            ScreenplayLiveDraftSyncService.shared.detach()
            for (index, key) in keys.enumerated() {
                if let value = original[index] { defaults.set(value, forKey: key) }
                else { defaults.removeObject(forKey: key) }
            }
            ScreenplayLiveDraftBridge.shared.reconcileAccountStorage()
        }
    }

    private func makeDeliverableEntry(
        id: String,
        draft: String = "Draft one",
        createdAt: TimeInterval = 100,
        origin: ScreenplayDraftSaveOrigin = .init(documentID: "document-a", backendURL: URL(string: "https://save.test")!),
        authority: ScreenplayDraftSaveRequestAuthority? = nil
    ) -> ScreenplayDraftSaveOutboxEntry {
        makeEntry(id: id, draft: draft, createdAt: createdAt, origin: origin, authority: authority)
    }

    private func makeOrderedManualEntry(
        id: String,
        draft: String = "Draft one",
        createdAt: TimeInterval,
        authority: ScreenplayDraftSaveRequestAuthority
    ) throws -> ScreenplayDraftSaveOutboxEntry {
        let entry = makeDeliverableEntry(id: id, draft: draft, createdAt: createdAt,
            authority: authority)
        var payload = try XCTUnwrap(JSONSerialization.jsonObject(
            with: JSONEncoder().encode(entry)) as? [String: Any])
        payload["source"] = "studio_manual"
        payload["saveOrderingVersion"] = 1
        return try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: payload))
    }

    private func makeEntry(
        id: String,
        draft: String = "Draft one",
        createdAt: TimeInterval = 100,
        source: String = "studio_autosave",
        origin: ScreenplayDraftSaveOrigin? = nil,
        authority: ScreenplayDraftSaveRequestAuthority? = nil
    ) -> ScreenplayDraftSaveOutboxEntry {
        var entry = ScreenplayDraftSaveOutboxEntry(
            id: id,
            projectId: "project-1",
            ownerUserId: "user-1",
            draft: draft,
            title: "Feature",
            phase: "scene_draft",
            notes: "",
            source: source,
            studioWriteAnchors: [],
            screenplayBindings: [],
            baseVersionId: "server-v1",
            createdAt: createdAt,
            updatedAt: createdAt,
            status: .pending,
            retries: 0,
            nextAttemptAt: createdAt,
            lastError: ""
        )
        entry.deliveryOrigin = origin
        entry.requestAuthority = authority
        return entry
    }

    private func replacingOwner(
        of entry: ScreenplayDraftSaveOutboxEntry,
        with ownerUserId: String
    ) -> ScreenplayDraftSaveOutboxEntry {
        var replaced = ScreenplayDraftSaveOutboxEntry(
            id: entry.id,
            projectId: entry.projectId,
            ownerUserId: ownerUserId,
            draft: entry.draft,
            title: entry.title,
            phase: entry.phase,
            notes: entry.notes,
            source: entry.source,
            studioWriteAnchors: entry.studioWriteAnchors,
            screenplayBindings: entry.screenplayBindings,
            baseVersionId: entry.baseVersionId,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
            status: entry.status,
            retries: entry.retries,
            nextAttemptAt: entry.nextAttemptAt,
            lastError: entry.lastError
        )
        replaced.initialization = entry.initialization
        replaced.deliveryOrigin = entry.deliveryOrigin
        replaced.requestAuthority = entry.requestAuthority
        replaced.loadServerRetirement = entry.loadServerRetirement
        replaced.supersededConflictRequests = entry.supersededConflictRequests
        replaced.deferredConflictRequests = entry.deferredConflictRequests
        return replaced
    }

    private func makeOrdinaryEvidence(
        for entry: ScreenplayDraftSaveOutboxEntry,
        versionID: String
    ) throws -> ScreenplayConfirmedDraftSave {
        let version = try JSONDecoder().decode(BackendScreenplayVersion.self,
            from: JSONSerialization.data(withJSONObject: [
                "id": versionID,
                "projectId": entry.projectId,
                "clientRequestId": entry.id,
                "draft": entry.draft,
            ]))
        let owner = ScreenplayStudioAuthContext(userID: entry.ownerUserId, sessionIntentGeneration: 7)
        return try XCTUnwrap(ScreenplayConfirmedDraftSave.ordinary(entry: entry, version: version,
            versionID: versionID, projectID: entry.projectId,
            responseURL: entry.deliveryOrigin?.backendURL, owner: owner, currentOwner: owner))
    }
}

/// Exact array element shape from the 4a3525c prior app. Decoding and then
/// encoding this type deliberately drops every new field, reproducing a real
/// downgrade rewrite instead of letting the current decoder preserve metadata.
private struct PriorDraftSaveOutboxEntry: Codable {
    let id: String
    let projectId: String
    let ownerUserId: String
    let draft: String
    let title: String
    let phase: String
    let notes: String
    let source: String
    let studioWriteAnchors: [BackendScreenplayWriteAnchor]
    let screenplayBindings: [BackendScreenplayBindingRecord]
    var baseVersionId: String
    let createdAt: TimeInterval
    var updatedAt: TimeInterval
    var status: ScreenplayDraftSaveOutboxStatus
    var retries: Int
    var nextAttemptAt: TimeInterval
    var lastError: String
    var initialization: ScreenplayInitialProjectMetadata? = nil
    var deliveryOrigin: ScreenplayDraftSaveOrigin? = nil
}

/// Test-only HTTP transport for exercising the real project-read client while
/// holding a response across a writer edit or a repeated conflict choice.
private nonisolated final class DelayedConflictFetchProtocol: URLProtocol {
    private static let handlerLock = NSLock()
    nonisolated(unsafe) private static var handler: ((DelayedConflictFetchProtocol, URLRequest) -> Void)?
    private let callbackLock = NSRecursiveLock()
    private var stopped = false

    static func install(_ next: @escaping (DelayedConflictFetchProtocol, URLRequest) -> Void) {
        handlerLock.lock()
        handler = next
        handlerLock.unlock()
    }

    static func uninstall() {
        handlerLock.lock()
        handler = nil
        handlerLock.unlock()
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.handlerLock.lock()
        let current = Self.handler
        Self.handlerLock.unlock()
        guard let current else { fail(URLError(.resourceUnavailable)); return }
        current(self, request)
    }

    override func stopLoading() {
        callbackLock.lock()
        stopped = true
        callbackLock.unlock()
    }

    func fail(_ error: Error) {
        callbackLock.lock()
        defer { callbackLock.unlock() }
        guard !stopped else { return }
        stopped = true
        client?.urlProtocol(self, didFailWithError: error)
    }

    func respond(_ payload: [String: Any]) throws {
        let body = try JSONSerialization.data(withJSONObject: payload)
        guard let url = request.url,
              let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                             headerFields: ["Content-Type": "application/json"]) else {
            throw URLError(.badServerResponse)
        }
        callbackLock.lock()
        defer { callbackLock.unlock() }
        guard !stopped else { return }
        stopped = true
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }
}

private nonisolated final class DelayedConflictFetchBox: @unchecked Sendable {
    let started = XCTestExpectation(description: "Scoped conflict HTTP read started")
    private let lock = NSLock()
    private var held: DelayedConflictFetchProtocol?
    func receive(_ transport: DelayedConflictFetchProtocol, request: URLRequest) {
        lock.lock()
        held = transport
        lock.unlock()
        started.fulfill()
    }
    func transport() -> DelayedConflictFetchProtocol? {
        lock.lock()
        defer { lock.unlock() }
        return held
    }
}
