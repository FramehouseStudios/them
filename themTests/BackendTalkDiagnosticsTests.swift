import XCTest
@testable import them

final class BackendTalkDiagnosticsTests: XCTestCase {
    override func tearDown() {
        TalkDiagnosticsURLProtocolStub.handler = nil
        super.tearDown()
    }

    func testFetchTalkStatsDecodesSafePublicSummary() async throws {
        let recorder = TalkDiagnosticsRequestRecorder()
        TalkDiagnosticsURLProtocolStub.handler = { request in
            recorder.record(request)
            return TalkDiagnosticsHTTPStub(
                status: 200,
                headers: ["Content-Type": "application/json"],
                body: Data(
                    #"""
                    {
                      "schemaVersion": 1,
                      "total": 12,
                      "audioDurationMs": { "median": 400, "p90": 900, "max": 1200 },
                      "transcriptChars": { "median": 40, "p90": 120, "max": 200 },
                      "replyChars": { "median": 80, "p90": 240, "max": 400 },
                      "uniqueUserCount": 3,
                      "uniqueSessionCount": 4,
                      "replyRoleCounts": { "preview": 2, "final": 10 },
                      "authoritativePageTextRate": 0.75,
                      "syncReadyRate": 0.5,
                      "ageBuckets": { "last5min": 1, "last1h": 2, "last24h": 8, "older": 1 },
                      "newestCreatedAtMs": 1714838400000,
                      "oldestCreatedAtMs": 1714838000000
                    }
                    """#.utf8
                )
            )
        }

        let api = makeTalkDiagnosticsAPI()
        let response = try await api.fetchTalkStats()

        XCTAssertEqual(response.schemaVersion, 1)
        XCTAssertEqual(response.total, 12)
        XCTAssertEqual(response.audioDurationMs.p90, 900)
        XCTAssertEqual(response.replyRoleCounts.final, 10)
        XCTAssertEqual(response.ageBuckets.last24h, 8)
        XCTAssertEqual(response.diagnosticsSummary, "12 turns, 75% page text, 50% sync ready, p90 audio 900 ms")
        XCTAssertEqual(recorder.requests.map(\.path), ["/talk/stats"])
    }

    func testFetchTalkErrorsPassesSinceMsAndDecodesCounts() async throws {
        let recorder = TalkDiagnosticsRequestRecorder()
        TalkDiagnosticsURLProtocolStub.handler = { request in
            recorder.record(request)
            return TalkDiagnosticsHTTPStub(
                status: 200,
                headers: ["Content-Type": "application/json"],
                body: Data(
                    #"""
                    {
                      "schemaVersion": 1,
                      "total": 3,
                      "counts": { "supplier_unavailable": 2, "mint_failed": 1 },
                      "lastOccurrence": { "supplier_unavailable": 1714838400100, "mint_failed": 1714838400200 },
                      "sinceMs": 1714838300000,
                      "observedAtMs": 1714838400300,
                      "errorRatePerHour": 18.2
                    }
                    """#.utf8
                )
            )
        }

        let api = makeTalkDiagnosticsAPI()
        let response = try await api.fetchTalkErrors(sinceMs: 1_714_838_300_000)

        XCTAssertEqual(response.schemaVersion, 1)
        XCTAssertEqual(response.total, 3)
        XCTAssertEqual(response.counts["supplier_unavailable"], 2)
        XCTAssertEqual(response.errorRatePerHour, 18.2)
        XCTAssertEqual(response.diagnosticsSummary, "3 errors, 18.2/hr · supplier_unavailable 2, mint_failed 1")

        let request = try XCTUnwrap(recorder.requests.first)
        XCTAssertEqual(request.path, "/talk/errors")
        XCTAssertEqual(request.queryItems["sinceMs"], "1714838300000")
    }

    func testFetchMemoryStatsDecodesContentFreeCounts() async throws {
        let recorder = TalkDiagnosticsRequestRecorder()
        TalkDiagnosticsURLProtocolStub.handler = { request in
            recorder.record(request)
            return TalkDiagnosticsHTTPStub(
                status: 200,
                headers: ["Content-Type": "application/json"],
                body: Data(
                    #"""
                    {
                      "schemaVersion": 1,
                      "hasMemory": true,
                      "counts": {
                        "characters": 3,
                        "charactersWithVoice": 2,
                        "charactersWithTraits": 1,
                        "toneSignals": 4,
                        "habitSignals": 2
                      },
                      "lastUpdatedMs": 1714838400000
                    }
                    """#.utf8
                )
            )
        }

        let api = makeTalkDiagnosticsAPI()
        let response = try await api.fetchMemoryStats()

        XCTAssertEqual(response.schemaVersion, 1)
        XCTAssertTrue(response.hasMemory)
        XCTAssertEqual(response.counts.characters, 3)
        XCTAssertEqual(response.counts.charactersWithVoice, 2)
        XCTAssertEqual(response.counts.charactersWithTraits, 1)
        XCTAssertEqual(response.counts.toneSignals, 4)
        XCTAssertEqual(response.counts.habitSignals, 2)
        XCTAssertEqual(response.diagnosticsSummary, "3 characters · 2 voices · 1 trait sets · 4 tone signals · 2 habit signals")
        XCTAssertEqual(recorder.requests.map(\.path), ["/memory/stats"])
    }

    func testTurnMetadataRetriesAndRestoresOversizedScreenplayBatch() async throws {
        let recorder = TalkDiagnosticsRequestRecorder()
        let screenplayText = (1...90).map { index in
            """
            INT. EDITING ROOM \(index) - NIGHT

            Mara threads reel \(index) through the flatbed while Eli guards the door.

            MARA
            The truth changes shape every time we cut it. \(index)
            """
        }.joined(separator: "\n\n")
        XCTAssertGreaterThan(screenplayText.count, 8_000)

        TalkDiagnosticsURLProtocolStub.handler = { request in
            recorder.record(request)
            if recorder.requests.count == 1 {
                return TalkDiagnosticsHTTPStub(
                    status: 503,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{"error":"temporary"}"#.utf8)
                )
            }
            let body = try JSONSerialization.data(withJSONObject: [
                "turn_id": "turn-long-batch",
                "screenplay_output": [
                    "target": "page",
                    "format": "hollywood",
                    "source": "studio_target",
                    "text": screenplayText,
                    "lines": [],
                    "quality": [
                        "ok": true,
                        "reason": "ok",
                        "source": "studio_target",
                        "confidence": "authoritative",
                    ],
                ],
                "render_contract": [
                    "reply_role": "preview",
                    "authoritative_page_text_available": true,
                    "sync_ready": true,
                ],
            ])
            return TalkDiagnosticsHTTPStub(
                status: 200,
                headers: ["Content-Type": "application/json"],
                body: body
            )
        }

        let client = makeBackendClient()
        let output = try await client.fetchScreenplayOutputForTesting(
            baseURL: URL(string: "https://talk-diagnostics.test")!,
            userID: "user-long-batch",
            clientToken: "session-long-batch",
            turnID: "turn-long-batch"
        )

        XCTAssertEqual(recorder.requests.map(\.path), [
            "/talk/turn/turn-long-batch",
            "/talk/turn/turn-long-batch",
        ])
        XCTAssertEqual(output?.target, "page")
        XCTAssertEqual(output?.text, screenplayText)
        XCTAssertTrue(output?.writesToPage == true)
    }

    private func makeTalkDiagnosticsAPI() -> BackendMemoryAPI {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [TalkDiagnosticsURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        return BackendMemoryAPI(
            session: session,
            baseURL: URL(string: "https://talk-diagnostics.test")!
        )
    }

    private func makeBackendClient() -> BackendClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [TalkDiagnosticsURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let baseURL = URL(string: "https://talk-diagnostics.test")!
        return BackendClient(
            baseURL: baseURL,
            fallbackURL: baseURL,
            urlSession: session,
            persistBackendBaseURL: false,
            attachUserIDHeader: false
        )
    }
}

private struct TalkDiagnosticsHTTPStub {
    let status: Int
    let headers: [String: String]
    let body: Data
}

private final class TalkDiagnosticsRequestRecorder {
    private(set) var requests: [(path: String, queryItems: [String: String])] = []

    func record(_ request: URLRequest) {
        let components = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)
        let queryItems = Dictionary(
            uniqueKeysWithValues: (components?.queryItems ?? []).map { ($0.name, $0.value ?? "") }
        )
        requests.append((path: request.url?.path ?? "", queryItems: queryItems))
    }
}

private final class TalkDiagnosticsURLProtocolStub: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> TalkDiagnosticsHTTPStub)?

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host == "talk-diagnostics.test"
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let handler = Self.handler else {
            client?.urlProtocol(
                self,
                didFailWithError: NSError(domain: "TalkDiagnosticsURLProtocolStub", code: 1)
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
