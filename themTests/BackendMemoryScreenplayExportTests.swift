import XCTest
@testable import them

final class BackendMemoryScreenplayExportTests: XCTestCase {
    override func tearDown() {
        ScreenplayExportURLProtocolStub.handler = nil
        UserDefaults.standard.removeObject(forKey: "client_token")
        UserDefaults.standard.removeObject(forKey: "user_id")
        super.tearDown()
    }

    func testMarkdownExportPostsMDFormatAndFallsBackToMDFilename() async throws {
        let recorder = ScreenplayExportRequestRecorder()
        ScreenplayExportURLProtocolStub.handler = { request in
            recorder.record(request)
            switch request.url?.path {
            case "/session":
                return ScreenplayExportHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "client_token": "client-test", "expires_in": 3600, "remembered_names": [] }"#.utf8)
                )
            case "/screenplay/export":
                return ScreenplayExportHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "text/markdown; charset=utf-8"],
                    body: Data("## INT. KITCHEN - NIGHT\n".utf8)
                )
            default:
                return ScreenplayExportHTTPStub(
                    status: 404,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "error": "not_found" }"#.utf8)
                )
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ScreenplayExportURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let api = BackendMemoryAPI(
            session: session,
            baseURL: URL(string: "https://screenplay-export.test")!
        )

        let artifact = try await api.exportScreenplayDraft(
            draft: "INT. KITCHEN - NIGHT\n",
            title: "Kitchen Scene",
            format: "md",
            projectId: "proj-1",
            versionId: "version-1"
        )

        XCTAssertEqual(artifact.format, "md")
        XCTAssertEqual(artifact.filename, "screenplay.md")
        XCTAssertEqual(artifact.contentType, "text/markdown; charset=utf-8")
        XCTAssertEqual(String(data: artifact.data, encoding: .utf8), "## INT. KITCHEN - NIGHT\n")

        let exportRequest = try XCTUnwrap(recorder.requests.first { $0.path == "/screenplay/export" })
        XCTAssertEqual(exportRequest.method, "POST")
        XCTAssertEqual(exportRequest.bodyObject?["format"] as? String, "md")
        XCTAssertEqual(exportRequest.bodyObject?["project_id"] as? String, "proj-1")
        XCTAssertEqual(exportRequest.bodyObject?["version_id"] as? String, "version-1")
    }

    func testFetchScreenplayExportFormatsDecodesExtensionField() async throws {
        let recorder = ScreenplayExportRequestRecorder()
        ScreenplayExportURLProtocolStub.handler = { request in
            recorder.record(request)
            switch request.url?.path {
            case "/session":
                return ScreenplayExportHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "client_token": "client-test", "expires_in": 3600, "remembered_names": [] }"#.utf8)
                )
            case "/screenplay/export/formats":
                return ScreenplayExportHTTPStub(
                    status: 200,
                    headers: [
                        "Content-Type": "application/json",
                        "Cache-Control": "no-store",
                    ],
                    body: Data(
                        #"""
                        {
                          "schemaVersion": 1,
                          "defaultFormat": "fountain",
                          "formats": [
                            {
                              "format": "md",
                              "extension": "md",
                              "mediaType": "text/markdown; charset=utf-8",
                              "description": "Markdown projection",
                              "supported": true
                            },
                            {
                              "format": "pdf",
                              "extension": "pdf",
                              "mediaType": "application/pdf",
                              "description": "Not supported locally",
                              "supported": false
                            }
                          ]
                        }
                        """#.utf8
                    )
                )
            default:
                return ScreenplayExportHTTPStub(
                    status: 404,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "error": "not_found" }"#.utf8)
                )
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ScreenplayExportURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let api = BackendMemoryAPI(
            session: session,
            baseURL: URL(string: "https://screenplay-export.test")!
        )

        let response = try await api.fetchScreenplayExportFormats()

        XCTAssertEqual(response.schemaVersion, 1)
        XCTAssertEqual(response.defaultFormat, "fountain")
        XCTAssertEqual(response.formats.count, 2)
        XCTAssertEqual(response.formats.first?.format, "md")
        XCTAssertEqual(response.formats.first?.fileExtension, "md")
        XCTAssertEqual(response.formats.first?.mediaType, "text/markdown; charset=utf-8")
        XCTAssertEqual(response.formats.last?.supported, false)

        let formatsRequest = try XCTUnwrap(recorder.requests.first { $0.path == "/screenplay/export/formats" })
        XCTAssertEqual(formatsRequest.method, "GET")
        XCTAssertNil(formatsRequest.bodyObject)
    }
}

private struct ScreenplayExportHTTPStub {
    let status: Int
    let headers: [String: String]
    let body: Data
}

private final class ScreenplayExportURLProtocolStub: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> ScreenplayExportHTTPStub)?

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host == "screenplay-export.test"
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

private struct RecordedScreenplayExportRequest {
    let method: String
    let path: String
    let bodyObject: [String: Any]?
}

private final class ScreenplayExportRequestRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private(set) var requests: [RecordedScreenplayExportRequest] = []

    func record(_ request: URLRequest) {
        let bodyObject: [String: Any]?
        if let body = Self.bodyData(from: request),
           let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any] {
            bodyObject = object
        } else {
            bodyObject = nil
        }

        let record = RecordedScreenplayExportRequest(
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
            if read > 0 {
                data.append(buffer, count: read)
            } else {
                break
            }
        }
        return data.isEmpty ? nil : data
    }
}
