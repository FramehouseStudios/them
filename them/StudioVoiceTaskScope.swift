import Combine
import Foundation

/// Owns the single voice invocation, including task cleanup after early returns.
@MainActor
final class StudioVoiceTaskScope: ObservableObject {
    @Published private(set) var task: Task<Void, Never>?
    private var activeID: UUID?

    @discardableResult
    func start(operation: @escaping @MainActor (UUID) async -> Void) -> UUID {
        cancel()
        let id = UUID()
        activeID = id
        task = Task { @MainActor [weak self] in
            defer { self?.finish(id) }
            guard self?.isCurrent(id) == true else { return }
            await operation(id)
        }
        return id
    }

    /// The DEBUG direct caller has no enclosing task but still needs ownership.
    func beginDirectIfIdle() -> UUID? {
        guard task == nil, activeID == nil else { return nil }
        let id = UUID()
        activeID = id
        return id
    }

    func isCurrent(_ id: UUID) -> Bool {
        activeID == id
    }

    @discardableResult
    func finish(_ id: UUID) -> Bool {
        guard isCurrent(id) else { return false }
        activeID = nil
        task = nil
        return true
    }

    @discardableResult
    func cancel() -> Bool {
        let previousTask = task
        let hadInvocation = activeID != nil || previousTask != nil
        guard hadInvocation else { return false }
        activeID = nil
        task = nil
        previousTask?.cancel()
        return true
    }
}

/// Hands off streamed voice playback only after the remainder is known.
struct StudioVoiceStreamHandoff {
    enum Action: Equatable {
        case wait
        case play(URL)
        case finish
        case alreadyHandled
    }

    private var state = Action.wait

    mutating func responseReady(remainder: URL?) {
        guard state == .wait else { return }
        state = remainder.map(Action.play) ?? .finish
    }

    mutating func nextAction() -> Action {
        let action = state
        if action != .wait { state = .alreadyHandled }
        return action
    }
}
