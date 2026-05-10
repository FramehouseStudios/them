import XCTest
import ScreenplayStudio
@testable import them

final class BackendClientCraftAPITests: XCTestCase {
    func testFetchesCraftFrameworksAndSchemasWithVersionHeader() async throws {
        let recorder = CraftRequestRecorder()
        let client = makeClient(recorder: recorder) { request in
            switch request.url?.path {
            case "/craft/frameworks":
                return .json(#"""
                {
                  "schemaVersion": 1,
                  "frameworks": [
                    { "id": "save-the-cat", "title": "Save the Cat!", "version": "1.0" }
                  ]
                }
                """#)
            case "/craft/frameworks/save-the-cat":
                return .json(Self.frameworkJSON)
            case "/craft/schemas/report":
                return .json(#"{ "$schema": "http://json-schema.org/draft-07/schema#", "title": "Report" }"#)
            default:
                return .json(#"{ "error": "not_found" }"#, status: 404)
            }
        }

        let frameworks = try await client.fetchCraftFrameworks()
        let framework = try await client.fetchCraftFramework(id: "save-the-cat")
        let schema = try await client.fetchCraftReportSchema()

        XCTAssertEqual(frameworks.schemaVersion, 1)
        XCTAssertEqual(frameworks.frameworks.first?.id, "save-the-cat")
        XCTAssertEqual(framework.beats.count, 1)
        XCTAssertEqual(schema["title"]?.stringValue, "Report")
        XCTAssertEqual(recorder.paths, [
            "/craft/frameworks",
            "/craft/frameworks/save-the-cat",
            "/craft/schemas/report"
        ])
        XCTAssertTrue(recorder.allHeaders(named: "X-Craft-Schema-Version").allSatisfy { $0 == "1" })
    }

    func testAnalyzeReportAndSnapshotUseCamelCaseContract() async throws {
        let recorder = CraftRequestRecorder()
        let client = makeClient(recorder: recorder) { request in
            switch request.url?.path {
            case "/craft/analyze":
                return .json(Self.reportJSON)
            case "/craft/reports/proj-17/v1":
                return .json(Self.reportJSON)
            default:
                return .json(#"{ "error": "not_found" }"#, status: 404)
            }
        }

        let screenplay = ScreenplayCraftAnalysisScreenplay(
            title: "Vapor Trail",
            pageCount: 102,
            text: "INT. CAR - DUSK\n\nA radio sputters.",
            scenes: []
        )
        let analyzed = try await client.analyzeCraft(
            projectId: "proj-17",
            versionId: "v1",
            frameworkId: "save-the-cat",
            screenplay: screenplay
        )
        let fetched = try await client.fetchCraftReport(projectId: "proj-17", versionId: "v1")
        let snapshot = try await client.fetchCraftSnapshot(projectId: "proj-17", versionId: "v1")

        XCTAssertEqual(analyzed.framework.id, "save-the-cat")
        XCTAssertEqual(fetched.missingRequiredMajorTurns.map(\.turnId), ["all-is-lost"])
        XCTAssertEqual(snapshot?.id, "snap_proj17_v1")

        let analyzeBody = try XCTUnwrap(recorder.requests.first?.bodyObject)
        XCTAssertEqual(analyzeBody["projectId"] as? String, "proj-17")
        XCTAssertEqual(analyzeBody["versionId"] as? String, "v1")
        XCTAssertEqual(analyzeBody["frameworkId"] as? String, "save-the-cat")
        let screenplayBody = try XCTUnwrap(analyzeBody["screenplay"] as? [String: Any])
        XCTAssertEqual(screenplayBody["pageCount"] as? Int, 102)
    }

    func testOverrideMutationAndDeleteBuildExpectedRequests() async throws {
        let recorder = CraftRequestRecorder()
        let client = makeClient(recorder: recorder) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("POST", "/craft/overrides"):
                return .json(#"""
                {
                  "id": "override-1",
                  "turnId": "all-is-lost",
                  "action": "mark_false_positive",
                  "reason": "This is a dream beat, not the actual low point.",
                  "sceneId": "s040",
                  "page": 76,
                  "userId": "usr_test",
                  "createdAt": "2026-05-09T22:10:00Z"
                }
                """#)
            case ("DELETE", "/craft/overrides/override-1"):
                return .json(#"{ "ok": true }"#)
            default:
                return .json(#"{ "error": "not_found" }"#, status: 404)
            }
        }

        let override = try await client.recordCraftTurnOverride(ScreenplayCraftTurnOverrideMutation(
            turnId: "all-is-lost",
            action: "mark_false_positive",
            reason: "This is a dream beat, not the actual low point.",
            sceneId: "s040",
            page: 76,
            userId: "usr_test",
            expiresAt: nil
        ))
        let deleted = try await client.deleteCraftTurnOverride(id: "override-1")

        XCTAssertEqual(override.id, "override-1")
        XCTAssertTrue(deleted)
        XCTAssertEqual(recorder.methodsAndPaths, [
            "POST /craft/overrides",
            "DELETE /craft/overrides/override-1"
        ])
        XCTAssertEqual(recorder.requests.first?.bodyObject?["turnId"] as? String, "all-is-lost")
        XCTAssertEqual(recorder.requests.first?.bodyObject?["action"] as? String, "mark_false_positive")
    }

    func testCraftUnavailableErrorUsesTypedEnvelope() async throws {
        let client = makeClient(recorder: CraftRequestRecorder()) { _ in
            .json(#"{ "error": "craft_runtime_unavailable" }"#, status: 503)
        }

        do {
            _ = try await client.fetchCraftFramework(id: "missing")
            XCTFail("Expected craft error")
        } catch BackendError.stage(let stage, let message) {
            XCTAssertEqual(stage, "craft")
            XCTAssertEqual(message, "craft_runtime_unavailable")
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    private func makeClient(
        recorder: CraftRequestRecorder,
        handler: @escaping (URLRequest) throws -> CraftHTTPStub
    ) -> BackendClient {
        CraftURLProtocolStub.handler = { request in
            recorder.record(request)
            return try handler(request)
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [CraftURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let baseURL = URL(string: "https://craft.test")!
        return BackendClient(baseURL: baseURL, fallbackURL: baseURL, urlSession: session, persistBackendBaseURL: false)
    }

    private static let frameworkJSON = #"""
    {
      "id": "save-the-cat",
      "title": "Save the Cat!",
      "summary": "Feature beat sheet.",
      "version": "1.0",
      "requiredMajorTurnIds": ["catalyst"],
      "beats": [
        {
          "id": "catalyst",
          "label": "Catalyst",
          "summary": "Inciting incident.",
          "expectedPageRange": { "start": 12, "end": 12 },
          "required": true,
          "majorTurnId": "catalyst"
        }
      ]
    }
    """#

    private static let reportJSON = #"""
    {
      "id": "report_proj17_v1_drifting",
      "schemaVersion": 1,
      "projectId": "proj-17",
      "versionId": "v1",
      "screenplayTitle": "Vapor Trail",
      "generatedAt": "2026-05-09T18:15:00Z",
      "generatedBy": "craft-analysis-stub@1.0",
      "framework": { "id": "save-the-cat", "title": "Save the Cat!", "version": "1.0" },
      "pageCount": 102,
      "summary": "All Is Lost is missing.",
      "coverage": {
        "requiredMajorTurnCount": 1,
        "detectedMajorTurnCount": 0,
        "overriddenMajorTurnCount": 0,
        "missingMajorTurnCount": 1,
        "complete": false,
        "confidence": 0.74
      },
      "beatSheet": {
        "id": "beats_proj17_v1",
        "frameworkId": "save-the-cat",
        "title": "Save the Cat! - Vapor Trail",
        "beats": [
          {
            "id": "b_all_lost",
            "frameworkBeatId": "all-is-lost",
            "label": "All Is Lost",
            "expectedPageRange": { "start": 75, "end": 75 },
            "status": "missing",
            "confidence": 0.12,
            "classificationSource": "stub",
            "evidence": [],
            "majorTurnId": "all-is-lost"
          }
        ]
      },
      "majorTurns": [
        {
          "id": "mt_all_lost",
          "turnId": "all-is-lost",
          "label": "All Is Lost",
          "required": true,
          "expectedPage": 75,
          "expectedPageRange": { "start": 75, "end": 75 },
          "status": "missing",
          "detected": false,
          "confidence": 0.12,
          "evidence": []
        }
      ],
      "drift": {
        "status": "drifting",
        "summary": "All Is Lost is absent.",
        "timeline": [
          {
            "id": "td_all_lost",
            "turnId": "all-is-lost",
            "label": "All Is Lost",
            "expectedPage": 75,
            "status": "missing"
          }
        ]
      },
      "overrides": [],
      "snapshot": {
        "id": "snap_proj17_v1",
        "projectId": "proj-17",
        "versionId": "v1",
        "reportId": "report_proj17_v1_drifting",
        "frameworkId": "save-the-cat",
        "createdAt": "2026-05-09T18:16:00Z"
      }
    }
    """#
}

private struct CraftHTTPStub {
    let status: Int
    let body: Data

    static func json(_ raw: String, status: Int = 200) -> CraftHTTPStub {
        CraftHTTPStub(status: status, body: Data(raw.utf8))
    }
}

private final class CraftURLProtocolStub: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> CraftHTTPStub)?

    override class func canInit(with request: URLRequest) -> Bool {
        true
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

private struct RecordedCraftRequest {
    let method: String
    let path: String
    let headers: [String: String]
    let bodyObject: [String: Any]?
}

private final class CraftRequestRecorder {
    private let lock = NSLock()
    private(set) var requests: [RecordedCraftRequest] = []

    var paths: [String] {
        lock.withLock { requests.map(\.path) }
    }

    var methodsAndPaths: [String] {
        lock.withLock { requests.map { "\($0.method) \($0.path)" } }
    }

    func allHeaders(named name: String) -> [String] {
        lock.withLock { requests.compactMap { $0.headers[name] } }
    }

    func record(_ request: URLRequest) {
        let bodyObject: [String: Any]? = {
            let data = request.httpBody ?? request.httpBodyStream?.readAllData()
            guard let data else { return nil }
            return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        }()
        let recorded = RecordedCraftRequest(
            method: request.httpMethod ?? "",
            path: request.url?.path ?? "",
            headers: request.allHTTPHeaderFields ?? [:],
            bodyObject: bodyObject
        )
        lock.withLock {
            requests.append(recorded)
        }
    }
}

private extension InputStream {
    func readAllData() -> Data {
        open()
        defer { close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while hasBytesAvailable {
            let count = read(&buffer, maxLength: buffer.count)
            if count > 0 {
                data.append(buffer, count: count)
            } else {
                break
            }
        }
        return data
    }
}

private extension NSLock {
    func withLock<T>(_ body: () -> T) -> T {
        lock()
        defer { unlock() }
        return body()
    }
}
