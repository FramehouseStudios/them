import XCTest
@testable import them

final class ScreenplayCollaborationScopeTests: XCTestCase {
    @MainActor func testLateCollaboratorsCannotSelectPreviousProject() async throws {
        try await verifyLateResult(path: "collaborators", mutation: false, failing: false)
    }
    @MainActor func testLateCommentsCannotSelectPreviousProject() async throws {
        try await verifyLateResult(path: "comments", mutation: false, failing: false)
    }
    @MainActor func testLateCommentSaveCannotClearNewProjectComposer() async throws {
        try await verifyLateResult(path: "comments", mutation: true, failing: false)
    }
    @MainActor func testLateCollaborationFailureCannotOverwriteNewProjectFeedback() async throws {
        try await verifyLateResult(path: "collaborators", mutation: false, failing: true)
    }
    @MainActor func testLateApproveCannotSelectPreviousProject() async throws {
        try await verifyLateResult(path: "collaborators", mutation: true, failing: false, action: "approve")
    }
    @MainActor func testLateRevokeCannotSelectPreviousProject() async throws {
        try await verifyLateResult(path: "collaborators", mutation: true, failing: false, action: "revoke")
    }
    @MainActor func testLateDeleteCannotClearNewProjectComposer() async throws {
        try await verifyLateResult(path: "comments", mutation: true, failing: false, action: "delete")
    }
    @MainActor func testLateResolveCannotSelectPreviousProject() async throws {
        try await verifyLateResult(path: "comments", mutation: true, failing: false, action: "resolve")
    }
    @MainActor func testSwitchingAwayAndBackStillRejectsOldResponse() async throws {
        try await verifyLateResult(path: "comments", mutation: true, failing: false, selection: "aba")
    }
    @MainActor func testAuthInvalidationRejectsPendingCommentAcknowledgement() async throws {
        try await verifyLateResult(path: "comments", mutation: true, failing: false, selection: "auth")
    }
    @MainActor func testSameProjectAcknowledgementPreservesNewComposerWords() async throws {
        try await verifyLateResult(path: "comments", mutation: true, failing: false, selection: "same")
    }
    @MainActor func testUnchangedCurrentCommentSaveAppliesAndClearsSubmittedComposer() async throws {
        try await verifyLateResult(path: "comments", mutation: true, failing: false, selection: "same", editComposer: false)
    }
    @MainActor func testCurrentRefreshAppliesBothCollections() async throws {
        try await verifyLateResult(path: "collaborators", mutation: false, failing: false, selection: "same")
    }
    @MainActor func testRefreshCannotOvertakePendingCommentSave() async throws {
        try await verifyLateResult(path: "comments", mutation: true, failing: false, selection: "same", interleave: "refresh")
    }
    @MainActor func testDuplicateCommentSaveDoesNotDispatchAnotherMutation() async throws {
        try await verifyLateResult(path: "comments", mutation: true, failing: false, selection: "same", interleave: "duplicate")
    }
    @MainActor func testMismatchedCurrentResponseIsRejectedWithoutClearingComposer() async throws {
        try await verifyLateResult(path: "comments", mutation: true, failing: false, selection: "same", responseProjectID: "wrong")
    }
    @MainActor func testSupersededManualRefreshFailureCannotReplaceCurrentMutationFeedback() async throws {
        try await verifyLateResult(path: "collaborators", mutation: false, failing: true, selection: "same", interleave: "write")
    }
    @MainActor func testCurrentApprovalPreservesNewFormNotes() async throws {
        try await verifyLateResult(path: "collaborators", mutation: true, failing: false, action: "approve", selection: "same")
    }

    @MainActor private func verifyLateResult(path: String, mutation: Bool, failing: Bool,
        action: String = "save", selection: String = "new", editComposer: Bool = true,
        interleave: String = "", responseProjectID: String? = nil) async throws {
        let suite = "them.collaboration-scope.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let transport = CollaborationScopeTransport(heldPath: path)
        defer {
            defaults.removePersistentDomain(forName: suite)
            try? FileManager.default.removeItem(at: directory)
            CollaborationScopeURLProtocol.handler = nil
        }
        let model = ScreenplayStudioViewModel(
            localDraftRecoveryStore: ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"),
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: directory),
            projectSelectionAPI: transport.api())
        model.autosaveEnabled = false
        model.selectedProjectID = "old"
        model.selectedProject = project("old")
        model.commentText = "Original comment"
        model.collaboratorEmail = "fixture@example.test"
        let comment = try JSONDecoder().decode(BackendScreenplayComment.self,
            from: Data(#"{"id":"old-comment","projectId":"old","text":"Original"}"#.utf8))
        let request = Task {
            if mutation {
                switch action {
                case "approve": await model.approveCollaborator()
                case "revoke": await model.revokeCollaborator(email: "fixture@example.test")
                case "delete": await model.deleteComment(comment)
                case "resolve": await model.setCommentResolved(comment, resolved: true)
                default: await model.addComment()
                }
            }
            else { await model.refreshCollaborationData(source: "Manual retry") }
        }
        await fulfillment(of: [transport.started], timeout: 3)
        if interleave == "refresh" { await model.refreshCollaborationData() }
        if interleave == "duplicate" { await model.addComment() }
        if interleave == "write" { await model.addComment() }
        if selection == "new" || selection == "aba" {
            model.selectedProjectID = "new"
            model.selectedProject = project("new")
            if selection == "aba" { model.selectedProjectID = "old"; model.selectedProject = project("old") }
        }
        if selection == "auth" { _ = BackendAuthClient.reserveAuthSessionIntent() }
        if interleave != "write" { model.collaborators = []; model.comments = [] }
        if editComposer { model.commentText = "New project's unsaved words cafe\u{0301}\r\n" }
        model.collaboratorNote = "New form words"
        model.infoText = "New project ready"
        model.collaborationErrorText = ""
        transport.release(failing: failing, responseProjectID: responseProjectID)
        await request.value
        let expectedID = selection == "new" ? "new" : "old"
        XCTAssertEqual(model.selectedProjectID, expectedID)
        XCTAssertEqual(model.selectedProject?.id, expectedID)
        let valid = selection == "same" && responseProjectID == nil
        let expectedComposer = valid && mutation && action == "save" && !editComposer ? "" :
            (editComposer ? "New project's unsaved words cafe\u{0301}\r\n" : "Original comment")
        XCTAssertEqual(Array(model.commentText.utf8), Array(expectedComposer.utf8))
        XCTAssertEqual(model.comments.count, valid && (path == "comments" || !mutation) ? 1 : 0)
        XCTAssertEqual(model.collaborators.count, valid && (path == "collaborators" || !mutation) && !failing ? 1 : 0)
        XCTAssertEqual(model.infoText, valid && mutation ? (action == "approve" ? "Collaborator approved." : "Comment saved.") : "New project ready")
        XCTAssertEqual(model.collaboratorNote, "New form words")
        XCTAssertEqual(model.collaborationErrorText, "")
        if responseProjectID != nil { XCTAssertFalse(model.errorText.isEmpty) }
        else { XCTAssertEqual(model.errorText, "") }
        XCTAssertFalse(model.isCollaborationRefreshing)
        if mutation { XCTAssertEqual(transport.mutationRequestCount, 1) }
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }
    private func project(_ id: String) -> BackendScreenplayProjectSummary {
        try! JSONDecoder().decode(BackendScreenplayProjectSummary.self,
            from: JSONSerialization.data(withJSONObject: ["id": id, "title": id]))
    }
}

private final class CollaborationScopeTransport: @unchecked Sendable {
    let started = XCTestExpectation(description: "Collaboration request held")
    private let lock = NSLock()
    private let heldPath: String
    private var held: CollaborationScopeURLProtocol?
    private var didHold = false
    private var mutationCount = 0
    var mutationRequestCount: Int { lock.withLock { mutationCount } }
    init(heldPath: String) { self.heldPath = heldPath }
    func api() -> BackendMemoryAPI {
        CollaborationScopeURLProtocol.handler = { [self] stub in
            let path = stub.request.url?.lastPathComponent ?? ""
            if stub.request.httpMethod == "POST" && path != "session" { lock.withLock { mutationCount += 1 } }
            if path == "session" {
                stub.respond(Data(#"{"client_token":"collaboration-fixture","expires_in":3600}"#.utf8))
            } else {
                let shouldHold = lock.withLock { () -> Bool in
                    if path == heldPath && !didHold { held = stub; didHold = true; return true }
                    return false
                }
                if shouldHold { started.fulfill() } else { respond(stub) }
            }
        }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [CollaborationScopeURLProtocol.self]
        return BackendMemoryAPI(session: URLSession(configuration: config),
            baseURL: URL(string: "https://collaboration-scope.test")!, requestIdentityProvider: { _ in
                .init(sessionEpoch: 1, userID: "fixture", clientToken: "fixture", accessToken: "fixture")
            })
    }
    func release(failing: Bool, responseProjectID: String? = nil) {
        guard let stub = lock.withLock({ let value = held; held = nil; return value }) else { return }
        if failing { stub.client?.urlProtocol(stub, didFailWithError: URLError(.timedOut)) }
        else { respond(stub, responseProjectID: responseProjectID) }
    }
    private func respond(_ stub: CollaborationScopeURLProtocol, responseProjectID: String? = nil) {
        let projectID = responseProjectID ?? (stub.request.url?.path.contains("/new/") == true ? "new" : "old")
        let payload: [String: Any] = ["status": "ok", "projectId": projectID,
            "project": ["id": projectID, "title": projectID],
            "collaborators": [["email": "fixture@example.test", "status": "approved"]],
            "approvedEmails": [], "comments": [["id": "old-comment", "projectId": projectID, "text": "Old note"]]]
        stub.respond(try! JSONSerialization.data(withJSONObject: payload))
    }
}

private final class CollaborationScopeURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var handler: ((CollaborationScopeURLProtocol) -> Void)?
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "collaboration-scope.test" }
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
