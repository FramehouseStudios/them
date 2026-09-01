import Foundation
import XCTest
@testable import them

final class BackendStateAuthRotationTests: XCTestCase {
    override func tearDown() {
        StateAuthRotationURLProtocolStub.handler = nil
        super.tearDown()
    }

    func testStateReadRetriesOnceWhenBearerRotatesInFlight() async throws {
        let identity = StateAuthRotationIdentityBox(accessToken: "old-access")
        let recorder = StateAuthRotationRequestRecorder()

        StateAuthRotationURLProtocolStub.handler = { request in
            switch request.url?.path {
            case "/session":
                return .json(
                    #"{"client_token":"client-state","expires_in":3600,"remembered_names":[]}"#
                )
            case "/state":
                let authorization = request.value(forHTTPHeaderField: "Authorization") ?? ""
                let attempt = recorder.recordStateAuthorization(authorization)
                if attempt == 1 {
                    identity.setAccessToken("new-access")
                    return .json(
                        #"{"stage":"auth_user","error":"user_auth_required"}"#,
                        status: 401
                    )
                }
                return .json(
                    #"{"source":"authuser:user-state","source_ip":"","state_version":"state-2","is_delta":true,"delta_no_change":false,"history_changed":false,"memory_changed":false,"since_version":"state-1","history_delta":[],"memories_delta":[]}"#
                )
            default:
                return .json(#"{"error":"not_found"}"#, status: 404)
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StateAuthRotationURLProtocolStub.self]
        let api = BackendMemoryAPI(
            session: URLSession(configuration: configuration),
            baseURL: URL(string: "https://state-auth-rotation.test")!,
            requestIdentityProvider: { _ in identity.snapshot() }
        )

        let result = try await api.fetchStateDelta(
            sinceVersion: "state-1",
            historyLimit: 1,
            memoriesLimit: 1
        )

        XCTAssertEqual(result.payload.stateVersion, "state-2")
        XCTAssertEqual(recorder.stateAuthorizations(), ["Bearer old-access", "Bearer new-access"])
    }

    func testStateReadDoesNotRetryUnchangedBearer() async throws {
        let identity = StateAuthRotationIdentityBox(accessToken: "same-access")
        let recorder = StateAuthRotationRequestRecorder()

        StateAuthRotationURLProtocolStub.handler = { request in
            switch request.url?.path {
            case "/session":
                return .json(
                    #"{"client_token":"client-state","expires_in":3600,"remembered_names":[]}"#
                )
            case "/state":
                recorder.recordStateAuthorization(
                    request.value(forHTTPHeaderField: "Authorization") ?? ""
                )
                return .json(
                    #"{"stage":"auth_user","error":"user_auth_required"}"#,
                    status: 401
                )
            default:
                return .json(#"{"error":"not_found"}"#, status: 404)
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StateAuthRotationURLProtocolStub.self]
        let api = BackendMemoryAPI(
            session: URLSession(configuration: configuration),
            baseURL: URL(string: "https://state-auth-rotation.test")!,
            requestIdentityProvider: { _ in identity.snapshot() }
        )

        do {
            _ = try await api.fetchStateDelta(
                sinceVersion: "state-1",
                historyLimit: 1,
                memoriesLimit: 1
            )
            XCTFail("Expected the unchanged unauthorized bearer to fail without retry.")
        } catch BackendMemoryAPIError.server(let status, let message) {
            XCTAssertEqual(status, 401)
            XCTAssertEqual(message, "auth_user: user_auth_required")
        }
        XCTAssertEqual(recorder.stateAuthorizations(), ["Bearer same-access"])
    }
}

private final class StateAuthRotationIdentityBox: @unchecked Sendable {
    private let lock = NSLock()
    private var accessToken: String

    init(accessToken: String) {
        self.accessToken = accessToken
    }

    func setAccessToken(_ value: String) {
        lock.lock()
        accessToken = value
        lock.unlock()
    }

    func snapshot() -> BackendAuthRequestIdentity {
        lock.lock()
        defer { lock.unlock() }
        return BackendAuthRequestIdentity(
            sessionEpoch: 1,
            userID: "user-state",
            clientToken: "client-state",
            accessToken: accessToken
        )
    }
}

private final class StateAuthRotationRequestRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var authorizations: [String] = []

    @discardableResult
    func recordStateAuthorization(_ value: String) -> Int {
        lock.lock()
        defer { lock.unlock() }
        authorizations.append(value)
        return authorizations.count
    }

    func stateAuthorizations() -> [String] {
        lock.lock()
        defer { lock.unlock() }
        return authorizations
    }
}

private struct StateAuthRotationHTTPStub {
    let status: Int
    let headers: [String: String]
    let body: Data

    static func json(_ raw: String, status: Int = 200) -> StateAuthRotationHTTPStub {
        StateAuthRotationHTTPStub(
            status: status,
            headers: ["Content-Type": "application/json"],
            body: Data(raw.utf8)
        )
    }
}

private final class StateAuthRotationURLProtocolStub: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> StateAuthRotationHTTPStub)?

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host == "state-auth-rotation.test"
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }
        do {
            let stub = try handler(request)
            guard let url = request.url,
                  let response = HTTPURLResponse(
                    url: url,
                    statusCode: stub.status,
                    httpVersion: "HTTP/1.1",
                    headerFields: stub.headers
                  ) else {
                throw URLError(.badServerResponse)
            }
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: stub.body)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}
