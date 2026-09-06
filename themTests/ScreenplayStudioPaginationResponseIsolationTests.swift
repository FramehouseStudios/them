import XCTest
@testable import them

@MainActor
final class ScreenplayStudioPaginationResponseIsolationTests: XCTestCase {
    #if DEBUG
    func testDebugPagesFixturePreservesRawLineCoordinatesAcrossNewlineStyles() {
        let draft = "\r\n" + (1...24).map { "LINE \($0)" }.joined(separator: "\r") + "\r\n\r\n"
        let pages = ScreenplayStudioViewModel.paginationPagesForUITesting(draft: draft, linesPerPage: 24)

        XCTAssertEqual(pages.map(\.startLine), [1, 25])
        XCTAssertEqual(pages.map(\.endLine), [24, 27])
        XCTAssertEqual(pages.map(\.lineCount), [24, 3])
        XCTAssertEqual(pages.last?.preview, "LINE 24  ")
        XCTAssertTrue(ScreenplayStudioViewModel.paginationPagesForUITesting(
            draft: " \r\n\t\r", linesPerPage: 24
        ).isEmpty)
    }
    #endif

    func testCurrentResponseAppliesPagesAndSendsTheExactEditorDraft() async throws {
        try await withFixture { fixture in
            let draft = "\n\nINT. ROOM — DAY\n\nÉLODIE\nHello.  \n"
            fixture.select(project: "project-a", draft: draft)
            fixture.model.linesPerPage = 24
            fixture.model.paginationErrorText = "Previous failure"
            let refreshing = try await startRefresh(fixture)
            XCTAssertTrue(fixture.model.isPaginationRefreshing)
            let body = try XCTUnwrap(fixture.transport.bodies.first)
            XCTAssertEqual(body["draft"] as? String, draft)
            XCTAssertEqual(body["title"] as? String, "project-a")
            XCTAssertEqual(body["phase"] as? String, "scene_draft")
            XCTAssertEqual(body["lines_per_page"] as? Int, 24)
            fixture.transport.finish(index: 0, response: .success)
            await refreshing.value

            XCTAssertEqual(fixture.model.paginationPages, [PaginationIsolationFixture.responsePage])
            XCTAssertEqual(fixture.model.paginationErrorText, "")
            XCTAssertFalse(fixture.model.isPaginationRefreshing)
            XCTAssertEqual(fixture.model.fountainDraft, draft)
        }
    }

    func testSameTextProjectSwitchRejectsAnEarlierSuccess() async throws {
        try await verifyStaleResponse(.success, change: .project)
    }

    func testSwitchAwayAndBackRejectsAnEarlierSelectionSuccess() async throws {
        try await verifyStaleResponse(.success, change: .selectionRoundTrip)
    }

    func testSameUserAuthIntentChangeRejectsAnEarlierSuccess() async throws {
        try await verifyStaleResponse(.success, change: .authIntent)
    }

    func testWhitespaceOnlyEditsRejectAnEarlierSuccess() async throws {
        for change in [ContextChange.leadingBlankLine, .trailingWhitespace] {
            try await verifyStaleResponse(.success, change: change)
        }
    }

    func testChangedPageDensityRejectsAnEarlierSuccess() async throws {
        try await verifyStaleResponse(.success, change: .density)
    }

    func testLateErrorsCannotReplaceCurrentPageStateOrGuidance() async throws {
        for change in ContextChange.allCases {
            try await verifyStaleResponse(.failure, change: change)
        }
    }

    func testEarlierCompletionDoesNotClearANewerRefreshLoadingState() async throws {
        try await withFixture { fixture in
            fixture.select(project: "project-a", draft: "SAME DRAFT")
            let earlier = try await startRefresh(fixture)
            let current = try await startRefresh(fixture)
            fixture.model.paginationPages = [PaginationIsolationFixture.currentPage]
            fixture.model.paginationErrorText = "Current guidance"
            fixture.transport.finish(index: 0, response: .success)
            await earlier.value

            XCTAssertTrue(fixture.model.isPaginationRefreshing)
            XCTAssertEqual(fixture.model.paginationPages, [PaginationIsolationFixture.currentPage])
            XCTAssertEqual(fixture.model.paginationErrorText, "Current guidance")
            fixture.transport.finish(index: 1, response: .success)
            await current.value

            XCTAssertFalse(fixture.model.isPaginationRefreshing)
            XCTAssertEqual(fixture.model.paginationPages, [PaginationIsolationFixture.responsePage])
            XCTAssertEqual(fixture.model.paginationErrorText, "")
        }
    }

    func testClearingDraftInvalidatesPendingRefreshAndClearsLoading() async throws {
        try await withFixture { fixture in
            fixture.select(project: "project-a", draft: "OLD DRAFT")
            fixture.model.paginationPages = [PaginationIsolationFixture.currentPage]
            let earlier = try await startRefresh(fixture)
            fixture.model.fountainDraft = " \n\t"
            await fixture.model.refreshPagination(source: "Manual")
            XCTAssertFalse(fixture.model.isPaginationRefreshing)
            XCTAssertTrue(fixture.model.paginationPages.isEmpty)
            XCTAssertEqual(fixture.transport.bodies.count, 1, "Blank drafts must not send a request.")
            fixture.transport.finish(index: 0, response: .failure)
            await earlier.value

            XCTAssertFalse(fixture.model.isPaginationRefreshing)
            XCTAssertTrue(fixture.model.paginationPages.isEmpty)
            XCTAssertEqual(fixture.model.paginationErrorText, "")
        }
    }

    func testCurrentFailureKeepsPagesAndShowsRecoveryGuidance() async throws {
        try await withFixture { fixture in
            fixture.select(project: "project-a", draft: "CURRENT DRAFT")
            fixture.model.paginationPages = [PaginationIsolationFixture.currentPage]
            let refreshing = try await startRefresh(fixture)
            fixture.transport.finish(index: 0, response: .failure)
            await refreshing.value

            XCTAssertEqual(fixture.model.paginationPages, [PaginationIsolationFixture.currentPage])
            XCTAssertEqual(fixture.model.paginationErrorText, "Couldn't refresh page layout right now. Try again.")
            XCTAssertFalse(fixture.model.isPaginationRefreshing)
        }
    }

    func testBackgroundTransportFailureAfterProjectSwitchDoesNotRetry() async throws {
        try await verifyStaleTransportFailure(change: .project)
    }

    func testBackgroundTransportFailureAfterAuthIntentChangeDoesNotRetry() async throws {
        try await verifyStaleTransportFailure(change: .authIntent)
    }

    func testBackgroundTransportFailureAfterWhitespaceEditDoesNotRetry() async throws {
        try await verifyStaleTransportFailure(change: .leadingBlankLine)
    }

    func testCurrentBackgroundTransportFailureRetriesOnce() async throws {
        try await withFixture { fixture in
            fixture.select(project: "project-a", draft: "CURRENT DRAFT")
            let refreshing = try await startRefresh(fixture, source: "Draft")
            fixture.transport.automaticResponse = .success
            fixture.transport.finish(index: 0, response: .connectionLost)
            await refreshing.value

            XCTAssertEqual(fixture.transport.bodies.count, 2)
            XCTAssertEqual(fixture.transport.bodies.last?["draft"] as? String, "CURRENT DRAFT")
            XCTAssertEqual(fixture.model.paginationPages, [PaginationIsolationFixture.responsePage])
            XCTAssertEqual(fixture.model.paginationErrorText, "")
            XCTAssertFalse(fixture.model.isPaginationRefreshing)
        }
    }

    func testCancelledRefreshDoesNotSendOrReplaceCurrentPageGuidance() async throws {
        try await withFixture { fixture in
            fixture.select(project: "project-a", draft: "CURRENT DRAFT")
            fixture.model.paginationPages = [PaginationIsolationFixture.currentPage]
            fixture.model.paginationErrorText = "Current guidance"
            let refreshing = Task { await fixture.model.refreshPagination(source: "Manual") }
            refreshing.cancel()
            await refreshing.value

            XCTAssertTrue(fixture.transport.bodies.isEmpty)
            XCTAssertEqual(fixture.model.paginationPages, [PaginationIsolationFixture.currentPage])
            XCTAssertEqual(fixture.model.paginationErrorText, "Current guidance")
            XCTAssertFalse(fixture.model.isPaginationRefreshing)
        }
    }

    func testCancellingPendingRefreshClearsLoadingWithoutReplacingPageState() async throws {
        try await withFixture { fixture in
            fixture.select(project: "project-a", draft: "CURRENT DRAFT")
            let refreshing = try await startRefresh(fixture, source: "Draft")
            fixture.model.paginationPages = [PaginationIsolationFixture.currentPage]
            fixture.model.paginationErrorText = "Current guidance"
            refreshing.cancel()
            await refreshing.value

            XCTAssertEqual(fixture.transport.bodies.count, 1)
            XCTAssertEqual(fixture.model.paginationPages, [PaginationIsolationFixture.currentPage])
            XCTAssertEqual(fixture.model.paginationErrorText, "Current guidance")
            XCTAssertFalse(fixture.model.isPaginationRefreshing)
        }
    }

    func testAuthChangeDuringBootstrapDoesNotDispatchPagination() async throws {
        try await withFixture { fixture in
            fixture.select(project: "project-a", draft: "ORIGINAL ACCOUNT DRAFT")
            let bootstrapping = expectation(description: "Pagination is waiting for session bootstrap")
            fixture.transport.onSession = { bootstrapping.fulfill() }
            // If the guard regresses, finish the erroneous request so the test
            // fails on observed dispatch instead of waiting for an HTTP timeout.
            fixture.transport.automaticResponse = .success
            let refreshing = Task { await fixture.model.refreshPagination(source: "Draft") }
            await fulfillment(of: [bootstrapping], timeout: 3)
            _ = BackendAuthClient.reserveAuthSessionIntent()
            fixture.model.paginationPages = [PaginationIsolationFixture.currentPage]
            fixture.model.paginationErrorText = "New account guidance"
            fixture.transport.finishSession()
            await refreshing.value

            XCTAssertTrue(fixture.transport.bodies.isEmpty, "The old account's draft must never reach pagination.")
            XCTAssertEqual(fixture.model.paginationPages, [PaginationIsolationFixture.currentPage])
            XCTAssertEqual(fixture.model.paginationErrorText, "New account guidance")
            XCTAssertFalse(fixture.model.isPaginationRefreshing)
        }
    }

    func testLegacyCallerWithoutExplicitAuthIntentStillPaginates() async throws {
        try await withFixture { fixture in
            fixture.transport.automaticResponse = .success
            let result = try await fixture.api.paginateScreenplayDraft(draft: "LEGACY CALLER DRAFT")

            XCTAssertEqual(fixture.transport.bodies.count, 1)
            XCTAssertEqual(fixture.transport.bodies.first?["draft"] as? String, "LEGACY CALLER DRAFT")
            XCTAssertEqual(result.payload.pages, [PaginationIsolationFixture.responsePage])
        }
    }

    private func verifyStaleTransportFailure(change: ContextChange) async throws {
        try await withFixture { fixture in
            fixture.select(project: "project-a", draft: "ORIGINAL DRAFT")
            let refreshing = try await startRefresh(fixture, source: "Draft")
            change.apply(to: fixture)
            fixture.model.paginationPages = [PaginationIsolationFixture.currentPage]
            fixture.model.paginationErrorText = "Current page guidance"
            fixture.transport.automaticResponse = .success
            fixture.transport.finish(index: 0, response: .connectionLost)
            await refreshing.value

            XCTAssertEqual(fixture.transport.bodies.count, 1, "A stale \(change) refresh must not retransmit the old draft.")
            XCTAssertEqual(fixture.model.paginationPages, [PaginationIsolationFixture.currentPage])
            XCTAssertEqual(fixture.model.paginationErrorText, "Current page guidance")
            XCTAssertFalse(fixture.model.isPaginationRefreshing)
        }
    }

    private enum ContextChange: CaseIterable {
        case project, selectionRoundTrip, authIntent, leadingBlankLine, trailingWhitespace, density

        @MainActor
        func apply(to fixture: PaginationIsolationFixture) {
            switch self {
            case .project:
                fixture.select(project: "project-b", draft: fixture.model.fountainDraft)
            case .selectionRoundTrip:
                fixture.select(project: "project-b", draft: fixture.model.fountainDraft)
                fixture.select(project: "project-a", draft: fixture.model.fountainDraft)
            case .authIntent:
                _ = BackendAuthClient.reserveAuthSessionIntent()
            case .leadingBlankLine:
                fixture.model.fountainDraft = "\n" + fixture.model.fountainDraft
            case .trailingWhitespace:
                fixture.model.fountainDraft += "  \n"
            case .density:
                fixture.model.linesPerPage = 24
            }
        }
    }

    private func verifyStaleResponse(
        _ response: PaginationIsolationResponse,
        change: ContextChange
    ) async throws {
        try await withFixture { fixture in
            fixture.select(project: "project-a", draft: "SAME DRAFT")
            let refreshing = try await startRefresh(fixture)
            change.apply(to: fixture)
            fixture.model.paginationPages = [PaginationIsolationFixture.currentPage]
            fixture.model.paginationErrorText = "Current page guidance"
            let currentDraft = fixture.model.fountainDraft
            let currentProject = fixture.model.selectedProjectID
            fixture.transport.finish(index: 0, response: response)
            await refreshing.value

            XCTAssertEqual(fixture.model.paginationPages, [PaginationIsolationFixture.currentPage], "\(change)")
            XCTAssertEqual(fixture.model.paginationErrorText, "Current page guidance", "\(change)")
            XCTAssertEqual(fixture.model.fountainDraft, currentDraft)
            XCTAssertEqual(fixture.model.selectedProjectID, currentProject)
            XCTAssertFalse(fixture.model.isPaginationRefreshing, "Stale requests must still finish their own loading state.")
        }
    }

    private func startRefresh(
        _ fixture: PaginationIsolationFixture,
        source: String = "Manual"
    ) async throws -> Task<Void, Never> {
        let requested = expectation(description: "Pagination reached the HTTP transport")
        let previousRequestCount = fixture.transport.bodies.count
        fixture.transport.onRequest = { requested.fulfill() }
        let refreshing = Task { await fixture.model.refreshPagination(source: source) }
        await fulfillment(of: [requested], timeout: 3)
        fixture.transport.onRequest = nil
        guard fixture.transport.bodies.count > previousRequestCount else {
            refreshing.cancel()
            throw URLError(.timedOut)
        }
        return refreshing
    }

    private func withFixture(_ body: (PaginationIsolationFixture) async throws -> Void) async throws {
        let fixture = try PaginationIsolationFixture()
        do {
            try await body(fixture)
        } catch {
            await fixture.close()
            throw error
        }
        await fixture.close()
    }
}

@MainActor
private final class PaginationIsolationFixture {
    static let responsePage = BackendScreenplayPaginationPage(
        page: 1, startLine: 1, endLine: 8, lineCount: 8, preview: "RESPONSE PAGE", estMinutes: 0.15
    )
    static let currentPage = BackendScreenplayPaginationPage(
        page: 2, startLine: 25, endLine: 48, lineCount: 24, preview: "CURRENT PAGE", estMinutes: 0.44
    )
    let transport = PaginationIsolationTransport()
    let model: ScreenplayStudioViewModel
    let api: BackendMemoryAPI
    private let outbox: ScreenplayDraftSaveOutbox
    private let session: URLSession
    private let defaults: UserDefaults
    private let suite = "io.them.PaginationIsolation.\(UUID().uuidString)"
    private let directory = FileManager.default.temporaryDirectory.appendingPathComponent("PaginationIsolation-\(UUID().uuidString)")

    init() throws {
        defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        outbox = ScreenplayDraftSaveOutbox(storageDirectory: directory)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [PaginationIsolationURLProtocol.self]
        session = URLSession(configuration: configuration)
        api = BackendMemoryAPI(session: session, baseURL: URL(string: "https://\(UUID().uuidString).pagination-isolation.test")!)
        model = ScreenplayStudioViewModel(
            draftSaveOutbox: outbox,
            localDraftRecoveryStore: ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"),
            draftAPI: api,
            projectSelectionAPI: api
        )
        model.autosaveEnabled = false
        PaginationIsolationURLProtocol.transport = transport
    }

    func select(project: String, draft: String) {
        model.selectedProjectID = project
        model.selectedProject = try! JSONDecoder().decode(
            BackendScreenplayProjectSummary.self,
            from: JSONSerialization.data(withJSONObject: ["id": project, "title": project])
        )
        model.fountainDraft = draft
    }

    func close() async {
        model.fountainDraft = ""
        model.selectedProjectID = ""
        session.invalidateAndCancel()
        PaginationIsolationURLProtocol.transport = nil
        await outbox.stopNetworkMonitoring()
        defaults.removePersistentDomain(forName: suite)
        try? FileManager.default.removeItem(at: directory)
    }
}

private enum PaginationIsolationResponse {
    case success, failure, connectionLost

    var status: Int { self == .success ? 200 : 503 }
    var body: String {
        switch self {
        case .success:
            #"{"page_count":1,"line_count":8,"lines_per_page":24,"pages":[{"page":1,"start_line":1,"end_line":8,"line_count":8,"preview":"RESPONSE PAGE","est_minutes":0.15}]}"#
        case .failure, .connectionLost:
            #"{"error":"temporarily_unavailable"}"#
        }
    }
}

private final class PaginationIsolationTransport: @unchecked Sendable {
    private let lock = NSLock()
    private var connections: [PaginationIsolationURLProtocol?] = []
    private var requestBodies: [[String: Any]] = []
    private var callback: (() -> Void)?
    private var sessionCallback: (() -> Void)?
    private var pendingSession: PaginationIsolationURLProtocol?
    private var automaticResult: PaginationIsolationResponse?

    var onRequest: (() -> Void)? {
        get { lock.withLock { callback } }
        set { lock.withLock { callback = newValue } }
    }
    var bodies: [[String: Any]] { lock.withLock { requestBodies } }
    var onSession: (() -> Void)? {
        get { lock.withLock { sessionCallback } }
        set { lock.withLock { sessionCallback = newValue } }
    }
    var automaticResponse: PaginationIsolationResponse? {
        get { lock.withLock { automaticResult } }
        set { lock.withLock { automaticResult = newValue } }
    }

    func receive(_ connection: PaginationIsolationURLProtocol) {
        switch connection.request.url?.path {
        case "/screenplay/paginate":
            var data = connection.request.httpBody ?? Data()
            if data.isEmpty, let stream = connection.request.httpBodyStream {
                stream.open()
                defer { stream.close() }
                var buffer = [UInt8](repeating: 0, count: 4096)
                while stream.hasBytesAvailable {
                    let count = stream.read(&buffer, maxLength: buffer.count)
                    guard count > 0 else { break }
                    data.append(buffer, count: count)
                }
            }
            let body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
            let (onRequest, index, result) = lock.withLock {
                connections.append(connection)
                requestBodies.append(body)
                return (callback, connections.count - 1, automaticResult)
            }
            onRequest?()
            if let result { finish(index: index, response: result) }
        case "/session":
            let onSession = lock.withLock {
                pendingSession = connection
                return sessionCallback
            }
            if let onSession { onSession() } else { finishSession() }
        default:
            connection.respond(status: 404, body: #"{"error":"unexpected_test_request"}"#)
        }
    }

    func finish(index: Int, response: PaginationIsolationResponse) {
        let connection = lock.withLock {
            guard connections.indices.contains(index) else { return nil as PaginationIsolationURLProtocol? }
            defer { connections[index] = nil }
            return connections[index]
        }
        if response == .connectionLost {
            connection?.fail(URLError(.networkConnectionLost))
        } else {
            connection?.respond(status: response.status, body: response.body)
        }
    }

    func finishSession() {
        let connection = lock.withLock {
            defer { pendingSession = nil }
            return pendingSession
        }
        connection?.respond(status: 200, body: #"{"client_token":"pagination-isolation","expires_in":3600,"remembered_names":[]}"#)
    }
}

private final class PaginationIsolationURLProtocol: URLProtocol {
    nonisolated(unsafe) static var transport: PaginationIsolationTransport?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let transport = Self.transport else {
            client?.urlProtocol(self, didFailWithError: URLError(.cancelled))
            return
        }
        transport.receive(self)
    }
    override func stopLoading() {}
    func fail(_ error: Error) { client?.urlProtocol(self, didFailWithError: error) }
    func respond(status: Int, body: String) {
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
}
