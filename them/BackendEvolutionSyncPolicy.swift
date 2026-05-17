import Foundation

nonisolated enum BackendEvolutionSyncPolicy {
    static func shouldAutoSync(
        sessionId: String,
        cachedSessionAvailable: Bool,
        isRunningTests: Bool = IOThemRuntime.isRunningTests
    ) -> Bool {
        if isRunningTests { return false }
        let normalizedSessionId = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
        return !normalizedSessionId.isEmpty || cachedSessionAvailable
    }
}
