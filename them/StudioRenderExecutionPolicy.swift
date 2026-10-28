import Foundation

/// Shared retry/deadline policy for voice and typed Studio transport.
@MainActor enum StudioRenderExecutionPolicy {
    static func shouldRetry(for error: Error) -> Bool {
        if error is CancellationError || error is BackendTalkAcceptedReplyError || error is BackendTalkCustodyError || error is BackendStudioRenderDeadlineError || error is BackendStudioRenderUnconfirmedError { return false }
        if error is BackendTalkQueuedError { return false }
        if case BackendError.continueListening = error { return false }
        if let urlError = error as? URLError {
            switch urlError.code {
            case .timedOut,
                 .networkConnectionLost,
                 .cannotConnectToHost,
                 .cannotFindHost,
                 .dnsLookupFailed,
                 .notConnectedToInternet:
                return true
            default:
                break
            }
        }
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain {
            return [
                NSURLErrorTimedOut,
                NSURLErrorNetworkConnectionLost,
                NSURLErrorCannotConnectToHost,
                NSURLErrorCannotFindHost,
                NSURLErrorDNSLookupFailed,
                NSURLErrorNotConnectedToInternet
            ].contains(nsError.code)
        }
        guard let backendError = error as? BackendError else { return false }
        if backendError.isProviderQuotaExhausted { return false }
        switch backendError {
        case let .http(status, _):
            return status == -1 ||
                status == 408 ||
                status == 425 ||
                status == 429 ||
                (500...599).contains(status)
        case let .stage(stage, message):
            let s = stage.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if s == "tts" || s == "chat" || s == "stt" {
                return true
            }
            let m = message.lowercased()
            return m.contains("timed out") ||
                m.contains("timeout") ||
                m.contains("temporar") ||
                m.contains("upstream") ||
                m.contains("network")
        case .emptyAudio:
            return true
        case .invalidAudioType:
            return true
        case .realtimeUnavailable:
            return true
        case .studioRenderQuality:
            return false
        case .continueListening:
            return false
        }
    }

    static func withTimeout<T>(
        seconds: Double = 30,
        operation: @escaping @Sendable () async throws -> T
    ) async throws -> T {
        let timeoutNanoseconds = UInt64(max(1, seconds) * 1_000_000_000)
        return try await withThrowingTaskGroup(of: T.self) { group in
            group.addTask {
                try await operation()
            }
            group.addTask {
                try await Task.sleep(nanoseconds: timeoutNanoseconds)
                throw BackendStudioRenderDeadlineError()
            }
            guard let result = try await group.next() else {
                throw BackendStudioRenderDeadlineError()
            }
            group.cancelAll()
            return result
        }
    }

    static func shouldFallback(for error: Error) -> Bool {
        if error is BackendTalkAcceptedReplyError || error is BackendTalkCustodyError || error is BackendStudioRenderDeadlineError || error is BackendStudioRenderUnconfirmedError { return false }
        guard let backendError = error as? BackendError else { return false }
        switch backendError {
        case let .studioRenderQuality(quality, _):
            return quality.permitsSingleFallbackRender
        case let .stage(stage, message):
            let normalizedStage = stage.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let normalizedMessage = message.lowercased()
            return normalizedStage == "studio_render" && (
                normalizedMessage.contains("stream response was empty") ||
                normalizedMessage.contains("quality confirmation")
            )
        case let .http(status, message):
            return status == 502 && message.lowercased().contains("stream response was empty")
        default:
            return false
        }
    }
}
