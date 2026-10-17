import XCTest
@testable import them

final class ScreenplayProjectCreationTrustTests: XCTestCase {
    @MainActor func testAutomaticCreationLostReplyUsesCanonicalRecoveryWithoutChangingLiveWorkspace() async throws {
        let suite = "them.automatic-creation.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer {
            defaults.removePersistentDomain(forName: suite)
            try? FileManager.default.removeItem(at: directory)
            CreationTrustURLProtocol.handler = nil
        }
        let store = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let transport = CreationTrustTransport(holdCreate: true, holdRequests: false)
        transport.dropNextCreationReply = true
        let api = transport.api()
        let bridge = ScreenplayLiveDraftBridge.shared
        let previousProject = bridge.preferredProjectID, previousVersion = bridge.preferredVersionID
        let raw = " \r\nINT. FIRST ROOM - NIGHT\r\nA cafe\u{0301} door opens.\t "
        let auth = ScreenplayStudioAuthContext.current()
        let worker = ScreenplayStudioViewModel(localDraftRecoveryStore: store,
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: directory), draftSaveAPI: api,
            projectSelectionAPI: api, connectsToLiveWorkspace: false)
        await worker.createAutomaticProject(draft: raw, title: "Original title", phase: "outline", expectedAuth: auth)
        let intent = try XCTUnwrap(store.pendingProjectCreation(ownerUserId: auth.userID))
        XCTAssertEqual(intent.phase, "outline")
        XCTAssertEqual(Array(intent.draft.utf8), Array(raw.utf8))
        XCTAssertEqual(transport.projectWrites, 1)
        XCTAssertTrue(transport.versionWrites.isEmpty)
        XCTAssertFalse(worker.errorText.isEmpty)
        let reopened = ScreenplayStudioViewModel(localDraftRecoveryStore: store,
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: directory), draftSaveAPI: api,
            projectSelectionAPI: api, connectsToLiveWorkspace: false)
        await reopened.createAutomaticProject(draft: "Must not replace pending words", title: "Other", phase: "draft", expectedAuth: auth)
        XCTAssertEqual(transport.projectWrites, 1, "Automatic promotion must not bypass an existing durable intent.")
        XCTAssertEqual(Array(reopened.fountainDraft.utf8), Array(raw.utf8))
        await reopened.createProject() // The actual Studio retry entry, retaining the original phase.
        XCTAssertEqual(Set(transport.creationIDs), [intent.projectId])
        XCTAssertEqual(transport.creationPhases, ["outline", "outline"])
        XCTAssertEqual(transport.versionWrites.count, 1)
        XCTAssertEqual(Array(try XCTUnwrap(transport.versionWrites.first).utf8), Array(raw.utf8))
        XCTAssertEqual(reopened.latestVersionID, "saved")
        XCTAssertFalse(reopened.hasUnsavedDraftChanges)
        XCTAssertNil(try store.pendingProjectCreation(ownerUserId: auth.userID))
        XCTAssertEqual(bridge.preferredProjectID, previousProject)
        XCTAssertEqual(bridge.preferredVersionID, previousVersion)
    }

    @MainActor func testAutomaticCreationRejectsStaleAuthenticationBeforeRequestOrDraftMutation() async throws {
        let suite = "them.automatic-creation-auth.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer {
            defaults.removePersistentDomain(forName: suite)
            try? FileManager.default.removeItem(at: directory)
            CreationTrustURLProtocol.handler = nil
        }
        let store = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let transport = CreationTrustTransport(holdCreate: true, holdRequests: false)
        let api = transport.api()
        let worker = ScreenplayStudioViewModel(localDraftRecoveryStore: store,
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: directory), draftSaveAPI: api,
            projectSelectionAPI: api, connectsToLiveWorkspace: false)
        let current = ScreenplayStudioAuthContext.current()
        let stale = ScreenplayStudioAuthContext(userID: current.userID,
            sessionIntentGeneration: current.sessionIntentGeneration &+ 1)
        let previous = worker.fountainDraft
        await worker.createAutomaticProject(draft: "Another session's story", title: "Other", phase: "outline", expectedAuth: stale)
        XCTAssertEqual(Array(worker.fountainDraft.utf8), Array(previous.utf8))
        XCTAssertEqual(transport.projectWrites, 0)
        XCTAssertTrue(transport.versionWrites.isEmpty)
        XCTAssertNil(try store.pendingProjectCreation(ownerUserId: current.userID))
    }

    func testCreationIntentBeforePhaseFieldStillDecodes() throws {
        let data = try JSONSerialization.data(withJSONObject: ["projectId": "project", "ownerUserId": "owner",
            "title": "Title", "draft": "Exact page", "seedsLiveDraft": true, "restoreAsCurrent": true])
        let intent = try JSONDecoder().decode(ScreenplayProjectCreationIntent.self, from: data)
        XCTAssertNil(intent.phase)
        XCTAssertEqual(intent.draft, "Exact page")
    }

    @MainActor func testLostCreationReplySurvivesRelaunchWithOneProjectIdentityAndExactScene() async throws {
        let suite = "them.creation-relaunch.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer {
            defaults.removePersistentDomain(forName: suite)
            try? FileManager.default.removeItem(at: directory)
            CreationTrustURLProtocol.handler = nil
        }
        let store = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let transport = CreationTrustTransport(holdCreate: true, holdRequests: false)
        transport.dropNextCreationReply = true
        let api = transport.api()
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store,
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: directory), draftSaveAPI: api, projectSelectionAPI: api)
        model.autosaveEnabled = false
        let raw = " \r\nINT. FIRST ROOM - NIGHT\r\nA cafe\u{0301} door opens.\t "
        model.fountainDraft = raw
        model.newProjectTitle = "Original title"
        model.noteManualDraftEdit()
        await model.createProject()
        XCTAssertEqual(transport.projectWrites, 1)
        XCTAssertEqual(transport.versionWrites.count, 0)
        XCTAssertEqual(Array(model.fountainDraft.utf8), Array(raw.utf8))
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let intent = try XCTUnwrap(store.pendingProjectCreation(ownerUserId: owner))
        let reopened = ScreenplayStudioViewModel(localDraftRecoveryStore: store,
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: directory), draftSaveAPI: api, projectSelectionAPI: api)
        reopened.autosaveEnabled = false
        XCTAssertEqual(reopened.selectedProjectID, intent.projectId)
        XCTAssertEqual(reopened.pendingProjectCreationTitle, "Original title")
        XCTAssertEqual(Array(reopened.fountainDraft.utf8), Array(raw.utf8))
        await reopened.refreshSelectedProjectForDebug()
        XCTAssertEqual(Array(reopened.fountainDraft.utf8), Array(raw.utf8))
        XCTAssertNil(reopened.recoveryCandidate, "Pending creation owns this exact restored page; Retry must remain reachable.")
        reopened.newProjectTitle = "A later title must survive retry"
        await reopened.createProject()
        XCTAssertEqual(Set(transport.creationIDs), [intent.projectId])
        XCTAssertEqual(transport.projectWrites, 2, "Two HTTP attempts must reuse one project identity.")
        XCTAssertEqual(transport.versionWrites.count, 1)
        XCTAssertEqual(Array(transport.versionWrites[0].utf8), Array(raw.utf8))
        XCTAssertEqual(reopened.newProjectTitle, "A later title must survive retry")
        XCTAssertEqual(Array(reopened.fountainDraft.utf8), Array(raw.utf8))
        XCTAssertFalse(reopened.hasUnsavedDraftChanges)
        XCTAssertNil(try store.pendingProjectCreation(ownerUserId: owner))
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor func testPendingCreationCodecIsExactOwnerScopedAndRejectsReplacingAnotherIntent() throws {
        let suite = "them.creation-codec.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let intent = ScreenplayProjectCreationIntent(projectId: UUID().uuidString.lowercased(), ownerUserId: "a",
            title: "Title", draft: " cafe\u{0301}\r\n ", seedsLiveDraft: true, restoreAsCurrent: true)
        try store.saveProjectCreation(intent)
        XCTAssertFalse(store.allowsAutomaticProjectCreation(ownerUserId: "a"))
        XCTAssertTrue(store.allowsAutomaticProjectCreation(ownerUserId: "b"))
        let invalidKey = ScreenplayOwnerScopedStoragePolicy.storageKey(baseKey: "recovery", ownerUserID: "b") + ".projectCreation.v1"
        defaults.set(Data("unreadable intent".utf8), forKey: invalidKey)
        XCTAssertFalse(store.allowsAutomaticProjectCreation(ownerUserId: "b"), "Corrupt recovery must not enable a second creation path.")
        defaults.removeObject(forKey: invalidKey)
        let reopened = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        XCTAssertEqual(Array(try XCTUnwrap(reopened.pendingProjectCreation(ownerUserId: "a")).draft.utf8), Array(intent.draft.utf8))
        XCTAssertNil(try reopened.pendingProjectCreation(ownerUserId: "b"))
        var replacement = intent
        replacement = ScreenplayProjectCreationIntent(projectId: UUID().uuidString.lowercased(), ownerUserId: "a",
            title: "Other", draft: "Other", seedsLiveDraft: true, restoreAsCurrent: true)
        XCTAssertThrowsError(try reopened.saveProjectCreation(replacement))
        try reopened.clearProjectCreation(ownerUserId: "a", projectId: replacement.projectId)
        XCTAssertEqual(try reopened.pendingProjectCreation(ownerUserId: "a")?.projectId, intent.projectId)
    }

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
    @MainActor func testCreationWaitsWhenSelectedProjectDraftHasNeverLoaded() async throws {
        try await verifyCreation(holdCreate: true, edit: false, switchProject: false, interleave: "unloaded")
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
        let transport = CreationTrustTransport(holdCreate: holdCreate,
            holdRequests: !["loading", "unloaded"].contains(interleave))
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
            model.applyStructuralUITestDraft(original, versionID: "old-version")
            model.hasUnsavedDraftChanges = true
        }
        if interleave == "loading" || interleave == "unloaded" {
            if interleave == "loading" { model.applyStructuralUITestDraft(original, versionID: "old-version") }
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
            let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
            XCTAssertEqual(Array(try XCTUnwrap(recovery.pendingProjectCreation(ownerUserId: owner)).draft.utf8), Array(newer.utf8))
        }
        transport.release()
        await creation.value
        let createdID = transport.createdID
        let rejected = switchProject || interleave == "aba" || interleave == "auth" || interleave == "save-auth"
        let expected = edit ? newer : original
        XCTAssertEqual(Array(model.fountainDraft.utf8), Array((selectedExisting ? "" : expected).utf8))
        let expectedID = switchProject ? "other" : (rejected && holdCreate ? "" : createdID)
        XCTAssertEqual(model.selectedProjectID, expectedID)
        XCTAssertEqual(model.newProjectTitle, edit ? "Next title" : "")
        XCTAssertEqual(transport.projectWrites, 1)
        XCTAssertEqual(transport.versionWrites.count, (selectedExisting || (rejected && holdCreate)) ? 0 : 1)
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        if interleave == "save-switch" || interleave == "save-auth" {
            let preserved = try XCTUnwrap(recovery.dirtyOrdinarySnapshot(ownerUserId: owner, projectId: createdID))
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
                let snapshot = try XCTUnwrap(recovery.dirtyOrdinarySnapshot(ownerUserId: owner, projectId: createdID))
                XCTAssertEqual(Array(snapshot.draft.utf8), Array(newer.utf8))
            }
        }
        if interleave == "bad-echo" {
            XCTAssertEqual(model.latestVersionID, "")
            XCTAssertFalse(model.errorText.isEmpty)
            XCTAssertTrue(model.infoText.contains("Save Now"))
            let preserved = try XCTUnwrap(recovery.dirtyOrdinarySnapshot(ownerUserId: owner, projectId: createdID))
            XCTAssertEqual(Array(preserved.draft.utf8), Array(original.utf8))
            let parked = await outbox.snapshot(ownerUserId: owner)
            XCTAssertEqual(parked.parkedCount, 1)
            transport.badEcho = false
            await model.manualSaveDraft()
            XCTAssertEqual(transport.projectWrites, 1)
            XCTAssertEqual(model.selectedProjectID, createdID)
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
    private var requestedProjectID = "created"
    var dropNextCreationReply = false
    private var requestedIDs: [String] = []
    private var requestedPhases: [String] = []
    var creationPhases: [String] { lock.withLock { requestedPhases } }
    var creationIDs: [String] { lock.withLock { requestedIDs } }
    var createdID: String { lock.withLock { requestedProjectID } }
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
            if path.hasSuffix("/creation") && stub.request.httpMethod == "PUT" {
                let body = (try? JSONSerialization.jsonObject(with: stub.body())) as? [String: Any]
                lock.withLock {
                    creates += 1
                    requestedProjectID = String(path.split(separator: "/").dropLast().last ?? "")
                    requestedIDs.append(requestedProjectID)
                    requestedPhases.append(body?["phase"] as? String ?? "")
                }
                if dropNextCreationReply {
                    dropNextCreationReply = false
                    stub.client?.urlProtocol(stub, didFailWithError: URLError(.timedOut))
                    return
                }
            }
            if path.hasSuffix("/version") && stub.request.httpMethod == "POST" {
                let body = stub.body()
                let draft = (try? JSONSerialization.jsonObject(with: body) as? [String: Any])?["draft"] as? String ?? ""
                lock.withLock { drafts.append(draft) }
            }
            let shouldHold = lock.withLock { () -> Bool in
                let isCreate = path.hasSuffix("/creation") && stub.request.httpMethod == "PUT"
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
        var project: [String: Any] = ["id": createdID, "title": "Original title", "versions": []]
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
