import XCTest
@testable import them

final class BackendScreenplayOutlineMutationAPITests: XCTestCase {
    override func tearDown() {
        ScreenplayOutlineMutationSafeURLProtocolStub.handler = nil
        UserDefaults.standard.removeObject(forKey: "client_token")
        UserDefaults.standard.removeObject(forKey: "user_id")
        super.tearDown()
    }

    func testSafeOutlineMutationSendsExactBodyWithoutLegacyKeysOrServerTimes() async throws {
        let recorder = ScreenplayOutlineMutationSafeRequestRecorder()
        ScreenplayOutlineMutationSafeURLProtocolStub.handler = { request in
            recorder.record(request)
            return Self.stub(for: request, outlineResponse: Self.savedResponse)
        }

        let response = try await makeAPI().upsertScreenplayOutline(
            projectId: "project-safe",
            acts: Self.acts,
            scenes: Self.scenes,
            beats: Self.beats,
            expectedOutlineRevision: 7,
            clientRequestId: " request-safe-001 ",
            includeUserIdentity: false,
            includeAuthToken: false,
            clientTokenOverride: "owner-client-token"
        )

        XCTAssertEqual(response.payload.status, "saved")
        XCTAssertEqual(response.payload.replayed, false)
        XCTAssertEqual(response.payload.conflict, false)
        XCTAssertEqual(response.payload.clientRequestId, "request-safe-001")
        XCTAssertEqual(response.payload.expectedOutlineRevision, 7)
        XCTAssertEqual(response.payload.outlineRevision, 8)
        XCTAssertEqual(response.payload.committedRevision, 8)
        XCTAssertEqual(response.payload.project?.outlineRevision, 8)
        XCTAssertEqual(response.payload.outline?.revision, 8)

        let request = try XCTUnwrap(recorder.requests.first { $0.path == "/screenplay/projects/project-safe/outline" })
        XCTAssertEqual(request.method, "POST")
        XCTAssertEqual(request.headers["X-Client-Token"], "owner-client-token")
        XCTAssertNil(request.headers["X-User-Id"])
        XCTAssertNil(request.headers["Authorization"])

        let body = try XCTUnwrap(request.bodyObject)
        XCTAssertEqual(
            Set(body.keys),
            Set(["client_request_id", "expected_outline_revision", "acts", "scenes", "beats"])
        )
        XCTAssertEqual(body["client_request_id"] as? String, "request-safe-001")
        XCTAssertEqual(body["expected_outline_revision"] as? Int, 7)
        XCTAssertNil(body["merge"])
        XCTAssertNil(body["title"])
        XCTAssertNil(body["phase"])

        let act = try XCTUnwrap((body["acts"] as? [[String: Any]])?.first)
        let scene = try XCTUnwrap((body["scenes"] as? [[String: Any]])?.first)
        let beat = try XCTUnwrap((body["beats"] as? [[String: Any]])?.first)
        for entity in [act, scene, beat] {
            XCTAssertNil(entity["createdAt"])
            XCTAssertNil(entity["created_at"])
            XCTAssertNil(entity["updatedAt"])
            XCTAssertNil(entity["updated_at"])
        }
    }

    func testSafeOutlineMutationDecodesReplayedResponse() async throws {
        ScreenplayOutlineMutationSafeURLProtocolStub.handler = { request in
            Self.stub(for: request, outlineResponse: Self.replayedResponse)
        }

        let response = try await performMutation()

        XCTAssertEqual(response.payload.status, "replayed")
        XCTAssertEqual(response.payload.replayed, true)
        XCTAssertEqual(response.payload.conflict, false)
        XCTAssertEqual(response.payload.clientRequestId, "request-safe-001")
        XCTAssertEqual(response.payload.expectedOutlineRevision, 7)
        XCTAssertEqual(response.payload.outlineRevision, 8)
        XCTAssertEqual(response.payload.committedRevision, 8)
        XCTAssertEqual(response.payload.project?.outlineRevision, 8)
        XCTAssertEqual(response.payload.outline?.revision, 8)
    }

    func testSafeOutlineMutationThrowsTyped409WithCanonicalEnvelope() async throws {
        ScreenplayOutlineMutationSafeURLProtocolStub.handler = { request in
            Self.stub(
                for: request,
                outlineResponse: Self.staleResponse,
                status: 409
            )
        }

        do {
            _ = try await performMutation()
            XCTFail("Expected a typed outline mutation HTTP error.")
        } catch let error as BackendScreenplayOutlineMutationHTTPError {
            XCTAssertEqual(error.statusCode, 409)
            XCTAssertNil(error.retryAfterMs)
            XCTAssertEqual(error.response?.status, "stale_revision")
            XCTAssertEqual(error.response?.error, "stale_screenplay_outline_revision")
            XCTAssertEqual(error.response?.conflict, true)
            XCTAssertEqual(error.response?.replayed, false)
            XCTAssertEqual(error.response?.clientRequestId, "request-safe-001")
            XCTAssertEqual(error.response?.expectedOutlineRevision, 7)
            XCTAssertEqual(error.response?.outlineRevision, 9)
            XCTAssertEqual(error.response?.project?.id, "project-safe")
            XCTAssertEqual(error.response?.project?.outlineRevision, 9)
            XCTAssertEqual(error.response?.outline?.revision, 9)
            XCTAssertEqual(error.response?.outline?.acts.first?.id, "act-canonical")
        } catch {
            XCTFail("Expected BackendScreenplayOutlineMutationHTTPError, got \(error).")
        }
    }

    func testSafeOutlineMutation425PrefersBodyRetryDelay() async throws {
        ScreenplayOutlineMutationSafeURLProtocolStub.handler = { request in
            Self.stub(
                for: request,
                outlineResponse: Data(
                    #"{"stage":"screenplay_outline","status":"persistence_pending","error":"screenplay_outline_mutation_inflight","conflict":false,"replayed":false,"client_request_id":"request-safe-001","retry_after_ms":1750}"#.utf8
                ),
                status: 425,
                headers: ["Content-Type": "application/json", "Retry-After": "9"]
            )
        }

        do {
            _ = try await performMutation()
            XCTFail("Expected a typed outline mutation HTTP error.")
        } catch let error as BackendScreenplayOutlineMutationHTTPError {
            XCTAssertEqual(error.statusCode, 425)
            XCTAssertEqual(error.retryAfterMs, 1_750)
            XCTAssertEqual(error.response?.retryAfterMs, 1_750)
        } catch {
            XCTFail("Expected BackendScreenplayOutlineMutationHTTPError, got \(error).")
        }
    }

    func testSafeOutlineMutation425FallsBackToRetryAfterHeaderSeconds() async throws {
        ScreenplayOutlineMutationSafeURLProtocolStub.handler = { request in
            Self.stub(
                for: request,
                outlineResponse: Data(
                    #"{"stage":"screenplay_outline","status":"persistence_pending","error":"screenplay_outline_mutation_inflight"}"#.utf8
                ),
                status: 425,
                headers: ["Content-Type": "application/json", "Retry-After": "2"]
            )
        }

        do {
            _ = try await performMutation()
            XCTFail("Expected a typed outline mutation HTTP error.")
        } catch let error as BackendScreenplayOutlineMutationHTTPError {
            XCTAssertEqual(error.statusCode, 425)
            XCTAssertEqual(error.retryAfterMs, 2_000)
            XCTAssertNil(error.response?.retryAfterMs)
        } catch {
            XCTFail("Expected BackendScreenplayOutlineMutationHTTPError, got \(error).")
        }
    }

    func testSafeOutlineMutationBoundsHugeRetryAfterHeader() async throws {
        ScreenplayOutlineMutationSafeURLProtocolStub.handler = { request in
            Self.stub(
                for: request,
                outlineResponse: Data(
                    #"{"stage":"screenplay_outline","status":"persistence_pending","error":"screenplay_outline_mutation_inflight"}"#.utf8
                ),
                status: 425,
                headers: ["Content-Type": "application/json", "Retry-After": "999999999999999999"]
            )
        }

        do {
            _ = try await performMutation()
            XCTFail("Expected a typed outline mutation HTTP error.")
        } catch let error as BackendScreenplayOutlineMutationHTTPError {
            XCTAssertEqual(error.statusCode, 425)
            XCTAssertEqual(error.retryAfterMs, 1_800_000)
        } catch {
            XCTFail("Expected BackendScreenplayOutlineMutationHTTPError, got \(error).")
        }
    }

    private func makeAPI() -> BackendMemoryAPI {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ScreenplayOutlineMutationSafeURLProtocolStub.self]
        return BackendMemoryAPI(
            session: URLSession(configuration: configuration),
            baseURL: URL(string: "https://screenplay-outline-mutation-safe.test")!
        )
    }

    private func performMutation() async throws -> BackendReadResult<BackendScreenplayOutlineMutationResponse> {
        try await makeAPI().upsertScreenplayOutline(
            projectId: "project-safe",
            acts: Self.acts,
            scenes: Self.scenes,
            beats: Self.beats,
            expectedOutlineRevision: 7,
            clientRequestId: "request-safe-001"
        )
    }

    private static func stub(
        for request: URLRequest,
        outlineResponse: Data,
        status: Int = 200,
        headers: [String: String] = ["Content-Type": "application/json"]
    ) -> ScreenplayOutlineMutationSafeHTTPStub {
        if request.url?.path == "/session" {
            return ScreenplayOutlineMutationSafeHTTPStub(
                status: 200,
                headers: ["Content-Type": "application/json"],
                body: Data(#"{"client_token":"session-client-token","expires_in":3600,"remembered_names":[]}"#.utf8)
            )
        }
        if request.url?.path == "/screenplay/projects/project-safe/outline" {
            return ScreenplayOutlineMutationSafeHTTPStub(
                status: status,
                headers: headers,
                body: outlineResponse
            )
        }
        return ScreenplayOutlineMutationSafeHTTPStub(
            status: 404,
            headers: ["Content-Type": "application/json"],
            body: Data(#"{"error":"not_found"}"#.utf8)
        )
    }

    private static let acts = [
        BackendScreenplayAct(
            id: "act-1",
            title: "Act One",
            summary: "The opening movement.",
            order: 0,
            sceneIds: ["scene-1"],
            createdAt: 1_700_000_000_000,
            updatedAt: 1_700_000_000_100
        ),
    ]

    private static let scenes = [
        BackendScreenplayScene(
            id: "scene-1",
            slugline: "INT. LAB - NIGHT",
            title: "The Lab",
            objective: "Find the signal.",
            summary: "Mara traces the broadcast.",
            actId: "act-1",
            order: 0,
            status: "outlined",
            beatIds: ["beat-1"],
            createdAt: 1_700_000_000_200,
            updatedAt: 1_700_000_000_300
        ),
    ]

    private static let beats = [
        BackendScreenplayBeat(
            id: "beat-1",
            label: "Signal found",
            summary: "The transmission resolves into a voice.",
            sceneId: "scene-1",
            actId: "act-1",
            order: 0,
            status: "outlined",
            createdAt: 1_700_000_000_400,
            updatedAt: 1_700_000_000_500
        ),
    ]

    private static let savedResponse = Data(
        #"{"stage":"screenplay_outline","status":"saved","replayed":false,"conflict":false,"client_request_id":"request-safe-001","expected_outline_revision":7,"outline_revision":8,"committed_revision":8,"project_id":"project-safe","project":{"id":"project-safe","title":"Safe Project","outline_revision":8},"outline":{"revision":8,"act_count":1,"scene_count":1,"beat_count":1,"acts":[{"id":"act-1","title":"Act One"}],"scenes":[{"id":"scene-1","title":"The Lab"}],"beats":[{"id":"beat-1","label":"Signal found"}]}}"#.utf8
    )

    private static let replayedResponse = Data(
        #"{"stage":"screenplay_outline","status":"replayed","replayed":true,"conflict":false,"client_request_id":"request-safe-001","expected_outline_revision":7,"outline_revision":8,"committed_revision":8,"project_id":"project-safe","project":{"id":"project-safe","title":"Safe Project","outline_revision":8},"outline":{"revision":8,"acts":[{"id":"act-1","title":"Act One"}],"scenes":[{"id":"scene-1","title":"The Lab"}],"beats":[{"id":"beat-1","label":"Signal found"}]}}"#.utf8
    )

    private static let staleResponse = Data(
        #"{"stage":"screenplay_outline","status":"stale_revision","error":"stale_screenplay_outline_revision","conflict":true,"replayed":false,"client_request_id":"request-safe-001","expected_outline_revision":7,"outline_revision":9,"project_id":"project-safe","project":{"id":"project-safe","title":"Canonical Project","outline_revision":9},"outline":{"revision":9,"acts":[{"id":"act-canonical","title":"Canonical Act"}],"scenes":[],"beats":[]}}"#.utf8
    )
}

private struct ScreenplayOutlineMutationSafeHTTPStub {
    let status: Int
    let headers: [String: String]
    let body: Data
}

private final class ScreenplayOutlineMutationSafeURLProtocolStub: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> ScreenplayOutlineMutationSafeHTTPStub)?

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host == "screenplay-outline-mutation-safe.test"
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

private struct RecordedScreenplayOutlineMutationSafeRequest {
    let method: String
    let path: String
    let headers: [String: String]
    let bodyObject: [String: Any]?
}

private final class ScreenplayOutlineMutationSafeRequestRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var recordedRequests: [RecordedScreenplayOutlineMutationSafeRequest] = []

    var requests: [RecordedScreenplayOutlineMutationSafeRequest] {
        lock.lock()
        defer { lock.unlock() }
        return recordedRequests
    }

    func record(_ request: URLRequest) {
        let bodyObject: [String: Any]?
        if let body = Self.bodyData(from: request),
           let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any] {
            bodyObject = object
        } else {
            bodyObject = nil
        }
        let headers = request.allHTTPHeaderFields ?? [:]
        let record = RecordedScreenplayOutlineMutationSafeRequest(
            method: request.httpMethod ?? "",
            path: request.url?.path ?? "",
            headers: headers,
            bodyObject: bodyObject
        )
        lock.lock()
        recordedRequests.append(record)
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
        let bufferSize = 1_024
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
