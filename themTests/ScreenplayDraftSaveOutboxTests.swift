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

    func testQueuePreservesDistinctIdentifiersForIdenticalDrafts() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)

        try await store.enqueue(makeEntry(id: "save-first", draft: "Same draft"))
        try await store.enqueue(makeEntry(id: "save-second", draft: "Same draft", createdAt: 101))

        let stored = try await store.entriesForTesting()
        XCTAssertEqual(stored.map(\.id), ["save-first", "save-second"])
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

        let entry = makeEntry(id: "save-1", draft: "Draft one", createdAt: 100)
        _ = try await store.markAccepted(
            key: receiptKey(for: entry),
            proof: serverProof(versionId: "server-v2", draft: entry.draft),
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

    func testLaterDraftCanContinuePastTerminalParkedSave() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let rejected = makeEntry(id: "rejected", draft: "Rejected draft", createdAt: 100)
        try await store.enqueue(rejected)
        _ = try await store.markRejected(
            key: receiptKey(for: rejected),
            reasonCode: "invalid_acknowledgement",
            error: "invalid response"
        )
        try await store.enqueue(makeEntry(id: "next", draft: "Next draft", createdAt: 101))

        let next = try await store.beginNext(
            projectId: "project-1",
            ownerUserId: "user-1",
            now: Date(timeIntervalSince1970: 102),
            force: true
        )

        XCTAssertEqual(next?.id, "next")
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

        let entry = makeEntry(id: "my-save", createdAt: 100)
        _ = try await store.markAccepted(
            key: receiptKey(for: entry),
            proof: serverProof(versionId: "my-server-v2", draft: entry.draft)
        )

        let stored = try await store.entriesForTesting()
        XCTAssertEqual(stored.count, 1)
        XCTAssertEqual(stored.first?.id, "other-save")
        XCTAssertEqual(stored.first?.baseVersionId, "server-v1")
    }

    func testAcceptedSaveRecordsOlderParkedWriteAsSuperseded() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let older = makeEntry(id: "older-parked", draft: "Older draft", createdAt: 99)
        let accepted = makeEntry(id: "accepted", draft: "Accepted draft", createdAt: 100)
        try await store.enqueue(older)
        try await store.markParked(id: older.id, error: "retry exhausted")
        try await store.enqueue(accepted)

        _ = try await store.markAccepted(
            key: receiptKey(for: accepted),
            proof: serverProof(versionId: "server-v2", draft: accepted.draft)
        )

        let remainingEntries = try await store.entriesForTesting()
        XCTAssertTrue(remainingEntries.isEmpty)
        let receipts = try await store.receiptsForTesting()
        XCTAssertEqual(receipts.count, 2)
        XCTAssertEqual(
            receipts.first(where: { $0.key.clientRequestId == older.id })?.outcome,
            .superseded
        )
        XCTAssertEqual(
            receipts.first(where: { $0.key.clientRequestId == older.id })?.reasonCode,
            "superseded_by_accepted_save"
        )
        XCTAssertEqual(
            receipts.first(where: { $0.key.clientRequestId == accepted.id })?.outcome,
            .accepted
        )
    }

    func testConflictPreservesAndParksLaterDistinctSnapshot() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "save-1", draft: "Draft one", createdAt: 100))
        try await store.enqueue(makeEntry(
            id: "save-2",
            draft: "Distinct snapshot draft",
            source: "studio_snapshot",
            createdAt: 101
        ))
        var otherOwner = makeEntry(id: "save-other", draft: "Other draft", createdAt: 102)
        otherOwner = replacingOwner(of: otherOwner, with: "user-2")
        try await store.enqueue(otherOwner)

        let active = makeEntry(id: "save-1", draft: "Draft one", createdAt: 100)
        let receipt = try await store.markConflict(
            activeKey: receiptKey(for: active),
            serverVersionId: "server-v2",
            serverDraft: "Server draft",
            reasonCode: "stale_version"
        )

        let stored = try await store.entriesForTesting()
        XCTAssertEqual(stored.map(\.id), ["save-2", "save-other"])
        XCTAssertEqual(stored.first?.draft, "Distinct snapshot draft")
        XCTAssertEqual(stored.first?.source, "studio_snapshot")
        XCTAssertEqual(stored.first?.status, .parked)
        XCTAssertEqual(stored.last?.status, .pending)
        XCTAssertEqual(receipt.outcome, .conflict)
        XCTAssertEqual(receipt.key.clientRequestId, "save-1")
        let receipts = try await store.receiptsForTesting()
        XCTAssertEqual(receipts, [receipt])
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

    func testAcceptedReceiptIsDurableAndBoundToExactRawDraft() async throws {
        let firstStore = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entry = makeEntry(id: "save-receipt", draft: "A\r\nB")
        try await firstStore.enqueue(entry)
        let receipt = try await firstStore.markAccepted(
            key: receiptKey(for: entry),
            proof: serverProof(versionId: "server-v2", draft: "A\nB")
        )

        let restoredStore = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let restoredReceipt = try await restoredStore.receipt(for: receipt.key)
        let restoredEntries = try await restoredStore.entriesForTesting()
        XCTAssertEqual(restoredReceipt, receipt)
        XCTAssertTrue(restoredEntries.isEmpty)
        XCTAssertNotEqual(
            receipt.key.rawDraftSHA256,
            ScreenplayDraftSaveCanonicalization.rawSHA256("A\nB")
        )
    }

    func testCompletedRequestCannotBeQueuedAgainOrReusedForAnotherDraft() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entry = makeEntry(id: "completed-once", draft: "Original draft")
        try await store.enqueue(entry)
        _ = try await store.markAccepted(
            key: receiptKey(for: entry),
            proof: serverProof(versionId: "server-v2", draft: entry.draft)
        )

        try await store.enqueue(entry)
        var queuedEntries = try await store.entriesForTesting()
        XCTAssertTrue(queuedEntries.isEmpty)

        do {
            try await store.enqueue(makeEntry(id: entry.id, draft: "Different draft"))
            XCTFail("Expected completed request identifier reuse to fail")
        } catch {
            guard case BackendMemoryAPIError.server(let status, let message) = error else {
                return XCTFail("Unexpected error: \(error)")
            }
            XCTAssertEqual(status, 409)
            XCTAssertEqual(message, "screenplay_save_id_reused")
        }
        queuedEntries = try await store.entriesForTesting()
        XCTAssertTrue(queuedEntries.isEmpty)
    }

    func testAcknowledgementPersistenceFailureLeavesEntryInActorMemory() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entry = makeEntry(id: "save-durable")
        try await store.enqueue(entry)
        try await store.markInflight(id: entry.id)
        try FileManager.default.removeItem(at: storageDirectory)
        try Data("blocks-directory-recreation".utf8).write(to: storageDirectory)

        do {
            _ = try await store.markAccepted(
                key: receiptKey(for: entry),
                proof: serverProof(versionId: "server-v2", draft: entry.draft)
            )
            XCTFail("Expected local receipt persistence to fail")
        } catch {
            XCTAssertTrue(error is ScreenplayDraftSaveReceiptPersistenceError)
            await store.recoverInflightAfterReceiptPersistenceFailure(
                id: entry.id,
                error: error.localizedDescription,
                now: Date(timeIntervalSince1970: 200)
            )
        }

        let retainedEntries = try await store.entriesForTesting()
        let retainedReceipts = try await store.receiptsForTesting()
        XCTAssertEqual(retainedEntries.map(\.id), [entry.id])
        XCTAssertEqual(retainedEntries.first?.status, .pending)
        XCTAssertTrue(retainedReceipts.isEmpty)

        try FileManager.default.removeItem(at: storageDirectory)
        let retried = try await store.beginNext(
            projectId: entry.projectId,
            ownerUserId: entry.ownerUserId,
            now: Date(timeIntervalSince1970: 203),
            force: true
        )
        XCTAssertEqual(retried?.id, entry.id)
    }

    func testMissingEntryCannotManufactureAcceptedReceipt() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entry = makeEntry(id: "missing")
        do {
            _ = try await store.markAccepted(
                key: receiptKey(for: entry),
                proof: serverProof(versionId: "server-v2", draft: entry.draft)
            )
            XCTFail("Expected missing entry rejection")
        } catch {}
        let receipts = try await store.receiptsForTesting()
        XCTAssertTrue(receipts.isEmpty)
    }

    func testTerminalReceiptCannotBeReclassifiedByARepeatedCompletion() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entry = makeEntry(id: "terminal-once")
        try await store.enqueue(entry)
        _ = try await store.markRejected(
            key: receiptKey(for: entry),
            reasonCode: "invalid_acknowledgement",
            error: "invalid response"
        )

        do {
            _ = try await store.markSuperseded(
                key: receiptKey(for: entry),
                serverVersionId: "server-v2",
                serverDraft: entry.draft,
                reasonCode: "already_saved_elsewhere"
            )
            XCTFail("Expected terminal receipt conflict")
        } catch {}

        let receipts = try await store.receiptsForTesting()
        XCTAssertEqual(receipts.count, 1)
        XCTAssertEqual(receipts.first?.outcome, .rejected)
    }

    func testLaterAcceptedSavePreservesEarlierRejectedTransactionAndDraft() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let rejected = makeEntry(id: "rejected", draft: "Rejected draft", createdAt: 99)
        let accepted = makeEntry(id: "accepted", draft: "Accepted draft", createdAt: 100)
        try await store.enqueue(rejected)
        _ = try await store.markRejected(
            key: receiptKey(for: rejected),
            reasonCode: "invalid_acknowledgement",
            error: "invalid response"
        )
        try await store.enqueue(accepted)

        _ = try await store.markAccepted(
            key: receiptKey(for: accepted),
            proof: serverProof(versionId: "server-v2", draft: accepted.draft)
        )

        let entries = try await store.entriesForTesting()
        let receipts = try await store.receiptsForTesting()
        XCTAssertEqual(entries.map(\.id), [rejected.id])
        XCTAssertEqual(entries.first?.draft, rejected.draft)
        XCTAssertEqual(receipts.first(where: { $0.key.clientRequestId == rejected.id })?.outcome, .rejected)
        XCTAssertEqual(receipts.first(where: { $0.key.clientRequestId == accepted.id })?.outcome, .accepted)
    }

    func testLegacyArrayManifestMigratesWithoutDroppingPendingSave() async throws {
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let entry = makeEntry(id: "legacy")
        try JSONEncoder().encode([entry]).write(
            to: storageDirectory.appendingPathComponent("queue.json"),
            options: .atomic
        )

        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entries = try await store.entriesForTesting()
        XCTAssertEqual(entries.map(\.id), [entry.id])
        let data = try Data(contentsOf: storageDirectory.appendingPathComponent("queue.json"))
        let manifest = try JSONDecoder().decode(ScreenplayDraftSaveOutboxManifest.self, from: data)
        XCTAssertEqual(manifest.schemaVersion, ScreenplayDraftSaveOutboxManifest.currentSchemaVersion)
        XCTAssertEqual(manifest.entries.map(\.id), [entry.id])
        XCTAssertTrue(manifest.receipts.isEmpty)
    }

    private func makeEntry(
        id: String,
        draft: String = "Draft one",
        source: String = "studio_autosave",
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

    private func receiptKey(for entry: ScreenplayDraftSaveOutboxEntry) -> ScreenplayDraftSaveReceiptKey {
        ScreenplayDraftSaveReceiptKey(
            ownerUserId: entry.ownerUserId,
            projectId: entry.projectId,
            clientRequestId: entry.id,
            draft: entry.draft
        )
    }

    private func serverProof(versionId: String, draft: String) -> ScreenplayDraftSaveServerProof {
        ScreenplayDraftSaveServerProof(
            versionId: versionId,
            committedDraft: ScreenplayDraftSaveCanonicalization.serverDraft(draft),
            canonicalDraftSHA256: ScreenplayDraftSaveCanonicalization.serverSHA256(draft)
        )
    }
}
