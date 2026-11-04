import XCTest
@testable import them

final class BackendHTTPRedirectGuardTests: XCTestCase {
    func testCrossOriginRedirectsAreRejectedBeforeRequestForwarding() throws {
        let original = try XCTUnwrap(URL(string: "https://api.example.test/auth/login"))
        for target in ["https://parking.example.test/", "http://api.example.test/",
                       "https://api.example.test:444/", "https://api.example.test.evil.test/"] {
            for status in [301, 302, 303, 307, 308] {
                let proposed = credentialRequest(try XCTUnwrap(URL(string: target)))
                let result = decision(original: original, responseURL: original,
                                      status: status, proposed: proposed)
                XCTAssertEqual(result.calls, 1)
                XCTAssertNil(result.request, "Origin-changing \(status) must stop before forwarding.")
            }
        }
    }

    func testSameOriginRedirectPreservesTheProposedRequestExactly() throws {
        let original = try XCTUnwrap(URL(string: "https://API.example.test/auth/login"))
        let proposed = credentialRequest(try XCTUnwrap(URL(string: "https://api.example.test:443/auth/login/")))
        let result = decision(original: original, responseURL: original, status: 307, proposed: proposed)
        XCTAssertEqual(result.calls, 1)
        XCTAssertEqual(result.request, proposed)
        XCTAssertEqual(result.request?.httpBody, proposed.httpBody)
    }

    func testLaterHopCannotTrustAnAlreadyForeignResponse() throws {
        let original = try XCTUnwrap(URL(string: "https://api.example.test/session"))
        let foreign = try XCTUnwrap(URL(string: "https://parking.example.test/session"))
        let result = decision(original: original, responseURL: foreign, status: 302,
                              proposed: credentialRequest(original))
        XCTAssertEqual(result.calls, 1)
        XCTAssertNil(result.request)
    }

    func testSameOriginCanRestoreStrippedAuthorizationWithoutChangingMethodOrBody() throws {
        let original = try XCTUnwrap(URL(string: "https://api.example.test/session"))
        var proposed = credentialRequest(try XCTUnwrap(URL(string: "https://api.example.test/session/")))
        proposed.setValue(nil, forHTTPHeaderField: "Authorization")
        let result = decision(original: original, responseURL: original, status: 307, proposed: proposed)
        XCTAssertEqual(result.request?.value(forHTTPHeaderField: "Authorization"), "Bearer dummy")
        XCTAssertEqual(result.request?.httpMethod, proposed.httpMethod)
        XCTAssertEqual(result.request?.httpBody, proposed.httpBody)
    }

    func testCredentialFreeHealthRedirectIsAlsoOriginBound() throws {
        let original = try XCTUnwrap(URL(string: "http://127.0.0.1:3000/healthz"))
        let proposed = URLRequest(url: try XCTUnwrap(URL(string: "http://localhost:3000/healthz")))
        let result = decision(original: original, responseURL: original, status: 302, proposed: proposed)
        XCTAssertNil(result.request)
    }

    private func credentialRequest(_ url: URL) -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = Data("synthetic-request-body".utf8)
        request.setValue("dummy-app", forHTTPHeaderField: "X-APP-TOKEN")
        request.setValue("dummy-client", forHTTPHeaderField: "X-Client-Token")
        request.setValue("dummy-byok", forHTTPHeaderField: "xi-api-key")
        request.setValue("Bearer dummy", forHTTPHeaderField: "Authorization")
        return request
    }

    private func decision(original: URL, responseURL: URL, status: Int,
                          proposed: URLRequest) -> (request: URLRequest?, calls: Int) {
        let task = URLSession.shared.dataTask(with: credentialRequest(original))
        defer { task.cancel() } // Never resume: callback characterization sends no network traffic.
        let result = RedirectDecision()
        BackendHTTPRedirectGuard.shared.urlSession(.shared, task: task,
            willPerformHTTPRedirection: HTTPURLResponse(url: responseURL, statusCode: status,
                httpVersion: "HTTP/1.1", headerFields: ["Location": proposed.url!.absoluteString])!,
            newRequest: proposed, completionHandler: { result.store($0) })
        return result.snapshot()
    }
}

nonisolated private final class RedirectDecision: @unchecked Sendable {
    private let lock = NSLock()
    private var request: URLRequest?
    private var calls = 0

    func store(_ request: URLRequest?) {
        lock.lock()
        defer { lock.unlock() }
        self.request = request
        calls += 1
    }

    func snapshot() -> (request: URLRequest?, calls: Int) {
        lock.lock()
        defer { lock.unlock() }
        return (request, calls)
    }
}
