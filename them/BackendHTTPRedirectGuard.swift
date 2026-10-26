import Foundation

// Canonical origin/response policy, moved unchanged from BackendClient.
nonisolated enum BackendAPIResponseValidator {
    static func hasMatchingOrigin(requestURL: URL?, responseURL: URL?) -> Bool {
        guard let requestURL,
              let responseURL,
              let requestScheme = requestURL.scheme?.lowercased(),
              let responseScheme = responseURL.scheme?.lowercased(),
              let requestHost = requestURL.host?.lowercased(),
              let responseHost = responseURL.host?.lowercased() else {
            return false
        }
        return requestScheme == responseScheme
            && requestHost == responseHost
            && effectivePort(for: requestURL) == effectivePort(for: responseURL)
    }

    static func isJSONResponse(_ response: HTTPURLResponse, data: Data) -> Bool {
        let mimeType = (response.mimeType ?? "").lowercased()
        if mimeType == "application/json" || mimeType.hasSuffix("+json") {
            return true
        }
        return (try? JSONSerialization.jsonObject(with: data)) != nil
    }

    static func isHealthyResponse(
        requestURL: URL?,
        response: HTTPURLResponse,
        data: Data
    ) -> Bool {
        guard hasMatchingOrigin(requestURL: requestURL, responseURL: response.url) else {
            return false
        }
        guard response.statusCode == 304 || (200...299).contains(response.statusCode) else {
            return false
        }
        if response.statusCode == 304 {
            return true
        }
        if let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           object["ok"] as? Bool == true {
            return true
        }
        let text = String(data: data, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        return text == "ok"
    }

    private static func effectivePort(for url: URL) -> Int? {
        if let port = url.port { return port }
        switch url.scheme?.lowercased() {
        case "http": return 80
        case "https": return 443
        default: return nil
        }
    }
}

/// Stop before Foundation forwards custom credentials or a 307/308 body.
/// Stateless per-task delegate: keep injected sessions and their lifetimes intact.
nonisolated final class BackendHTTPRedirectGuard: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    static let shared = BackendHTTPRedirectGuard()

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping @Sendable (URLRequest?) -> Void
    ) {
        let originalURL = task.originalRequest?.url
        guard BackendAPIResponseValidator.hasMatchingOrigin(requestURL: originalURL, responseURL: response.url),
              BackendAPIResponseValidator.hasMatchingOrigin(requestURL: originalURL, responseURL: request.url) else {
            completionHandler(nil)
            return
        }
        var trustedRequest = request
        if trustedRequest.value(forHTTPHeaderField: "Authorization") == nil,
           let authorization = task.originalRequest?.value(forHTTPHeaderField: "Authorization") {
            // Foundation strips this even on some same-origin redirects.
            // Restore only after both response and target match the original origin.
            trustedRequest.setValue(authorization, forHTTPHeaderField: "Authorization")
        }
        completionHandler(trustedRequest)
    }
}
