import XCTest
@testable import them

final class ScreenplayDraftSaveOutboxTests: XCTestCase {
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
        createdAt: TimeInterval = 100
    ) -> ScreenplayDraftSaveOutboxEntry {
        ScreenplayDraftSaveOutboxEntry(
            id: id,
            projectId: "project-1",
            ownerUserId: "user-1",
            draft: draft,
            title: "Feature",
            phase: "scene_draft",
            notes: "",
            source: "studio_autosave",
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
