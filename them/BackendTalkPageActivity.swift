import Foundation

/// Retry attempts and overlapping requests must release only their own activity.
/// A new login discards old leases; their late completions then publish nothing.
/// State and synchronous publication share one lock, so a finish cannot publish
/// false after a newer begin has already published true. Callbacks may reenter.
nonisolated final class BackendTalkPageActivity: @unchecked Sendable {
    private let lock = NSRecursiveLock()
    private var leases: [UUID: ScreenplayStudioAuthContext] = [:]

    func begin(_ id: UUID, owner: ScreenplayStudioAuthContext, onChange: ((Bool) -> Void)? = nil) {
        lock.lock(); defer { lock.unlock() }
        leases = leases.filter { $0.value == owner }
        leases[id] = owner
        onChange?(true)
    }

    @discardableResult
    func finish(_ id: UUID, currentOwner: ScreenplayStudioAuthContext, onChange: ((Bool) -> Void)? = nil) -> Bool? {
        lock.lock(); defer { lock.unlock() }
        guard leases.removeValue(forKey: id) != nil else { return nil }
        leases = leases.filter { $0.value == currentOwner }
        let inFlight = !leases.isEmpty
        onChange?(inFlight)
        return inFlight
    }
}
