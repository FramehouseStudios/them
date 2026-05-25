import XCTest
@testable import them

final class BackendAccountDataControlsTests: XCTestCase {
    override func tearDown() {
        AccountDataControlsURLProtocolStub.handler = nil
        UserDefaults.standard.removeObject(forKey: "client_token")
        UserDefaults.standard.removeObject(forKey: "user_id")
        super.tearDown()
    }

    func testExportAccountDataDownloadsBackendAccountArchive() async throws {
        let recorder = AccountDataControlsRequestRecorder()
        AccountDataControlsURLProtocolStub.handler = { request in
            recorder.record(request)
            switch request.url?.path {
            case "/session":
                return AccountDataControlsHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "client_token": "client-test", "expires_in": 3600, "remembered_names": [] }"#.utf8)
                )
            case "/account/export":
                return AccountDataControlsHTTPStub(
                    status: 200,
                    headers: [
                        "Content-Type": "application/json; charset=utf-8",
                        "Content-Disposition": #"attachment; filename="io-them-export-user-1.json""#,
                    ],
                    body: Data(#"{ "schema": "io.them.account_export.v1", "domains": { "screenplay": [] } }"#.utf8)
                )
            default:
                return AccountDataControlsHTTPStub(
                    status: 404,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "error": "not_found" }"#.utf8)
                )
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AccountDataControlsURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let api = BackendMemoryAPI(
            session: session,
            baseURL: URL(string: "https://account-data-controls.test")!
        )

        let artifact = try await api.exportAccountData()

        XCTAssertEqual(artifact.filename, "io-them-export-user-1.json")
        XCTAssertEqual(artifact.contentType, "application/json; charset=utf-8")
        XCTAssertTrue(String(data: artifact.data, encoding: .utf8)?.contains("account_export") == true)
        let exportRequest = try XCTUnwrap(recorder.requests.first { $0.path == "/account/export" })
        XCTAssertEqual(exportRequest.method, "GET")
        XCTAssertEqual(exportRequest.acceptHeader, "application/json")
    }

    func testRequestAccountDeletionSendsDeleteToAccountRoute() async throws {
        let recorder = AccountDataControlsRequestRecorder()
        AccountDataControlsURLProtocolStub.handler = { request in
            recorder.record(request)
            switch request.url?.path {
            case "/session":
                return AccountDataControlsHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "client_token": "client-test", "expires_in": 3600, "remembered_names": [] }"#.utf8)
                )
            case "/account":
                return AccountDataControlsHTTPStub(
                    status: 202,
                    headers: ["Content-Type": "application/json"],
                    body: Data(
                        #"""
                        {
                          "status": "pending_deletion",
                          "pending_deletion_at": "2026-05-23T12:00:00.000Z",
                          "hard_delete_at": "2026-05-30T12:00:00.000Z",
                          "recovery_window_days": 7
                        }
                        """#.utf8
                    )
                )
            default:
                return AccountDataControlsHTTPStub(
                    status: 404,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "error": "not_found" }"#.utf8)
                )
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AccountDataControlsURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let api = BackendMemoryAPI(
            session: session,
            baseURL: URL(string: "https://account-data-controls.test")!
        )

        let response = try await api.requestAccountDeletion(reason: "Leaving")

        XCTAssertEqual(response.status, "pending_deletion")
        XCTAssertEqual(response.hardDeleteAt, "2026-05-30T12:00:00.000Z")
        XCTAssertEqual(response.recoveryWindowDays, 7)

        let accountRequest = try XCTUnwrap(recorder.requests.first { $0.path == "/account" })
        XCTAssertEqual(accountRequest.method, "DELETE")
        XCTAssertEqual(accountRequest.bodyObject?["reason"] as? String, "Leaving")
    }
}

final class BackendCredentialMigrationTests: XCTestCase {
    private var suiteName: String!
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        suiteName = "io.them.BackendCredentialMigrationTests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        suiteName = nil
        super.tearDown()
    }

    func testReadMigratesLegacyDefaultsValueToKeychainAndClearsDefaults() {
        defaults.set(" legacy-token ", forKey: "client_token")
        var keychain: [String: String] = [:]

        let value = BackendCredentialMigration.readString(
            account: "session_client_token",
            defaultsKey: "client_token",
            defaults: defaults,
            readKeychain: { keychain[$0] },
            writeKeychain: { value, account in
                keychain[account] = value
                return true
            }
        )

        XCTAssertEqual(value, "legacy-token")
        XCTAssertNil(defaults.string(forKey: "client_token"))
        XCTAssertEqual(keychain["session_client_token"], "legacy-token")
    }

    func testReadLeavesLegacyDefaultsWhenKeychainWriteFails() {
        defaults.set("legacy-token", forKey: "client_token")

        let value = BackendCredentialMigration.readString(
            account: "session_client_token",
            defaultsKey: "client_token",
            defaults: defaults,
            readKeychain: { _ in nil },
            writeKeychain: { _, _ in false }
        )

        XCTAssertEqual(value, "legacy-token")
        XCTAssertEqual(defaults.string(forKey: "client_token"), "legacy-token")
    }

    func testStudioDebugProjectLoadUsesDefaultsClientTokenOverride() {
        defaults.set(" studio-smoke-project ", forKey: "client_token")
        defaults.set("project-123", forKey: "studio_debug_load_project_id")
        defaults.set(101, forKey: "studio_debug_load_project_token")
        defaults.set(100, forKey: "studio_debug_load_project_ack_token")

        XCTAssertTrue(BackendAuthClient.isStudioDebugClientTokenOverrideActive(defaults: defaults))
        XCTAssertEqual(
            BackendAuthClient.studioDebugClientTokenOverride(defaults: defaults),
            "studio-smoke-project"
        )
    }

    func testStudioDebugProjectLoadOverrideClearsAfterAck() {
        defaults.set("studio-smoke-project", forKey: "client_token")
        defaults.set("project-123", forKey: "studio_debug_load_project_id")
        defaults.set(101, forKey: "studio_debug_load_project_token")
        defaults.set(101, forKey: "studio_debug_load_project_ack_token")

        XCTAssertFalse(BackendAuthClient.isStudioDebugClientTokenOverrideActive(defaults: defaults))
        XCTAssertNil(BackendAuthClient.studioDebugClientTokenOverride(defaults: defaults))
    }

    func testNewWritesUseKeychainAndRemoveDefaults() {
        defaults.set("stale-user", forKey: "user_id")
        var keychain: [String: String] = [:]

        let wrote = BackendCredentialMigration.writeString(
            " usr_new_value ",
            account: "stable_user_id",
            defaultsKey: "user_id",
            defaults: defaults,
            writeKeychain: { value, account in
                keychain[account] = value
                return true
            },
            deleteKeychain: { keychain.removeValue(forKey: $0) }
        )

        XCTAssertTrue(wrote)
        XCTAssertNil(defaults.string(forKey: "user_id"))
        XCTAssertEqual(keychain["stable_user_id"], "usr_new_value")
    }

    func testEmptyWritesClearKeychainAndDefaults() {
        defaults.set("stale-expiry", forKey: "client_token_expiry")
        var keychain = ["session_client_token_expiry": "stale-expiry"]

        let wrote = BackendCredentialMigration.writeString(
            "   ",
            account: "session_client_token_expiry",
            defaultsKey: "client_token_expiry",
            defaults: defaults,
            writeKeychain: { value, account in
                keychain[account] = value
                return true
            },
            deleteKeychain: { account in
                keychain.removeValue(forKey: account)
            }
        )

        XCTAssertFalse(wrote)
        XCTAssertNil(defaults.string(forKey: "client_token_expiry"))
        XCTAssertNil(keychain["session_client_token_expiry"])
    }
}

private struct AccountDataControlsHTTPStub {
    let status: Int
    let headers: [String: String]
    let body: Data
}

private final class AccountDataControlsURLProtocolStub: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> AccountDataControlsHTTPStub)?

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host == "account-data-controls.test"
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
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: stub.status,
                httpVersion: "HTTP/1.1",
                headerFields: stub.headers
            )!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: stub.body)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

private struct RecordedAccountDataControlsRequest {
    let method: String
    let path: String
    let acceptHeader: String?
    let bodyObject: [String: Any]?
}

private final class AccountDataControlsRequestRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private(set) var requests: [RecordedAccountDataControlsRequest] = []

    func record(_ request: URLRequest) {
        let bodyObject: [String: Any]?
        if let body = Self.bodyData(from: request),
           let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any] {
            bodyObject = object
        } else {
            bodyObject = nil
        }

        let record = RecordedAccountDataControlsRequest(
            method: request.httpMethod ?? "",
            path: request.url?.path ?? "",
            acceptHeader: request.value(forHTTPHeaderField: "Accept"),
            bodyObject: bodyObject
        )
        lock.lock()
        requests.append(record)
        lock.unlock()
    }

    private static func bodyData(from request: URLRequest) -> Data? {
        if let body = request.httpBody {
            return body
        }
        guard let stream = request.httpBodyStream else {
            return nil
        }
        stream.open()
        defer { stream.close() }
        var data = Data()
        let bufferSize = 1024
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
        defer { buffer.deallocate() }
        while stream.hasBytesAvailable {
            let read = stream.read(buffer, maxLength: bufferSize)
            if read <= 0 { break }
            data.append(buffer, count: read)
        }
        return data
    }
}
