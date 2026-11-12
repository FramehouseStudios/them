import Foundation
import XCTest
@testable import them

@MainActor
final class BackendOriginAuthorityTests: XCTestCase {
    func testAliasOnlyKeepsVoiceOnTheAuthenticatedBackend() async throws {
        try await verifyPrimaryOrigin(alias: "https://primary-backend.test/api", legacy: nil,
                                      expected: "https://primary-backend.test/api")
    }

    func testAliasWinsOverConflictingLegacyURLForEveryClient() async throws {
        try await verifyPrimaryOrigin(alias: "https://primary-backend.test/api", legacy: "https://other-backend.test",
                                      expected: "https://primary-backend.test/api")
    }

    func testLegacyURLRemainsSupportedByEveryClient() async throws {
        try await verifyPrimaryOrigin(alias: nil, legacy: "https://legacy-backend.test",
                                      expected: "https://legacy-backend.test")
    }

    func testUnusableAliasFallsThroughToLegacyForEveryClient() async throws {
        try await verifyPrimaryOrigin(alias: "$(BACKEND_BASE_URL)", legacy: "https://legacy-backend.test",
                                      expected: "https://legacy-backend.test")
    }

    func testExplicitVoiceFallbackRemainsIndependentOfPrimaryAlias() async throws {
        try await verifyPrimaryOrigin(alias: "https://primary-backend.test/api", legacy: "https://other-backend.test",
            expected: "https://primary-backend.test/api", explicitFallback: "https://fallback-backend.test", failPrimary: true)
    }

    func testPlistAliasAndEnvironmentPrecedence() {
        let info = ["BACKEND_BASE_URL": "https://plist-primary.test", "BACKEND_URL": "https://plist-legacy.test"]
        XCTAssertEqual(BackendDefaultBaseURLPolicy.configuredPrimaryBaseURL(environment: [:], infoDictionary: info,
            isDebug: true)?.absoluteString, "https://plist-primary.test")
        XCTAssertEqual(BackendDefaultBaseURLPolicy.configuredPrimaryBaseURL(
            environment: ["BACKEND_URL": "https://environment.test"], infoDictionary: info,
            isDebug: true)?.absoluteString, "https://environment.test")
    }

    func testReleaseRejectsLoopbackWhileDebugCanonicalizesIt() {
        let environment = ["BACKEND_BASE_URL": " http://localhost:31337/api ", "BACKEND_URL": "https://release-backend.test"]
        XCTAssertEqual(BackendDefaultBaseURLPolicy.configuredPrimaryBaseURL(environment: environment,
            infoDictionary: [:], isDebug: false)?.absoluteString, "https://release-backend.test")
        XCTAssertEqual(BackendDefaultBaseURLPolicy.configuredPrimaryBaseURL(environment: environment,
            infoDictionary: [:], isDebug: true)?.absoluteString, "http://127.0.0.1:31337/api")
        XCTAssertNil(BackendDefaultBaseURLPolicy.configuredPrimaryBaseURL(
            environment: ["BACKEND_BASE_URL": "ftp://invalid-backend.test"], infoDictionary: [:], isDebug: false))
    }

    private func verifyPrimaryOrigin(alias: String?, legacy: String?, expected: String,
                                     explicitFallback: String? = nil, failPrimary: Bool = false) async throws {
        let keys = ["BACKEND_BASE_URL", "BACKEND_URL", "BACKEND_FALLBACK_URL"]
        let previous = keys.map { key in getenv(key).map { String(cString: $0) } }
        defer {
            for (key, value) in zip(keys, previous) {
                if let value { setenv(key, value, 1) } else { unsetenv(key) }
            }
        }
        if let alias { setenv(keys[0], alias, 1) } else { unsetenv(keys[0]) }
        if let legacy { setenv(keys[1], legacy, 1) } else { unsetenv(keys[1]) }
        if let explicitFallback { setenv(keys[2], explicitFallback, 1) } else { unsetenv(keys[2]) }
        XCTAssertNil(BackendDefaultBaseURLPolicy.currentUITestOverrideBaseURL)
        let expectedURL = try XCTUnwrap(URL(string: expected))
        let recorder = OriginAuthorityRecorder()
        OriginAuthorityURLProtocol.handler = { request in
            recorder.record(request.url)
            return failPrimary && request.url?.host == expectedURL.host ? 503 : 200
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [OriginAuthorityURLProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel(); OriginAuthorityURLProtocol.handler = nil }
        let outbox = OfflineTalkOutbox(storageDirectory: FileManager.default.temporaryDirectory
            .appendingPathComponent("origin-authority-\(UUID().uuidString)"))
        let voice = BackendClient(urlSession: session, persistBackendBaseURL: false,
                                  attachUserIDHeader: false, talkOutbox: outbox)
        let memory = BackendMemoryAPI(session: session)

        XCTAssertEqual(BackendAuthClient.resolvedBackendBaseURL(), expectedURL)
        let memoryURL = await memory.baseURL()
        XCTAssertEqual(memoryURL, expectedURL)
        let healthy = try await voice.health()
        XCTAssertTrue(healthy)
        var expectedRequests = [expectedURL.appendingPathComponent("health")]
        if failPrimary, let explicitFallback, let fallbackURL = URL(string: explicitFallback) {
            expectedRequests.append(fallbackURL.appendingPathComponent("health"))
        }
        XCTAssertEqual(recorder.snapshot(), expectedRequests,
                       "Voice must select the same configured backend as sign-in and saved drafts.")
    }
}

private nonisolated final class OriginAuthorityRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var values: [URL] = []
    func record(_ url: URL?) {
        guard let url else { return }
        lock.lock(); defer { lock.unlock() }; values.append(url)
    }
    func snapshot() -> [URL] { lock.lock(); defer { lock.unlock() }; return values }
}

private final class OriginAuthorityURLProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) -> Int)?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse)); return
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: handler(request), httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(#"{"ok":true}"#.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
