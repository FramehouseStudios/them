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

/// Tracks which explicit conflict decision still authorizes a pending save.
nonisolated struct ScreenplayDraftConflictAuthority {
    struct Scope: Hashable {
        let ownerID: String
        let projectID: String
    }

    struct Ticket: Equatable {
        let scope: Scope
        let generation: UInt64
        let serverVersionID: String
    }

    enum Disposition: Equatable {
        case submit
        case preserve
        case retire
    }

    private var latest: [Scope: UInt64] = [:]
    private var retiredThrough: [Scope: UInt64] = [:]

    mutating func present(scope: Scope, serverVersionID: String) -> Ticket {
        let generation = (latest[scope] ?? 0) &+ 1
        latest[scope] = generation
        return Ticket(scope: scope, generation: generation, serverVersionID: serverVersionID)
    }

    mutating func chooseServer(scope: Scope) {
        retiredThrough[scope] = latest[scope] ?? 0
    }

    func disposition(for ticket: Ticket, scopeIsCurrent: Bool, conflictIsVisible: Bool) -> Disposition {
        if ticket.generation <= (retiredThrough[ticket.scope] ?? 0) { return .retire }
        guard scopeIsCurrent, !conflictIsVisible,
              ticket.generation == latest[ticket.scope] else { return .preserve }
        return .submit
    }
}
