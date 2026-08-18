import Foundation

enum StudioCraftResilience {
    static let maximumBackgroundRetryCount = 1
    static let backgroundRetryDelayNanoseconds: UInt64 = 180_000_000

    static func isUserInitiated(source: String) -> Bool {
        let normalized = source.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return normalized.contains("manual") ||
            normalized.contains("retry") ||
            normalized == "document"
    }

    static func run<T>(
        source: String,
        retryDelayNanoseconds: UInt64? = nil,
        operation: () async throws -> T
    ) async throws -> T {
        var retryCount = 0
        while true {
            do {
                return try await operation()
            } catch {
                guard shouldRetry(error: error, source: source, retryCount: retryCount) else {
                    throw error
                }
                retryCount += 1
                let delay = retryDelayNanoseconds ?? backgroundRetryDelayNanoseconds
                if delay > 0 {
                    try await Task.sleep(nanoseconds: delay)
                }
            }
        }
    }

    static func shouldRetry(
        error: Error,
        source: String,
        retryCount: Int
    ) -> Bool {
        guard !isUserInitiated(source: source),
              retryCount < maximumBackgroundRetryCount,
              !(error is CancellationError) else {
            return false
        }

        if let backendError = error as? BackendError {
            if backendError.requiresUserAuthentication {
                return false
            }
            if backendError.isProviderQuotaExhausted {
                return false
            }
            switch backendError {
            case .http(let status, _):
                return status == -1 ||
                    status == 408 ||
                    status == 425 ||
                    status == 429 ||
                    (500...599).contains(status)
            case .stage(let stage, let message):
                let signal = "\(stage) \(message)".lowercased()
                return [
                    "temporarily",
                    "timeout",
                    "timed out",
                    "unavailable",
                    "rate limit",
                    "try again",
                    "connection",
                ].contains { signal.contains($0) }
            default:
                return false
            }
        }

        let urlError: URLError? = {
            if let urlError = error as? URLError {
                return urlError
            }
            let nsError = error as NSError
            guard nsError.domain == NSURLErrorDomain else { return nil }
            return URLError(URLError.Code(rawValue: nsError.code))
        }()
        guard let urlError else { return false }
        return [
            .timedOut,
            .cannotFindHost,
            .cannotConnectToHost,
            .networkConnectionLost,
            .dnsLookupFailed,
            .notConnectedToInternet,
            .resourceUnavailable,
            .cannotLoadFromNetwork,
            .secureConnectionFailed,
        ].contains(urlError.code)
    }

    static func presentedError(
        _ error: Error,
        source: String,
        subject: String
    ) -> String {
        guard isUserInitiated(source: source) else { return "" }
        if let backendError = error as? BackendError,
           backendError.requiresUserAuthentication {
            return backendError.localizedDescription
        }
        if let backendError = error as? BackendError,
           backendError.isProviderQuotaExhausted {
            return BackendProviderFailurePolicy.userMessage
        }
        if let backendError = error as? BackendError,
           case .http(429, _) = backendError {
            return "Clementine's story tools are busy right now. Try again in a moment."
        }
        if let urlError = error as? URLError,
           urlError.code == .notConnectedToInternet {
            return "Couldn't refresh \(subject) while offline. Try again when your connection returns."
        }
        return "Couldn't refresh \(subject) right now. Try again."
    }

    static func backgroundStatus(subject: String, hasExistingContent: Bool) -> String {
        hasExistingContent ? "Showing the latest available \(subject)." : ""
    }
}
