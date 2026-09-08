import XCTest
@testable import them

final class ScreenplayPreciseEditTransactionTests: XCTestCase {
    private let transactionID = UUID(uuidString: "11111111-2222-3333-4444-555555555555")!
    private let draft = "INT. ROOM - NIGHT\n\nJOHN\nOld words.\n\nMARY\nLeave."

    func testPrepareProducesExactConfirmationPreviewWithoutMutatingDraft() async throws {
        let coordinator = ScreenplayPreciseEditTransactionCoordinator()
        let snapshot = makeSnapshot()
        let preview = try await coordinator.prepare(intent: makeIntent(save: true), snapshot: snapshot).get()

        XCTAssertEqual(preview.transactionID, transactionID)
        XCTAssertEqual(preview.projectID, "project-1")
        XCTAssertEqual(preview.baseVersionID, "version-1")
        XCTAssertEqual(preview.snapshotDraftHash, snapshot.draftHash)
        XCTAssertEqual(preview.expectedOldText, "Old words.")
        XCTAssertEqual(preview.replacementText, "New words.")
        XCTAssertTrue(preview.saveRequested)
        XCTAssertFalse(preview.confirmationDigest.isEmpty)
        let state = await coordinator.state(for: transactionID)
        XCTAssertEqual(state, .awaitingConfirmation(preview))
        XCTAssertEqual(snapshot.draft, draft)
    }

    func testPrepareRejectsInvalidScopeMissingAndAmbiguousTargets() async throws {
        let coordinator = ScreenplayPreciseEditTransactionCoordinator()
        let invalidProject = ScreenplayPreciseEditDocumentSnapshot(projectID: " ", baseVersionID: "v", draft: draft, revision: 1)
        let invalidProjectResult = await coordinator.prepare(intent: makeIntent(), snapshot: invalidProject)
        XCTAssertEqual(invalidProjectResult, .failure(.invalidProject))
        let invalidVersion = ScreenplayPreciseEditDocumentSnapshot(projectID: "p", baseVersionID: "\n", draft: draft, revision: 1)
        let invalidVersionResult = await coordinator.prepare(intent: makeIntent(), snapshot: invalidVersion)
        XCTAssertEqual(invalidVersionResult, .failure(.invalidBaseVersion))

        let missing = ScreenplayPreciseEditIntent(transactionID: UUID(), page: 1, dialogueOrdinal: 2, character: "JOHN", replacementText: "X", saveRequested: false)
        let missingResult = await coordinator.prepare(intent: missing, snapshot: makeSnapshot())
        XCTAssertEqual(missingResult, .failure(.targetNotFound))

        let duplicateDraft = "JOHN\nSame.\n\nJOHN\nSame."
        let duplicate = ScreenplayPreciseEditDocumentSnapshot(projectID: "p", baseVersionID: "v", draft: duplicateDraft, revision: 1)
        let ambiguous = ScreenplayPreciseEditIntent(transactionID: UUID(), page: 1, dialogueOrdinal: 1, character: "JOHN", replacementText: "X", saveRequested: false)
        guard case let .failure(.targetAmbiguous(ranges)) = await coordinator.prepare(intent: ambiguous, snapshot: duplicate) else {
            return XCTFail("Expected ambiguity")
        }
        XCTAssertEqual(ranges.count, 2)
    }

    func testApplyAtomicallyReplacesOnlyExactUTF16RangeAndReturnsUndoPayload() async throws {
        let original = "😀\r\n\r\nJOHN\r\nOld words.\r\nAgain.\r\n\r\nMARY\r\nLeave."
        let snapshot = makeSnapshot(draft: original)
        let coordinator = ScreenplayPreciseEditTransactionCoordinator()
        let intent = ScreenplayPreciseEditIntent(transactionID: transactionID, page: 1, dialogueOrdinal: 1, character: "JOHN", replacementText: "New 😀 line.", saveRequested: true)
        let preview = try await coordinator.prepare(intent: intent, snapshot: snapshot).get()
        let receipt = try await coordinator.apply(confirmation: preview.confirmation, currentSnapshot: snapshot).get()

        XCTAssertEqual(receipt.updatedDraft, "😀\r\n\r\nJOHN\r\nNew 😀 line.\r\n\r\nMARY\r\nLeave.")
        XCTAssertEqual((original as NSString).substring(with: receipt.replacedRange), "Old words.\r\nAgain.")
        XCTAssertEqual(receipt.replacedText, "Old words.\r\nAgain.")
        XCTAssertEqual(receipt.undoPayload.replacementRange.length, ("New 😀 line." as NSString).length)
        XCTAssertNotEqual(receipt.beforeDraftHash, receipt.afterDraftHash)
        let state = await coordinator.state(for: transactionID)
        XCTAssertEqual(state, .localApplied(receipt))
    }

    func testApplyRequiresMatchingConfirmationProjectBaseVersionDraftAndRevision() async throws {
        try await assertApplyFailure(.confirmationMismatch) { preview, snapshot in
            (.init(transactionID: preview.transactionID, confirmationDigest: "wrong"), snapshot)
        }
        try await assertApplyFailure(.projectChanged) { preview, snapshot in
            (preview.confirmation, self.makeSnapshot(project: "other", draft: snapshot.draft))
        }
        try await assertApplyFailure(.baseVersionChanged) { preview, snapshot in
            (preview.confirmation, self.makeSnapshot(version: "other", draft: snapshot.draft))
        }
        try await assertApplyFailure(.draftChanged) { preview, snapshot in
            (preview.confirmation, self.makeSnapshot(draft: snapshot.draft + "\nChanged"))
        }
        try await assertApplyFailure(.revisionChanged) { preview, snapshot in
            (preview.confirmation, self.makeSnapshot(draft: snapshot.draft, revision: 2))
        }
    }

    func testTransactionIDIsIdempotentButCannotBeReusedForDifferentIntent() async throws {
        let coordinator = ScreenplayPreciseEditTransactionCoordinator()
        let snapshot = makeSnapshot()
        let intent = makeIntent()
        let firstPreview = try await coordinator.prepare(intent: intent, snapshot: snapshot).get()
        let repeatedPreview = try await coordinator.prepare(intent: intent, snapshot: makeSnapshot(draft: draft + "\nLater")).get()
        XCTAssertEqual(firstPreview, repeatedPreview)

        let conflicting = ScreenplayPreciseEditIntent(transactionID: transactionID, page: 1, dialogueOrdinal: 1, character: "JOHN", replacementText: "Different", saveRequested: false)
        let conflict = await coordinator.prepare(intent: conflicting, snapshot: snapshot)
        XCTAssertEqual(conflict, .failure(.transactionIDConflict))

        let firstReceipt = try await coordinator.apply(confirmation: firstPreview.confirmation, currentSnapshot: snapshot).get()
        let repeatedReceipt = try await coordinator.apply(confirmation: firstPreview.confirmation, currentSnapshot: snapshot).get()
        let appliedSnapshot = makeSnapshot(draft: firstReceipt.updatedDraft)
        let postApplyReceipt = try await coordinator.apply(confirmation: firstPreview.confirmation, currentSnapshot: appliedSnapshot).get()
        XCTAssertEqual(firstReceipt, repeatedReceipt)
        XCTAssertEqual(firstReceipt, postApplyReceipt)
    }

    func testSaveRequestedRemainsLocalAppliedUntilMatchingReceiptArrives() async throws {
        let coordinator = ScreenplayPreciseEditTransactionCoordinator()
        let receipt = try await apply(coordinator: coordinator, save: true)
        let state = await coordinator.state(for: transactionID)
        XCTAssertEqual(state, .localApplied(receipt))

        let queued = ScreenplayPreciseEditSaveReceipt(
            transactionID: transactionID,
            projectID: receipt.projectID,
            savedDraftHash: receipt.afterDraftHash,
            outcome: .queued(durableQueueID: "outbox-1")
        )
        let queuedState = try await coordinator.recordSaveReceipt(queued).get()
        XCTAssertEqual(queuedState, .saveQueued(receipt, queued))

        let saved = ScreenplayPreciseEditSaveReceipt(
            transactionID: transactionID,
            projectID: receipt.projectID,
            savedDraftHash: receipt.afterDraftHash,
            outcome: .saved(serverVersionID: "version-2")
        )
        let savedState = try await coordinator.recordSaveReceipt(saved).get()
        XCTAssertEqual(savedState, .saved(receipt, saved))
        let currentState = await coordinator.state(for: transactionID)
        XCTAssertEqual(currentState, .saved(receipt, saved))
    }

    func testMismatchedOrEmptySaveReceiptsNeverProduceSavedState() async throws {
        let coordinator = ScreenplayPreciseEditTransactionCoordinator()
        let mutation = try await apply(coordinator: coordinator, save: true)
        let mismatches = [
            ScreenplayPreciseEditSaveReceipt(transactionID: transactionID, projectID: "other", savedDraftHash: mutation.afterDraftHash, outcome: .saved(serverVersionID: "v2")),
            ScreenplayPreciseEditSaveReceipt(transactionID: transactionID, projectID: mutation.projectID, savedDraftHash: "wrong", outcome: .saved(serverVersionID: "v2"))
        ]
        for receipt in mismatches {
            let result = await coordinator.recordSaveReceipt(receipt)
            XCTAssertEqual(result, .failure(.saveReceiptMismatch))
        }
        let emptyVersion = ScreenplayPreciseEditSaveReceipt(transactionID: transactionID, projectID: mutation.projectID, savedDraftHash: mutation.afterDraftHash, outcome: .saved(serverVersionID: " "))
        let emptyVersionResult = await coordinator.recordSaveReceipt(emptyVersion)
        XCTAssertEqual(emptyVersionResult, .failure(.invalidServerReceipt))
        let emptyQueue = ScreenplayPreciseEditSaveReceipt(transactionID: transactionID, projectID: mutation.projectID, savedDraftHash: mutation.afterDraftHash, outcome: .queued(durableQueueID: ""))
        let emptyQueueResult = await coordinator.recordSaveReceipt(emptyQueue)
        XCTAssertEqual(emptyQueueResult, .failure(.invalidQueueReceipt))
        let state = await coordinator.state(for: transactionID)
        XCTAssertEqual(state, .localApplied(mutation))
    }

    func testSaveReceiptRejectedWhenSaveWasNotRequested() async throws {
        let coordinator = ScreenplayPreciseEditTransactionCoordinator()
        let mutation = try await apply(coordinator: coordinator, save: false)
        let receipt = ScreenplayPreciseEditSaveReceipt(transactionID: transactionID, projectID: mutation.projectID, savedDraftHash: mutation.afterDraftHash, outcome: .saved(serverVersionID: "v2"))
        let saveResult = await coordinator.recordSaveReceipt(receipt)
        XCTAssertEqual(saveResult, .failure(.saveNotRequested))
        let state = await coordinator.state(for: transactionID)
        XCTAssertEqual(state, .localApplied(mutation))
    }

    func testFailedSaveReceiptProducesExplicitFailedStateWithoutClaimingSaved() async throws {
        let coordinator = ScreenplayPreciseEditTransactionCoordinator()
        let mutation = try await apply(coordinator: coordinator, save: true)
        let failure = ScreenplayPreciseEditSaveReceipt(transactionID: transactionID, projectID: mutation.projectID, savedDraftHash: mutation.afterDraftHash, outcome: .failed(reason: "offline"))
        let failedState = try await coordinator.recordSaveReceipt(failure).get()
        XCTAssertEqual(failedState, .failed(mutation, reason: "offline"))
        let state = await coordinator.state(for: transactionID)
        XCTAssertEqual(state, .failed(mutation, reason: "offline"))
    }

    func testMatchingServerReceiptRecoversFailureAndCannotRegressToStaleQueueOrFailure() async throws {
        let coordinator = ScreenplayPreciseEditTransactionCoordinator()
        let mutation = try await apply(coordinator: coordinator, save: true)
        let failure = ScreenplayPreciseEditSaveReceipt(transactionID: transactionID, projectID: mutation.projectID, savedDraftHash: mutation.afterDraftHash, outcome: .failed(reason: "offline"))
        _ = try await coordinator.recordSaveReceipt(failure).get()
        let saved = ScreenplayPreciseEditSaveReceipt(transactionID: transactionID, projectID: mutation.projectID, savedDraftHash: mutation.afterDraftHash, outcome: .saved(serverVersionID: "server-v2"))
        let recovered = try await coordinator.recordSaveReceipt(saved).get()
        XCTAssertEqual(recovered, .saved(mutation, saved))

        let staleQueue = ScreenplayPreciseEditSaveReceipt(transactionID: transactionID, projectID: mutation.projectID, savedDraftHash: mutation.afterDraftHash, outcome: .queued(durableQueueID: "outbox-1"))
        let staleFailure = ScreenplayPreciseEditSaveReceipt(transactionID: transactionID, projectID: mutation.projectID, savedDraftHash: mutation.afterDraftHash, outcome: .failed(reason: "late timeout"))
        let afterQueue = try await coordinator.recordSaveReceipt(staleQueue).get()
        let afterFailure = try await coordinator.recordSaveReceipt(staleFailure).get()
        XCTAssertEqual(afterQueue, .saved(mutation, saved))
        XCTAssertEqual(afterFailure, .saved(mutation, saved))
        let state = await coordinator.state(for: transactionID)
        XCTAssertEqual(state, .saved(mutation, saved))
    }

    func testUndoRestoresExactOriginalDraftAndIsIdempotent() async throws {
        let coordinator = ScreenplayPreciseEditTransactionCoordinator()
        let mutation = try await apply(coordinator: coordinator, save: false)
        let applied = makeSnapshot(draft: mutation.updatedDraft)
        let undo = try await coordinator.undo(transactionID: transactionID, currentSnapshot: applied).get()
        XCTAssertEqual(undo.restoredDraft, draft)
        XCTAssertEqual(undo.restoredDraftHash, mutation.beforeDraftHash)
        let state = await coordinator.state(for: transactionID)
        XCTAssertEqual(state, .undone(undo))
        let repeatedAppliedUndo = try await coordinator.undo(transactionID: transactionID, currentSnapshot: applied).get()
        XCTAssertEqual(repeatedAppliedUndo, undo)
        let repeatedRestoredUndo = try await coordinator.undo(transactionID: transactionID, currentSnapshot: makeSnapshot(draft: draft)).get()
        XCTAssertEqual(repeatedRestoredUndo, undo)
    }

    func testUndoRejectsAnyInterveningDraftProjectOrVersionChange() async throws {
        for changed in [
            makeSnapshot(draft: draft + "\nLater edit"),
            makeSnapshot(project: "other", draft: draft.replacingOccurrences(of: "Old words.", with: "New words.")),
            makeSnapshot(version: "other", draft: draft.replacingOccurrences(of: "Old words.", with: "New words."))
        ] {
            let coordinator = ScreenplayPreciseEditTransactionCoordinator()
            _ = try await apply(coordinator: coordinator, save: false)
            let result = await coordinator.undo(transactionID: transactionID, currentSnapshot: changed)
            XCTAssertEqual(result, .failure(.undoConflict))
        }
    }

    func testConcurrentDuplicateApplyReturnsOneDeterministicReceipt() async throws {
        let coordinator = ScreenplayPreciseEditTransactionCoordinator()
        let snapshot = makeSnapshot()
        let preview = try await coordinator.prepare(intent: makeIntent(), snapshot: snapshot).get()
        async let first = coordinator.apply(confirmation: preview.confirmation, currentSnapshot: snapshot)
        async let second = coordinator.apply(confirmation: preview.confirmation, currentSnapshot: snapshot)
        let results = await (first, second)
        XCTAssertEqual(try results.0.get(), try results.1.get())
    }

    func testRetentionEvictsOldestTransactionsAtConfiguredCap() async throws {
        let coordinator = ScreenplayPreciseEditTransactionCoordinator(retentionLimit: 2)
        let ids = (0..<3).map { _ in UUID() }
        for id in ids {
            _ = try await coordinator.prepare(intent: makeIntent(id: id), snapshot: makeSnapshot()).get()
        }
        let count = await coordinator.retainedTransactionCount()
        let oldestState = await coordinator.state(for: ids[0])
        let middleState = await coordinator.state(for: ids[1])
        let newestState = await coordinator.state(for: ids[2])
        XCTAssertEqual(count, 2)
        XCTAssertNil(oldestState)
        XCTAssertNotNil(middleState)
        XCTAssertNotNil(newestState)
    }

    func testRepeatedTransactionRemainsIdempotentWhileRetained() async throws {
        let coordinator = ScreenplayPreciseEditTransactionCoordinator(retentionLimit: 2)
        let id = UUID()
        let intent = makeIntent(id: id)
        let first = try await coordinator.prepare(intent: intent, snapshot: makeSnapshot()).get()
        _ = try await coordinator.prepare(intent: makeIntent(id: UUID()), snapshot: makeSnapshot()).get()
        let repeated = try await coordinator.prepare(intent: intent, snapshot: makeSnapshot(draft: draft + "\nLater")).get()
        let count = await coordinator.retainedTransactionCount()
        XCTAssertEqual(first, repeated)
        XCTAssertEqual(count, 2)
    }

    func testDiscardRemovesCancelledTransaction() async throws {
        let coordinator = ScreenplayPreciseEditTransactionCoordinator(retentionLimit: 2)
        let id = UUID()
        _ = try await coordinator.prepare(intent: makeIntent(id: id), snapshot: makeSnapshot()).get()
        await coordinator.discard(id)
        let state = await coordinator.state(for: id)
        let count = await coordinator.retainedTransactionCount()
        XCTAssertNil(state)
        XCTAssertEqual(count, 0)
    }

    func testRetentionNeverEvictsProtectedActiveTransaction() async throws {
        let coordinator = ScreenplayPreciseEditTransactionCoordinator(retentionLimit: 2)
        let activeID = UUID()
        await coordinator.protect(activeID)
        let activePreview = try await coordinator.prepare(intent: makeIntent(id: activeID), snapshot: makeSnapshot()).get()
        let evictedID = UUID()
        _ = try await coordinator.prepare(intent: makeIntent(id: evictedID), snapshot: makeSnapshot()).get()
        let newestID = UUID()
        _ = try await coordinator.prepare(intent: makeIntent(id: newestID), snapshot: makeSnapshot()).get()
        let activeState = await coordinator.state(for: activeID)
        let evictedState = await coordinator.state(for: evictedID)
        let newestState = await coordinator.state(for: newestID)
        XCTAssertEqual(activeState, .awaitingConfirmation(activePreview))
        XCTAssertNil(evictedState)
        XCTAssertNotNil(newestState)
    }

    private func assertApplyFailure(
        _ expected: ScreenplayPreciseEditTransactionError,
        mutation: (ScreenplayPreciseEditPreview, ScreenplayPreciseEditDocumentSnapshot) -> (ScreenplayPreciseEditConfirmation, ScreenplayPreciseEditDocumentSnapshot)
    ) async throws {
        let coordinator = ScreenplayPreciseEditTransactionCoordinator()
        let snapshot = makeSnapshot()
        let preview = try await coordinator.prepare(intent: makeIntent(), snapshot: snapshot).get()
        let inputs = mutation(preview, snapshot)
        let result = await coordinator.apply(confirmation: inputs.0, currentSnapshot: inputs.1)
        XCTAssertEqual(result, .failure(expected))
    }

    private func apply(
        coordinator: ScreenplayPreciseEditTransactionCoordinator,
        save: Bool
    ) async throws -> ScreenplayPreciseEditMutationReceipt {
        let snapshot = makeSnapshot()
        let preview = try await coordinator.prepare(intent: makeIntent(save: save), snapshot: snapshot).get()
        return try await coordinator.apply(confirmation: preview.confirmation, currentSnapshot: snapshot).get()
    }

    private func makeIntent(save: Bool = false) -> ScreenplayPreciseEditIntent {
        ScreenplayPreciseEditIntent(transactionID: transactionID, page: 1, dialogueOrdinal: 1, character: "JOHN", replacementText: "New words.", saveRequested: save)
    }

    private func makeIntent(id: UUID) -> ScreenplayPreciseEditIntent {
        ScreenplayPreciseEditIntent(transactionID: id, page: 1, dialogueOrdinal: 1, character: "JOHN", replacementText: "New words.", saveRequested: false)
    }

    private func makeSnapshot(
        project: String = "project-1",
        version: String = "version-1",
        draft: String? = nil,
        revision: UInt64 = 1
    ) -> ScreenplayPreciseEditDocumentSnapshot {
        ScreenplayPreciseEditDocumentSnapshot(projectID: project, baseVersionID: version, draft: draft ?? self.draft, revision: revision)
    }
}
