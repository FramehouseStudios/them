import Foundation

/// One request's Page-lane observations. Companion requests never emit Page
/// completion, and late headers cannot resurrect a finished request.
@MainActor
final class PageTalkLifecycle {
    enum Event: Equatable {
        case began(UUID)
        case reservation(UUID, String)
        case finished(UUID)
    }

    private let id = UUID()
    private let onChange: (@MainActor (Event) -> Void)?
    private var started = false
    private var finished = false

    init(onChange: (@MainActor (Event) -> Void)?) { self.onChange = onChange }

    func begin() {
        guard !started, !finished else { return }
        started = true
        onChange?(.began(id))
    }

    func observeReservation(_ value: String) {
        guard started, !finished else { return }
        let clean = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        onChange?(.reservation(id, clean))
    }

    func finish() {
        guard !finished else { return }
        finished = true
        if started { onChange?(.finished(id)) }
    }
}
