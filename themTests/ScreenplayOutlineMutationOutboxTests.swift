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

        XCTAssertEqual(restored, [parkedEntry])
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
        XCTAssertEqual(storedEntries, [original])
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

    func testQueueOrderingUsesIdentifierAsDeterministicTimestampTieBreaker() async throws {
        let store = ScreenplayOutlineMutationOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "request-b", createdAt: 100))
        try await store.enqueue(makeEntry(id: "request-a", createdAt: 100))

        let orderedIDs = try await store.entriesForTesting().map(\.id)
        XCTAssertEqual(orderedIDs, ["request-a", "request-b"])
        let next = try await store.beginNext(
            projectId: "project-1",
            ownerUserId: "user-1",
            now: Date(timeIntervalSince1970: 100),
            force: true
        )
        XCTAssertEqual(next?.id, "request-a")
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
        nextAttemptAt: TimeInterval? = nil
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
            lastError: ""
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
