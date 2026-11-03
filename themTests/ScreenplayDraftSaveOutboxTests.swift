import XCTest
@testable import them

final class ScreenplayDraftSaveOutboxTests: XCTestCase {
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
        // parent's active outbox; later conflict-retention semantics stay separate.
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

    private var storageDirectory: URL!

    override func setUp() {
        super.setUp()
        storageDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("ScreenplayDraftSaveOutboxTests-(UUID().uuidString)", isDirectory: true)
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
