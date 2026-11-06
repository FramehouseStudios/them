import Foundation

/// One Studio draft save runs at a time; a save that arrives meanwhile waits as
/// the single newest pending one. The slot is claimed before any await, so two
/// saves can't both pass the "nothing running" check and one end up parked in
/// the local queue, unsent until the next poll — a page write's save sat
/// "Unsaved" for 9+ minutes that way (finding #35, 2026-09-30). A save still
/// waiting when the slot frees is handed back so the caller runs it next.
nonisolated struct ScreenplayDraftSaveSlot<Request> {
    private(set) var isClaimed = false
    private(set) var pending: Request?

    /// Claims the slot for `request`; false means it now waits as pending.
    mutating func claim(_ request: Request) -> Bool {
        guard !isClaimed else {
            pending = request
            return false
        }
        isClaimed = true
        return true
    }

    /// Claims the slot to drain the local queue; false while a save runs.
    mutating func claimForQueue() -> Bool {
        guard !isClaimed else { return false }
        isClaimed = true
        return true
    }

    /// The save waiting behind the running one, if any.
    mutating func takePending() -> Request? {
        defer { pending = nil }
        return pending
    }

    /// Frees the slot and hands back a save that arrived meanwhile and never ran.
    mutating func release() -> Request? {
        isClaimed = false
        return takePending()
    }
}
