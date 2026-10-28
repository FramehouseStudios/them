import Foundation

/// A drained first segment is not a completed reply. Register the accepted
/// remainder before publishing response availability, then consume it once.
nonisolated struct TalkStreamPlaybackDelivery {
    enum Next: Equatable { case wait, play(URL), finish }
    private var registered = false
    private var remainder: URL?
    private var remainderStarted = false

    mutating func registerResponse(remainder: URL?) {
        guard !registered else { return }
        self.remainder = remainder
        registered = true
    }

    mutating func firstSegmentFinished() -> Next {
        guard registered, !remainderStarted else { return .wait }
        guard let remainder else { return .finish }
        remainderStarted = true
        self.remainder = nil
        return .play(remainder)
    }
}
