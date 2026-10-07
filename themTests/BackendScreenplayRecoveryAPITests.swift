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
        let response = #"{"stage":"screenplay_recovery","status":"preserved","project_id":"project-1","recovery_id":"recovery-1","recovery":{"id":"recovery-1","project_id":"project-1","source":"studio_live_sync_recovery","base_version_id":"version-before-edit","draft":"INT. ROOM - NIGHT\r\n\r\nMARA\r\nMy exact line.  \r\n"}}"#
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
            clientRequestId: "stable-request-1",
            baseVersionId: "version-before-edit"
        )

        XCTAssertEqual(result.recoveryId, "recovery-1")
        XCTAssertEqual(result.recovery?.draft, draft)
        XCTAssertEqual(result.recovery?.baseVersionId, "version-before-edit")
        let body = try XCTUnwrap(capturedBody)
        let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
        XCTAssertEqual(payload["draft"], draft)
        XCTAssertEqual(payload["client_request_id"], "stable-request-1")
        XCTAssertEqual(payload["base_version_id"], "version-before-edit")
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
