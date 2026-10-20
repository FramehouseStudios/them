import Foundation

/// Canonical provider retry policy, extracted unchanged from BackendClient
/// except for distinguishing app-session expiry from an upstream auth failure.
nonisolated enum BackendProviderFailurePolicy {
    static let userMessage = "Clementine's writing service is temporarily unavailable. Your draft is safe. Please try again later."

    static func requiresManualTalkRetry(statusCode: Int, data: Data) -> Bool {
        guard !(200...299).contains(statusCode) else { return false }
        if isQuotaExhausted(statusCode: statusCode, data: data) { return true }
        guard statusCode == 401 || statusCode == 403,
              let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
        return (payload["error_class"] as? String)?.lowercased() == "provider_auth"
    }

    static func shouldRefreshClientSession(statusCode: Int, stage: String?) -> Bool {
        guard statusCode == 401 else { return false }
        let normalized = (stage ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        // Retain old servers' unstaged401 recovery. Explicit provider/app/user
        // failures cannot be repaired by discarding a valid client session.
        return normalized.isEmpty || normalized == "auth_client"
    }

    static func isQuotaExhausted(
        statusCode: Int? = nil,
        data: Data
    ) -> Bool {
        isQuotaExhausted(
            statusCode: statusCode,
            payload: String(data: data, encoding: .utf8) ?? ""
        )
    }

    static func isQuotaExhausted(
        statusCode: Int? = nil,
        payload: String
    ) -> Bool {
        let normalized = payload
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: "-", with: "_")
            .replacingOccurrences(of: " ", with: "_")

        if normalized.contains("provider_quota") ||
            normalized.contains("insufficient_quota") ||
            normalized.contains("quota_exhausted") ||
            normalized.contains("quota_exceeded") {
            return true
        }

        guard statusCode == 429 || normalized.contains("quota") else {
            return false
        }
        return normalized.contains("quota") && [
            "insufficient",
            "exhausted",
            "exceeded",
            "credit_balance",
            "billing_balance",
        ].contains { normalized.contains($0) }
    }

    static func shouldRetryHTTP(
        statusCode: Int,
        data: Data,
        retryableStatusCodes: Set<Int>
    ) -> Bool {
        retryableStatusCodes.contains(statusCode) &&
            !isQuotaExhausted(statusCode: statusCode, data: data)
    }
}
