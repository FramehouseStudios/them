import Foundation

/// One request's Page-lane observations. Companion requests never emit Page
/// completion, and late headers cannot resurrect a finished request.
@MainActor
final class PageTalkLifecycle {
    enum Event: Equatable {
        case began(UUID)
        case session(UUID, String)
        case reservation(UUID, String)
        case finished(UUID)
    }

    let id = UUID()
    private let onChange: (@MainActor (Event) -> Void)?
    private var started = false
    private var finished = false
    private(set) var originalSessionID: String?

    init(onChange: (@MainActor (Event) -> Void)?) { self.onChange = onChange }

    func begin(sessionID: String? = nil) {
        guard !started, !finished else { return }
        started = true
        originalSessionID = sessionID?.trimmingCharacters(in: .whitespacesAndNewlines)
        onChange?(.began(id))
        if let sessionID = originalSessionID, !sessionID.isEmpty { onChange?(.session(id, sessionID)) }
    }

    func attach(to request: inout URLRequest) {
        begin(sessionID: request.value(forHTTPHeaderField: "X-Client-Token"))
        request.setValue(id.uuidString, forHTTPHeaderField: "x-clementine-page-request")
        if let originalSessionID, !originalSessionID.isEmpty {
            request.setValue(originalSessionID, forHTTPHeaderField: "x-session-id")
        }
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
