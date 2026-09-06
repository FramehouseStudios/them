import XCTest
@testable import them

final class BackendPageCancelClientTests: XCTestCase {
    override func setUp() {
        super.setUp()
        BackendAuthClient.clearSharedClientToken()
        let expiry = ISO8601DateFormatter().string(from: Date().addingTimeInterval(3600))
        XCTAssertTrue(BackendAuthClient.persistSharedClientToken(
            "client-test-token",
            expiryRaw: expiry,
            baseURLRaw: "https://page-cancel.test"
        ))
    }

    override func tearDown() {
        PageCancelURLProtocolStub.handler = nil
        BackendAuthClient.clearSharedClientToken()
        UserDefaults.standard.removeObject(forKey: "client_token")
        UserDefaults.standard.removeObject(forKey: "client_token_expiry")
        UserDefaults.standard.removeObject(forKey: "client_token_base_url")
        UserDefaults.standard.removeObject(forKey: "client_token_cached_at")
        super.tearDown()
    }

    func testCancelPageLaneEncodesReservationIdReasonAndAuthHeaders() async throws {
        let recorder = PageCancelRequestRecorder()
        PageCancelURLProtocolStub.handler = { request in
            recorder.record(request)
            return Self.stub(for: request, pageCancelBody: Data(
                #"""
                {
                  "ok": true,
                  "cancelled": true,
                  "reservation_id": "res-123",
                  "session_id": "sess-9",
                  "dropped": ["res-123"],
                  "cancel_reason": "manual_typing",
                  "status": "cancelled"
                }
                """#.utf8
            ))
        }

        let client = makeClient()
        let result = try await client.cancelPageLane(
            reservationId: "res-123",
            sessionId: "sess-9",
            reason: "manual_typing"
        )

        XCTAssertEqual(result.ok, true)
        XCTAssertEqual(result.cancelled, true)
        XCTAssertEqual(result.reservationId, "res-123")
        XCTAssertEqual(result.dropped, ["res-123"])
        XCTAssertEqual(result.cancelReason, "manual_typing")

        let recorded = try XCTUnwrap(recorder.requests.first { $0.path == "/talk/page-cancel" })
        XCTAssertEqual(recorded.method, "POST")
        XCTAssertEqual(recorded.json["reservation_id"] as? String, "res-123")
        XCTAssertEqual(recorded.json["session_id"] as? String, "sess-9")
        XCTAssertEqual(recorded.json["reason"] as? String, "manual_typing")
        XCTAssertEqual(recorded.headers["content-type"], "application/json")
        XCTAssertEqual(recorded.headers["x-persona-key"], "clementine")
        XCTAssertFalse((recorded.headers["x-client-token"] ?? "").isEmpty)
        XCTAssertEqual(recorded.headers["x-session-id"], "sess-9")
    }

    func testCancelPageLaneBySessionOnlyUsesOwnerCancelShape() async throws {
        let recorder = PageCancelRequestRecorder()
        PageCancelURLProtocolStub.handler = { request in
            recorder.record(request)
            return Self.stub(for: request, pageCancelBody: Data(
                #"""
                {
                  "ok": true,
                  "cancelled": true,
                  "session_id": "sess-owner",
                  "dropped": ["a", "b"],
                  "cancel_reason": "barge_in"
                }
                """#.utf8
            ))
        }

        let client = makeClient()
        let result = try await client.cancelPageLane(
            reservationId: nil,
            sessionId: "sess-owner",
            reason: "barge_in"
        )

        XCTAssertEqual(result.ok, true)
        XCTAssertEqual(result.dropped.sorted(), ["a", "b"])
        let recorded = try XCTUnwrap(recorder.requests.first { $0.path == "/talk/page-cancel" })
        XCTAssertNil(recorded.json["reservation_id"])
        XCTAssertEqual(recorded.json["session_id"] as? String, "sess-owner")
        XCTAssertEqual(recorded.json["reason"] as? String, "barge_in")
    }

    func testCancelPageLaneMissingReservationIsSoftNoop() async throws {
        PageCancelURLProtocolStub.handler = { request in
            if request.url?.path == "/talk/page-cancel" {
                return PageCancelHTTPStub(
                    status: 404,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{"ok":false,"error":"reservation_not_found","reservation_id":"missing"}"#.utf8)
                )
            }
            return Self.stub(for: request, pageCancelBody: Data())
        }

        let client = makeClient()
        let result = try await client.cancelPageLane(
            reservationId: "missing",
            reason: "barge_in"
        )
        XCTAssertEqual(result.ok, false)
        XCTAssertEqual(result.cancelled, false)
        XCTAssertEqual(result.status, "reservation_not_found")
    }

    func testRecorderReadsStreamedBodyAndCaseInsensitiveHeaders() throws {
        var request = URLRequest(url: URL(string: "https://page-cancel.test/talk/page-cancel")!)
        request.httpMethod = "POST"
        request.httpBodyStream = InputStream(data: Data(#"{"session_id":"stream-owner","reason":"barge_in"}"#.utf8))
        request.setValue("application/json", forHTTPHeaderField: "CONTENT-TYPE")
        request.setValue("stream-owner", forHTTPHeaderField: "X-Session-Id")
        let recorder = PageCancelRequestRecorder()

        recorder.record(request)

        let recorded = try XCTUnwrap(recorder.requests.first)
        XCTAssertEqual(recorded.json["session_id"] as? String, "stream-owner")
        XCTAssertEqual(recorded.json["reason"] as? String, "barge_in")
        XCTAssertEqual(recorded.headers["content-type"], "application/json")
        XCTAssertEqual(recorded.headers["x-session-id"], "stream-owner")
    }

    private func makeClient() -> BackendClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [PageCancelURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let baseURL = URL(string: "https://page-cancel.test")!
        return BackendClient(
            baseURL: baseURL,
            fallbackURL: baseURL,
            urlSession: session,
            persistBackendBaseURL: false,
            attachUserIDHeader: false
        )
    }

    private static func stub(for request: URLRequest, pageCancelBody: Data) -> PageCancelHTTPStub {
        switch request.url?.path {
        case "/health":
            return PageCancelHTTPStub(
                status: 200,
                headers: ["Content-Type": "application/json"],
                body: Data(#"{"ok":true,"status":"up"}"#.utf8)
            )
        case "/session":
            return PageCancelHTTPStub(
                status: 200,
                headers: ["Content-Type": "application/json"],
                body: Data(#"{"client_token":"client-test-token","expires_in":3600}"#.utf8)
            )
        case "/talk/page-cancel":
            return PageCancelHTTPStub(
                status: 200,
                headers: ["Content-Type": "application/json"],
                body: pageCancelBody
            )
        default:
            return PageCancelHTTPStub(
                status: 404,
                headers: ["Content-Type": "application/json"],
                body: Data(#"{"error":"not_found"}"#.utf8)
            )
        }
    }
}

private struct PageCancelHTTPStub {
    let status: Int
    let headers: [String: String]
    let body: Data
}

private final class PageCancelRequestRecorder {
    struct Recorded {
        let method: String
        let path: String
        let headers: [String: String]
        let json: [String: Any]
    }

    private(set) var requests: [Recorded] = []

    func record(_ request: URLRequest) {
        let path = request.url?.path ?? ""
        let headers = (request.allHTTPHeaderFields ?? [:]).reduce(into: [String: String]()) {
            $0[$1.key.lowercased()] = $1.value
        }
        // URLSession hands URLProtocol stubs the body as a stream, not `httpBody`,
        // so drain the stream when needed and normalize header names for lookup.
        let json = (try? JSONSerialization.jsonObject(with: Self.bodyData(from: request) ?? Data())) as? [String: Any] ?? [:]
        requests.append(
            Recorded(
                method: request.httpMethod ?? "",
                path: path,
                headers: headers,
                json: json
            )
        )
    }

    private static func bodyData(from request: URLRequest) -> Data? {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }
        var data = Data()
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 1_024)
        defer { buffer.deallocate() }
        while stream.hasBytesAvailable {
            let count = stream.read(buffer, maxLength: 1_024)
            if count <= 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }
}

private final class PageCancelURLProtocolStub: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> PageCancelHTTPStub)?

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host == "page-cancel.test"
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let handler = Self.handler else {
            client?.urlProtocol(
                self,
                didFailWithError: NSError(domain: "PageCancelURLProtocolStub", code: 1)
            )
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
