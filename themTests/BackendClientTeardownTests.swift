import XCTest
@testable import them

private enum BackendClientTeardownContext {
    @TaskLocal static var marker: Int = 0
}

final class BackendClientTeardownTests: XCTestCase {
    @MainActor
    func testReleasingClientDoesNotInvalidateCallerOwnedSession() async throws {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [BackendTeardownURLProtocol.self]
        let session = URLSession(configuration: config)
        defer { session.invalidateAndCancel() } // Only the fixture owns this session.
        let endpoint = URL(string: "https://client-teardown.test")!
        var first: BackendClient? = BackendClient(baseURL: endpoint, fallbackURL: endpoint,
            urlSession: session, persistBackendBaseURL: false, attachUserIDHeader: false)
        weak var released = first
        first = nil
        XCTAssertNil(released)
        let second = BackendClient(baseURL: endpoint, fallbackURL: endpoint,
            urlSession: session, persistBackendBaseURL: false, attachUserIDHeader: false)
        let healthy = try await second.health()
        XCTAssertTrue(healthy, "Another client must still be able to use the caller's session.")
    }

    @MainActor
    func testSynchronousClientReleaseWithinTaskLocalScopeDoesNotCrashOrLeak() {
        XCTAssertTrue(Thread.isMainThread)
        let endpoint = URL(string: "https://client-teardown.test")!
        for _ in 0..<100 {
            BackendClientTeardownContext.$marker.withValue(7) {
                var client: BackendClient? = BackendClient(baseURL: endpoint, fallbackURL: endpoint,
                    persistBackendBaseURL: false, attachUserIDHeader: false)
                weak var released = client
                XCTAssertNotNil(released)
                XCTAssertEqual(BackendClientTeardownContext.marker, 7)
                client = nil // Release synchronously inside the task-local scope, not after an await.
                XCTAssertNil(released, "Retaining clients forever is not a teardown fix.")
                XCTAssertEqual(BackendClientTeardownContext.marker, 7)
            }
            XCTAssertEqual(BackendClientTeardownContext.marker, 0)
        }
    }
}

private final class BackendTeardownURLProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "client-teardown.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(#"{"ok":true}"#.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
