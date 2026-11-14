// Pure decisions for writer take-back. Task cancellation and UI mutation remain
// owned by ScreenplayLiveDraftBridge; this policy never performs side effects.
nonisolated enum ScreenplayStreamCancellationPolicy {
    enum PendingAction: Equatable {
        case retain, clear, rollback
    }

    static func hasQueuedInsert(_ mode: ScreenplayInsertionRequest.Mode?) -> Bool {
        switch mode {
        case .streamInsertProgress, .streamInsertFinalize, .streamInsertCancel,
             .voiceRevealPrepare, .voiceRevealUpdate, .voiceRevealFinalize, .voiceRevealCancel:
            return true
        case .insert, .streamPreview, .streamCommit, .streamCancel, nil:
            return false
        }
    }

    static func pendingAction(
        rollbackDraft: Bool, wasStreaming: Bool,
        cancelledSynced: Bool, hadQueuedInsert: Bool
    ) -> PendingAction {
        if rollbackDraft && (wasStreaming || cancelledSynced) { return .rollback }
        if !rollbackDraft && hadQueuedInsert { return .clear }
        return .retain
    }

    static func notifiesBackend(_ reason: ScreenplaySyncedInsertInterruptionReason) -> Bool {
        switch reason {
        case .manualTyping, .bargeIn, .cancel: return true
        case .other: return false
        }
    }
}
