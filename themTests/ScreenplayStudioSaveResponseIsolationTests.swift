import XCTest
@testable import them

final class ScreenplayStudioSaveResponseIsolationTests: XCTestCase {
    @MainActor
    func testSuccessfulSaveAfterProjectSwitchDoesNotNavigateOrOverwriteRecovery() async throws {
        try await verifyProjectSwitch(response: .success, expectedStatus: nil)
    }

    @MainActor
    func testConflictAfterProjectSwitchStaysWithOriginalQueuedDraft() async throws {
        try await verifyProjectSwitch(response: .conflict, expectedStatus: .pending)
    }

    @MainActor
    func testRetryableFailureAfterProjectSwitchDoesNotMarkNewProjectAsFailed() async throws {
        try await verifyProjectSwitch(response: .retryable, expectedStatus: .pending)
    }

    @MainActor
    func testPermanentFailureAfterProjectSwitchPreservesOriginalQueuedDraft() async throws {
        try await verifyProjectSwitch(response: .permanent, expectedStatus: .parked)
    }

    @MainActor
    func testSwitchAwayAndBackDoesNotApplyAnEarlierSelectionResponse() async throws {
        let fixture = try StudioSaveIsolationFixture()
        defer { fixture.close() }
        let started = expectation(description: "Save started")
        fixture.transport.onSave = { started.fulfill() }
        fixture.select(project: "project-a", draft: "OLD SELECTION", version: "base-a")
        let saving = Task { await fixture.model.manualSaveDraft() }
        await fulfillment(of: [started], timeout: 3)
        fixture.select(project: "project-b", draft: "OTHER PROJECT", version: "base-b")
        fixture.select(project: "project-a", draft: "NEW SELECTION", version: "newer-a")
        let journal = fixture.recovery.payloads(ownerUserId: fixture.owner)["project-a"]
        fixture.transport.finishSave(.success)
        await saving.value

        XCTAssertEqual(fixture.model.latestVersionID, "newer-a")
        XCTAssertEqual(fixture.model.fountainDraft, "NEW SELECTION")
        XCTAssertTrue(fixture.model.hasUnsavedDraftChanges)
        XCTAssertEqual(fixture.recovery.payloads(ownerUserId: fixture.owner)["project-a"] as NSDictionary?, journal as NSDictionary?)
        let entries = try await fixture.outbox.entriesForTesting()
        XCTAssertTrue(entries.isEmpty)
        await fixture.outbox.stopNetworkMonitoring()
    }

    @MainActor
    func testNewerEditsOnTheSamePageRemainDirtyAfterSuccessfulSave() async throws {
        let fixture = try StudioSaveIsolationFixture()
        defer { fixture.close() }
        let started = expectation(description: "Save started")
        fixture.transport.onSave = { started.fulfill() }
        fixture.select(project: "project-a", draft: "REQUESTED DRAFT", version: "base-a")
        let saving = Task { await fixture.model.manualSaveDraft() }
        await fulfillment(of: [started], timeout: 3)
        fixture.model.fountainDraft = "NEWER UNSAVED EDITS"
        fixture.model.noteManualDraftEdit()
        fixture.transport.finishSave(.success)
        await saving.value

        XCTAssertEqual(fixture.model.latestVersionID, "saved-a")
        XCTAssertEqual(fixture.model.fountainDraft, "NEWER UNSAVED EDITS")
        XCTAssertTrue(fixture.model.hasUnsavedDraftChanges)
        XCTAssertEqual(fixture.model.autosaveStatusText, "Unsaved changes")
        let journal = fixture.recovery.payloads(ownerUserId: fixture.owner)["project-a"]
        XCTAssertEqual(journal?["draft"] as? String, "NEWER UNSAVED EDITS")
        XCTAssertEqual(journal?["baseVersionId"] as? String, "saved-a")
        XCTAssertEqual(journal?["dirty"] as? Bool, true)
        XCTAssertEqual(fixture.transport.saveRequests.count, 1)
        await fixture.outbox.stopNetworkMonitoring()
    }

    @MainActor
    func testExplicitSaveInNewProjectIsNotCoalescedWithIdenticalOldProjectText() async throws {
        try await verifyPendingNewProject(after: .success)
    }

    @MainActor
    func testConflictInOldProjectDoesNotDropExplicitSaveInNewProject() async throws {
        try await verifyPendingNewProject(after: .conflict)
    }

    @MainActor
    private func verifyPendingNewProject(after response: DelayedStudioSaveResponse) async throws {
        let fixture = try StudioSaveIsolationFixture()
        defer { fixture.close() }
        let first = expectation(description: "Old project's save started")
        fixture.transport.onSave = { first.fulfill() }
        fixture.select(project: "project-a", draft: "IDENTICAL TEXT", version: "same-base-id")
        let saving = Task { await fixture.model.manualSaveDraft() }
        await fulfillment(of: [first], timeout: 3)
        fixture.select(project: "project-b", draft: "IDENTICAL TEXT", version: "same-base-id")
        await fixture.model.manualSaveDraft()
        let second = expectation(description: "New project's explicit save started")
        fixture.transport.onSave = { second.fulfill() }
        fixture.transport.finishSave(response)
        await fulfillment(of: [second], timeout: 3)
        fixture.transport.finishSave(status: 200, body: #"{"status":"saved","project_id":"project-b","version_id":"saved-b","project":{"id":"project-b","title":"New project"}}"#)
        await saving.value

        XCTAssertEqual(fixture.transport.saveRequests.map { $0.url?.path }, [
            "/screenplay/projects/project-a/version", "/screenplay/projects/project-b/version",
        ])
        XCTAssertEqual(fixture.transport.saveBodies.last?["base_version_id"] as? String, "same-base-id")
        XCTAssertEqual(fixture.transport.saveBodies.last?["draft"] as? String, "IDENTICAL TEXT")
        XCTAssertEqual(fixture.model.selectedProjectID, "project-b")
        XCTAssertEqual(fixture.model.latestVersionID, "saved-b")
        XCTAssertFalse(fixture.model.hasUnsavedDraftChanges)
        XCTAssertEqual(fixture.model.autosaveStatusText, "Saved now")
        XCTAssertNil(fixture.model.conflictState)
        await fixture.outbox.stopNetworkMonitoring()
    }

    @MainActor
    func testChangedAuthIntentRejectsTheOldSaveResponseEvenForSameUserAndProject() async throws {
        let fixture = try StudioSaveIsolationFixture()
        defer { fixture.close() }
        let started = expectation(description: "Save started")
        fixture.transport.onSave = { started.fulfill() }
        fixture.select(project: "project-a", draft: "LOCAL DRAFT", version: "base-a")
        let journal = fixture.recovery.payloads(ownerUserId: fixture.owner)["project-a"]
        let saving = Task { await fixture.model.manualSaveDraft() }
        await fulfillment(of: [started], timeout: 3)
        _ = BackendAuthClient.reserveAuthSessionIntent()
        fixture.transport.finishSave(.success)
        await saving.value

        XCTAssertEqual(fixture.model.latestVersionID, "base-a")
        XCTAssertTrue(fixture.model.hasUnsavedDraftChanges)
        XCTAssertEqual(fixture.recovery.payloads(ownerUserId: fixture.owner)["project-a"] as NSDictionary?, journal as NSDictionary?)
        let entries = try await fixture.outbox.entriesForTesting()
        XCTAssertEqual(entries.first?.status, .pending)
        XCTAssertEqual(entries.first?.ownerUserId, fixture.owner)
        await fixture.outbox.stopNetworkMonitoring()
    }

    @MainActor
    func testProjectSwitchDuringEmptyBasePreflightDoesNotSendTheOldWrite() async throws {
        let fixture = try StudioSaveIsolationFixture()
        defer { fixture.close() }
        let started = expectation(description: "Save preflight started")
        fixture.transport.onPreflight = { started.fulfill() }
        fixture.select(project: "project-a", draft: "LOCAL DRAFT", version: "")
        let saving = Task { await fixture.model.manualSaveDraft() }
        await fulfillment(of: [started], timeout: 3)
        fixture.select(project: "project-b", draft: "NEW PROJECT", version: "base-b")
        fixture.transport.finishSave(status: 200, body: #"{"project":{"id":"project-a","title":"Original project","versions":[]}}"#)
        await saving.value

        XCTAssertTrue(fixture.transport.saveRequests.isEmpty, "A read that finishes after navigation must not dispatch an old write.")
        XCTAssertEqual(fixture.model.selectedProjectID, "project-b")
        XCTAssertEqual(fixture.model.latestVersionID, "base-b")
        XCTAssertEqual(fixture.model.autosaveStatusText, "Unsaved changes")
        XCTAssertNil(fixture.model.conflictState)
        let entries = try await fixture.outbox.entriesForTesting()
        XCTAssertEqual(entries.first?.status, .pending)
        XCTAssertEqual(entries.first?.projectId, "project-a")
        await fixture.outbox.stopNetworkMonitoring()
    }

    @MainActor
    func testProjectSwitchDuringDurableAcknowledgementDoesNotApplyOldResponse() async throws {
        try await verifySwitchDuringAcknowledgement(changeAuthIntent: false)
    }

    @MainActor
    func testAuthChangeDuringDurableAcknowledgementDoesNotApplyOldResponse() async throws {
        try await verifySwitchDuringAcknowledgement(changeAuthIntent: true)
    }

    @MainActor
    private func verifySwitchDuringAcknowledgement(changeAuthIntent: Bool) async throws {
        let barrier = StudioSaveAcknowledgementBarrier()
        let fixture = try StudioSaveIsolationFixture(fileProtectionEnforcer: { try barrier.protect($0) })
        defer { barrier.release(); fixture.close() }
        let started = expectation(description: "Save started")
        fixture.transport.onSave = { started.fulfill() }
        fixture.select(project: "project-a", draft: "ORIGINAL LOCAL DRAFT", version: "base-a")
        let saving = Task { await fixture.model.manualSaveDraft() }
        await fulfillment(of: [started], timeout: 3)
        let acknowledging = expectation(description: "Confirmed save is committing its queue acknowledgement")
        barrier.arm { acknowledging.fulfill() }
        fixture.transport.finishSave(.success)
        await fulfillment(of: [acknowledging], timeout: 3)
        if changeAuthIntent { _ = BackendAuthClient.reserveAuthSessionIntent() }
        let currentProject = changeAuthIntent ? "project-a" : "project-b"
        fixture.select(project: currentProject, draft: "NEW CONTEXT EDITS", version: "new-context-base")
        let journal = fixture.recovery.payloads(ownerUserId: fixture.owner)[currentProject]
        barrier.release()
        await saving.value

        XCTAssertEqual(fixture.model.selectedProjectID, currentProject)
        XCTAssertEqual(fixture.model.latestVersionID, "new-context-base")
        XCTAssertEqual(fixture.model.fountainDraft, "NEW CONTEXT EDITS")
        XCTAssertTrue(fixture.model.hasUnsavedDraftChanges)
        XCTAssertEqual(fixture.recovery.payloads(ownerUserId: fixture.owner)[currentProject] as NSDictionary?, journal as NSDictionary?)
        let entries = try await fixture.outbox.entriesForTesting()
        XCTAssertTrue(entries.isEmpty, "The original owner's confirmed request was already acknowledged.")
        await fixture.outbox.stopNetworkMonitoring()
    }

    @MainActor
    func testLateRevisionFailureDoesNotOverwriteNewProjectGuidance() async throws {
        let fixture = try StudioSaveIsolationFixture()
        defer { fixture.close() }
        let started = expectation(description: "Save started")
        fixture.transport.onSave = { started.fulfill() }
        fixture.select(project: "project-a", draft: "IDENTICAL TEXT", version: "base-a")
        let saving = Task { await fixture.model.manualSaveDraft() }
        await fulfillment(of: [started], timeout: 3)
        let revision = expectation(description: "Post-save revision enrichment started")
        fixture.transport.onRevision = { revision.fulfill() }
        fixture.transport.finishSave(.success)
        await fulfillment(of: [revision], timeout: 3)
        fixture.select(project: "project-b", draft: "IDENTICAL TEXT", version: "base-b")
        fixture.model.errorText = "New project notice"
        fixture.model.revisionErrorText = "New project revision guidance"
        fixture.transport.finishSave(status: 503, body: #"{"error":"temporarily_unavailable"}"#)
        await saving.value

        XCTAssertEqual(fixture.model.latestVersionID, "base-b")
        XCTAssertEqual(fixture.model.errorText, "New project notice")
        XCTAssertEqual(fixture.model.revisionErrorText, "New project revision guidance")
        XCTAssertEqual(fixture.model.autosaveStatusText, "Unsaved changes")
        await fixture.outbox.stopNetworkMonitoring()
    }

    @MainActor
    func testAuthChangeDuringSessionBootstrapDoesNotDispatchTheOldDraft() async throws {
        let fixture = try StudioSaveIsolationFixture()
        defer { fixture.close() }
        let bootstrapping = expectation(description: "Save is waiting for session bootstrap")
        fixture.transport.onSession = { bootstrapping.fulfill() }
        fixture.transport.automaticSaveResponse = .success
        fixture.select(project: "project-a", draft: "ORIGINAL OWNER DRAFT", version: "base-a")
        let saving = Task { await fixture.model.manualSaveDraft() }
        await fulfillment(of: [bootstrapping], timeout: 3)
        _ = BackendAuthClient.reserveAuthSessionIntent()
        fixture.transport.finishSave(status: 200, body: #"{"client_token":"save-isolation-test","expires_in":3600,"remembered_names":[]}"#)
        await saving.value

        XCTAssertTrue(fixture.transport.saveRequests.isEmpty, "An old draft must not be sent using a new account intent after session bootstrap.")
        XCTAssertEqual(fixture.model.latestVersionID, "base-a")
        XCTAssertTrue(fixture.model.hasUnsavedDraftChanges)
        let entries = try await fixture.outbox.entriesForTesting()
        XCTAssertEqual(entries.first?.status, .pending)
        XCTAssertEqual(entries.first?.draft, "ORIGINAL OWNER DRAFT")
        await fixture.outbox.stopNetworkMonitoring()
    }

    @MainActor
    private func verifyProjectSwitch(
        response: DelayedStudioSaveResponse,
        expectedStatus: ScreenplayDraftSaveOutboxStatus?
    ) async throws {
        let fixture = try StudioSaveIsolationFixture()
        defer { fixture.close() }
        let started = expectation(description: "Original project's save reached the HTTP client")
        fixture.transport.onSave = { started.fulfill() }
        fixture.select(project: "project-a", draft: "ORIGINAL LOCAL DRAFT", version: "base-a")
        let originalRecovery = fixture.recovery.payloads(ownerUserId: fixture.owner)["project-a"]

        let saving = Task { await fixture.model.manualSaveDraft() }
        await fulfillment(of: [started], timeout: 3)
        fixture.select(project: "project-b", draft: "NEW PROJECT UNSAVED DRAFT", version: "base-b")
        fixture.model.infoText = "New project guidance"
        fixture.model.errorText = "New project notice"
        let newRecovery = fixture.recovery.payloads(ownerUserId: fixture.owner)["project-b"]
        fixture.transport.finishSave(response)
        await saving.value

        XCTAssertEqual(fixture.model.selectedProjectID, "project-b")
        XCTAssertEqual(fixture.model.selectedProject?.id, "project-b")
        XCTAssertEqual(fixture.model.fountainDraft, "NEW PROJECT UNSAVED DRAFT")
        XCTAssertEqual(fixture.model.latestVersionID, "base-b")
        XCTAssertEqual(fixture.model.autosaveStatusText, "Unsaved changes")
        XCTAssertTrue(fixture.model.hasUnsavedDraftChanges)
        XCTAssertNil(fixture.model.conflictState)
        XCTAssertNil(fixture.model.recoveryCandidate)
        XCTAssertEqual(fixture.model.infoText, "New project guidance")
        XCTAssertEqual(fixture.model.errorText, "New project notice")
        XCTAssertFalse(fixture.model.isSaving)
        XCTAssertEqual(fixture.recovery.payloads(ownerUserId: fixture.owner)["project-a"] as NSDictionary?, originalRecovery as NSDictionary?)
        XCTAssertEqual(fixture.recovery.payloads(ownerUserId: fixture.owner)["project-b"] as NSDictionary?, newRecovery as NSDictionary?)
        let entries = try await fixture.outbox.entriesForTesting()
        if let expectedStatus {
            XCTAssertEqual(entries.count, 1)
            XCTAssertEqual(entries.first?.status, expectedStatus)
            XCTAssertEqual(entries.first?.draft, "ORIGINAL LOCAL DRAFT")
            XCTAssertEqual(entries.first?.projectId, "project-a")
            XCTAssertEqual(entries.first?.ownerUserId, fixture.owner)
        } else {
            XCTAssertTrue(entries.isEmpty, "The confirmed original save should be acknowledged without changing the current page.")
        }
        XCTAssertEqual(fixture.transport.saveRequests.count, 1, "A reply must not automatically save another project's draft.")
        await fixture.outbox.stopNetworkMonitoring()
    }
}

@MainActor
private final class StudioSaveIsolationFixture {
    let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
    let transport = DelayedStudioSaveTransport()
    let outbox: ScreenplayDraftSaveOutbox
    let recovery: ScreenplayLocalDraftRecoveryStore
    let model: ScreenplayStudioViewModel
    private let session: URLSession
    private let defaults: UserDefaults
    private let suite = "io.them.StudioSaveIsolation.\(UUID().uuidString)"
    private let directory = FileManager.default.temporaryDirectory.appendingPathComponent("StudioSaveIsolation-\(UUID().uuidString)")

    init(fileProtectionEnforcer: ScreenplayDraftSaveOutbox.FileProtectionEnforcer? = nil) throws {
        defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        outbox = ScreenplayDraftSaveOutbox(storageDirectory: directory, fileProtectionEnforcer: fileProtectionEnforcer)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [DelayedStudioSaveURLProtocol.self]
        session = URLSession(configuration: configuration)
        let api = BackendMemoryAPI(session: session, baseURL: URL(string: "https://\(UUID().uuidString).studio-save-isolation.test")!)
        model = ScreenplayStudioViewModel(draftSaveOutbox: outbox, localDraftRecoveryStore: recovery, draftAPI: api, projectSelectionAPI: api)
        model.autosaveEnabled = false
        DelayedStudioSaveURLProtocol.transport = transport
    }

    func select(project: String, draft: String, version: String) {
        model.selectedProjectID = project
        model.selectedProject = try! JSONDecoder().decode(
            BackendScreenplayProjectSummary.self,
            from: JSONSerialization.data(withJSONObject: ["id": project, "title": project])
        )
        model.applyStructuralUITestDraft("SAVED BASELINE", versionID: version)
        model.fountainDraft = draft
        model.noteManualDraftEdit()
    }

    func close() {
        model.fountainDraft = ""
        model.selectedProjectID = ""
        session.invalidateAndCancel()
        DelayedStudioSaveURLProtocol.transport = nil
        defaults.removePersistentDomain(forName: suite)
        try? FileManager.default.removeItem(at: directory)
    }
}

private enum DelayedStudioSaveResponse {
    case success, conflict, retryable, permanent

    var status: Int {
        switch self {
        case .success: 200
        case .conflict: 409
        case .retryable: 503
        case .permanent: 403
        }
    }

    var body: String {
        switch self {
        case .success:
            #"{"status":"saved","project_id":"project-a","version_id":"saved-a","project":{"id":"project-a","title":"Original project"}}"#
        case .conflict:
            #"{"status":"conflict","conflict":true,"project_id":"project-a","base_version_id":"base-a","server_version_id":"remote-a","server_version":{"id":"remote-a","draft":"REMOTE DRAFT"}}"#
        case .retryable: #"{"error":"temporarily_unavailable"}"#
        case .permanent: #"{"error":"project_access_revoked"}"#
        }
    }
}

private final class DelayedStudioSaveTransport: @unchecked Sendable {
    private let lock = NSLock()
    private var pending: DelayedStudioSaveURLProtocol?
    private var requests: [URLRequest] = []
    private var bodies: [[String: Any]] = []
    var onSave: (() -> Void)?
    var onPreflight: (() -> Void)?
    var onRevision: (() -> Void)?
    var onSession: (() -> Void)?
    var automaticSaveResponse: DelayedStudioSaveResponse?

    var saveRequests: [URLRequest] { lock.withLock { requests } }
    var saveBodies: [[String: Any]] { lock.withLock { bodies } }

    func receive(_ connection: DelayedStudioSaveURLProtocol) {
        if connection.request.url?.path.hasSuffix("/version") == true {
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
            lock.withLock {
                pending = connection
                requests.append(connection.request)
                bodies.append(body)
            }
            onSave?()
            if let automaticSaveResponse { finishSave(automaticSaveResponse) }
        } else if connection.request.url?.path == "/screenplay/projects/project-a" {
            lock.withLock { pending = connection }
            onPreflight?()
        } else if connection.request.url?.path == "/session" {
            if let onSession {
                lock.withLock { pending = connection }
                onSession()
            } else {
                connection.respond(status: 200, body: #"{"client_token":"save-isolation-test","expires_in":3600,"remembered_names":[]}"#)
            }
        } else if connection.request.url?.path == "/screenplay/revision-colors" {
            if let onRevision {
                lock.withLock { pending = connection }
                onRevision()
            } else {
                connection.respond(status: 200, body: #"{"ranges":[],"summary":null}"#)
            }
        } else {
            connection.respond(status: 404, body: #"{"error":"unexpected_test_request"}"#)
        }
    }

    func finishSave(_ response: DelayedStudioSaveResponse) {
        finishSave(status: response.status, body: response.body)
    }

    func finishSave(status: Int, body: String) {
        let connection = lock.withLock {
            defer { pending = nil }
            return pending
        }
        connection?.respond(status: status, body: body)
    }
}

private final class StudioSaveAcknowledgementBarrier: @unchecked Sendable {
    private let lock = NSLock()
    private let semaphore = DispatchSemaphore(value: 0)
    private var onBlocked: (() -> Void)?

    func arm(_ onBlocked: @escaping () -> Void) {
        lock.withLock { self.onBlocked = onBlocked }
    }

    func protect(_ url: URL) throws {
        guard url.lastPathComponent.hasPrefix(".queue-") else { return }
        let callback = lock.withLock {
            defer { onBlocked = nil }
            return onBlocked
        }
        guard let callback else { return }
        callback()
        guard semaphore.wait(timeout: .now() + 3) == .success else {
            throw URLError(.timedOut)
        }
    }

    func release() { semaphore.signal() }
}

private final class DelayedStudioSaveURLProtocol: URLProtocol {
    nonisolated(unsafe) static var transport: DelayedStudioSaveTransport?
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
    func respond(status: Int, body: String) {
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
}
