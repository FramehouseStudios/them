import Foundation
import XCTest
@testable import them

final class BackendScreenplayRecoveryAPITests: XCTestCase {
    override func tearDown() {
        RecoveryAPIURLProtocol.handler = nil
        super.tearDown()
    }

    func testPreserveRecoverySendsExactDraftWithProjectBearerAndClientRequestID() async throws {
        let draft = "INT. ROOM - NIGHT\r\n\r\nMARA\r\nMy exact line.  \r\n"
        let response = #"{"stage":"screenplay_recovery","status":"preserved","project_id":"project-1","recovery_id":"recovery-1","recovery":{"id":"recovery-1","project_id":"project-1","source":"studio_live_sync_recovery","draft":"INT. ROOM - NIGHT\r\n\r\nMARA\r\nMy exact line.  \r\n"}}"#
        var capturedBody: Data?
        var capturedAuthorization: String?
        var capturedUserID: String?
        RecoveryAPIURLProtocol.handler = { request in
            switch request.url?.path {
            case "/session":
                return .json(#"{"client_token":"session-client","expires_in":3600,"remembered_names":[]}"#)
            case "/screenplay/projects/project-1/recovery":
                capturedBody = Self.bodyData(from: request)
                capturedAuthorization = request.value(forHTTPHeaderField: "Authorization")
                capturedUserID = request.value(forHTTPHeaderField: "X-User-Id")
                return .json(response, status: 201)
            default:
                return .json(#"{"error":"not_found"}"#, status: 404)
            }
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RecoveryAPIURLProtocol.self]
        let identity = BackendAuthRequestIdentity(
            sessionEpoch: 1,
            userID: "user-1",
            clientToken: "project-client",
            accessToken: "access-1"
        )
        let api = BackendMemoryAPI(
            session: URLSession(configuration: configuration),
            baseURL: URL(string: "https://screenplay-recovery.test")!,
            requestIdentityProvider: { _ in identity }
        )

        let result = try await api.preserveScreenplayProjectRecovery(
            projectId: "project-1",
            draft: draft,
            clientRequestId: "stable-request-1"
        )

        XCTAssertEqual(result.recoveryId, "recovery-1")
        XCTAssertEqual(result.recovery?.draft, draft)
        let body = try XCTUnwrap(capturedBody)
        let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
        XCTAssertEqual(payload["draft"], draft)
        XCTAssertEqual(payload["client_request_id"], "stable-request-1")
        XCTAssertEqual(capturedAuthorization, "Bearer access-1")
        XCTAssertEqual(capturedUserID, "user-1")
    }

    func testDeleteRecoveryUsesAuthenticatedDeleteEndpoint() async throws {
        var capturedMethod: String?
        var capturedAuthorization: String?
        RecoveryAPIURLProtocol.handler = { request in
            switch request.url?.path {
            case "/session":
                return .json(#"{"client_token":"session-client","expires_in":3600,"remembered_names":[]}"#)
            case "/screenplay/projects/project-1/recovery/recovery-1":
                capturedMethod = request.httpMethod
                capturedAuthorization = request.value(forHTTPHeaderField: "Authorization")
                return .json(#"{"status":"deleted"}"#)
            default:
                return .json(#"{"error":"not_found"}"#, status: 404)
            }
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RecoveryAPIURLProtocol.self]
        let api = BackendMemoryAPI(
            session: URLSession(configuration: configuration),
            baseURL: URL(string: "https://screenplay-recovery.test")!,
            requestIdentityProvider: { _ in
                BackendAuthRequestIdentity(
                    sessionEpoch: 1,
                    userID: "user-1",
                    clientToken: "project-client",
                    accessToken: "access-1"
                )
            }
        )

        try await api.deleteScreenplayProjectRecovery(projectId: "project-1", recoveryId: "recovery-1")

        XCTAssertEqual(capturedMethod, "DELETE")
        XCTAssertEqual(capturedAuthorization, "Bearer access-1")
    }

    private static func bodyData(from request: URLRequest) -> Data? {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }
        var result = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count < 0 { return nil }
            if count == 0 { break }
            result.append(buffer, count: count)
        }
        return result
    }

    func testPreserveDoesNotSendDraftAfterAccountChangesDuringBootstrap() async throws {
        try await assertBootstrapAccountChangeIsRejected(deleting: false)
    }

    func testDeleteDoesNotSendAfterAccountChangesDuringBootstrap() async throws {
        try await assertBootstrapAccountChangeIsRejected(deleting: true)
    }

    private func assertBootstrapAccountChangeIsRejected(deleting: Bool) async throws {
        let identity = RecoveryIdentityBox()
        var bootstrapCount = 0
        var mutationCount = 0
        RecoveryAPIURLProtocol.handler = { request in
            if request.url?.path == "/session" {
                bootstrapCount += 1
                identity.changeUser(to: "user-2")
                return .json(#"{"client_token":"session-client","expires_in":3600,"remembered_names":[]}"#)
            }
            mutationCount += 1
            return .json(#"{"status":"preserved","recovery_id":"recovery-1","recovery":{"id":"recovery-1","project_id":"project-1","source":"studio_live_sync_recovery","draft":"Original words"}}"#)
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RecoveryAPIURLProtocol.self]
        let api = BackendMemoryAPI(
            session: URLSession(configuration: configuration),
            baseURL: URL(string: "https://screenplay-recovery.test")!,
            requestIdentityProvider: { _ in identity.snapshot() }
        )
        do {
            if deleting {
                try await api.deleteScreenplayProjectRecovery(projectId: "project-1", recoveryId: "recovery-1")
            } else {
                _ = try await api.preserveScreenplayProjectRecovery(
                    projectId: "project-1", draft: "Original words", clientRequestId: "request-1"
                )
            }
            XCTFail("An account change must cancel the original recovery mutation")
        } catch BackendMemoryAPIError.server(let status, let message) {
            XCTAssertEqual(status, 409)
            XCTAssertEqual(message, "auth_session_changed")
        }
        XCTAssertEqual(bootstrapCount, 1, "The test must exercise a real bootstrap wait")
        XCTAssertEqual(mutationCount, 0, "Never send the original account's mutation as another account")
    }

    func testRecoveryMutationsDoNotRetryAsAnotherAccountAfterRefresh() async throws {
        for deleting in [false, true] {
            try await assertRefreshScope(deleting: deleting, change: .account)
        }
    }

    func testRecoveryMutationsDoNotRetryAfterNewSignInIntentForSameAccount() async throws {
        for deleting in [false, true] {
            try await assertRefreshScope(deleting: deleting, change: .signInIntent)
        }
    }

    func testRecoveryMutationsRetryWithRotatedTokenForSameSession() async throws {
        for deleting in [false, true] {
            try await assertRefreshScope(deleting: deleting, change: .tokenOnly)
        }
    }

    private enum RefreshChange: Sendable { case account, signInIntent, tokenOnly }

    private func assertRefreshScope(deleting: Bool, change: RefreshChange) async throws {
        let identity = RecoveryIdentityBox()
        var mutationCount = 0
        var authorizations: [String] = []
        RecoveryAPIURLProtocol.handler = { request in
            if request.url?.path == "/session" {
                return .json(#"{"client_token":"session-client","expires_in":3600,"remembered_names":[]}"#)
            }
            mutationCount += 1
            authorizations.append(request.value(forHTTPHeaderField: "Authorization") ?? "")
            if mutationCount == 1 { return .json(#"{"error":"expired"}"#, status: 401) }
            return .json(#"{"status":"preserved","recovery_id":"recovery-1","recovery":{"id":"recovery-1","project_id":"project-1","source":"studio_live_sync_recovery","draft":"Original words"}}"#)
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RecoveryAPIURLProtocol.self]
        let api = BackendMemoryAPI(
            session: URLSession(configuration: configuration),
            baseURL: URL(string: "https://screenplay-recovery.test")!,
            requestIdentityProvider: { _ in identity.snapshot() }
        )
        let refresh: @Sendable () async throws -> Bool = {
            switch change {
            case .account: identity.changeUser(to: "user-2")
            case .signInIntent: _ = BackendAuthClient.reserveAuthSessionIntent()
            case .tokenOnly: identity.rotateToken()
            }
            return true
        }
        do {
            if deleting {
                try await api.deleteScreenplayProjectRecovery(
                    projectId: "project-1", recoveryId: "recovery-1", refreshAuthentication: refresh
                )
            } else {
                _ = try await api.preserveScreenplayProjectRecovery(
                    projectId: "project-1", draft: "Original words", clientRequestId: "request-1",
                    refreshAuthentication: refresh
                )
            }
            XCTAssertEqual(change, .tokenOnly, "Changed accounts or sign-in sessions must not retry")
        } catch BackendMemoryAPIError.server(let status, let message) {
            XCTAssertNotEqual(change, .tokenOnly, "Ordinary refresh must remain usable")
            XCTAssertEqual(status, 409)
            XCTAssertEqual(message, "auth_session_changed")
        }
        XCTAssertEqual(mutationCount, change == .tokenOnly ? 2 : 1)
        XCTAssertEqual(authorizations, change == .tokenOnly ? ["Bearer access-1", "Bearer access-2"] : ["Bearer access-1"])
    }
}

private nonisolated final class RecoveryIdentityBox: @unchecked Sendable {
    private let lock = NSLock()
    private var userID = "user-1"
    private var accessToken = "access-1"
    private var epoch = 1

    func changeUser(to value: String) {
        lock.lock()
        defer { lock.unlock() }
        userID = value
    }

    func snapshot() -> BackendAuthRequestIdentity {
        lock.lock()
        defer { lock.unlock() }
        return BackendAuthRequestIdentity(
            sessionEpoch: epoch, userID: userID, clientToken: "project-client", accessToken: accessToken
        )
    }

    func rotateToken() {
        lock.lock()
        defer { lock.unlock() }
        accessToken = "access-2"
        epoch += 1
    }
}

private struct RecoveryAPIHTTPStub {
    let status: Int
    let body: Data

    static func json(_ value: String, status: Int = 200) -> RecoveryAPIHTTPStub {
        RecoveryAPIHTTPStub(status: status, body: Data(value.utf8))
    }
}

private final class RecoveryAPIURLProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) -> RecoveryAPIHTTPStub)?

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host == "screenplay-recovery.test"
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let result = Self.handler?(request),
              let url = request.url,
              let response = HTTPURLResponse(
                url: url,
                statusCode: result.status,
                httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": "application/json"]
              ) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: result.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
