import XCTest
@testable import them

final class BackendPageCancelClientTests: XCTestCase {
    func testRequestCancellationRequiresMatchingAcknowledgement() async throws {
        for body in [#"{}"#, #"{"ok":true,"request_id":"different-turn"}"#,
                     #"{"ok":false,"request_id":"turn-123"}"#] {
            PageCancelURLProtocolStub.handler = { request in
                if request.url?.path == "/talk/page-cancel/request" {
                    return PageCancelHTTPStub(status: 200, headers: ["Content-Type": "application/json"],
                        body: Data(body.utf8))
                }
                return Self.stub(for: request, pageCancelBody: Data())
            }
            do {
                _ = try await makeClient().cancelPageLane(sessionId: "session", requestId: "turn-123")
                XCTFail("An unconfirmed turn must not clear cancellation tracking")
            } catch { }
        }
    }

    func testRequestCancellationAcceptsExactEarlyStopAcknowledgement() async throws {
        PageCancelURLProtocolStub.handler = { request in
            if request.url?.path == "/talk/page-cancel/request" {
                return PageCancelHTTPStub(status: 200, headers: ["Content-Type": "application/json"],
                    body: Data(#"{"ok":true,"request_id":"turn-123","cancelled":false,"dropped":[]}"#.utf8))
            }
            return Self.stub(for: request, pageCancelBody: Data())
        }
        let result = try await makeClient().cancelPageLane(sessionId: "session", requestId: "turn-123")
        XCTAssertTrue(result.ok)
        XCTAssertFalse(result.cancelled)
    }

    func testRequestCancellationDoesNotFallBackOnAnOldServer() async throws {
        let recorder = PageCancelRequestRecorder()
        PageCancelURLProtocolStub.handler = { request in
            recorder.record(request)
            return Self.stub(for: request, pageCancelBody: Data())
        }
        do {
            _ = try await makeClient().cancelPageLane(sessionId: "session", requestId: "turn-123")
            XCTFail("An unsupported request endpoint must fail, not cancel the session")
        } catch { }
        let requests = recorder.requests.filter { $0.path.contains("page-cancel") }
        XCTAssertEqual(requests.count, 1)
        XCTAssertEqual(requests.first?.path, "/talk/page-cancel/request")
        XCTAssertEqual(requests.first?.json["request_id"] as? String, "turn-123")
    }

    override func setUp() {
        super.setUp()
        UserDefaults.standard.set("client-test-token", forKey: "client_token")
        let expiry = ISO8601DateFormatter().string(from: Date().addingTimeInterval(3600))
        UserDefaults.standard.set(expiry, forKey: "client_token_expiry")
        UserDefaults.standard.set("https://page-cancel.test", forKey: "client_token_base_url")
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "client_token_cached_at")
    }

    override func tearDown() {
        PageCancelURLProtocolStub.handler = nil
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
        XCTAssertEqual(recorded.headers["Content-Type"], "application/json")
        XCTAssertEqual(recorded.headers["X-Persona-Key"], "clementine")
        XCTAssertFalse((recorded.headers["X-Client-Token"] ?? "").isEmpty)
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
        let headers = request.allHTTPHeaderFields ?? [:]
        // URLSession hands URLProtocol stubs the body as a stream, not `httpBody`,
        // so drain the stream when the data property is nil (same as the other recorders).
        let bodyData: Data = request.httpBody ?? {
            guard let stream = request.httpBodyStream else { return Data() }
            stream.open()
            defer { stream.close() }
            var data = Data()
            let bufferSize = 4096
            let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
            defer { buffer.deallocate() }
            while stream.hasBytesAvailable {
                let read = stream.read(buffer, maxLength: bufferSize)
                if read <= 0 { break }
                data.append(buffer, count: read)
            }
            return data
        }()
        let json = (try? JSONSerialization.jsonObject(with: bodyData)) as? [String: Any] ?? [:]
        requests.append(
            Recorded(
                method: request.httpMethod ?? "",
                path: path,
                headers: headers,
                json: json
            )
        )
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
