import XCTest
@testable import them

final class ScreenplayOutlineMutationOutboxTests: XCTestCase {
    private enum FileProtectionTestError: Error {
        case rejected
    }

    private var storageDirectory: URL!

    override func setUp() {
        super.setUp()
        storageDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent(
                "ScreenplayOutlineMutationOutboxTests-\(UUID().uuidString)",
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

    func testQueuePersistsAndRecoversInterruptedInflightMutation() async throws {
        let firstStore = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        let entry = makeEntry(id: "outline-1")
        try await firstStore.enqueue(entry)
        let begun = try await firstStore.beginNext(
            projectId: entry.projectId,
            ownerUserId: entry.ownerUserId,
            now: Date(timeIntervalSince1970: 101),
            force: true
        )
        XCTAssertEqual(begun?.status, .inflight)

        let restoredStore = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        let restored = try await restoredStore.entriesForTesting()

        XCTAssertEqual(restored.count, 1)
        XCTAssertEqual(restored.first?.id, entry.id)
        XCTAssertEqual(restored.first?.status, .pending)
        XCTAssertEqual(restored.first?.lastError, "Interrupted while saving outline.")
        XCTAssertLessThanOrEqual(
            restored.first?.nextAttemptAt ?? .greatestFiniteMagnitude,
            Date().timeIntervalSince1970
        )
    }

    func testCorruptManifestIsNeverSilentlyReplaced() async throws {
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let corruptData = Data("{not-json".utf8)
        try corruptData.write(to: manifestURL)
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)

        let firstSnapshot = await store.snapshot(ownerUserId: "user-1")
        let secondSnapshot = await store.snapshot(ownerUserId: "user-1")
        XCTAssertFalse(firstSnapshot.lastError.isEmpty)
        XCTAssertFalse(secondSnapshot.lastError.isEmpty)

        do {
            try await store.enqueue(makeEntry(id: "must-not-overwrite"))
            XCTFail("Expected corrupt manifest load to fail")
        } catch {
            XCTAssertFalse(error.localizedDescription.isEmpty)
        }
        XCTAssertEqual(try Data(contentsOf: manifestURL), corruptData)
    }

    func testStructurallyInvalidRestoredManifestFailsClosedBeforeInflightRecoveryWrite() async throws {
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let invalidEntry = makeEntry(
            id: "invalid-restored-entry",
            expectedRevision: -1,
            status: .inflight
        )
        let originalData = try JSONEncoder().encode([invalidEntry])
        try originalData.write(to: manifestURL)
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)

        do {
            _ = try await store.entriesForTesting()
            XCTFail("Expected structurally invalid restored entry to fail closed")
        } catch {
            XCTAssertFalse(error.localizedDescription.isEmpty)
        }

        XCTAssertEqual(try Data(contentsOf: manifestURL), originalData)
        do {
            try await store.enqueue(makeEntry(id: "must-not-replace-invalid-manifest"))
            XCTFail("Expected invalid restored manifest to remain terminal")
        } catch {
            XCTAssertFalse(error.localizedDescription.isEmpty)
        }
        XCTAssertEqual(try Data(contentsOf: manifestURL), originalData)
    }

    func testDuplicateRestoredRequestIdentifiersFailClosedBeforeInflightRecoveryWrite() async throws {
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let duplicateEntries = [
            makeEntry(id: "duplicate-request", createdAt: 100, status: .inflight),
            makeEntry(id: "duplicate-request", createdAt: 101),
        ]
        let originalData = try JSONEncoder().encode(duplicateEntries)
        try originalData.write(to: manifestURL)
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)

        do {
            _ = try await store.entriesForTesting()
            XCTFail("Expected duplicate restored request IDs to fail closed")
        } catch BackendMemoryAPIError.server(let status, let message) {
            XCTAssertEqual(status, 409)
            XCTAssertEqual(message, "screenplay_outline_client_request_id_reused")
        } catch {
            XCTFail("Unexpected error: \(error)")
        }

        XCTAssertEqual(try Data(contentsOf: manifestURL), originalData)
    }

    func testParkedRestoredSnapshotMayPreserveInvalidOutlineReferences() async throws {
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let parkedEntry = makeEntry(
            id: "parked-invalid-references",
            acts: [],
            scenes: [makeScene(id: "scene-1", actId: "missing-act")],
            beats: [makeBeat(id: "beat-1", sceneId: "missing-scene")],
            status: .parked,
            nextAttemptAt: 0
        )
        try JSONEncoder().encode([parkedEntry]).write(to: manifestURL)
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)

        let restored = try await store.entriesForTesting()

        XCTAssertEqual(restored.count, 1)
        XCTAssertEqual(restored.first?.id, parkedEntry.id)
        XCTAssertEqual(restored.first?.acts, parkedEntry.acts)
        XCTAssertEqual(restored.first?.scenes, parkedEntry.scenes)
        XCTAssertEqual(restored.first?.beats, parkedEntry.beats)
        XCTAssertEqual(restored.first?.status, parkedEntry.status)
        XCTAssertEqual(restored.first?.queueSequence, 1)
    }

    func testManifestWriteFailureRollsBackEnqueueAndMarkStateInMemory() async throws {
        let seedStore = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        try await seedStore.enqueue(makeEntry(id: "existing"))

        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        let initiallyLoaded = try await store.entriesForTesting()
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        try FileManager.default.removeItem(at: manifestURL)
        try FileManager.default.createDirectory(
            at: manifestURL,
            withIntermediateDirectories: false
        )

        do {
            try await store.enqueue(makeEntry(id: "uncommitted-enqueue", createdAt: 101))
            XCTFail("Expected manifest Data.write to fail")
        } catch {
            XCTAssertFalse(error.localizedDescription.isEmpty)
        }
        let afterFailedEnqueue = try await store.entriesForTesting()
        XCTAssertEqual(afterFailedEnqueue, initiallyLoaded)

        do {
            try await store.markParked(
                id: "existing",
                error: "must-not-leak-in-memory",
                now: Date(timeIntervalSince1970: 102)
            )
            XCTFail("Expected manifest Data.write to fail")
        } catch {
            XCTAssertFalse(error.localizedDescription.isEmpty)
        }
        let afterFailedMark = try await store.entriesForTesting()
        XCTAssertEqual(afterFailedMark, initiallyLoaded)
    }

    func testDirectoryProtectionFailureLeavesNewManifestAndActorStateEmpty() async throws {
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let protectedDirectory = storageDirectory
        let store = ScreenplayOutlineMutationOutbox(
            storageDirectory: storageDirectory,
            fileProtectionEnforcer: { url in
                if url == protectedDirectory {
                    throw FileProtectionTestError.rejected
                }
            }
        )

        do {
            try await store.enqueue(makeEntry(id: "must-not-commit", createdAt: 101))
            XCTFail("Expected directory protection enforcement to fail")
        } catch FileProtectionTestError.rejected {
            // Expected.
        } catch {
            XCTFail("Unexpected error: \(error)")
        }

        let afterFailure = try await store.entriesForTesting()
        XCTAssertTrue(afterFailure.isEmpty)
        XCTAssertFalse(FileManager.default.fileExists(atPath: manifestURL.path))
    }

    func testManifestProtectionFailureLeavesPriorManifestAndActorStateUnchanged() async throws {
        let seedStore = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        try await seedStore.enqueue(makeEntry(id: "existing"))
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let originalManifest = try Data(contentsOf: manifestURL)
        let store = ScreenplayOutlineMutationOutbox(
            storageDirectory: storageDirectory,
            fileProtectionEnforcer: { url in
                if url.lastPathComponent.hasPrefix(".queue-") {
                    throw FileProtectionTestError.rejected
                }
            }
        )
        let initiallyLoaded = try await store.entriesForTesting()

        do {
            try await store.enqueue(makeEntry(id: "must-not-commit", createdAt: 101))
            XCTFail("Expected manifest protection enforcement to fail")
        } catch FileProtectionTestError.rejected {
            // Expected.
        } catch {
            XCTFail("Unexpected error: \(error)")
        }

        let afterFailure = try await store.entriesForTesting()
        XCTAssertEqual(afterFailure, initiallyLoaded)
        XCTAssertEqual(try Data(contentsOf: manifestURL), originalManifest)
        let candidateFiles = try FileManager.default.contentsOfDirectory(
            at: storageDirectory,
            includingPropertiesForKeys: nil
        ).filter { $0.lastPathComponent.hasPrefix(".queue-") }
        XCTAssertTrue(candidateFiles.isEmpty)
    }

    func testLegacyManifestProtectionFailureBlocksLoadBeforeDecoding() async throws {
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let originalManifest = Data("{legacy-unprotected-content".utf8)
        try originalManifest.write(to: manifestURL)
        let store = ScreenplayOutlineMutationOutbox(
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
                XCTFail("Expected legacy manifest protection enforcement to block loading")
            } catch FileProtectionTestError.rejected {
                // Protection is checked before corrupt legacy bytes are decoded.
            } catch {
                XCTFail("Unexpected error: \(error)")
            }
        }

        XCTAssertEqual(try Data(contentsOf: manifestURL), originalManifest)
    }

    func testExactIdentifierReplayDeduplicatesButChangedSemanticIntentIsRejected() async throws {
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        let original = makeEntry(id: "stable-request", source: "reorder")
        try await store.enqueue(original)
        try await store.enqueue(makeEntry(id: "stable-request", source: "retry-after-relaunch"))
        let replayedEntries = try await store.entriesForTesting()
        XCTAssertEqual(replayedEntries.count, 1)

        do {
            try await store.enqueue(
                makeEntry(
                    id: "stable-request",
                    acts: [makeAct(id: "act-1", title: "Changed intent")]
                )
            )
            XCTFail("Expected changed semantic content to reject request ID reuse")
        } catch BackendMemoryAPIError.server(let status, let message) {
            XCTAssertEqual(status, 409)
            XCTAssertEqual(message, "screenplay_outline_client_request_id_reused")
        } catch {
            XCTFail("Unexpected error: \(error)")
        }

        let storedEntries = try await store.entriesForTesting()
        XCTAssertEqual(storedEntries, replayedEntries)
    }

    func testBackedOffHeadBlocksLaterMutationWithoutBlockingAnotherScope() async throws {
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(
            makeEntry(id: "head", createdAt: 100, nextAttemptAt: 200)
        )
        try await store.enqueue(
            makeEntry(id: "later", createdAt: 101, nextAttemptAt: 101)
        )
        try await store.enqueue(
            makeEntry(
                id: "other-owner",
                ownerUserId: "user-2",
                createdAt: 102,
                nextAttemptAt: 102
            )
        )
        try await store.enqueue(
            makeEntry(
                id: "other-project",
                projectId: "project-2",
                createdAt: 103,
                nextAttemptAt: 103
            )
        )

        let blocked = try await store.beginNext(
            projectId: "project-1",
            ownerUserId: "user-1",
            now: Date(timeIntervalSince1970: 150)
        )
        XCTAssertNil(blocked)

        let otherOwner = try await store.beginNext(
            projectId: "project-1",
            ownerUserId: "user-2",
            now: Date(timeIntervalSince1970: 150)
        )
        let otherProject = try await store.beginNext(
            projectId: "project-2",
            ownerUserId: "user-1",
            now: Date(timeIntervalSince1970: 150)
        )
        XCTAssertEqual(otherOwner?.id, "other-owner")
        XCTAssertEqual(otherProject?.id, "other-project")

        let forcedHead = try await store.beginNext(
            projectId: " project-1 ",
            ownerUserId: " user-1 ",
            now: Date(timeIntervalSince1970: 150),
            force: true
        )
        XCTAssertEqual(forcedHead?.id, "head")
        let laterStatus = try await store.status(id: "later")
        XCTAssertEqual(laterStatus, .pending)
    }

    func testSuccessRebasesOnlyLaterNeverAttemptedEntriesSharingOldRevision() async throws {
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "head", expectedRevision: 4, createdAt: 100))
        try await store.enqueue(makeEntry(id: "unsent", expectedRevision: 4, createdAt: 101))
        try await store.enqueue(
            makeEntry(id: "attempted", expectedRevision: 4, createdAt: 102, retries: 1)
        )
        try await store.enqueue(makeEntry(id: "different-base", expectedRevision: 5, createdAt: 103))
        try await store.enqueue(
            makeEntry(
                id: "other-project",
                projectId: "project-2",
                expectedRevision: 4,
                createdAt: 104
            )
        )

        try await store.markSucceeded(
            id: "head",
            committedRevision: 5,
            now: Date(timeIntervalSince1970: 105)
        )

        let stored = try await store.entriesForTesting()
        XCTAssertNil(stored.first(where: { $0.id == "head" }))
        XCTAssertEqual(stored.first(where: { $0.id == "unsent" })?.expectedOutlineRevision, 5)
        XCTAssertEqual(stored.first(where: { $0.id == "unsent" })?.updatedAt, 105)
        XCTAssertEqual(stored.first(where: { $0.id == "attempted" })?.expectedOutlineRevision, 4)
        XCTAssertEqual(stored.first(where: { $0.id == "different-base" })?.expectedOutlineRevision, 5)
        XCTAssertEqual(stored.first(where: { $0.id == "other-project" })?.expectedOutlineRevision, 4)
    }

    func testSupersededAcknowledgementRemovesHeadAndParksLaterActiveChain() async throws {
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "head", expectedRevision: 7, createdAt: 100))
        try await store.enqueue(makeEntry(id: "later-1", expectedRevision: 7, createdAt: 101))
        try await store.enqueue(makeEntry(id: "later-2", expectedRevision: 7, createdAt: 102))
        try await store.enqueue(
            makeEntry(
                id: "other-owner",
                ownerUserId: "user-2",
                expectedRevision: 7,
                createdAt: 103
            )
        )
        _ = try await store.beginNext(
            projectId: "project-1",
            ownerUserId: "user-1",
            now: Date(timeIntervalSince1970: 104),
            force: true
        )

        try await store.markSuperseded(
            id: "head",
            currentRevision: 9,
            error: "",
            now: Date(timeIntervalSince1970: 105)
        )

        let stored = try await store.entriesForTesting()
        XCTAssertNil(stored.first(where: { $0.id == "head" }))
        for id in ["later-1", "later-2"] {
            let entry = try XCTUnwrap(stored.first(where: { $0.id == id }))
            XCTAssertEqual(entry.status, .parked)
            XCTAssertEqual(entry.expectedOutlineRevision, 7)
            XCTAssertEqual(entry.nextAttemptAt, 0)
            XCTAssertEqual(entry.lastError, "Outline changed remotely at revision 9.")
            XCTAssertEqual(entry.parkedReason, .supersededByRemoteChange)
        }
        XCTAssertEqual(stored.first(where: { $0.id == "other-owner" })?.status, .pending)
    }

    func testRetryUsesDeterministicBackoffAndHonorsBoundedRetryAfter() async throws {
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "retry"))
        _ = try await store.beginNext(
            projectId: "project-1",
            ownerUserId: "user-1",
            now: Date(timeIntervalSince1970: 100),
            force: true
        )

        try await store.markRetryable(
            id: "retry",
            error: "offline",
            now: Date(timeIntervalSince1970: 100)
        )
        var storedEntries = try await store.entriesForTesting()
        var entry = try XCTUnwrap(storedEntries.first)
        XCTAssertEqual(entry.status, .pending)
        XCTAssertEqual(entry.retries, 1)
        XCTAssertEqual(entry.nextAttemptAt, 102)
        let tooEarly = try await store.beginNext(
            projectId: "project-1",
            ownerUserId: "user-1",
            now: Date(timeIntervalSince1970: 101)
        )
        XCTAssertNil(tooEarly)

        try await store.markRetryable(
            id: "retry",
            error: "HTTP 425",
            retryAfter: 20,
            now: Date(timeIntervalSince1970: 200)
        )
        storedEntries = try await store.entriesForTesting()
        entry = try XCTUnwrap(storedEntries.first)
        XCTAssertEqual(entry.retries, 2)
        XCTAssertEqual(entry.nextAttemptAt, 220)

        try await store.markRetryable(
            id: "retry",
            error: "retry-after capped",
            retryAfter: 99_999,
            now: Date(timeIntervalSince1970: 300)
        )
        storedEntries = try await store.entriesForTesting()
        entry = try XCTUnwrap(storedEntries.first)
        XCTAssertEqual(entry.retries, 3)
        XCTAssertEqual(entry.nextAttemptAt, 2_100)

        for retry in 4...6 {
            try await store.markRetryable(
                id: "retry",
                error: "offline \(retry)",
                now: Date(timeIntervalSince1970: TimeInterval(200 + retry))
            )
        }
        storedEntries = try await store.entriesForTesting()
        entry = try XCTUnwrap(storedEntries.first)
        XCTAssertEqual(entry.status, .parked)
        XCTAssertEqual(entry.retries, 6)
        XCTAssertEqual(entry.nextAttemptAt, 0)
        XCTAssertEqual(entry.lastError, "offline 6")
        XCTAssertEqual(entry.parkedReason, .retryExhausted)
    }

    func testExplicitParkingAndScopedSnapshotsPreserveRecoverableIntent() async throws {
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "mine"))
        try await store.enqueue(makeEntry(id: "theirs", ownerUserId: "user-2", createdAt: 101))

        try await store.markParked(
            id: "mine",
            error: "stale_screenplay_outline_revision",
            now: Date(timeIntervalSince1970: 102)
        )

        let mineStatus = try await store.status(id: "mine")
        let missingStatus = try await store.status(id: "missing")
        XCTAssertEqual(mineStatus, .parked)
        XCTAssertEqual(missingStatus, nil)
        let parkedEntries = try await store.entriesForTesting()
        let explicitlyParked = parkedEntries.first { $0.id == "mine" }
        XCTAssertEqual(explicitlyParked?.parkedReason, .permanentRejection)
        let mine = await store.snapshot(ownerUserId: "user-1", projectId: "project-1")
        let theirs = await store.snapshot(ownerUserId: "user-2", projectId: "project-1")
        let all = await store.snapshot()
        XCTAssertEqual(mine.parkedCount, 1)
        XCTAssertEqual(mine.lastError, "stale_screenplay_outline_revision")
        XCTAssertEqual(theirs.pendingCount, 1)
        XCTAssertEqual(all.parkedCount, 1)
        XCTAssertEqual(all.pendingCount, 1)
        let hasOtherOwnerEntries = try await store.hasActiveEntries(
            projectId: "project-1",
            ownerUserId: "user-2"
        )
        let hasMissingOwnerEntries = try await store.hasActiveEntries(
            projectId: "project-1",
            ownerUserId: "user-3"
        )
        XCTAssertTrue(hasOtherOwnerEntries)
        XCTAssertFalse(hasMissingOwnerEntries)
    }

    func testRecoveryChainsAreOwnerScopedAndPreserveDependentSnapshotOrder() async throws {
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(
            makeEntry(id: "earlier-active", createdAt: 90)
        )
        try await store.enqueue(
            makeEntry(
                id: "parked-head",
                createdAt: 100,
                status: .parked,
                nextAttemptAt: 0,
                parkedReason: .staleRevision
            )
        )
        try await store.enqueue(
            makeEntry(
                id: "dependent",
                createdAt: 101,
                status: .parked,
                nextAttemptAt: 0,
                parkedReason: .supersededByRemoteChange
            )
        )
        try await store.enqueue(
            makeEntry(
                id: "other-project",
                projectId: "project-2",
                createdAt: 102,
                status: .parked,
                retries: 6,
                nextAttemptAt: 0,
                parkedReason: .retryExhausted
            )
        )
        try await store.enqueue(
            makeEntry(
                id: "other-owner",
                ownerUserId: "user-2",
                createdAt: 103,
                status: .parked,
                retries: 6,
                nextAttemptAt: 0,
                parkedReason: .retryExhausted
            )
        )

        let mine = try await store.recoveryChains(ownerUserIds: [" user-1 "])
        XCTAssertEqual(mine.map(\.projectId), ["project-1", "project-2"])
        XCTAssertEqual(mine[0].entries.map(\.id), ["parked-head", "dependent"])
        XCTAssertFalse(mine[0].permitsRetry)
        XCTAssertTrue(mine[0].retryUnavailableReason.contains("earlier"))
        XCTAssertEqual(mine[1].entries.map(\.id), ["other-project"])
        XCTAssertTrue(mine[1].permitsRetry)

        let theirs = try await store.recoveryChains(ownerUserIds: ["user-2"])
        XCTAssertEqual(theirs.map(\.parkedHead.id), ["other-owner"])
        let missing = try await store.recoveryChains(ownerUserIds: ["user-3"])
        XCTAssertTrue(missing.isEmpty)
    }

    func testExactRetryPreservesIntentAndSurvivesRelaunch() async throws {
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        let original = makeEntry(
            id: "retry-exhausted",
            expectedRevision: 11,
            acts: [makeAct(id: "act-1", title: "Preserved Act")],
            scenes: [makeScene(id: "scene-1", actId: "act-1")],
            beats: [makeBeat(id: "beat-1", sceneId: "scene-1", actId: "act-1")],
            source: "reorder scene",
            createdAt: 100,
            status: .parked,
            retries: 6,
            nextAttemptAt: 0,
            parkedReason: .retryExhausted
        )
        try await store.enqueue(original)

        let snapshot = try await store.retryParkedHead(
            id: original.id,
            projectId: original.projectId,
            ownerUserIds: [original.ownerUserId],
            now: Date(timeIntervalSince1970: 200)
        )

        XCTAssertEqual(snapshot.pendingCount, 1)
        XCTAssertEqual(snapshot.parkedCount, 0)
        let retriedEntries = try await store.entriesForTesting()
        let retried = try XCTUnwrap(retriedEntries.first)
        XCTAssertEqual(retried.id, original.id)
        XCTAssertEqual(retried.projectId, original.projectId)
        XCTAssertEqual(retried.ownerUserId, original.ownerUserId)
        XCTAssertEqual(retried.expectedOutlineRevision, original.expectedOutlineRevision)
        XCTAssertEqual(retried.acts, original.acts)
        XCTAssertEqual(retried.scenes, original.scenes)
        XCTAssertEqual(retried.beats, original.beats)
        XCTAssertEqual(retried.source, original.source)
        XCTAssertEqual(retried.createdAt, original.createdAt)
        XCTAssertEqual(retried.status, .pending)
        XCTAssertEqual(retried.retries, 0)
        XCTAssertEqual(retried.nextAttemptAt, 200)
        XCTAssertEqual(retried.updatedAt, 200)
        XCTAssertNil(retried.parkedReason)

        let restoredStore = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        let restoredEntries = try await restoredStore.entriesForTesting()
        XCTAssertEqual(restoredEntries, [retried])
    }

    func testKnownStaleRecoveryCannotRetryOrMutateManifest() async throws {
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        let stale = makeEntry(
            id: "stale-head",
            expectedRevision: 4,
            status: .parked,
            nextAttemptAt: 0,
            parkedReason: .staleRevision
        )
        try await store.enqueue(stale)
        let beforeRejectedRetry = try await store.entriesForTesting()
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let originalManifest = try Data(contentsOf: manifestURL)

        do {
            try await store.retryParkedHead(
                id: stale.id,
                projectId: stale.projectId,
                ownerUserIds: [stale.ownerUserId]
            )
            XCTFail("Expected stale exact retry to be rejected")
        } catch ScreenplayOutlineMutationRecoveryError.exactRetryUnavailable(let reason) {
            XCTAssertTrue(reason.contains("server outline changed"))
        } catch {
            XCTFail("Unexpected error: \(error)")
        }

        let afterRejectedRetry = try await store.entriesForTesting()
        XCTAssertEqual(afterRejectedRetry, beforeRejectedRetry)
        XCTAssertEqual(try Data(contentsOf: manifestURL), originalManifest)
    }

    func testNonHeadRecoveryRetryIsRejectedWithoutMutation() async throws {
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        let earlier = makeEntry(id: "earlier", createdAt: 100)
        let parked = makeEntry(
            id: "parked",
            createdAt: 101,
            status: .parked,
            retries: 6,
            nextAttemptAt: 0,
            parkedReason: .retryExhausted
        )
        try await store.enqueue(earlier)
        try await store.enqueue(parked)
        let before = try await store.entriesForTesting()

        do {
            try await store.retryParkedHead(
                id: parked.id,
                projectId: parked.projectId,
                ownerUserIds: [parked.ownerUserId]
            )
            XCTFail("Expected non-head retry to be rejected")
        } catch ScreenplayOutlineMutationRecoveryError.parkedHeadRequired {
            // Expected.
        } catch {
            XCTFail("Unexpected error: \(error)")
        }

        let afterRejectedRetry = try await store.entriesForTesting()
        XCTAssertEqual(afterRejectedRetry, before)
    }

    func testDiscardRecoveryChainCannotResurrectDependentSnapshots() async throws {
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        let earlier = makeEntry(id: "earlier", createdAt: 90)
        let parked = makeEntry(
            id: "parked",
            createdAt: 100,
            status: .parked,
            nextAttemptAt: 0,
            parkedReason: .staleRevision
        )
        let dependentOne = makeEntry(
            id: "dependent-1",
            acts: [makeAct(id: "act-1", title: "Contains discarded change")],
            createdAt: 101,
            status: .parked,
            nextAttemptAt: 0,
            parkedReason: .supersededByRemoteChange
        )
        let dependentTwo = makeEntry(
            id: "dependent-2",
            createdAt: 102,
            status: .parked,
            nextAttemptAt: 0,
            parkedReason: .supersededByRemoteChange
        )
        let otherProject = makeEntry(
            id: "other-project",
            projectId: "project-2",
            createdAt: 103
        )
        let otherOwner = makeEntry(
            id: "other-owner",
            ownerUserId: "user-2",
            createdAt: 104
        )
        for entry in [earlier, parked, dependentOne, dependentTwo, otherProject, otherOwner] {
            try await store.enqueue(entry)
        }

        let result = try await store.discardRecoveryChain(
            parkedHeadID: parked.id,
            projectId: parked.projectId,
            confirmedEntryIDs: [parked.id, dependentOne.id, dependentTwo.id],
            ownerUserIds: [parked.ownerUserId]
        )

        XCTAssertEqual(result.removedCount, 3)
        let remaining = try await store.entriesForTesting()
        XCTAssertEqual(Set(remaining.map(\.id)), ["earlier", "other-project", "other-owner"])
        XCTAssertFalse(remaining.contains { $0.acts.first?.title == "Contains discarded change" })

        let restoredStore = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        let restoredEntries = try await restoredStore.entriesForTesting()
        XCTAssertEqual(restoredEntries, remaining)
    }

    func testDiscardRequiresExactConfirmedChainAndPreservesConcurrentAppend() async throws {
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        let parked = makeEntry(
            id: "parked",
            createdAt: 100,
            status: .parked,
            nextAttemptAt: 0,
            parkedReason: .staleRevision
        )
        let dependent = makeEntry(
            id: "dependent",
            createdAt: 101,
            status: .parked,
            nextAttemptAt: 0,
            parkedReason: .supersededByRemoteChange
        )
        try await store.enqueue(parked)
        try await store.enqueue(dependent)
        let confirmedChains = try await store.recoveryChains(ownerUserIds: [parked.ownerUserId])
        let confirmedChain = try XCTUnwrap(confirmedChains.first)

        let concurrentAppend = makeEntry(
            id: "concurrent-append",
            createdAt: 102,
            status: .parked,
            nextAttemptAt: 0,
            parkedReason: .supersededByRemoteChange
        )
        try await store.enqueue(concurrentAppend)

        do {
            try await store.discardRecoveryChain(
                parkedHeadID: parked.id,
                projectId: parked.projectId,
                confirmedEntryIDs: confirmedChain.entries.map(\.id),
                ownerUserIds: [parked.ownerUserId]
            )
            XCTFail("Expected changed-chain confirmation failure")
        } catch ScreenplayOutlineMutationRecoveryError.recoveryChainChanged {
            // Expected: a newly appended snapshot must never be deleted by stale confirmation.
        } catch {
            XCTFail("Unexpected error: \(error)")
        }

        let afterDeniedDiscard = try await store.entriesForTesting()
        XCTAssertEqual(afterDeniedDiscard.map(\.id), [parked.id, dependent.id, concurrentAppend.id])
        let refreshedChains = try await store.recoveryChains(ownerUserIds: [parked.ownerUserId])
        let refreshedChain = try XCTUnwrap(refreshedChains.first)
        let result = try await store.discardRecoveryChain(
            parkedHeadID: parked.id,
            projectId: parked.projectId,
            confirmedEntryIDs: refreshedChain.entries.map(\.id),
            ownerUserIds: [parked.ownerUserId]
        )
        XCTAssertEqual(result.removedCount, 3)
        let finalEntries = try await store.entriesForTesting()
        XCTAssertTrue(finalEntries.isEmpty)
    }

    func testRecoveryMutationsRollbackWhenProtectedCandidateWriteFails() async throws {
        let seedStore = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        let parked = makeEntry(
            id: "parked",
            createdAt: 100,
            status: .parked,
            retries: 6,
            nextAttemptAt: 0,
            parkedReason: .retryExhausted
        )
        let dependent = makeEntry(
            id: "dependent",
            createdAt: 101,
            status: .parked,
            nextAttemptAt: 0,
            parkedReason: .supersededByRemoteChange
        )
        try await seedStore.enqueue(parked)
        try await seedStore.enqueue(dependent)
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let originalManifest = try Data(contentsOf: manifestURL)
        let store = ScreenplayOutlineMutationOutbox(
            storageDirectory: storageDirectory,
            fileProtectionEnforcer: { url in
                if url.lastPathComponent.hasPrefix(".queue-") {
                    throw FileProtectionTestError.rejected
                }
            }
        )
        let originalEntries = try await store.entriesForTesting()

        do {
            try await store.retryParkedHead(
                id: parked.id,
                projectId: parked.projectId,
                ownerUserIds: [parked.ownerUserId]
            )
            XCTFail("Expected retry persistence failure")
        } catch FileProtectionTestError.rejected {
            // Expected.
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
        let afterFailedRetry = try await store.entriesForTesting()
        XCTAssertEqual(afterFailedRetry, originalEntries)
        XCTAssertEqual(try Data(contentsOf: manifestURL), originalManifest)

        do {
            try await store.discardRecoveryChain(
                parkedHeadID: parked.id,
                projectId: parked.projectId,
                confirmedEntryIDs: [parked.id, dependent.id],
                ownerUserIds: [parked.ownerUserId]
            )
            XCTFail("Expected discard persistence failure")
        } catch FileProtectionTestError.rejected {
            // Expected.
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
        let afterFailedDiscard = try await store.entriesForTesting()
        XCTAssertEqual(afterFailedDiscard, originalEntries)
        XCTAssertEqual(try Data(contentsOf: manifestURL), originalManifest)
    }

    func testRecoveryExportIsDeterministicCompleteOwnerRedactedAndNonmutating() async throws {
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        let parked = makeEntry(
            id: "parked-export",
            ownerUserId: "owner-secret-partition",
            expectedRevision: 8,
            acts: [makeAct(id: "act-1", title: "Exported Act")],
            scenes: [makeScene(id: "scene-1", actId: "act-1")],
            beats: [makeBeat(id: "beat-1", sceneId: "scene-1", actId: "act-1")],
            source: "outline recovery export",
            createdAt: 100,
            status: .parked,
            nextAttemptAt: 0,
            parkedReason: .staleRevision
        )
        let dependent = makeEntry(
            id: "dependent-export",
            ownerUserId: parked.ownerUserId,
            createdAt: 101,
            status: .parked,
            nextAttemptAt: 0,
            parkedReason: .supersededByRemoteChange
        )
        try await store.enqueue(parked)
        try await store.enqueue(dependent)
        let before = try await store.entriesForTesting()
        let exportedAt = Date(timeIntervalSince1970: 1_234)

        let first = try await store.exportRecoveryChain(
            parkedHeadID: parked.id,
            projectId: parked.projectId,
            ownerUserIds: [parked.ownerUserId],
            exportedAt: exportedAt
        )
        let second = try await store.exportRecoveryChain(
            parkedHeadID: parked.id,
            projectId: parked.projectId,
            ownerUserIds: [parked.ownerUserId],
            exportedAt: exportedAt
        )

        XCTAssertEqual(first, second)
        XCTAssertEqual(first.filename, "io-them-screenplay-outline-recovery-1234.json")
        let exportText = try XCTUnwrap(String(data: first.data, encoding: .utf8))
        XCTAssertFalse(exportText.contains(parked.ownerUserId))
        XCTAssertTrue(exportText.contains("Exported Act"))
        XCTAssertTrue(exportText.contains("parked-export"))
        XCTAssertTrue(exportText.contains("dependent-export"))
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: first.data) as? [String: Any]
        )
        XCTAssertEqual(object["schemaVersion"] as? Int, 1)
        XCTAssertEqual(object["projectId"] as? String, parked.projectId)
        XCTAssertEqual((object["entries"] as? [[String: Any]])?.count, 2)
        let afterExport = try await store.entriesForTesting()
        XCTAssertEqual(afterExport, before)
    }

    func testRecoveryActionsDenyOtherOwnerWithoutRevealingEntry() async throws {
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        let parked = makeEntry(
            id: "private-entry",
            ownerUserId: "owner-private",
            status: .parked,
            retries: 6,
            nextAttemptAt: 0,
            parkedReason: .retryExhausted
        )
        try await store.enqueue(parked)
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let originalManifest = try Data(contentsOf: manifestURL)

        let otherOwnerChains = try await store.recoveryChains(ownerUserIds: ["other-owner"])
        XCTAssertTrue(otherOwnerChains.isEmpty)
        for operation in ["retry", "discard", "export"] {
            do {
                switch operation {
                case "retry":
                    try await store.retryParkedHead(
                        id: parked.id,
                        projectId: parked.projectId,
                        ownerUserIds: ["other-owner"]
                    )
                case "discard":
                    try await store.discardRecoveryChain(
                        parkedHeadID: parked.id,
                        projectId: parked.projectId,
                        confirmedEntryIDs: [parked.id],
                        ownerUserIds: ["other-owner"]
                    )
                default:
                    _ = try await store.exportRecoveryChain(
                        parkedHeadID: parked.id,
                        projectId: parked.projectId,
                        ownerUserIds: ["other-owner"]
                    )
                }
                XCTFail("Expected owner-scoped \(operation) denial")
            } catch ScreenplayOutlineMutationRecoveryError.entryUnavailable {
                // Identical denial for missing and cross-owner entries.
            } catch {
                XCTFail("Unexpected \(operation) error: \(error)")
            }
        }

        let afterDeniedActions = try await store.entriesForTesting()
        XCTAssertEqual(afterDeniedActions.map(\.id), [parked.id])
        XCTAssertEqual(try Data(contentsOf: manifestURL), originalManifest)
    }

    func testLegacyRetryExhaustedEntryWithoutTypedReasonRemainsRecoverable() async throws {
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let legacy = makeEntry(
            id: "legacy-retry-exhausted",
            status: .parked,
            retries: 6,
            nextAttemptAt: 0,
            parkedReason: nil
        )
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        try JSONEncoder().encode([legacy]).write(to: manifestURL)
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)

        let chains = try await store.recoveryChains(ownerUserIds: [legacy.ownerUserId])

        XCTAssertEqual(chains.count, 1)
        XCTAssertTrue(chains[0].permitsRetry)
        XCTAssertNil(chains[0].parkedHead.parkedReason)
    }

    func testQueueOrderingUsesDurableEnqueueSequenceAcrossClockRollbackAndRelaunch() async throws {
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "request-b", createdAt: 200))
        try await store.enqueue(makeEntry(id: "request-a", createdAt: 100))

        let orderedIDs = try await store.entriesForTesting().map(\.id)
        XCTAssertEqual(orderedIDs, ["request-b", "request-a"])

        let restoredStore = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        let restoredIDs = try await restoredStore.entriesForTesting().map(\.id)
        XCTAssertEqual(restoredIDs, orderedIDs)
        let next = try await restoredStore.beginNext(
            projectId: "project-1",
            ownerUserId: "user-1",
            now: Date(timeIntervalSince1970: 200),
            force: true
        )
        XCTAssertEqual(next?.id, "request-b")
    }

    func testRecoveryChainUsesEnqueueSequenceWhenClockMovesBackward() async throws {
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        let parked = makeEntry(
            id: "parked-after-clock-forward",
            createdAt: 200,
            status: .parked,
            nextAttemptAt: 0,
            parkedReason: .staleRevision
        )
        let laterSnapshot = makeEntry(
            id: "later-after-clock-rollback",
            createdAt: 100,
            status: .parked,
            nextAttemptAt: 0,
            parkedReason: .supersededByRemoteChange
        )
        try await store.enqueue(parked)
        try await store.enqueue(laterSnapshot)

        let chains = try await store.recoveryChains(ownerUserIds: [parked.ownerUserId])
        let chain = try XCTUnwrap(chains.first)
        XCTAssertEqual(chain.entries.map(\.id), [parked.id, laterSnapshot.id])

        let result = try await store.discardRecoveryChain(
            parkedHeadID: parked.id,
            projectId: parked.projectId,
            confirmedEntryIDs: chain.entries.map(\.id),
            ownerUserIds: [parked.ownerUserId]
        )
        XCTAssertEqual(result.removedCount, 2)
        let remainingEntries = try await store.entriesForTesting()
        XCTAssertTrue(remainingEntries.isEmpty)
    }

    func testLegacyManifestMigratesArrayOrderToDurableQueueSequence() async throws {
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let first = makeEntry(id: "legacy-first", createdAt: 200)
        let second = makeEntry(id: "legacy-second", createdAt: 100)
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        try JSONEncoder().encode([first, second]).write(to: manifestURL)

        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        let migrated = try await store.entriesForTesting()

        XCTAssertEqual(migrated.map(\.id), [first.id, second.id])
        XCTAssertEqual(migrated.map(\.queueSequence), [1, 2])
        let migratedManifest = try String(contentsOf: manifestURL, encoding: .utf8)
        XCTAssertTrue(migratedManifest.contains("\"queueSequence\":1"))
        XCTAssertTrue(migratedManifest.contains("\"queueSequence\":2"))

        let restoredStore = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        let restored = try await restoredStore.entriesForTesting()
        XCTAssertEqual(restored, migrated)
    }

    func testLatestActiveEntryReturnsTailOfActiveScope() async throws {
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "head", createdAt: 100, status: .inflight))
        try await store.enqueue(makeEntry(id: "middle", createdAt: 101))
        try await store.enqueue(makeEntry(id: "tail", createdAt: 102))

        let latest = try await store.latestActiveEntry(
            projectId: " project-1 ",
            ownerUserId: " user-1 "
        )

        XCTAssertEqual(latest?.id, "tail")
    }

    func testHeadEntryPreservesPersistedRetryDeadlineAcrossRelaunch() async throws {
        let firstStore = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        try await firstStore.enqueue(
            makeEntry(id: "backed-off-head", createdAt: 100, nextAttemptAt: 240)
        )
        try await firstStore.enqueue(
            makeEntry(id: "later", createdAt: 101, nextAttemptAt: 101)
        )

        let restoredStore = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        let head = try await restoredStore.headEntry(
            projectId: " project-1 ",
            ownerUserId: " user-1 "
        )
        let tooEarly = try await restoredStore.beginNext(
            projectId: "project-1",
            ownerUserId: "user-1",
            now: Date(timeIntervalSince1970: 200)
        )

        XCTAssertEqual(head?.id, "backed-off-head")
        XCTAssertEqual(head?.status, .pending)
        XCTAssertEqual(head?.nextAttemptAt, 240)
        XCTAssertNil(tooEarly)
    }

    func testOrphanedInflightRecoveryMakesStableRequestRunnableAgain() async throws {
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "ambiguous-commit", createdAt: 100))
        let firstAttempt = try await store.beginNext(
            projectId: "project-1",
            ownerUserId: "user-1",
            now: Date(timeIntervalSince1970: 101),
            force: true
        )
        XCTAssertEqual(firstAttempt?.status, .inflight)

        let recovered = try await store.recoverOrphanedInflight(
            projectId: " project-1 ",
            ownerUserId: " user-1 ",
            error: "Saved remotely; local acknowledgement was interrupted.",
            now: Date(timeIntervalSince1970: 102)
        )
        let secondAttempt = try await store.beginNext(
            projectId: "project-1",
            ownerUserId: "user-1",
            now: Date(timeIntervalSince1970: 102)
        )

        XCTAssertTrue(recovered)
        XCTAssertEqual(secondAttempt?.id, "ambiguous-commit")
        XCTAssertEqual(secondAttempt?.status, .inflight)
        XCTAssertEqual(secondAttempt?.retries, 0)
        XCTAssertEqual(
            secondAttempt?.lastError,
            "Saved remotely; local acknowledgement was interrupted."
        )
    }

    func testLatestActiveEntryIgnoresOtherOwnerAndProjectScopes() async throws {
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "mine", createdAt: 100))
        try await store.enqueue(
            makeEntry(id: "other-owner", ownerUserId: "user-2", createdAt: 200)
        )
        try await store.enqueue(
            makeEntry(id: "other-project", projectId: "project-2", createdAt: 300)
        )

        let latest = try await store.latestActiveEntry(
            projectId: "project-1",
            ownerUserId: "user-1"
        )

        XCTAssertEqual(latest?.id, "mine")
    }

    func testLatestActiveEntryReturnsNilWhenScopeHeadIsParked() async throws {
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "parked-head", createdAt: 100, status: .parked))
        try await store.enqueue(makeEntry(id: "later-active", createdAt: 101))

        let latest = try await store.latestActiveEntry(
            projectId: "project-1",
            ownerUserId: "user-1"
        )

        XCTAssertNil(latest)
    }

    func testCollectionCapsRejectOversizedSnapshotsWithoutPersistingThem() async throws {
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        let tooManyActs = (0...32).map { makeAct(id: "act-\($0)", title: "Act \($0)") }
        let tooManyScenes = (0...512).map { makeScene(id: "scene-\($0)") }
        let tooManyBeats = (0...2_048).map { makeBeat(id: "beat-\($0)") }

        await assertLimitFailure(
            store: store,
            entry: makeEntry(id: "acts-over-limit", acts: tooManyActs),
            message: "screenplay_outline_acts_limit_exceeded"
        )
        await assertLimitFailure(
            store: store,
            entry: makeEntry(id: "scenes-over-limit", scenes: tooManyScenes),
            message: "screenplay_outline_scenes_limit_exceeded"
        )
        await assertLimitFailure(
            store: store,
            entry: makeEntry(id: "beats-over-limit", beats: tooManyBeats),
            message: "screenplay_outline_beats_limit_exceeded"
        )

        let storedEntries = try await store.entriesForTesting()
        XCTAssertEqual(storedEntries, [])
    }

    private func assertLimitFailure(
        store: ScreenplayOutlineMutationOutbox,
        entry: ScreenplayOutlineMutationOutboxEntry,
        message: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) async {
        do {
            try await store.enqueue(entry)
            XCTFail("Expected outline collection limit failure", file: file, line: line)
        } catch BackendMemoryAPIError.server(let status, let receivedMessage) {
            XCTAssertEqual(status, 413, file: file, line: line)
            XCTAssertEqual(receivedMessage, message, file: file, line: line)
        } catch {
            XCTFail("Unexpected error: \(error)", file: file, line: line)
        }
    }

    private func makeEntry(
        id: String,
        projectId: String = "project-1",
        ownerUserId: String = "user-1",
        expectedRevision: Int = 4,
        acts: [BackendScreenplayAct]? = nil,
        scenes: [BackendScreenplayScene] = [],
        beats: [BackendScreenplayBeat] = [],
        source: String = "test",
        createdAt: TimeInterval = 100,
        status: ScreenplayOutlineMutationOutboxStatus = .pending,
        retries: Int = 0,
        nextAttemptAt: TimeInterval? = nil,
        parkedReason: ScreenplayOutlineMutationParkedReason? = nil
    ) -> ScreenplayOutlineMutationOutboxEntry {
        ScreenplayOutlineMutationOutboxEntry(
            id: id,
            projectId: projectId,
            ownerUserId: ownerUserId,
            expectedOutlineRevision: expectedRevision,
            acts: acts ?? [makeAct(id: "act-1", title: "Act One")],
            scenes: scenes,
            beats: beats,
            source: source,
            createdAt: createdAt,
            updatedAt: createdAt,
            status: status,
            retries: retries,
            nextAttemptAt: nextAttemptAt ?? createdAt,
            lastError: "",
            parkedReason: parkedReason
        )
    }

    private func makeAct(id: String, title: String) -> BackendScreenplayAct {
        BackendScreenplayAct(
            id: id,
            title: title,
            summary: nil,
            order: nil,
            sceneIds: nil,
            createdAt: nil,
            updatedAt: nil
        )
    }

    private func makeScene(id: String, actId: String? = nil) -> BackendScreenplayScene {
        BackendScreenplayScene(
            id: id,
            slugline: nil,
            title: "Scene",
            objective: nil,
            summary: nil,
            actId: actId,
            order: nil,
            status: nil,
            beatIds: nil,
            createdAt: nil,
            updatedAt: nil
        )
    }

    private func makeBeat(
        id: String,
        sceneId: String? = nil,
        actId: String? = nil
    ) -> BackendScreenplayBeat {
        BackendScreenplayBeat(
            id: id,
            label: "Beat",
            summary: nil,
            sceneId: sceneId,
            actId: actId,
            order: nil,
            status: nil,
            createdAt: nil,
            updatedAt: nil
        )
    }
}
