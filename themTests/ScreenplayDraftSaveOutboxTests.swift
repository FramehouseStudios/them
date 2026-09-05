import XCTest
@testable import them

final class ScreenplayDraftSaveOutboxTests: XCTestCase {
    private enum FileProtectionTestError: Error {
        case rejected
    }

    private var storageDirectory: URL!

    override func setUp() {
        super.setUp()
        storageDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent(
                "ScreenplayDraftSaveOutboxTests-\(UUID().uuidString)",
                isDirectory: true
            )
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
        XCTAssertTrue(try candidateFiles().isEmpty)
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

    func testDraftSnapshotSeparatesOwnerTotalsFromExactProjectAndNormalizedDraft() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let draft = "INT. MOTEL - NIGHT\n\nCLEMENTINE waits."
        try await store.enqueue(makeEntry(id: "parked", draft: draft))
        try await store.markParked(id: "parked", error: "Conflict")
        try await store.enqueue(makeEntry(id: "inflight", draft: draft))
        try await store.markInflight(id: "inflight")
        try await store.enqueue(makeEntry(id: "older", draft: draft + " An older ending."))
        try await store.enqueue(makeEntry(id: "other-project", draft: draft, projectId: "project-2"))
        try await store.enqueue(replacingOwner(of: makeEntry(id: "other-owner", draft: draft), with: "user-2"))
        let beforeRead = try await store.entriesForTesting()
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let persistedBeforeRead = try Data(contentsOf: manifestURL)

        let snapshot = await store.snapshot(
            ownerUserId: " user-1 ",
            projectId: " project-1 ",
            draft: "\n" + draft.replacingOccurrences(of: "\n", with: "\r\n") + "\n"
        )
        let newer = await store.snapshot(ownerUserId: "user-1", projectId: "project-1", draft: draft + " New edit.")
        let owner = await store.snapshot(ownerUserId: "user-1")
        let all = await store.snapshot()

        XCTAssertEqual(snapshot.owner, owner)
        XCTAssertEqual(snapshot.owner.pendingCount, 2)
        XCTAssertEqual(snapshot.owner.inflightCount, 1)
        XCTAssertEqual(snapshot.owner.parkedCount, 1)
        XCTAssertEqual(snapshot.draft.pendingCount, 0)
        XCTAssertEqual(snapshot.draft.inflightCount, 1)
        XCTAssertEqual(snapshot.draft.parkedCount, 1)
        XCTAssertEqual(newer.owner, owner)
        XCTAssertEqual(newer.draft, .empty)
        XCTAssertEqual(all.activeCount, 4)
        let afterRead = try await store.entriesForTesting()
        XCTAssertEqual(afterRead, beforeRead)
        XCTAssertEqual(try Data(contentsOf: manifestURL), persistedBeforeRead)
    }

    func testCorruptManifestIsNotSilentlyReplacedByAnEmptyQueue() async throws {
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let corruptData = Data("{not-json".utf8)
        try corruptData.write(to: manifestURL)
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)

        let firstRead = await store.snapshot(ownerUserId: "user-1")
        let secondRead = await store.snapshot(ownerUserId: "user-1")
        let draftRead = await store.snapshot(ownerUserId: "user-1", projectId: "project-1", draft: "Draft")

        XCTAssertFalse(firstRead.lastError.isEmpty)
        XCTAssertFalse(secondRead.lastError.isEmpty)
        XCTAssertFalse(draftRead.owner.lastError.isEmpty)
        XCTAssertEqual(draftRead.owner, draftRead.draft)
        XCTAssertEqual(try Data(contentsOf: manifestURL), corruptData)
    }

    func testManifestWriteFailureRollsBackEnqueueAndMarkStateInMemory() async throws {
        let seedStore = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await seedStore.enqueue(makeEntry(id: "existing"))

        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let initiallyLoaded = try await store.entriesForTesting()
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        try FileManager.default.removeItem(at: manifestURL)
        try FileManager.default.createDirectory(
            at: manifestURL,
            withIntermediateDirectories: false
        )

        do {
            try await store.enqueue(
                makeEntry(
                    id: "uncommitted-enqueue",
                    draft: "A distinct draft that requires a manifest commit.",
                    createdAt: 101
                )
            )
            XCTFail("Expected manifest commit to fail")
        } catch {
            XCTAssertFalse(error.localizedDescription.isEmpty)
        }
        let entriesAfterFailedEnqueue = try await store.entriesForTesting()
        XCTAssertEqual(entriesAfterFailedEnqueue, initiallyLoaded)

        do {
            try await store.markParked(
                id: "existing",
                error: "must-not-leak-in-memory",
                now: Date(timeIntervalSince1970: 102)
            )
            XCTFail("Expected manifest commit to fail")
        } catch {
            XCTAssertFalse(error.localizedDescription.isEmpty)
        }
        let entriesAfterFailedMark = try await store.entriesForTesting()
        XCTAssertEqual(entriesAfterFailedMark, initiallyLoaded)
        XCTAssertTrue(try candidateFiles().isEmpty)
    }

    func testDirectoryProtectionFailureLeavesNewManifestAndActorStateEmpty() async throws {
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let protectedDirectory = storageDirectory
        let store = ScreenplayDraftSaveOutbox(
            storageDirectory: storageDirectory,
            fileProtectionEnforcer: { url in
                if url == protectedDirectory {
                    throw FileProtectionTestError.rejected
                }
            }
        )

        do {
            try await store.enqueue(makeEntry(id: "must-not-commit"))
            XCTFail("Expected directory protection enforcement to fail")
        } catch FileProtectionTestError.rejected {
            // Expected.
        } catch {
            XCTFail("Unexpected error: \(error)")
        }

        let entriesAfterFailure = try await store.entriesForTesting()
        XCTAssertTrue(entriesAfterFailure.isEmpty)
        XCTAssertFalse(FileManager.default.fileExists(atPath: manifestURL.path))
    }

    func testManifestProtectionFailureLeavesPriorManifestAndActorStateUnchanged() async throws {
        let seedStore = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await seedStore.enqueue(makeEntry(id: "existing"))
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let originalManifest = try Data(contentsOf: manifestURL)
        let store = ScreenplayDraftSaveOutbox(
            storageDirectory: storageDirectory,
            fileProtectionEnforcer: { url in
                if url.lastPathComponent.hasPrefix(".queue-") {
                    throw FileProtectionTestError.rejected
                }
            }
        )
        let initiallyLoaded = try await store.entriesForTesting()

        do {
            try await store.enqueue(
                makeEntry(
                    id: "must-not-commit",
                    draft: "A distinct draft that requires a manifest commit.",
                    createdAt: 101
                )
            )
            XCTFail("Expected manifest protection enforcement to fail")
        } catch FileProtectionTestError.rejected {
            // Expected.
        } catch {
            XCTFail("Unexpected error: \(error)")
        }

        let entriesAfterFailure = try await store.entriesForTesting()
        XCTAssertEqual(entriesAfterFailure, initiallyLoaded)
        XCTAssertEqual(try Data(contentsOf: manifestURL), originalManifest)
        XCTAssertTrue(try candidateFiles().isEmpty)
    }

    func testExistingManifestProtectionFailureBlocksLoadBeforeDecoding() async throws {
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let originalManifest = Data("{unprotected-content".utf8)
        try originalManifest.write(to: manifestURL)
        let store = ScreenplayDraftSaveOutbox(
            storageDirectory: storageDirectory,
            fileProtectionEnforcer: { url in
                if url == manifestURL {
                    throw FileProtectionTestError.rejected
                }
            }
        )

        for _ in 0..<2 {
            do {
                _ = try await store.entriesForTesting()
                XCTFail("Expected manifest protection enforcement to block loading")
            } catch FileProtectionTestError.rejected {
                // Protection is checked before legacy bytes are decoded.
            } catch {
                XCTFail("Unexpected error: \(error)")
            }
        }

        XCTAssertEqual(try Data(contentsOf: manifestURL), originalManifest)
    }

    func testRecoveryProtectionFailurePreservesInflightManifestUntilRecoveryCanCommit() async throws {
        let seedStore = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await seedStore.enqueue(makeEntry(id: "interrupted"))
        try await seedStore.markInflight(
            id: "interrupted",
            now: Date(timeIntervalSince1970: 101)
        )
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let inflightManifest = try Data(contentsOf: manifestURL)
        let failingStore = ScreenplayDraftSaveOutbox(
            storageDirectory: storageDirectory,
            fileProtectionEnforcer: { url in
                if url.lastPathComponent.hasPrefix(".queue-") {
                    throw FileProtectionTestError.rejected
                }
            }
        )

        for _ in 0..<2 {
            do {
                _ = try await failingStore.entriesForTesting()
                XCTFail("Expected recovery manifest protection enforcement to fail")
            } catch FileProtectionTestError.rejected {
                // Recovery remains retryable without changing the committed manifest.
            } catch {
                XCTFail("Unexpected error: \(error)")
            }
            XCTAssertEqual(try Data(contentsOf: manifestURL), inflightManifest)
            XCTAssertTrue(try candidateFiles().isEmpty)
        }

        let recoveredStore = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let recovered = try await recoveredStore.entriesForTesting()
        XCTAssertEqual(recovered.count, 1)
        XCTAssertEqual(recovered.first?.id, "interrupted")
        XCTAssertEqual(recovered.first?.status, .pending)
        XCTAssertEqual(recovered.first?.lastError, "Interrupted while saving.")
        XCTAssertTrue(try candidateFiles().isEmpty)
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
        projectId: String = "project-1"
    ) -> ScreenplayDraftSaveOutboxEntry {
        ScreenplayDraftSaveOutboxEntry(
            id: id,
            projectId: projectId,
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

    private func candidateFiles() throws -> [URL] {
        guard FileManager.default.fileExists(atPath: storageDirectory.path) else { return [] }
        return try FileManager.default.contentsOfDirectory(
            at: storageDirectory,
            includingPropertiesForKeys: nil
        ).filter { $0.lastPathComponent.hasPrefix(".queue-") }
    }
}
