import XCTest
@testable import them

final class BackendFirstPageTelemetryTests: XCTestCase {
    override func tearDown() {
        FirstPageTelemetryURLProtocolStub.handler = nil
        UserDefaults.standard.removeObject(forKey: "client_token")
        UserDefaults.standard.removeObject(forKey: "user_id")
        super.tearDown()
    }

    func testRecordFirstPageWrittenPostsOnlyContentFreeActivationFields() async throws {
        let recorder = FirstPageTelemetryRequestRecorder()
        FirstPageTelemetryURLProtocolStub.handler = { request in
            recorder.record(request)
            switch request.url?.path {
            case "/session":
                return FirstPageTelemetryHTTPStub(
                    status: 200,
                    body: Data(#"{ "client_token": "client-test", "expires_in": 3600, "remembered_names": [] }"#.utf8)
                )
            case "/telemetry/first-page-written":
                return FirstPageTelemetryHTTPStub(
                    status: 200,
                    body: Data(#"{ "schemaVersion": 1, "ok": true, "action": "recorded" }"#.utf8)
                )
            default:
                return FirstPageTelemetryHTTPStub(
                    status: 404,
                    body: Data(#"{ "error": "not_found" }"#.utf8)
                )
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [FirstPageTelemetryURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let api = BackendMemoryAPI(
            session: session,
            baseURL: URL(string: "https://first-page-telemetry.test")!
        )

        let result = try await api.recordFirstPageWritten(
            occurredAt: Date(timeIntervalSince1970: 1_700_000_000),
            source: "voice",
            projectId: "project-1",
            versionId: "version-2"
        )

        XCTAssertTrue(result.payload.ok)
        XCTAssertEqual(result.payload.action, "recorded")
        let request = try XCTUnwrap(recorder.requests.first { $0.path == "/telemetry/first-page-written" })
        XCTAssertEqual(request.method, "POST")
        XCTAssertEqual(request.body["occurred_at_ms"] as? Int, 1_700_000_000_000)
        XCTAssertEqual(request.body["source"] as? String, "voice")
        XCTAssertEqual(request.body["project_id"] as? String, "project-1")
        XCTAssertEqual(request.body["version_id"] as? String, "version-2")
        XCTAssertEqual(Set(request.body.keys), ["occurred_at_ms", "source", "project_id", "version_id"])
        XCTAssertNil(request.body["user_id"])
        XCTAssertNil(request.body["screenplay"])
        XCTAssertNil(request.body["prompt"])
        XCTAssertNil(request.body["transcript"])
    }
}

private struct FirstPageTelemetryHTTPStub {
    let status: Int
    let body: Data
}

private final class FirstPageTelemetryURLProtocolStub: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> FirstPageTelemetryHTTPStub)?

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host == "first-page-telemetry.test"
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
                headerFields: ["Content-Type": "application/json"]
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

private struct RecordedFirstPageTelemetryRequest {
    let method: String
    let path: String
    let body: [String: Any]
}

private final class FirstPageTelemetryRequestRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private(set) var requests: [RecordedFirstPageTelemetryRequest] = []

    func record(_ request: URLRequest) {
        let data = Self.bodyData(from: request) ?? Data()
        let body = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
        let record = RecordedFirstPageTelemetryRequest(
            method: request.httpMethod ?? "",
            path: request.url?.path ?? "",
            body: body
        )
        lock.lock()
        requests.append(record)
        lock.unlock()
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
