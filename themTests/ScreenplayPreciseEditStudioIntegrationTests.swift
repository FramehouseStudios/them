import XCTest
@testable import them

@MainActor
final class ScreenplayPreciseEditStudioIntegrationTests: XCTestCase {
    private let draft = "INT. ROOM - NIGHT\n\nJOHN\nOld words.\n\nMARY\nLeave."

    func testOnlySupportedFinalTranscriptIsInterceptedAndTurnBasedAudioIsSuppressedOnce() async throws {
        let session = ScreenplayPreciseEditStudioSession()
        let snapshot = makeSnapshot()
        XCTAssertFalse(session.interceptFinalTranscript("Tell me about page 1", source: .turnBased, snapshot: snapshot))
        XCTAssertFalse(session.consumeTurnBasedAudioSuppression())

        XCTAssertTrue(session.interceptFinalTranscript(command(save: false), source: .turnBased, snapshot: snapshot))
        XCTAssertTrue(session.consumeTurnBasedAudioSuppression())
        XCTAssertFalse(session.consumeTurnBasedAudioSuppression())
        let preview = try await waitForPreview(session)
        XCTAssertEqual(preview.expectedOldText, "Old words.")
        XCTAssertEqual(preview.replacementText, "New words.")
    }

    func testMalformedDestructiveAddressIsInterceptedAndFailsClosed() async {
        let session = ScreenplayPreciseEditStudioSession()
        XCTAssertTrue(session.interceptFinalTranscript(
            "Page twenty, line, replace it with something better",
            source: .turnBased,
            snapshot: makeSnapshot()
        ))
        guard case let .failed(message) = session.presentation else { return XCTFail("Expected a closed failure") }
        XCTAssertTrue(message.contains("No edit was applied"))
        XCTAssertTrue(session.consumeTurnBasedAudioSuppression())
        session.cancel()
        await Task.yield()
    }

    func testRealtimeInterceptionDoesNotSuppressLaterTurnBasedAudio() async throws {
        let session = ScreenplayPreciseEditStudioSession()
        XCTAssertTrue(session.interceptFinalTranscript(command(save: false), source: .realtime, snapshot: makeSnapshot()))
        _ = try await waitForPreview(session)
        XCTAssertFalse(session.consumeTurnBasedAudioSuppression())
    }

    func testSecondTurnBasedEditIsInterceptedWhileConfirmationIsOpen() async throws {
        let session = ScreenplayPreciseEditStudioSession()
        XCTAssertTrue(session.interceptFinalTranscript(command(save: false), source: .turnBased, snapshot: makeSnapshot()))
        _ = try await waitForPreview(session)
        XCTAssertTrue(session.consumeTurnBasedAudioSuppression())
        XCTAssertTrue(session.interceptFinalTranscript(command(save: false), source: .turnBased, snapshot: makeSnapshot()))
        XCTAssertTrue(session.consumeTurnBasedAudioSuppression())
        guard case let .failed(message) = session.presentation else { return XCTFail("Expected a closed failure") }
        XCTAssertTrue(message.contains("current precise edit"))
    }

    func testConfirmRevalidatesThenCommitsExactMutationAndReportsLocalOnly() async throws {
        let session = ScreenplayPreciseEditStudioSession()
        let snapshot = makeSnapshot()
        XCTAssertTrue(session.interceptFinalTranscript(command(save: false), source: .turnBased, snapshot: snapshot))
        _ = try await waitForPreview(session)
        var committed: ScreenplayPreciseEditMutationReceipt?
        await session.confirm(currentSnapshot: snapshot) { mutation in
            committed = mutation
            return .localApplied
        }

        let mutation = try XCTUnwrap(committed)
        XCTAssertEqual(mutation.updatedDraft, draft.replacingOccurrences(of: "Old words.", with: "New words."))
        XCTAssertEqual(session.presentation, .applied(mutation))
    }

    func testChangedDraftFailsClosedBeforeEditorCommit() async throws {
        let session = ScreenplayPreciseEditStudioSession()
        XCTAssertTrue(session.interceptFinalTranscript(command(save: false), source: .turnBased, snapshot: makeSnapshot()))
        _ = try await waitForPreview(session)
        var didCommit = false
        await session.confirm(currentSnapshot: makeSnapshot(draft: draft + "\nChanged")) { _ in
            didCommit = true
            return .localApplied
        }
        XCTAssertFalse(didCommit)
        guard case let .failed(message) = session.presentation else { return XCTFail("Expected a failed state") }
        XCTAssertTrue(message.contains("changed"))
    }

    func testSaveRequestRemainsQueuedWithoutServerReceipt() async throws {
        let session = ScreenplayPreciseEditStudioSession()
        let snapshot = makeSnapshot()
        XCTAssertTrue(session.interceptFinalTranscript(command(save: true), source: .turnBased, snapshot: snapshot))
        let preview = try await waitForPreview(session)
        let queueID = preview.transactionID.uuidString.lowercased()
        await session.confirm(currentSnapshot: snapshot) { mutation in
            .receipt(.init(
                transactionID: mutation.transactionID,
                projectID: mutation.projectID,
                savedDraftHash: mutation.afterDraftHash,
                outcome: .queued(durableQueueID: queueID)
            ))
        }
        guard case let .queued(mutation, receipt) = session.presentation else {
            return XCTFail("A local queue receipt must not be presented as saved")
        }
        XCTAssertEqual(mutation.transactionID, preview.transactionID)
        XCTAssertEqual(receipt.outcome, .queued(durableQueueID: queueID))
    }

    func testLocalEditCanBeUndoneAgainstExactAppliedSnapshot() async throws {
        let session = ScreenplayPreciseEditStudioSession()
        let snapshot = makeSnapshot()
        XCTAssertTrue(session.interceptFinalTranscript(command(save: false), source: .turnBased, snapshot: snapshot))
        _ = try await waitForPreview(session)
        var mutation: ScreenplayPreciseEditMutationReceipt?
        await session.confirm(currentSnapshot: snapshot) { receipt in
            mutation = receipt
            return .localApplied
        }
        let applied = try XCTUnwrap(mutation)
        var committedUndo: ScreenplayPreciseEditUndoReceipt?
        await session.undo(currentSnapshot: makeSnapshot(draft: applied.updatedDraft)) { receipt in
            committedUndo = receipt
            return true
        }
        XCTAssertEqual(committedUndo?.restoredDraft, draft)
        XCTAssertEqual(session.presentation, committedUndo.map(ScreenplayPreciseEditStudioSession.Presentation.undone))
    }

    private func waitForPreview(
        _ session: ScreenplayPreciseEditStudioSession
    ) async throws -> ScreenplayPreciseEditPreview {
        for _ in 0..<100 {
            if case let .preview(preview) = session.presentation { return preview }
            await Task.yield()
        }
        throw NSError(domain: "ScreenplayPreciseEditStudioIntegrationTests", code: 1)
    }

    private func command(save: Bool) -> String {
        "Page 1, first line by John, replace it with New words." + (save ? " and save" : "")
    }

    private func makeSnapshot(draft: String? = nil) -> ScreenplayPreciseEditDocumentSnapshot {
        ScreenplayPreciseEditStudioSession.snapshot(
            projectID: "project-1",
            baseVersionID: "version-1",
            draft: draft ?? self.draft
        )
    }
}
