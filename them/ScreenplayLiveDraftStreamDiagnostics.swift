import Foundation

extension ScreenplayLiveDraftBridge {
    /// Synthetic UI runs only: identify a silent stream cancellation without
    /// recording draft text, user identity or credentials.
    func traceActiveStreamCancellation(reason: ScreenplaySyncedInsertInterruptionReason) {
        #if DEBUG
        guard IOThemRuntime.isRunningUITests else { return }
        debugTraceReplacementTarget(
            kind: "stream-cancel-origin", target: nil,
            detail: "reason=\(reason); " + Thread.callStackSymbols.prefix(12).joined(separator: " | ")
        )
        #endif
    }
}
