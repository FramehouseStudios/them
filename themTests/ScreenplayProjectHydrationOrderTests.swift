import XCTest
@testable import them

final class ScreenplayProjectHydrationOrderTests: XCTestCase {
    @MainActor
    func testOlderSameProjectResponseCannotRewindNewerHydration() async throws {
        try await verifyOverlappingLoads(failOlder: false)
    }

    @MainActor
    func testOlderSameProjectFailureCannotReplaceNewerSuccessFeedback() async throws {
        try await verifyOverlappingLoads(failOlder: true)
    }

    @MainActor
    func testPendingHydrationCannotRewindExplicitFreshLoadServer() async throws {
        try await verifyOverlappingLoads(failOlder: false, loadServerChoice: true)
    }

    @MainActor
    func testOlderOutlineResponseCannotRewindNewerHydration() async throws {
        try await verifyOverlappingLoads(failOlder: false, holdOutline: true)
    }

    @MainActor
    func testPendingHydrationCannotRewindExactlyConfirmedManualSave() async throws {
        try await verifyOverlappingLoads(failOlder: false, saveChoice: true)
    }

    @MainActor
    private func verifyOverlappingLoads(failOlder: Bool, loadServerChoice: Bool = false,
        holdOutline: Bool = false, saveChoice: Bool = false) async throws {
        let suite = "them.hydration-order.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer {
            defaults.removePersistentDomain(forName: suite)
            try? FileManager.default.removeItem(at: directory)
            HydrationOrderURLProtocol.handler = nil
        }
        let transport = HydrationOrderTransport(holdOutline: holdOutline)
        let api = transport.api()
        let model = ScreenplayStudioViewModel(
            localDraftRecoveryStore: ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"),
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: directory),
            draftSaveAPI: api, projectSelectionAPI: api, conflictProjectLoader: { _ in
                try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
                    from: JSONSerialization.data(withJSONObject: ["id": "project", "title": "Newer title",
                        "activeVersionId": "newer", "versions": [["id": "newer",
                            "draft": "Newest words cafe\u{0301}\r\n", "updatedAt": 300]]]))
            })
        model.autosaveEnabled = false
        model.selectedProjectID = "project"
        model.selectedProject = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
            from: Data(#"{"id":"project","title":"Initial"}"#.utf8))
        model.applyStructuralUITestDraft("Saved base", versionID: "base")
        let older = Task { await model.refreshSelectedProjectForDebug() }
        await fulfillment(of: [transport.firstStarted], timeout: 3)
        if saveChoice {
            model.fountainDraft = "Newest words cafe\u{0301}\r\n"
            model.hasUnsavedDraftChanges = true
            await model.manualSaveDraft()
        } else if loadServerChoice {
            await model.handleDraftSaveConflict(.init(projectId: "project", baseVersionId: "base",
                serverVersionId: "newer", serverDraft: "Cached words", serverDraftExcerpt: "Cached", serverUpdatedAt: 300),
                ownerUserId: BackendAuthClient.currentAuthSessionState().user?.userId ?? "")
            await model.applyServerVersionFromConflict()?.value
        } else {
            await model.refreshSelectedProjectForDebug()
        }
        XCTAssertEqual(model.latestVersionID, "newer")
        let expectedTitle = (loadServerChoice || saveChoice) ? "Initial" : "Newer title"
        XCTAssertEqual(model.selectedProject?.title, expectedTitle)
        XCTAssertEqual(Array(model.fountainDraft.utf8), Array("Newest words cafe\u{0301}\r\n".utf8))
        let newerFeedback = model.infoText
        transport.releaseFirst(failing: failOlder)
        await older.value
        XCTAssertEqual(model.latestVersionID, "newer", "An old response is not the current project head.")
        XCTAssertEqual(model.selectedProject?.title, expectedTitle)
        XCTAssertEqual(Array(model.fountainDraft.utf8), Array("Newest words cafe\u{0301}\r\n".utf8))
        XCTAssertEqual(model.infoText, newerFeedback)
        XCTAssertEqual(model.errorText, "", "A superseded failure cannot replace successful feedback.")
        XCTAssertFalse(model.hasUnsavedDraftChanges)
        XCTAssertNil(model.conflictState)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }
}

private final class HydrationOrderTransport: @unchecked Sendable {
    let firstStarted = XCTestExpectation(description: "First project detail held")
    private let lock = NSLock()
    private var count = 0
    private var outlineCount = 0
    private let holdOutline: Bool
    private var held: HydrationOrderURLProtocol?
    init(holdOutline: Bool = false) { self.holdOutline = holdOutline }
    func api() -> BackendMemoryAPI {
        HydrationOrderURLProtocol.handler = { [self] stub in
            switch stub.request.url?.path {
            case "/session":
                stub.respond(Data(#"{"client_token":"hydration-fixture","expires_in":3600}"#.utf8))
            case "/screenplay/projects/project":
                let first = lock.withLock { () -> Bool in
                    count += 1
                    if count == 1 { if !holdOutline { held = stub }; return true }
                    return false
                }
                if first && holdOutline { respond(stub, newer: false) }
                else if first { firstStarted.fulfill() }
                else { respond(stub, newer: true) }
            case "/screenplay/projects/project/outline":
                let shouldHold = lock.withLock { () -> Bool in
                    outlineCount += 1
                    if holdOutline && outlineCount == 1 { held = stub; return true }
                    return false
                }
                if shouldHold { firstStarted.fulfill() }
                else { stub.respond(Data(#"{"status":"ok","outline":{"acts":[],"beats":[],"scenes":[]}}"#.utf8)) }
            case "/screenplay/projects/project/version":
                var body = stub.request.httpBody ?? Data()
                if let stream = stub.request.httpBodyStream {
                    stream.open(); defer { stream.close() }
                    var bytes = [UInt8](repeating: 0, count: 4096)
                    while stream.hasBytesAvailable {
                        let size = stream.read(&bytes, maxLength: bytes.count)
                        if size <= 0 { break }
                        body.append(contentsOf: bytes.prefix(size))
                    }
                }
                let request = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
                stub.respond(try! JSONSerialization.data(withJSONObject: ["status": "saved", "version_id": "newer",
                    "version": ["id": "newer", "draft": request?["draft"] as? String ?? ""]]))
            default:
                stub.client?.urlProtocol(stub, didFailWithError: URLError(.unsupportedURL))
            }
        }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [HydrationOrderURLProtocol.self]
        return BackendMemoryAPI(session: URLSession(configuration: config),
            baseURL: URL(string: "https://hydration-order.test")!, requestIdentityProvider: { _ in
                .init(sessionEpoch: 1, userID: "fixture", clientToken: "fixture", accessToken: "fixture")
            })
    }
    func releaseFirst(failing: Bool) {
        let stub = lock.withLock { let value = held; held = nil; return value }
        guard let stub else { return }
        if failing { stub.client?.urlProtocol(stub, didFailWithError: URLError(.timedOut)) }
        else { respond(stub, newer: false) }
    }
    private func respond(_ stub: HydrationOrderURLProtocol, newer: Bool) {
        let version = newer ? "newer" : "older"
        let project: [String: Any] = ["id": "project", "title": newer ? "Newer title" : "Older title",
            "activeVersionId": version, "versions": [["id": version,
                "draft": newer ? "Newest words cafe\u{0301}\r\n" : "Old words", "updatedAt": newer ? 300 : 200]]]
        stub.respond(try! JSONSerialization.data(withJSONObject: ["status": "ok", "project": project]))
    }
}

private final class HydrationOrderURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var handler: ((HydrationOrderURLProtocol) -> Void)?
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "hydration-order.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() { Self.handler?(self) }
    override func stopLoading() {}
    func respond(_ data: Data) {
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
}
