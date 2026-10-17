import XCTest
@testable import them

final class ScreenplayProjectCreationTrustTests: XCTestCase {
    @MainActor func testInitialProjectSeedPreservesExactWriterBytes() async throws {
        try await verifyCreation(holdCreate: false, edit: false, switchProject: false)
    }
    @MainActor func testTypingDuringInitialSaveSurvivesAcknowledgementAndHydration() async throws {
        try await verifyCreation(holdCreate: false, edit: true, switchProject: false)
    }
    @MainActor func testTypingBeforeProjectAcknowledgementIsIncludedInFirstSave() async throws {
        try await verifyCreation(holdCreate: true, edit: true, switchProject: false)
    }
    @MainActor func testOldCreationCannotSelectAnotherProjectOrClearNewTitle() async throws {
        try await verifyCreation(holdCreate: true, edit: true, switchProject: true)
    }
    @MainActor func testSelectedProjectsDirtyWordsAreRecoveredButNeverSeedNewProject() async throws {
        try await verifyCreation(holdCreate: true, edit: true, switchProject: false, selectedExisting: true)
    }
    @MainActor func testSelectionAwayAndBackRejectsCreationAcknowledgement() async throws {
        try await verifyCreation(holdCreate: true, edit: true, switchProject: false, interleave: "aba")
    }
    @MainActor func testAuthChangeRejectsCreationAcknowledgement() async throws {
        try await verifyCreation(holdCreate: true, edit: true, switchProject: false, interleave: "auth")
    }
    @MainActor func testDuplicateCreationTapDoesNotDispatchAnotherProject() async throws {
        try await verifyCreation(holdCreate: true, edit: false, switchProject: false, interleave: "duplicate")
    }
    @MainActor func testSaveDuringCreationCannotEnterAnotherProjectsPendingSave() async throws {
        try await verifyCreation(holdCreate: true, edit: true, switchProject: false, selectedExisting: true, interleave: "save")
    }
    @MainActor func testUnconfirmedFirstPageRetainsRecoveryAndRetryUsesCreatedProject() async throws {
        try await verifyCreation(holdCreate: false, edit: false, switchProject: false, interleave: "bad-echo")
    }
    @MainActor func testSelectionAwayAndBackRejectsInitialVersionAcknowledgement() async throws {
        try await verifyCreation(holdCreate: false, edit: true, switchProject: false, interleave: "aba")
    }
    @MainActor func testCreationWaitsUntilSelectedProjectOwnsTheDisplayedDraft() async throws {
        try await verifyCreation(holdCreate: true, edit: false, switchProject: false, selectedExisting: true, interleave: "loading")
    }
    @MainActor func testSaveDuringCreationRecoversUnderDisplayedProjectNotNewSelection() async throws {
        try await verifyCreation(holdCreate: false, edit: true, switchProject: true, interleave: "save-switch")
    }
    @MainActor func testSaveDuringCreationCannotPublishOldAccountRecoveryAfterAuthChange() async throws {
        try await verifyCreation(holdCreate: false, edit: true, switchProject: false, interleave: "save-auth")
    }
    @MainActor func testLiveOnlySaveDuringCreationDoesNotClaimDurabilityBeforeProjectExists() async throws {
        try await verifyCreation(holdCreate: true, edit: true, switchProject: false, interleave: "save-live-only")
    }

    @MainActor private func verifyCreation(holdCreate: Bool, edit: Bool, switchProject: Bool,
        selectedExisting: Bool = false, interleave: String = "") async throws {
        let suite = "them.creation-trust.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let transport = CreationTrustTransport(holdCreate: holdCreate, holdRequests: interleave != "loading")
        transport.badEcho = interleave == "bad-echo"
        let api = transport.api()
        defer {
            defaults.removePersistentDomain(forName: suite)
            try? FileManager.default.removeItem(at: directory)
            CreationTrustURLProtocol.handler = nil
        }
        let outbox = ScreenplayDraftSaveOutbox(storageDirectory: directory)
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery,
            draftSaveOutbox: outbox,
            draftSaveAPI: api, projectSelectionAPI: api)
        model.autosaveEnabled = false
        let original = " \r\nINT. TEST ROOM - DAY\r\n\r\nA writer arrives. cafe\u{0301}\r\n "
        let newer = original + "\r\nNewest writer words.\r\n"
        model.fountainDraft = original
        model.hasUnsavedDraftChanges = true
        model.newProjectTitle = "Original title"
        if selectedExisting {
            model.selectedProjectID = "old"
            model.selectedProject = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
                from: Data(#"{"id":"old","title":"Old"}"#.utf8))
            model.latestVersionID = "old-version"
        }
        if interleave == "loading" {
            model.applyStructuralUITestDraft(original, versionID: "old-version")
            model.hasUnsavedDraftChanges = true
            model.selectedProjectID = "other"
            model.selectedProject = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
                from: Data(#"{"id":"other","title":"Other"}"#.utf8))
            await model.createProject()
            XCTAssertEqual(transport.projectWrites, 0)
            XCTAssertEqual(model.selectedProjectID, "other")
            XCTAssertEqual(Array(model.fountainDraft.utf8), Array(original.utf8))
            XCTAssertEqual(model.newProjectTitle, "Original title")
            XCTAssertTrue(model.hasUnsavedDraftChanges)
            XCTAssertTrue(model.errorText.contains("finish loading"))
            try? await Task.sleep(nanoseconds: 1_100_000_000)
            return
        }
        let creation = Task { await model.createProject() }
        await fulfillment(of: [transport.started], timeout: 3)
        if edit {
            model.fountainDraft = newer
            model.hasUnsavedDraftChanges = true
            model.newProjectTitle = "Next title"
        }
        if switchProject {
            model.selectedProjectID = "other"
            model.selectedProject = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
                from: Data(#"{"id":"other","title":"Other"}"#.utf8))
        }
        if interleave == "aba" {
            let id = model.selectedProjectID
            let project = model.selectedProject
            model.selectedProjectID = "other"
            model.selectedProjectID = id
            model.selectedProject = project
        }
        if interleave == "auth" || interleave == "save-auth" { _ = BackendAuthClient.reserveAuthSessionIntent() }
        if interleave == "duplicate" { await model.createProject() }
        if interleave == "save" { await model.manualSaveDraft() }
        if interleave == "save-switch" || interleave == "save-auth" { await model.manualSaveDraft() }
        if interleave == "save-live-only" {
            await model.manualSaveDraft()
            XCTAssertEqual(model.autosaveStatusText, "Creating project - edits remain on the page")
            XCTAssertEqual(model.selectedProjectID, "")
        }
        transport.release()
        await creation.value
        let rejected = switchProject || interleave == "aba" || interleave == "auth" || interleave == "save-auth"
        let expected = edit ? newer : original
        XCTAssertEqual(Array(model.fountainDraft.utf8), Array((selectedExisting ? "" : expected).utf8))
        let expectedID = switchProject ? "other" : (rejected && holdCreate ? "" : "created")
        XCTAssertEqual(model.selectedProjectID, expectedID)
        XCTAssertEqual(model.newProjectTitle, edit ? "Next title" : "")
        XCTAssertEqual(transport.projectWrites, 1)
        XCTAssertEqual(transport.versionWrites.count, (selectedExisting || (rejected && holdCreate)) ? 0 : 1)
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        if interleave == "save-switch" || interleave == "save-auth" {
            let preserved = try XCTUnwrap(recovery.dirtyOrdinarySnapshot(ownerUserId: owner, projectId: "created"))
            XCTAssertEqual(Array(preserved.draft.utf8), Array((interleave == "save-switch" ? newer : original).utf8))
            XCTAssertNil(recovery.dirtyOrdinarySnapshot(ownerUserId: owner, projectId: "other"))
        }
        if selectedExisting {
            let snapshot = try XCTUnwrap(recovery.dirtyOrdinarySnapshot(ownerUserId: owner, projectId: "old"))
            XCTAssertEqual(Array(snapshot.draft.utf8), Array(expected.utf8))
            XCTAssertEqual(snapshot.baseVersionId, "old-version")
            XCTAssertEqual(model.latestVersionID, "")
        } else if !rejected {
            let submitted = try XCTUnwrap(transport.versionWrites.first)
            XCTAssertEqual(Array(submitted.utf8), Array((holdCreate && edit ? newer : original).utf8))
            XCTAssertEqual(model.hasUnsavedDraftChanges, interleave == "bad-echo" || (edit && !holdCreate))
            if edit && !holdCreate {
                let snapshot = try XCTUnwrap(recovery.dirtyOrdinarySnapshot(ownerUserId: owner, projectId: "created"))
                XCTAssertEqual(Array(snapshot.draft.utf8), Array(newer.utf8))
            }
        }
        if interleave == "bad-echo" {
            XCTAssertEqual(model.latestVersionID, "")
            XCTAssertFalse(model.errorText.isEmpty)
            XCTAssertTrue(model.infoText.contains("Save Now"))
            let preserved = try XCTUnwrap(recovery.dirtyOrdinarySnapshot(ownerUserId: owner, projectId: "created"))
            XCTAssertEqual(Array(preserved.draft.utf8), Array(original.utf8))
            let parked = await outbox.snapshot(ownerUserId: owner)
            XCTAssertEqual(parked.parkedCount, 1)
            transport.badEcho = false
            await model.manualSaveDraft()
            XCTAssertEqual(transport.projectWrites, 1)
            XCTAssertEqual(model.selectedProjectID, "created")
            XCTAssertEqual(model.latestVersionID, "saved")
            let snapshot = await outbox.snapshot(ownerUserId: owner)
            XCTAssertEqual(snapshot.activeCount, 0)
            XCTAssertEqual(snapshot.parkedCount, 0)
        }
        if rejected && !holdCreate {
            XCTAssertEqual(model.latestVersionID, "")
            XCTAssertTrue(model.hasUnsavedDraftChanges)
            let snapshot = await outbox.snapshot(ownerUserId: owner)
            XCTAssertEqual(snapshot.inflightCount, 0)
            XCTAssertEqual(snapshot.pendingCount, 1)
        }
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }
}

private final class CreationTrustTransport: @unchecked Sendable {
    let started = XCTestExpectation(description: "Creation request held")
    private let lock = NSLock()
    private let holdCreate: Bool
    private let holdRequests: Bool
    private var held: CreationTrustURLProtocol?
    private var didHold = false
    private var drafts: [String] = []
    private var creates = 0
    private var invalidEcho = false
    var badEcho: Bool {
        get { lock.withLock { invalidEcho } }
        set { lock.withLock { invalidEcho = newValue } }
    }
    var projectWrites: Int { lock.withLock { creates } }
    var versionWrites: [String] { lock.withLock { drafts } }
    init(holdCreate: Bool, holdRequests: Bool = true) {
        self.holdCreate = holdCreate; self.holdRequests = holdRequests
    }
    func api() -> BackendMemoryAPI {
        CreationTrustURLProtocol.handler = { [self] stub in
            let path = stub.request.url?.path ?? ""
            if path == "/session" { stub.respond(Data(#"{"client_token":"creation-fixture","expires_in":3600}"#.utf8)); return }
            if path == "/screenplay/projects" && stub.request.httpMethod == "POST" {
                lock.withLock { creates += 1 }
            }
            if path.hasSuffix("/version") && stub.request.httpMethod == "POST" {
                let body = stub.body()
                let draft = (try? JSONSerialization.jsonObject(with: body) as? [String: Any])?["draft"] as? String ?? ""
                lock.withLock { drafts.append(draft) }
            }
            let shouldHold = lock.withLock { () -> Bool in
                let isCreate = path == "/screenplay/projects" && stub.request.httpMethod == "POST"
                let isVersion = path.hasSuffix("/version") && stub.request.httpMethod == "POST"
                if holdRequests && !didHold && (holdCreate ? isCreate : isVersion) { held = stub; didHold = true; return true }
                return false
            }
            if shouldHold { started.fulfill() } else { respond(stub) }
        }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [CreationTrustURLProtocol.self]
        return BackendMemoryAPI(session: URLSession(configuration: config),
            baseURL: URL(string: "https://creation-trust.test")!, requestIdentityProvider: { _ in
                .init(sessionEpoch: 1, userID: "fixture", clientToken: "fixture", accessToken: "fixture")
            })
    }
    func release() {
        guard let stub = lock.withLock({ let value = held; held = nil; return value }) else { return }
        respond(stub)
    }
    private func respond(_ stub: CreationTrustURLProtocol) {
        let latest = lock.withLock { drafts.last }
        var project: [String: Any] = ["id": "created", "title": "Original title", "versions": []]
        var payload: [String: Any] = ["status": "ok", "outline": ["acts": [], "beats": [], "scenes": []],
            "collaborators": [], "comments": []]
        if let latest {
            let echo = badEcho && stub.request.httpMethod == "POST" ? "not the writer's page" : latest
            let version: [String: Any] = ["id": "saved", "draft": echo, "updatedAt": 200]
            project["versions"] = [version]
            project["activeVersionId"] = "saved"
            payload["version"] = version
            payload["version_id"] = "saved"
        }
        payload["project"] = project
        stub.respond(try! JSONSerialization.data(withJSONObject: payload))
    }
}

private final class CreationTrustURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var handler: ((CreationTrustURLProtocol) -> Void)?
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "creation-trust.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() { Self.handler?(self) }
    override func stopLoading() {}
    func body() -> Data {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open(); defer { stream.close() }
        var result = Data(), bytes = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&bytes, maxLength: bytes.count)
            if count <= 0 { break }; result.append(contentsOf: bytes.prefix(count))
        }
        return result
    }
    func respond(_ data: Data) {
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
}
