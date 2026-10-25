import Foundation

// Reused from fc759311; the canonical origin validator still lives in
// BackendClient at this stack boundary. Do not define a second origin policy.
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
