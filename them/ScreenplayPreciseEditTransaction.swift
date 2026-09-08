import Foundation

nonisolated struct ScreenplayPreciseEditPreview: Equatable, Sendable {
    let transactionID: UUID
    let projectID: String
    let baseVersionID: String
    let snapshotDraftHash: String
    let snapshotRevision: UInt64
    let page: Int
    let character: String
    let dialogueOrdinal: Int
    let cueLine: Int
    let startLine: Int
    let endLine: Int
    let replacementRange: NSRange
    let expectedOldText: String
    let replacementText: String
    let expectedTargetHash: String
    let saveRequested: Bool
    let confirmationDigest: String

    var confirmation: ScreenplayPreciseEditConfirmation {
        ScreenplayPreciseEditConfirmation(
            transactionID: transactionID,
            confirmationDigest: confirmationDigest
        )
    }
}

nonisolated struct ScreenplayPreciseEditConfirmation: Equatable, Sendable {
    let transactionID: UUID
    let confirmationDigest: String
}

nonisolated struct ScreenplayPreciseEditUndoPayload: Equatable, Sendable {
    let transactionID: UUID
    let projectID: String
    let baseVersionID: String
    let beforeDraftHash: String
    let appliedDraftHash: String
    let replacementRange: NSRange
    let originalText: String
    let replacementText: String
}

nonisolated struct ScreenplayPreciseEditMutationReceipt: Equatable, Sendable {
    let transactionID: UUID
    let projectID: String
    let baseVersionID: String
    let beforeDraftHash: String
    let afterDraftHash: String
    let updatedDraft: String
    let replacedRange: NSRange
    let replacedText: String
    let insertedText: String
    let saveRequested: Bool
    let undoPayload: ScreenplayPreciseEditUndoPayload
}

nonisolated struct ScreenplayPreciseEditUndoReceipt: Equatable, Sendable {
    let transactionID: UUID
    let projectID: String
    let baseVersionID: String
    let appliedDraftHash: String
    let restoredDraftHash: String
    let restoredDraft: String
}

nonisolated struct ScreenplayPreciseEditSaveReceipt: Equatable, Sendable {
    enum Outcome: Equatable, Sendable {
        case queued(durableQueueID: String)
        case saved(serverVersionID: String)
        case failed(reason: String)
    }

    let transactionID: UUID
    let projectID: String
    let savedDraftHash: String
    let outcome: Outcome
}

nonisolated enum ScreenplayPreciseEditTransactionError: Error, Equatable, Sendable {
    case invalidProject
    case invalidBaseVersion
    case targetNotFound
    case targetAmbiguous(candidateRanges: [NSRange])
    case transactionIDConflict
    case transactionNotPrepared
    case confirmationMismatch
    case projectChanged
    case baseVersionChanged
    case draftChanged
    case revisionChanged
    case targetChanged
    case invalidReplacementRange
    case saveNotRequested
    case saveReceiptMismatch
    case invalidQueueReceipt
    case invalidServerReceipt
    case invalidFailureReceipt
    case undoUnavailable
    case undoConflict
}

nonisolated enum ScreenplayPreciseEditTransactionState: Equatable, Sendable {
    case awaitingConfirmation(ScreenplayPreciseEditPreview)
    case localApplied(ScreenplayPreciseEditMutationReceipt)
    case saveQueued(ScreenplayPreciseEditMutationReceipt, ScreenplayPreciseEditSaveReceipt)
    case saved(ScreenplayPreciseEditMutationReceipt, ScreenplayPreciseEditSaveReceipt)
    case failed(ScreenplayPreciseEditMutationReceipt?, reason: String)
    case undone(ScreenplayPreciseEditUndoReceipt)
}

actor ScreenplayPreciseEditTransactionCoordinator {
    private struct Record {
        let intent: ScreenplayPreciseEditIntent
        let preview: ScreenplayPreciseEditPreview
        var mutation: ScreenplayPreciseEditMutationReceipt?
        var saveReceipt: ScreenplayPreciseEditSaveReceipt?
        var failureReason: String?
        var undoReceipt: ScreenplayPreciseEditUndoReceipt?
    }

    private var records: [UUID: Record] = [:]

    func prepare(
        intent: ScreenplayPreciseEditIntent,
        snapshot: ScreenplayPreciseEditDocumentSnapshot
    ) -> Result<ScreenplayPreciseEditPreview, ScreenplayPreciseEditTransactionError> {
        if let existing = records[intent.transactionID] {
            guard existing.intent == intent else { return .failure(.transactionIDConflict) }
            return .success(existing.preview)
        }
        guard !snapshot.projectID.isEmpty else { return .failure(.invalidProject) }
        guard !snapshot.baseVersionID.isEmpty else { return .failure(.invalidBaseVersion) }

        let anchor: ScreenplayPreciseEditAnchor
        switch ScreenplayPreciseEditResolver.resolve(intent, in: snapshot) {
        case let .resolved(resolved):
            anchor = resolved
        case .notFound:
            return .failure(.targetNotFound)
        case let .ambiguous(candidateRanges):
            return .failure(.targetAmbiguous(candidateRanges: candidateRanges))
        }

        let digestMaterial = [
            intent.transactionID.uuidString.lowercased(), snapshot.projectID,
            snapshot.baseVersionID, snapshot.draftHash, String(snapshot.revision),
            anchor.expectedTargetHash, String(anchor.replacementRange.location),
            String(anchor.replacementRange.length), intent.replacementText,
            intent.saveRequested ? "save" : "local"
        ].joined(separator: "\u{1F}")
        let preview = ScreenplayPreciseEditPreview(
            transactionID: intent.transactionID,
            projectID: snapshot.projectID,
            baseVersionID: snapshot.baseVersionID,
            snapshotDraftHash: snapshot.draftHash,
            snapshotRevision: snapshot.revision,
            page: anchor.page,
            character: anchor.character,
            dialogueOrdinal: anchor.dialogueOrdinal,
            cueLine: anchor.cueLine,
            startLine: anchor.startLine,
            endLine: anchor.endLine,
            replacementRange: anchor.replacementRange,
            expectedOldText: anchor.expectedOldText,
            replacementText: anchor.replacementText,
            expectedTargetHash: anchor.expectedTargetHash,
            saveRequested: anchor.saveRequested,
            confirmationDigest: ScreenplayPreciseEditHash.sha256(digestMaterial)
        )
        records[intent.transactionID] = Record(intent: intent, preview: preview)
        return .success(preview)
    }

    func apply(
        confirmation: ScreenplayPreciseEditConfirmation,
        currentSnapshot: ScreenplayPreciseEditDocumentSnapshot
    ) -> Result<ScreenplayPreciseEditMutationReceipt, ScreenplayPreciseEditTransactionError> {
        guard var record = records[confirmation.transactionID] else {
            return .failure(.transactionNotPrepared)
        }
        guard confirmation == record.preview.confirmation else { return .failure(.confirmationMismatch) }

        if let mutation = record.mutation {
            guard currentSnapshot.projectID == mutation.projectID else { return .failure(.projectChanged) }
            guard currentSnapshot.baseVersionID == mutation.baseVersionID else { return .failure(.baseVersionChanged) }
            guard currentSnapshot.draftHash == mutation.beforeDraftHash ||
                    currentSnapshot.draftHash == mutation.afterDraftHash else {
                return .failure(.draftChanged)
            }
            return .success(mutation)
        }

        let preview = record.preview
        guard currentSnapshot.projectID == preview.projectID else {
            record.failureReason = "project_changed"; records[confirmation.transactionID] = record
            return .failure(.projectChanged)
        }
        guard currentSnapshot.baseVersionID == preview.baseVersionID else {
            record.failureReason = "base_version_changed"; records[confirmation.transactionID] = record
            return .failure(.baseVersionChanged)
        }
        guard currentSnapshot.draftHash == preview.snapshotDraftHash else {
            record.failureReason = "draft_changed"; records[confirmation.transactionID] = record
            return .failure(.draftChanged)
        }
        guard currentSnapshot.revision == preview.snapshotRevision else {
            record.failureReason = "revision_changed"; records[confirmation.transactionID] = record
            return .failure(.revisionChanged)
        }

        let source = currentSnapshot.draft as NSString
        let range = preview.replacementRange
        guard range.location >= 0, range.length >= 0, NSMaxRange(range) <= source.length else {
            record.failureReason = "invalid_replacement_range"; records[confirmation.transactionID] = record
            return .failure(.invalidReplacementRange)
        }
        guard source.substring(with: range) == preview.expectedOldText else {
            record.failureReason = "target_changed"; records[confirmation.transactionID] = record
            return .failure(.targetChanged)
        }

        let updatedDraft = source.replacingCharacters(in: range, with: preview.replacementText)
        let afterHash = ScreenplayPreciseEditHash.sha256(updatedDraft)
        let appliedRange = NSRange(
            location: range.location,
            length: (preview.replacementText as NSString).length
        )
        let undo = ScreenplayPreciseEditUndoPayload(
            transactionID: preview.transactionID,
            projectID: preview.projectID,
            baseVersionID: preview.baseVersionID,
            beforeDraftHash: preview.snapshotDraftHash,
            appliedDraftHash: afterHash,
            replacementRange: appliedRange,
            originalText: preview.expectedOldText,
            replacementText: preview.replacementText
        )
        let mutation = ScreenplayPreciseEditMutationReceipt(
            transactionID: preview.transactionID,
            projectID: preview.projectID,
            baseVersionID: preview.baseVersionID,
            beforeDraftHash: preview.snapshotDraftHash,
            afterDraftHash: afterHash,
            updatedDraft: updatedDraft,
            replacedRange: range,
            replacedText: preview.expectedOldText,
            insertedText: preview.replacementText,
            saveRequested: preview.saveRequested,
            undoPayload: undo
        )
        record.mutation = mutation
        record.failureReason = nil
        records[confirmation.transactionID] = record
        return .success(mutation)
    }

    func recordSaveReceipt(
        _ receipt: ScreenplayPreciseEditSaveReceipt
    ) -> Result<ScreenplayPreciseEditTransactionState, ScreenplayPreciseEditTransactionError> {
        guard var record = records[receipt.transactionID], let mutation = record.mutation else {
            return .failure(.transactionNotPrepared)
        }
        guard mutation.saveRequested else { return .failure(.saveNotRequested) }
        guard receipt.projectID.trimmingCharacters(in: .whitespacesAndNewlines) == mutation.projectID,
              receipt.savedDraftHash == mutation.afterDraftHash else {
            return .failure(.saveReceiptMismatch)
        }
        if let existing = record.saveReceipt,
           case .saved = existing.outcome {
            return .success(.saved(mutation, existing))
        }

        let state: ScreenplayPreciseEditTransactionState
        switch receipt.outcome {
        case let .queued(durableQueueID):
            guard !durableQueueID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                return .failure(.invalidQueueReceipt)
            }
            record.failureReason = nil
            state = .saveQueued(mutation, receipt)
        case let .saved(serverVersionID):
            guard !serverVersionID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                return .failure(.invalidServerReceipt)
            }
            record.failureReason = nil
            state = .saved(mutation, receipt)
        case let .failed(reason):
            let cleanReason = reason.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanReason.isEmpty else { return .failure(.invalidFailureReceipt) }
            record.failureReason = cleanReason
            state = .failed(mutation, reason: cleanReason)
        }
        record.saveReceipt = receipt
        records[receipt.transactionID] = record
        return .success(state)
    }

    func undo(
        transactionID: UUID,
        currentSnapshot: ScreenplayPreciseEditDocumentSnapshot
    ) -> Result<ScreenplayPreciseEditUndoReceipt, ScreenplayPreciseEditTransactionError> {
        guard var record = records[transactionID], let mutation = record.mutation else {
            return .failure(.undoUnavailable)
        }
        if let existing = record.undoReceipt {
            guard currentSnapshot.draftHash == existing.appliedDraftHash ||
                    currentSnapshot.draftHash == existing.restoredDraftHash else {
                return .failure(.undoConflict)
            }
            return .success(existing)
        }

        let payload = mutation.undoPayload
        guard currentSnapshot.projectID == payload.projectID,
              currentSnapshot.baseVersionID == payload.baseVersionID,
              currentSnapshot.draftHash == payload.appliedDraftHash else {
            return .failure(.undoConflict)
        }
        let source = currentSnapshot.draft as NSString
        guard NSMaxRange(payload.replacementRange) <= source.length,
              source.substring(with: payload.replacementRange) == payload.replacementText else {
            return .failure(.undoConflict)
        }
        let restoredDraft = source.replacingCharacters(in: payload.replacementRange, with: payload.originalText)
        let restoredHash = ScreenplayPreciseEditHash.sha256(restoredDraft)
        guard restoredHash == payload.beforeDraftHash else { return .failure(.undoConflict) }
        let receipt = ScreenplayPreciseEditUndoReceipt(
            transactionID: transactionID,
            projectID: payload.projectID,
            baseVersionID: payload.baseVersionID,
            appliedDraftHash: payload.appliedDraftHash,
            restoredDraftHash: restoredHash,
            restoredDraft: restoredDraft
        )
        record.undoReceipt = receipt
        records[transactionID] = record
        return .success(receipt)
    }

    func state(for transactionID: UUID) -> ScreenplayPreciseEditTransactionState? {
        guard let record = records[transactionID] else { return nil }
        if let undo = record.undoReceipt { return .undone(undo) }
        if let failure = record.failureReason { return .failed(record.mutation, reason: failure) }
        if let mutation = record.mutation, let saveReceipt = record.saveReceipt {
            switch saveReceipt.outcome {
            case .queued: return .saveQueued(mutation, saveReceipt)
            case .saved: return .saved(mutation, saveReceipt)
            case let .failed(reason): return .failed(mutation, reason: reason)
            }
        }
        if let mutation = record.mutation { return .localApplied(mutation) }
        return .awaitingConfirmation(record.preview)
    }
}
