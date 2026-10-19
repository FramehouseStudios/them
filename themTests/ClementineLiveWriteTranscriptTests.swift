import XCTest
@testable import them

@MainActor
final class ClementineLiveWriteTranscriptTests: XCTestCase {
    func testPunctuatedClauseEmitsOnlyAfterSurvivingLaterPartial() {
        var subject = ClementineLiveWriteTranscriptStabilizer()

        XCTAssertNil(subject.observePartial("Rain needles the empty street.", at: 0))
        XCTAssertEqual(
            subject.observePartial("Rain needles the empty street. Mara runs", at: 0.2),
            "Rain needles the empty street."
        )
        XCTAssertNil(subject.observePartial("Rain needles the empty street. Mara runs home", at: 0.4))
    }

    func testStableLongPartialEmitsWithoutPunctuationAfterDelay() {
        var subject = ClementineLiveWriteTranscriptStabilizer(
            configuration: .init(stableInterval: 0.8, minimumUnpunctuatedWords: 8)
        )

        XCTAssertNil(subject.observePartial("Mara crosses the room and reaches for the letter", at: 2))
        XCTAssertNil(subject.emitStablePartial(at: 2.79))
        XCTAssertEqual(
            subject.emitStablePartial(at: 2.8),
            "Mara crosses the room and reaches for the letter"
        )
        XCTAssertNil(subject.emitStablePartial(at: 3.8))
    }

    func testFinalTranscriptAppendsOnlyUnemittedRemainder() {
        var subject = ClementineLiveWriteTranscriptStabilizer()
        _ = subject.observePartial("Rain needles the empty street.", at: 0)
        XCTAssertEqual(
            subject.observePartial("Rain needles the empty street. Mara runs", at: 0.2),
            "Rain needles the empty street."
        )

        XCTAssertEqual(
            subject.finalize("Rain needles the empty street. Mara runs home."),
            .append("Mara runs home.")
        )
        XCTAssertEqual(subject.latestPartial, "")
        XCTAssertEqual(subject.emittedPrefix, "")
    }

    func testFinalCorrectionRequestsAtomicReconciliation() {
        var subject = ClementineLiveWriteTranscriptStabilizer()
        _ = subject.observePartial("Mara takes the red door.", at: 0)
        _ = subject.observePartial("Mara takes the red door. It closes", at: 0.2)

        XCTAssertEqual(
            subject.finalize("Mara takes the read door. It closes."),
            .reconcile(fullTranscript: "Mara takes the read door. It closes.")
        )
    }

    func testQueuePreservesOrderAndDoesNotReplaceActiveChunk() throws {
        var queue = ClementineLiveWriteRenderQueue()
        let firstID = UUID()
        let secondID = UUID()
        let first = try XCTUnwrap(queue.enqueue("First clause.", id: firstID))
        let second = try XCTUnwrap(queue.enqueue("Second clause.", id: secondID))

        XCTAssertEqual(queue.beginNext(), first)
        XCTAssertNil(queue.beginNext(), "A new utterance must not cancel or replace active work")
        XCTAssertEqual(queue.pending, [second])
        XCTAssertTrue(queue.finishActive(id: firstID))
        XCTAssertEqual(queue.beginNext(), second)
    }

    func testQueueDeduplicatesChunkIdentityButAllowsRepeatedTranscript() throws {
        var queue = ClementineLiveWriteRenderQueue()
        let chunkID = UUID()
        let active = try XCTUnwrap(queue.enqueue("A door opens.", id: chunkID))
        XCTAssertNil(queue.enqueue("Different words.", id: chunkID))
        let repeated = try XCTUnwrap(queue.enqueue("  A   door opens.  "))
        XCTAssertEqual(queue.beginNext(), active)
        XCTAssertFalse(queue.finishActive(id: UUID()))
        XCTAssertEqual(queue.active, active)
        XCTAssertTrue(queue.finishActive(id: active.id))
        XCTAssertEqual(queue.beginNext(), repeated)
        XCTAssertEqual(repeated.transcript, active.transcript)
    }

    func testFailedActiveChunkIsDeferredWithoutLosingItsOrder() throws {
        var queue = ClementineLiveWriteRenderQueue()
        let first = try XCTUnwrap(queue.enqueue("First passage."))
        let second = try XCTUnwrap(queue.enqueue("Second passage."))

        XCTAssertEqual(queue.beginNext(), first)
        XCTAssertTrue(queue.deferActive(id: first.id))
        XCTAssertNil(queue.active)
        XCTAssertEqual(queue.pending, [first, second])
        XCTAssertEqual(queue.beginNext(), first)
    }

    func testPendingStoreSurvivesRelaunchAndSeparatesOwnerProjectScopes() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = ClementineLiveWritePendingStore(directoryURL: directory)
        let scope = ClementineLiveWriteScope(ownerUserID: "writer-a", projectID: "feature-1")
        let otherScope = ClementineLiveWriteScope(ownerUserID: "writer-b", projectID: "feature-1")
        let chunks = [
            ClementineLiveWriteRenderQueue.Chunk(transcript: "First passage."),
            ClementineLiveWriteRenderQueue.Chunk(transcript: "Second passage."),
        ]

        XCTAssertTrue(store.save(chunks, scope: scope))
        XCTAssertEqual(ClementineLiveWritePendingStore(directoryURL: directory).load(scope: scope), chunks)
        XCTAssertEqual(store.load(scope: otherScope), [])
        XCTAssertTrue(store.save([], scope: scope))
        XCTAssertEqual(store.load(scope: scope), [])
    }

    func testPendingStoreRefusesIncompleteOwnerOrProjectScope() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = ClementineLiveWritePendingStore(directoryURL: directory)
        let chunks = [ClementineLiveWriteRenderQueue.Chunk(transcript: "Private passage.")]
        let missingOwner = ClementineLiveWriteScope(ownerUserID: "  ", projectID: "feature")
        let missingProject = ClementineLiveWriteScope(ownerUserID: "writer", projectID: "\n")

        XCTAssertNil(missingOwner.storageKeySuffix)
        XCTAssertNil(missingProject.storageKeySuffix)
        XCTAssertFalse(store.save(chunks, scope: missingOwner))
        XCTAssertFalse(store.save(chunks, scope: missingProject))
        XCTAssertEqual(store.load(scope: missingOwner), [])
        XCTAssertEqual(store.load(scope: missingProject), [])
        XCTAssertFalse(FileManager.default.fileExists(atPath: directory.path))
    }

    func testPendingStoreReportsJournalFailure() throws {
        let blockedDirectory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try Data("not a directory".utf8).write(to: blockedDirectory)
        defer { try? FileManager.default.removeItem(at: blockedDirectory) }
        let store = ClementineLiveWritePendingStore(directoryURL: blockedDirectory)
        let scope = ClementineLiveWriteScope(ownerUserID: "writer", projectID: "feature")

        XCTAssertFalse(store.save([.init(transcript: "Keep this passage.")], scope: scope))
    }

    @MainActor
    func testCoordinatorRestoresRetryablePassageAfterFreshInstance() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = ClementineLiveWritePendingStore(directoryURL: directory)
        let scope = ClementineLiveWriteScope(ownerUserID: "writer", projectID: "feature")
        let failed = ClementineLiveWriteCoordinator(pendingStore: store)
        XCTAssertTrue(failed.finalize("The motel sign goes dark.", scope: scope))
        let paused = expectation(description: "retryable passage retained")
        failed.startWorkerIfNeeded { _ in false } onPause: { paused.fulfill() }
        await fulfillment(of: [paused], timeout: 2)
        failed.cancel()

        let restored = ClementineLiveWriteCoordinator(pendingStore: store)
        XCTAssertTrue(restored.resume(scope: scope))
        let committed = expectation(description: "restored passage rendered")
        restored.startWorkerIfNeeded { chunk in
            XCTAssertEqual(chunk.transcript, "The motel sign goes dark.")
            committed.fulfill()
            return true
        } onPause: {
            XCTFail("Recovered passage unexpectedly paused again")
        }
        await fulfillment(of: [committed], timeout: 2)
    }

    @MainActor
    func testCoordinatorInvalidatesRenderSynchronouslyBeforeChangingScope() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let coordinator = ClementineLiveWriteCoordinator(
            pendingStore: ClementineLiveWritePendingStore(directoryURL: directory)
        )
        let first = ClementineLiveWriteScope(ownerUserID: "writer", projectID: "first")
        let second = ClementineLiveWriteScope(ownerUserID: "writer", projectID: "second")
        XCTAssertTrue(coordinator.finalize("First project passage.", scope: first) {
            XCTFail("Initial scope activation must not invalidate a render")
        })
        var scopeObservedDuringInvalidation: ClementineLiveWriteScope?

        XCTAssertFalse(coordinator.resume(scope: second) {
            scopeObservedDuringInvalidation = coordinator.activeScope
        })

        XCTAssertEqual(scopeObservedDuringInvalidation, first)
        XCTAssertEqual(coordinator.activeScope, second)
    }

    @MainActor
    func testCoordinatorWaitsForMatchingAuthoritativeEditorReceipt() async {
        let coordinator = ClementineLiveWriteCoordinator()
        let expected = UUID()
        var committed: UUID?
        coordinator.expectEditorCommit(expected)
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(50))
            committed = expected
        }

        let didCommit = await coordinator.waitForExpectedEditorCommit { committed }
        XCTAssertTrue(didCommit)
    }

}
