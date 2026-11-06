import Foundation

/// One Studio draft save runs at a time; a save that arrives meanwhile waits as
/// the newest pending one per scope. The slot is claimed before any await, so two
/// saves can't both pass the "nothing running" check and one end up parked in
/// the local queue, unsent until the next poll — a page write's save sat
/// "Unsaved" for 9+ minutes that way (finding #35, 2026-09-30). A save still
/// waiting when the slot frees is handed back so the caller runs it next.
nonisolated struct ScreenplayDraftSaveSlot<Request> {
    private(set) var isClaimed = false
    private var waiting: [(scope: String?, request: Request)] = []
    var pending: Request? { waiting.first?.request }

    /// Claims the slot; a waiting request replaces only the same scope.
    mutating func claim(_ request: Request, scope: String? = nil) -> Bool {
        guard !isClaimed else {
            if let index = waiting.firstIndex(where: { $0.scope == scope }) {
                waiting[index].request = request
            } else {
                waiting.append((scope: scope, request: request))
            }
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
        guard !waiting.isEmpty else { return nil }
        return waiting.removeFirst().request
    }

    /// Frees the slot and hands back a save that arrived meanwhile and never ran.
    mutating func release() -> Request? {
        isClaimed = false
        return takePending()
    }
}
