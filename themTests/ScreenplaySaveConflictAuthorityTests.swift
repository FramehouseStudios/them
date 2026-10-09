import XCTest
@testable import them

final class ScreenplaySaveConflictAuthorityTests: XCTestCase {
    @MainActor
    func testSaveNowCannotDismissAnUnresolvedChoiceOrPostWriterWords() async throws {
        let fixture = try Fixture()
        defer { fixture.cleanup() }
        let transport = SaveAuthorityTransport(delayed: false)
        let model = fixture.model(api: transport.api())
        let raw = "  Writer cafe\u{0301}\r\n"
        model.fountainDraft = raw
        model.hasUnsavedDraftChanges = true
        let conflict = fixture.conflict()
        await model.handleDraftSaveConflict(conflict, ownerUserId: fixture.owner)
        await model.manualSaveDraft()
        XCTAssertEqual(transport.postCount, 0, "Save Now is not an implicit Keep Mine choice.")
        XCTAssertEqual(model.conflictState, conflict)
        XCTAssertEqual(Array(model.fountainDraft.utf8), Array(raw.utf8))
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertEqual(model.autosaveStatusText, "Conflict detected")
        let entries = try await fixture.queue.entriesForTesting()
        XCTAssertTrue(entries.contains { ScreenplayDraftTextIdentity.matches($0.draft, raw) && $0.status == .parked })
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testLateSaveSuccessCannotClearNewerConflictOrDispatchPendingEdit() async throws {
        let fixture = try Fixture()
        defer { fixture.cleanup() }
        let transport = SaveAuthorityTransport(delayed: true)
        let model = fixture.model(api: transport.api())
        model.fountainDraft = "First writer text"
        model.hasUnsavedDraftChanges = true
        let first = Task { await model.manualSaveDraft() }
        await fulfillment(of: [transport.started], timeout: 3)
        model.fountainDraft = "Newer writer cafe\u{0301}\r\n"
        await model.manualSaveDraft()
        let conflict = fixture.conflict()
        await model.handleDraftSaveConflict(conflict, ownerUserId: fixture.owner)
        transport.finish()
        await first.value
        XCTAssertEqual(transport.postCount, 1, "A late acknowledgement must not send the pending edit through a conflict.")
        XCTAssertEqual(model.conflictState, conflict)
        XCTAssertEqual(model.latestVersionID, "base")
        XCTAssertEqual(Array(model.fountainDraft.utf8), Array("Newer writer cafe\u{0301}\r\n".utf8))
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertEqual(model.autosaveStatusText, "Conflict detected")
        let entries = try await fixture.queue.entriesForTesting()
        XCTAssertTrue(entries.contains { $0.draft == "First writer text" && $0.status == .parked })
        XCTAssertTrue(entries.contains { ScreenplayDraftTextIdentity.matches($0.draft, model.fountainDraft) && $0.status == .parked })
        XCTAssertTrue(entries.allSatisfy { $0.baseVersionId == "base" })
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testKeepMineRetainsCapturedBaseAndCannotClearAnotherConflict() async throws {
        let fixture = try Fixture()
        defer { fixture.cleanup() }
        let transport = SaveAuthorityTransport(delayed: true)
        let model = fixture.model(api: transport.api())
        model.fountainDraft = "Writer choice"
        await model.handleDraftSaveConflict(fixture.conflict(), ownerUserId: fixture.owner)
        let save = Task { await model.keepLocalDraftAfterConflict() }
        await fulfillment(of: [transport.started], timeout: 3)
        let newer = ScreenplayStudioViewModel.SaveConflictState(projectId: "project", baseVersionId: "base",
            serverVersionId: "remote-v4", serverDraft: "Even newer collaborator words",
            serverDraftExcerpt: "New words", serverUpdatedAt: 400)
        await model.handleDraftSaveConflict(newer, ownerUserId: fixture.owner)
        transport.finish()
        await save.value
        XCTAssertEqual(transport.postCount, 1)
        XCTAssertEqual(transport.lastBaseVersion, "remote-v3")
        XCTAssertEqual(model.conflictState, newer)
        XCTAssertEqual(model.fountainDraft, "Writer choice")
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        let entries = try await fixture.queue.entriesForTesting()
        XCTAssertTrue(entries.contains { $0.source == "studio_conflict_resolve" && $0.status == .parked })
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testKeepMineStillCompletesWhenCapturedChoiceRemainsCurrent() async throws {
        let fixture = try Fixture()
        defer { fixture.cleanup() }
        let transport = SaveAuthorityTransport(delayed: false)
        let model = fixture.model(api: transport.api())
        model.fountainDraft = "Writer choice"
        await model.handleDraftSaveConflict(fixture.conflict(), ownerUserId: fixture.owner)
        await model.keepLocalDraftAfterConflict()
        XCTAssertEqual(transport.postCount, 1)
        XCTAssertEqual(transport.lastBaseVersion, "remote-v3")
        XCTAssertNil(model.conflictState)
        XCTAssertEqual(model.latestVersionID, "saved-v2")
        XCTAssertFalse(model.hasUnsavedDraftChanges)
        let entries = try await fixture.queue.entriesForTesting()
        XCTAssertTrue(entries.isEmpty)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testLateSuccessCannotRewindExplicitLoadServerChoice() async throws {
        let fixture = try Fixture()
        defer { fixture.cleanup() }
        let transport = SaveAuthorityTransport(delayed: true)
        let model = fixture.model(api: transport.api(), currentServerDraft: "Collaborator text")
        model.fountainDraft = "Original writer text"
        let save = Task { await model.manualSaveDraft() }
        await fulfillment(of: [transport.started], timeout: 3)
        await model.handleDraftSaveConflict(fixture.conflict(), ownerUserId: fixture.owner)
        await model.applyServerVersionFromConflict()?.value
        transport.finish()
        await save.value
        XCTAssertEqual(model.fountainDraft, "Collaborator text")
        XCTAssertEqual(model.latestVersionID, "remote-v3")
        XCTAssertNil(model.conflictState)
        XCTAssertFalse(model.hasUnsavedDraftChanges)
        XCTAssertEqual(transport.postCount, 1)
        let entries = try await fixture.queue.entriesForTesting()
        XCTAssertTrue(entries.isEmpty)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    private final class Fixture {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let suite = "them.save-authority.\(UUID().uuidString)"
        let defaults: UserDefaults
        let queue: ScreenplayDraftSaveOutbox
        let recovery: ScreenplayLocalDraftRecoveryStore
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        init() throws {
            defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
            queue = ScreenplayDraftSaveOutbox(storageDirectory: directory)
            recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        }
        func model(api: BackendMemoryAPI, currentServerDraft: String = "Collaborator text") -> ScreenplayStudioViewModel {
            let data = try! JSONSerialization.data(withJSONObject: ["id": "project", "title": "Script",
                "activeVersionId": "remote-v3", "versions": [["id": "remote-v3", "draft": currentServerDraft]]])
            let project = try! JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data)
            let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery,
                draftSaveOutbox: queue, draftSaveAPI: api, projectSelectionAPI: api,
                conflictProjectLoader: { _ in project })
            model.autosaveEnabled = false
            model.selectedProjectID = "project"
            model.selectedProject = try! JSONDecoder().decode(BackendScreenplayProjectSummary.self,
                from: Data(#"{"id":"project","title":"Script"}"#.utf8))
            model.applyStructuralUITestDraft("Saved base", versionID: "base")
            return model
        }
        func conflict() -> ScreenplayStudioViewModel.SaveConflictState {
            .init(projectId: "project", baseVersionId: "base", serverVersionId: "remote-v3",
                serverDraft: "Collaborator text", serverDraftExcerpt: "Collaborator text", serverUpdatedAt: 300)
        }
        func cleanup() {
            defaults.removePersistentDomain(forName: suite)
            try? FileManager.default.removeItem(at: directory)
            SaveAuthorityURLProtocol.handler = nil
        }
    }
}

private final class SaveAuthorityTransport: @unchecked Sendable {
    let started = XCTestExpectation(description: "Version POST reached transport")
    private let lock = NSLock()
    private let delayed: Bool
    private var posts = 0
    private var pending: SaveAuthorityURLProtocol?
    private var baseVersion = ""
    init(delayed: Bool) { self.delayed = delayed }
    var postCount: Int { lock.withLock { posts } }
    var lastBaseVersion: String { lock.withLock { baseVersion } }
    func api() -> BackendMemoryAPI {
        SaveAuthorityURLProtocol.handler = { [self] stub in
            if stub.request.url?.path == "/session" {
                stub.respond(Data(#"{"client_token":"authority-fixture","expires_in":3600}"#.utf8))
                return
            }
            guard stub.request.url?.path == "/screenplay/projects/project/version" else {
                stub.client?.urlProtocol(stub, didFailWithError: URLError(.unsupportedURL))
                return
            }
            let number = lock.withLock { posts += 1; pending = stub; return posts }
            if number == 1 { started.fulfill() }
            if !delayed || number > 1 { finish() }
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [SaveAuthorityURLProtocol.self]
        return BackendMemoryAPI(session: URLSession(configuration: configuration),
            baseURL: URL(string: "https://save-authority.test")!, requestIdentityProvider: { _ in
                .init(sessionEpoch: 1, userID: "fixture", clientToken: "fixture", accessToken: "fixture")
            })
    }
    func finish() {
        guard let stub = lock.withLock({ let value = pending; pending = nil; return value }) else { return }
        var body = stub.request.httpBody ?? Data()
        if let stream = stub.request.httpBodyStream {
            stream.open(); defer { stream.close() }
            var bytes = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let count = stream.read(&bytes, maxLength: bytes.count)
                guard count > 0 else { break }
                body.append(contentsOf: bytes.prefix(count))
            }
        }
        let object = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] ?? [:]
        lock.withLock { baseVersion = object["base_version_id"] as? String ?? "" }
        let data = try! JSONSerialization.data(withJSONObject: ["version_id": "saved-v2",
            "version": ["id": "saved-v2", "project_id": "project", "draft": object["draft"] as? String ?? ""]])
        stub.respond(data)
    }
}

private final class SaveAuthorityURLProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((SaveAuthorityURLProtocol) -> Void)?
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "save-authority.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() { Self.handler?(self) }
    override func stopLoading() {}
    func respond(_ data: Data) {
        let response = HTTPURLResponse(url: request.url!, statusCode: 200,
            httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
}
