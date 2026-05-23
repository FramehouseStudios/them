import XCTest
@testable import them

final class BackendScreenplayProjectActivationTests: XCTestCase {
    override func tearDown() {
        ScreenplayProjectActivationURLProtocolStub.handler = nil
        UserDefaults.standard.removeObject(forKey: "client_token")
        UserDefaults.standard.removeObject(forKey: "user_id")
        super.tearDown()
    }

    func testActivateScreenplayProjectPostsToActivationRoute() async throws {
        let recorder = ScreenplayProjectActivationRequestRecorder()
        ScreenplayProjectActivationURLProtocolStub.handler = { request in
            recorder.record(request)
            switch request.url?.path {
            case "/session":
                return ScreenplayProjectActivationHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "client_token": "client-test", "expires_in": 3600, "remembered_names": [] }"#.utf8)
                )
            case "/screenplay/projects/proj-2/activate":
                return ScreenplayProjectActivationHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "application/json"],
                    body: Data(
                        #"""
                        {
                          "stage": "screenplay_project_activate",
                          "status": "activated",
                          "project_id": "proj-2",
                          "screenplay_active_project_id": "proj-2",
                          "screenplay_project_count": 2,
                          "project": {
                            "id": "proj-2",
                            "title": "Second Project",
                            "updated_at": 1700000000000
                          }
                        }
                        """#.utf8
                    )
                )
            default:
                return ScreenplayProjectActivationHTTPStub(
                    status: 404,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "error": "not_found" }"#.utf8)
                )
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ScreenplayProjectActivationURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let api = BackendMemoryAPI(
            session: session,
            baseURL: URL(string: "https://screenplay-project-activation.test")!
        )

        let response = try await api.activateScreenplayProject(projectId: "proj-2")

        XCTAssertEqual(response.payload.status, "activated")
        XCTAssertEqual(response.payload.projectId, "proj-2")
        XCTAssertEqual(response.payload.screenplayActiveProjectId, "proj-2")
        XCTAssertEqual(response.payload.project?.id, "proj-2")

        let activateRequest = try XCTUnwrap(recorder.requests.first { $0.path == "/screenplay/projects/proj-2/activate" })
        XCTAssertEqual(activateRequest.method, "POST")
        XCTAssertEqual(activateRequest.bodyObject?.isEmpty, true)
    }
}

private struct ScreenplayProjectActivationHTTPStub {
    let status: Int
    let headers: [String: String]
    let body: Data
}

private final class ScreenplayProjectActivationURLProtocolStub: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> ScreenplayProjectActivationHTTPStub)?

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host == "screenplay-project-activation.test"
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

private struct RecordedScreenplayProjectActivationRequest {
    let method: String
    let path: String
    let bodyObject: [String: Any]?
}

private final class ScreenplayProjectActivationRequestRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private(set) var requests: [RecordedScreenplayProjectActivationRequest] = []

    func record(_ request: URLRequest) {
        let bodyObject: [String: Any]?
        if let body = Self.bodyData(from: request),
           let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any] {
            bodyObject = object
        } else {
            bodyObject = nil
        }

        let record = RecordedScreenplayProjectActivationRequest(
            method: request.httpMethod ?? "",
            path: request.url?.path ?? "",
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
