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
    func testParkedConflictRestoresChoiceWhenNewerRecoveryAlreadyNamesServerHead() async throws {
        // Adapt original #962's authority regression to this earlier model's
        // existing injected queue; no later transport framework is required.
        for textRestoredFirst in [false, true] {
            let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
            let directory = storageDirectory.appendingPathComponent("metadata-\(textRestoredFirst)", isDirectory: true)
            let queue = ScreenplayDraftSaveOutbox(storageDirectory: directory)
            let submitted = "Earlier submitted writer words"
            try await queue.enqueue(replacingOwner(of: makeEntry(id: "retained", draft: submitted), with: owner))
            _ = try await queue.retainConflict(projectId: "project-1", ownerUserId: owner)
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
            // The structural setup clears ordinary recovery; install it after.
            recovery.save(ownerUserId: owner, projectId: "project-1", draft: raw,
                baseVersionId: "remote", dirty: true, savedAt: 200)
            let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Script",
                "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Collaborator words"]]])
            let applied = await model.hydrateDraftRestoringQueuedSaves(from:
                try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
            XCTAssertTrue(applied)
            XCTAssertEqual(Array(model.fountainDraft.utf8), Array(raw.utf8))
            XCTAssertEqual(model.conflictState?.projectId, "project-1")
            XCTAssertEqual(model.conflictState?.baseVersionId, "server-v1")
            XCTAssertEqual(model.conflictState?.serverVersionId, "remote")
            XCTAssertTrue(model.hasUnsavedDraftChanges)
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
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let local = "  Submitted writer words\r\n"
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "submitted", draft: local), with: owner))
        let suite = "them.conflict-refresh-choice.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"), draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        model.applyStructuralUITestDraft("Collaborator words", versionID: "remote")
        let conflict = ScreenplayStudioViewModel.SaveConflictState(projectId: "project-1",
            baseVersionId: "server-v1", serverVersionId: "remote", serverDraft: "Collaborator words",
            serverDraftExcerpt: "Collaborator words", serverUpdatedAt: 0)
        await model.handleDraftSaveConflict(conflict, ownerUserId: owner)
        XCTAssertEqual(model.conflictState, conflict)
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Script",
            "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Collaborator words"]]])
        let applied = await model.hydrateDraftRestoringQueuedSaves(from:
            try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
        XCTAssertTrue(applied)
        XCTAssertEqual(Array(model.fountainDraft.utf8), Array(local.utf8))
        XCTAssertEqual(model.conflictState, conflict, "A metadata refresh is not a writer's resolution.")
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        model.applyServerVersionFromConflict()
        XCTAssertEqual(model.fountainDraft, "Collaborator words")
        XCTAssertEqual(model.latestVersionID, "remote")
        XCTAssertNil(model.conflictState)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
        let remaining = try await queue.entriesForTesting()
        XCTAssertTrue(remaining.isEmpty, "Only the explicit server choice should discard this conflict.")
    }

    @MainActor
    func testProjectHydrationRestoresParkedWriterSaveBeforeRemoteDraft() async throws {
        // Original #928's real-model regression, seeded through the existing
        // parked-entry API so it also executes before #925 is ported here.
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let local = "  Writer words cafe\u{0301}\r\n"
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "parked", draft: local), with: owner))
        try await queue.markParked(id: "parked", error: ScreenplayDraftSaveOutbox.conflictReason)
        let suite = "them.parked-project-hydration.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"), draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        model.applyStructuralUITestDraft("Collaborator words", versionID: "remote")
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
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let local = "Writer words cafe\u{0301}\n"
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "queued", draft: local), with: owner))
        let suite = "them.project-hydration.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
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
        model.preserveLocalDraftForLiveSyncRecovery(edited, projectID: "project-1")
        let preserved = recovery.firstPreservedConflict(ownerUserId: owner, projectId: "project-1")
        XCTAssertTrue(preserved?.draft.utf8.elementsEqual(edited.utf8) == true)
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
            let reloaded = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
            let snapshot = reloaded.recoverySnapshot(ownerUserId: owner, projectId: "project-1",
                serverDraft: "Writer words", fingerprint: { $0 })
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
        model.preserveLocalDraftForLiveSyncRecovery("", projectID: "project-1")
        XCTAssertEqual(recovery.firstPreservedConflict(ownerUserId: owner, projectId: "project-1")?.draft, "")
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
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "writer"), with: owner))
        _ = try await queue.retainConflict(projectId: "project-1", ownerUserId: owner)
        let suite = "them.delayed-conflict-fetch.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let deferred = DeferredConflictProject()
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue,
            conflictProjectLoader: { _ in await deferred.load() })
        model.selectedProjectID = "project-1"
        model.fountainDraft = "Draft one"
        let conflict = ScreenplayStudioViewModel.SaveConflictState(projectId: "project-1",
            baseVersionId: "server-v1", serverVersionId: "remote", serverDraft: "",
            serverDraftExcerpt: "", serverUpdatedAt: 1)
        model.conflictState = conflict
        let task = Task { await model.loadMissingServerDraftForConflict(conflict,
            owner: ScreenplayStudioAuthContext(userID: owner,
                sessionIntentGeneration: BackendAuthClient.currentAuthSessionIntentGeneration()),
            draftAtChoice: "Draft one", choiceTime: 200) }
        await fulfillment(of: [deferred.started], timeout: 2)
        model.fountainDraft = "Newer words typed during fetch\n"
        model.hasUnsavedDraftChanges = true
        recovery.save(ownerUserId: owner, projectId: "project-1", draft: model.fountainDraft,
            baseVersionId: "server-v1", dirty: true)
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Server words"]]])
        deferred.continuation?.resume(returning: try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
        await task.value
        XCTAssertEqual(model.fountainDraft, "Newer words typed during fetch\n")
        XCTAssertEqual(model.conflictState, conflict)
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertEqual(recovery.payloads(ownerUserId: owner)["project-1"]?["draft"] as? String, model.fountainDraft)
        let copies = try await queue.entriesForTesting()
        XCTAssertEqual(copies.map(\.draft), ["Draft one"])
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testRepeatedConflictInvalidatesOlderServerChoiceFetch() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "writer"), with: owner))
        _ = try await queue.retainConflict(projectId: "project-1", ownerUserId: owner)
        let suite = "them.repeated-conflict-fetch.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let deferred = DeferredConflictProject()
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue,
            conflictProjectLoader: { _ in await deferred.load() })
        model.selectedProjectID = "project-1"
        model.fountainDraft = "Draft one"
        let conflict = ScreenplayStudioViewModel.SaveConflictState(projectId: "project-1",
            baseVersionId: "server-v1", serverVersionId: "remote", serverDraft: "",
            serverDraftExcerpt: "", serverUpdatedAt: 1)
        model.conflictState = conflict
        let task = Task { await model.loadMissingServerDraftForConflict(conflict,
            owner: ScreenplayStudioAuthContext(userID: owner,
                sessionIntentGeneration: BackendAuthClient.currentAuthSessionIntentGeneration()),
            draftAtChoice: "Draft one", choiceTime: 200) }
        await fulfillment(of: [deferred.started], timeout: 2)
        // A fresh presentation can carry identical values but is a different choice.
        model.conflictState = conflict
        model.hasUnsavedDraftChanges = true
        recovery.save(ownerUserId: owner, projectId: "project-1", draft: model.fountainDraft,
            baseVersionId: "server-v1", dirty: true)
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Server words"]]])
        deferred.continuation?.resume(returning: try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
        await task.value
        XCTAssertEqual(model.fountainDraft, "Draft one")
        XCTAssertEqual(model.conflictState, conflict)
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertEqual(recovery.payloads(ownerUserId: owner)["project-1"]?["draft"] as? String, model.fountainDraft)
        let copies = try await queue.entriesForTesting()
        XCTAssertEqual(copies.map(\.draft), ["Draft one"])
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testLoadServerKeepsSeparatePreservedConflictDraft() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let suite = "them.load-server-preserved.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        recovery.save(ownerUserId: owner, projectId: "project-1", draft: "Ordinary local draft",
                      baseVersionId: "base", dirty: true)
        recovery.savePreservedConflict(ownerUserId: owner, projectId: "project-1",
                                       draft: "Other preserved words\n", baseVersionId: "older")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.selectedProjectID = "project-1"
        model.fountainDraft = "Ordinary local draft"
        model.conflictState = ScreenplayStudioViewModel.SaveConflictState(projectId: "project-1",
            baseVersionId: "base", serverVersionId: "server", serverDraft: "Server draft",
            serverDraftExcerpt: "Server draft", serverUpdatedAt: 1)
        model.applyServerVersionFromConflict()
        XCTAssertEqual(model.fountainDraft, "Server draft")
        XCTAssertNil(recovery.dirtyOrdinarySnapshot(ownerUserId: owner, projectId: "project-1"))
        XCTAssertEqual(recovery.firstPreservedConflict(ownerUserId: owner, projectId: "project-1")?.draft,
                       "Other preserved words\n")
        XCTAssertEqual(model.recoveryCandidate?.draft, "Other preserved words\n")
        XCTAssertEqual(model.recoveryCandidate?.isPreservedConflict, true)
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
        model.recoveryCandidate = .init(projectId: "project-1", draft: "First", baseVersionId: "one",
                                        savedAt: 100, isPreservedConflict: true)
        model.discardLocalRecoveryCopy()
        XCTAssertEqual(model.recoveryCandidate?.draft, "Second")
        XCTAssertEqual(recovery.firstPreservedConflict(ownerUserId: owner, projectId: "project-1")?.draft, "Second")
        XCTAssertEqual(recovery.dirtyOrdinarySnapshot(ownerUserId: owner, projectId: "project-1")?.draft, "Ordinary")
        model.keepServerDraft()
        XCTAssertEqual(model.recoveryCandidate?.draft, "Ordinary")
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
        model.recoveryCandidate = .init(projectId: "project-1", draft: "Earlier", baseVersionId: "base",
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
    func testFailedSaveAfterProjectSwitchPreservesOriginalProjectText() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let suite = "them.save-switch-scope.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let deferred = DeferredFailingSavePreflight()
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue,
            savePreflightProjectLoader: { _ in try await deferred.load() })
        model.autosaveEnabled = false
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "First"])
        model.selectedProject = try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data)
        model.selectedProjectID = "project-1"
        model.latestVersionID = ""
        model.fountainDraft = "Original project words\n"
        let save = Task { await model.manualSaveDraft() }
        await fulfillment(of: [deferred.started], timeout: 2)
        model.selectedProjectID = "project-2"
        model.fountainDraft = "Different project words"
        deferred.continuation?.resume(throwing: URLError(.notConnectedToInternet))
        await save.value
        let preserved = recovery.firstPreservedConflict(ownerUserId: owner, projectId: "project-1")
        XCTAssertTrue(preserved?.draft.utf8.elementsEqual("Original project words\n".utf8) == true)
        XCTAssertEqual(model.fountainDraft, "Different project words")
        let reopened = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let retained = try await reopened.entriesForTesting()
        XCTAssertEqual(retained.first?.projectId, "project-1")
        XCTAssertTrue(retained.first?.draft.utf8.elementsEqual("Original project words\n".utf8) == true)
        XCTAssertEqual(retained.first?.status, .parked)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testSuccessfulPreflightAfterProjectSwitchCannotChangeSelectedProject() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let suite = "them.save-switch-success.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let deferred = DeferredFailingSavePreflight()
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue,
            savePreflightProjectLoader: { _ in try await deferred.load() })
        model.autosaveEnabled = false
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "First",
            "activeVersionId": "server-v1", "versions": [["id": "server-v1", "draft": "Original words"]]])
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data)
        model.selectedProject = project
        model.selectedProjectID = "project-1"
        model.latestVersionID = ""
        model.fountainDraft = "Original words"
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
        let preserved = recovery.firstPreservedConflict(ownerUserId: owner, projectId: "project-1")
        XCTAssertEqual(preserved?.draft, "Original words")
        let reopened = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let retained = try await reopened.entriesForTesting()
        XCTAssertEqual(retained.first?.projectId, "project-1")
        XCTAssertEqual(retained.first?.status, .parked)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testPendingSaveDuringDrainConflictRemainsDiscoverableAfterRelaunch() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        var first = replacingOwner(of: makeEntry(id: "first", draft: "Original draft"), with: owner)
        first.baseVersionId = ""
        try await queue.enqueue(first)
        let suite = "them.drain-conflict-pending.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let deferred = DeferredFailingSavePreflight()
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue,
            savePreflightProjectLoader: { _ in try await deferred.load() })
        model.autosaveEnabled = false
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Script",
            "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Server draft"]]])
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data)
        model.selectedProjectID = project.id
        model.selectedProject = project
        model.applyStructuralUITestDraft("Original draft", versionID: "")
        let drain = Task { await model.resumeQueuedDraftSavesIfNeeded(force: true) }
        await fulfillment(of: [deferred.started], timeout: 2)
        let newest = "Newer writer words\n"
        model.fountainDraft = newest
        model.hasUnsavedDraftChanges = true
        await model.manualSaveDraft()
        deferred.continuation?.resume(returning: project)
        await drain.value
        XCTAssertNotNil(model.conflictState)
        let reopened = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let restored = try await reopened.pendingEntry(projectId: project.id, ownerUserId: owner)
        XCTAssertTrue(restored?.draft.utf8.elementsEqual(newest.utf8) == true)
        XCTAssertEqual(restored?.status, .parked)
        XCTAssertEqual(restored?.lastError, ScreenplayDraftSaveOutbox.conflictReason)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testEmptyBasePreflightDoesNotAcknowledgeWhitespaceDifferentDraft() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let suite = "them.empty-base-exact-preflight.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Script",
            "activeVersionId": "server-v2", "versions": [["id": "server-v2", "draft": "Writer words"]]])
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data)
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue,
            savePreflightProjectLoader: { _ in project })
        model.autosaveEnabled = false
        model.selectedProjectID = project.id
        model.selectedProject = project
        model.latestVersionID = ""
        let writerDraft = "Writer words\n"
        model.fountainDraft = writerDraft
        model.hasUnsavedDraftChanges = true
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
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let draft = "Exact writer text\n"
        var entry = replacingOwner(of: makeEntry(id: "choice", draft: draft,
            source: "studio_conflict_resolve"), with: owner)
        entry.baseVersionId = "server-v1"
        entry.status = .parked
        entry.lastError = ScreenplayDraftSaveOutbox.conflictReason
        try await queue.enqueue(entry)
        let suite = "them.same-version-conflict.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"), draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
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
    func testWhitespaceOnlyServerDifferenceCannotDiscardRawWriterCopy() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let raw = "Writer words\n"
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "writer", draft: raw), with: owner))
        _ = try await queue.retainConflict(projectId: "project-1", ownerUserId: owner)
        let suite = "them.whitespace-conflict.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"), draftSaveOutbox: queue)
        model.selectedProjectID = "project-1"
        await model.restorePendingDraftSaveBeforeProjectHydration()
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Writer words"]]])
        model.hydrateDraft(from: try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
        try? await Task.sleep(nanoseconds: 1_100_000_000)
        XCTAssertEqual(model.fountainDraft, raw)
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertNotNil(model.conflictState)
        let copies = try await queue.entriesForTesting()
        XCTAssertEqual(copies.map(\.draft), [raw])
        XCTAssertEqual(copies.first?.status, .parked)
    }

    @MainActor
    func testMissingServerFetchFailurePreservesConflictAndDurableWords() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "writer"), with: owner))
        _ = try await queue.retainConflict(projectId: "project-1", ownerUserId: owner)
        let suite = "them.failed-conflict-fetch.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        recovery.save(ownerUserId: owner, projectId: "project-1", draft: "Draft one",
            baseVersionId: "server-v1", dirty: true, savedAt: 100)
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue,
            conflictProjectLoader: { _ in throw URLError(.notConnectedToInternet) })
        model.selectedProjectID = "project-1"
        model.fountainDraft = "Draft one"
        let conflict = ScreenplayStudioViewModel.SaveConflictState(projectId: "project-1",
            baseVersionId: "server-v1", serverVersionId: "remote", serverDraft: "",
            serverDraftExcerpt: "", serverUpdatedAt: 1)
        model.conflictState = conflict
        await model.loadMissingServerDraftForConflict(conflict,
            owner: ScreenplayStudioAuthContext(userID: owner,
                sessionIntentGeneration: BackendAuthClient.currentAuthSessionIntentGeneration()),
            draftAtChoice: model.fountainDraft, choiceTime: 200)
        XCTAssertEqual(model.fountainDraft, "Draft one")
        XCTAssertEqual(model.conflictState, conflict)
        XCTAssertFalse(model.errorText.isEmpty)
        XCTAssertEqual(recovery.payloads(ownerUserId: owner)["project-1"]?["draft"] as? String, "Draft one")
        let copies = try await queue.entriesForTesting()
        XCTAssertEqual(copies.map(\.draft), ["Draft one"])
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testCanonicalHydrationRetiresExactMatchingParkedCopyWithoutAnotherWrite() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let raw = "  Writer words\r\n"
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "writer", draft: raw), with: owner))
        _ = try await queue.retainConflict(projectId: "project-1", ownerUserId: owner)
        let suite = "them.confirmed-conflict.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"), draftSaveOutbox: queue)
        model.selectedProjectID = "project-1"
        await model.restorePendingDraftSaveBeforeProjectHydration()
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "confirmed", "versions": [["id": "confirmed", "draft": raw]]])
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data)
        model.hydrateDraft(from: project)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
        XCTAssertEqual(model.fountainDraft, raw)
        XCTAssertEqual(model.latestVersionID, "confirmed")
        XCTAssertFalse(model.hasUnsavedDraftChanges)
        let copies = try await queue.entriesForTesting()
        XCTAssertTrue(copies.isEmpty)
    }

    func testFailedConflictPersistenceAndDiscardNeverDropTheInMemoryCopies() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "writer"))
        _ = try await store.retainConflict(projectId: "project-1", ownerUserId: "user-1")
        let before = try await store.entriesForTesting()
        let manifest = storageDirectory.appendingPathComponent("queue.json")
        try FileManager.default.moveItem(at: manifest, to: storageDirectory.appendingPathComponent("original.json"))
        try FileManager.default.createDirectory(at: manifest, withIntermediateDirectories: false)
        do {
            _ = try await store.retainConflict(projectId: "project-1", ownerUserId: "user-1")
            XCTFail("Writing over a directory should fail")
        } catch {}
        do {
            try await store.discardConflicts(projectId: "project-1", ownerUserId: "user-1", through: 1000)
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
    func testRelaunchMustPreferNewerUnsavedRecoveryOverOlderConflictedQueue() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "older", draft: "Submitted words", createdAt: 100), with: owner))
        _ = try await queue.retainConflict(projectId: "project-1", ownerUserId: owner)
        let suite = "them.conflict-relaunch.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        recovery.save(ownerUserId: owner, projectId: "project-1", draft: "  Newer writer words\r\n",
                      baseVersionId: "base-newer", dirty: true, savedAt: 200)
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.selectedProjectID = "project-1"
        model.fountainDraft = ""
        await model.restorePendingDraftSaveBeforeProjectHydration()
        XCTAssertEqual(model.fountainDraft, "  Newer writer words\r\n")
        XCTAssertEqual(model.latestVersionID, "base-newer")
        XCTAssertEqual(recovery.payloads(ownerUserId: owner)["project-1"]?["draft"] as? String, "  Newer writer words\r\n")
        let copies = try await queue.entriesForTesting()
        XCTAssertEqual(copies.map(\.draft), ["Submitted words"])
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testRealConflictHandlerRecoversQueuedWordsWhenEditorWasHydratedFromServer() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let local = "  INT. ROOM - NIGHT\r\n\r\nWriter words.\r\n"
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "writer", draft: local), with: owner))
        let suite = "them.conflict-handler.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.selectedProjectID = "project-1"
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
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "submitted", draft: "Submitted words"), with: owner))
        let suite = "them.conflict-handler.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.selectedProjectID = "project-1"
        model.fountainDraft = "Newer writer edits"
        model.hasUnsavedDraftChanges = true
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
        let retained = try await store.retainConflict(projectId: "project-1", ownerUserId: "user-1")
        XCTAssertEqual(retained?.draft, newest.draft)
        let relaunched = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entries = try await relaunched.entriesForTesting()
        XCTAssertEqual(entries.map(\.draft), [first.draft, newest.draft])
        XCTAssertTrue(entries.allSatisfy { $0.status == .parked })
        let retry = try await relaunched.beginNext(projectId: "project-1", ownerUserId: "user-1", force: true)
        XCTAssertNil(retry)
        let restored = try await relaunched.pendingEntry(projectId: "project-1", ownerUserId: "user-1")
        XCTAssertEqual(restored?.draft, newest.draft)
    }

    func testConflictResolutionRetiresOlderCopiesOnlyAfterServerConfirmation() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "old", createdAt: 100))
        try await store.enqueue(replacingOwner(of: makeEntry(id: "private", createdAt: 100), with: "user-2"))
        _ = try await store.retainConflict(projectId: "project-1", ownerUserId: "user-1")
        try await store.enqueue(makeEntry(id: "choice", draft: "Chosen draft", createdAt: 102))
        try await store.enqueue(makeEntry(id: "newer-edit", draft: "Newer edit", createdAt: 103))
        let before = try await store.entriesForTesting()
        XCTAssertEqual(before.count, 4)
        try await store.markSucceeded(id: "choice", serverVersionId: "confirmed",
                                      supersedesEarlierSaves: true)
        let after = try await store.entriesForTesting()
        XCTAssertEqual(Set(after.map(\.id)), ["private", "newer-edit"])
        XCTAssertEqual(after.first { $0.id == "newer-edit" }?.baseVersionId, "confirmed")
    }

    func testStaleAcknowledgementCannotRetireNewlyParkedConflict() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let older = makeEntry(id: "older", draft: "Original writer words", createdAt: 100)
        let choice = makeEntry(id: "choice", draft: "Chosen writer words", createdAt: 101,
                               source: "studio_conflict_resolve")
        try await store.enqueue(older)
        try await store.enqueue(choice)
        try await store.markInflight(id: choice.id)
        _ = try await store.retainConflict(projectId: choice.projectId, ownerUserId: choice.ownerUserId)
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
        try await store.enqueue(makeEntry(id: "old", createdAt: 100))
        try await store.enqueue(makeEntry(id: "later", draft: "Later writer text", createdAt: 200))
        try await store.enqueue(replacingOwner(of: makeEntry(id: "private", createdAt: 100), with: "user-2"))
        _ = try await store.retainConflict(projectId: "project-1", ownerUserId: "user-1")
        try await store.discardConflicts(projectId: "project-1", ownerUserId: "user-1", through: 150)
        let after = try await store.entriesForTesting()
        XCTAssertEqual(Set(after.map(\.id)), ["private", "later"])
    }

    func testHeldSaveIsPersistedSeparatelyFromAnIdenticalRunnableSave() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let active = makeEntry(id: "active", draft: "Exact writer words", createdAt: 100)
        var held = makeEntry(id: "held", draft: active.draft, createdAt: 101)
        held.status = .parked
        held.nextAttemptAt = 0
        held.lastError = "Writer choice required"
        try await queue.enqueue(active)
        try await queue.enqueue(held)

        let reopened = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let stored = try await reopened.entriesForTesting()
        XCTAssertEqual(stored, [active, held], "Same text is not permission to drop a separate held intent.")
        let next = try await reopened.beginNext(projectId: active.projectId, ownerUserId: active.ownerUserId, force: true)
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
            let original = makeEntry(id: "writer", draft: "Exact writer words")
            try await queue.enqueue(original)
            let manifest = directory.appendingPathComponent("queue.json")
            try FileManager.default.removeItem(at: manifest)
            try FileManager.default.createDirectory(at: manifest, withIntermediateDirectories: false)
            do {
                switch operation {
                case "begin": _ = try await queue.beginNext(projectId: original.projectId,
                    ownerUserId: original.ownerUserId, force: true)
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
        XCTAssertEqual(recoverable?.draft, entry.draft)
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
        XCTAssertEqual(recoverable?.draft, entry.draft)
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
        XCTAssertEqual(recoverable?.draft, entry.draft)
        let next = try await queue.beginNext(projectId: entry.projectId, ownerUserId: entry.ownerUserId, force: true)
        XCTAssertNil(next)
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

    func testQueueDeduplicatesSameSaveIdentifier() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entry = makeEntry(id: "save-once")

        try await store.enqueue(entry)
        try await store.enqueue(entry)

        let stored = try await store.entriesForTesting()
        XCTAssertEqual(stored.map(\.id), ["save-once"])
    }

    func testSnapshotCountsOnlyTheCurrentAccount() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "my-save"))
        let otherOwner = replacingOwner(of: makeEntry(id: "other-save"), with: "user-2")
        try await store.enqueue(otherOwner)

        let mine = await store.snapshot(ownerUserId: "user-1")
        let theirs = await store.snapshot(ownerUserId: "user-2")
        let all = await store.snapshot()

        XCTAssertEqual(mine.pendingCount, 1)
        XCTAssertEqual(theirs.pendingCount, 1)
        XCTAssertEqual(all.pendingCount, 2)
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
        XCTAssertEqual(try Data(contentsOf: manifestURL), corruptData)
    }

    func testSuccessfulSaveRebasesCausallyFollowingDrafts() async throws {
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
        XCTAssertEqual(stored.map(\.baseVersionId), ["server-v2", "server-v2"])
    }

    func testLaterDraftCannotSkipOlderBackedOffSave() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "save-1", draft: "Draft one", createdAt: 100))
        try await store.markRetryable(
            id: "save-1",
            error: "offline",
            now: Date(timeIntervalSince1970: 100)
        )
        try await store.enqueue(makeEntry(id: "save-2", draft: "Draft two", createdAt: 101))

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
        var otherOwner = makeEntry(id: "other-save", draft: "Other draft", createdAt: 99)
        otherOwner = replacingOwner(of: otherOwner, with: "user-2")
        try await store.enqueue(otherOwner)
        try await store.enqueue(makeEntry(id: "my-save", createdAt: 100))

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

    private func makeEntry(
        id: String,
        draft: String = "Draft one",
        createdAt: TimeInterval = 100,
        source: String = "studio_autosave"
    ) -> ScreenplayDraftSaveOutboxEntry {
        ScreenplayDraftSaveOutboxEntry(
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
    }

    private func replacingOwner(
        of entry: ScreenplayDraftSaveOutboxEntry,
        with ownerUserId: String
    ) -> ScreenplayDraftSaveOutboxEntry {
        ScreenplayDraftSaveOutboxEntry(
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
    }
}
