import XCTest
@testable import them

final class ScreenplayDraftSaveOutboxTests: XCTestCase {
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
