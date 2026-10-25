import Foundation
import XCTest
@testable import them

@MainActor
final class ScreenplaySaveCompletionContextTests: XCTestCase {
    func testConfirmedSaveAfterProjectSwitchCannotAdoptItsReceiptIntoTheNewPage() async throws {
        try await assertSaveCompletion(.confirmed)
    }

    func testFailedSaveAfterProjectSwitchRetainsOnlyItsOriginalRecoveryWords() async throws {
        try await assertSaveCompletion(.retryableFailure)
    }

    func testConflictedSaveAfterProjectSwitchParksItsOriginalRequestWithoutChangingTheNewPage() async throws {
        try await assertSaveCompletion(.conflict)
    }

    func testOldConfirmedSaveCannotRollbackANewerVersionOfTheSameProject() async throws {
        try await assertSaveCompletion(.confirmed, newerSameProject: true)
    }

    func testDetachedConfirmedSaveDurablyHandsOffTheOtherProjectsWaitingSaveWithoutRebasingIt() async throws {
        try await assertSaveCompletion(.confirmed, queueOtherSave: true)
    }

    func testDebugOwnerFallbackAfterProjectSwitchCannotLeaveAnInflightSaveWithoutATask() async throws {
        try await assertSaveCompletion(.debugNotFound)
    }

    private enum Completion { case confirmed, retryableFailure, conflict, debugNotFound }

    private func assertSaveCompletion(_ completion: Completion, newerSameProject: Bool = false,
                                      queueOtherSave: Bool = false) async throws {
        let suite = "THEM-save-completion-\(UUID())", defaults = UserDefaults(suiteName: suite)!
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(suite, isDirectory: true)
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: directory)
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let gate = SaveCompletionResponseGate()
        defer {
            gate.release(); defaults.removePersistentDomain(forName: suite)
            SaveCompletionProtocol.handler = nil; SaveCompletionProtocol.scheduler = nil
            try? FileManager.default.removeItem(at: directory) // Only this test's owned queue.
        }
        let a = "save-completion-a-\(UUID().uuidString)", b = "save-completion-b"
        if completion == .debugNotFound {
            ScreenplayLiveDraftBridge.shared.rememberDebugClientTokenOwnedProjectID(a, clientToken: "local-test-client-owner")
        }
        let before = "INT. ORIGINAL ROOM - NIGHT\n\nBefore."
        let writerA = before + "\n\nMARA\nKeep A's exact words. \t"
        let writerB = "INT. OTHER ROOM - DAY\r\n\r\nKeep B's Café words. \t"
        let savedA = try project(a, draft: writerA, version: "a-confirmed")
        let payload: Data
        let status: Int
        switch completion {
        case .confirmed:
            status = 200
            payload = try JSONSerialization.data(withJSONObject: ["version_id": "a-confirmed", "project_id": a,
                "project": ["id": a, "title": a], "version": ["id": "a-confirmed", "draft": writerA]])
        case .conflict:
            status = 409
            payload = try JSONSerialization.data(withJSONObject: ["status": "conflict", "conflict": true,
                "base_version_id": "a-base", "server_version_id": "a-remote",
                "server_version": ["id": "a-remote", "draft": "A's other-device words"]])
        case .retryableFailure:
            status = 503; payload = Data(#"{"error":"held_local_save_failure"}"#.utf8)
        case .debugNotFound:
            status = 404; payload = Data(#"{"error":"held_local_missing_debug_project"}"#.utf8)
        }
        let requested = expectation(description: "Real version POST waits before its acknowledgement")
        SaveCompletionProtocol.handler = { request in
            request.url?.path == "/screenplay/projects/\(a)/version"
                ? (status, payload) : (503, Data(#"{"error":"local_fixture_only"}"#.utf8))
        }
        SaveCompletionProtocol.scheduler = { request, send in
            if request.url?.path == "/screenplay/projects/\(a)/version" { gate.hold(send); requested.fulfill() }
            else { send() }
        }
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [SaveCompletionProtocol.self]
        let api = BackendMemoryAPI(session: URLSession(configuration: config), baseURL: URL(string: "https://save-completion.test")!)
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue, projectSelectionAPI: api)
        model.autosaveEnabled = false
        model.selectedProjectID = a; model.selectedProject = savedA
        model.applyStructuralUITestDraft(before, versionID: "a-base")
        model.fountainDraft = writerA; model.noteManualDraftEdit()
        let save = Task { await model.manualSaveDraft() }
        await fulfillment(of: [requested], timeout: 4)
        let inflight = try await queue.entriesForTesting()
        XCTAssertEqual(inflight.count, 1)
        XCTAssertEqual(inflight.first?.projectId, a)
        XCTAssertEqual(inflight.first?.draft, writerA)
        let currentProject = newerSameProject ? a : b
        let currentVersion = newerSameProject ? "a-newer-saved-version" : "b-base"
        let currentDraft = newerSameProject ? writerA + "\n\nNewer saved writer words." : writerB
        model.selectedProjectID = currentProject
        model.selectedProject = try project(currentProject, draft: currentDraft, version: currentVersion)
        model.applyStructuralUITestDraft(newerSameProject ? currentDraft : "B's saved baseline", versionID: currentVersion)
        if !newerSameProject {
            model.fountainDraft = currentDraft
            model.noteManualDraftEdit()
            XCTAssertTrue(model.hasUnsavedDraftChanges, "The fixture must create a real B edit after its saved baseline.")
        }
        model.autosaveStatusText = "B has unsaved words"; model.infoText = "B's current notice"
        if queueOtherSave {
            XCTAssertTrue(model.debugIsDraftSaveInFlight)
            await model.manualSaveDraft() // Waits in the real claimed save slot, not an injected queue.
        }
        gate.release()
        await save.value
        XCTAssertEqual(model.selectedProjectID, currentProject, "An old save acknowledgement must not reopen project A.")
        XCTAssertEqual(model.selectedProject?.id, currentProject)
        XCTAssertEqual(model.debugLoadedDraftProjectID, currentProject)
        XCTAssertEqual(model.latestVersionID, currentVersion, "A late receipt must not roll back a newer saved base.")
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(currentDraft.utf8))
        XCTAssertEqual(model.hasUnsavedDraftChanges, !newerSameProject)
        XCTAssertNil(model.conflictState, "A's delayed conflict is not a conflict in B's page.")
        if !queueOtherSave {
            XCTAssertEqual(model.autosaveStatusText, "B has unsaved words")
            XCTAssertEqual(model.infoText, "B's current notice")
        }
        if !newerSameProject {
            XCTAssertEqual(recovery.payloads(ownerUserId: inflight.first?.ownerUserId ?? "")[a]?["draft"] as? String, writerA)
        }
        let remaining = try await queue.entriesForTesting()
        if queueOtherSave {
            XCTAssertEqual(remaining.count, 1, "The other project's waiting save must not be dropped or replayed with A's base.")
            let waiting = try XCTUnwrap(remaining.first)
            XCTAssertEqual(waiting.projectId, b)
            XCTAssertEqual(waiting.baseVersionId, "b-base")
            XCTAssertEqual(Data(waiting.draft.utf8), Data(writerB.utf8))
            XCTAssertEqual(waiting.status, .pending)
        } else if completion == .confirmed {
            XCTAssertTrue(remaining.isEmpty, "A's actual confirmed save still needs its durable queue acknowledgement.")
        } else {
            XCTAssertEqual(remaining.count, 1)
            XCTAssertEqual(remaining.first?.projectId, a)
            XCTAssertEqual(remaining.first?.draft, writerA)
            XCTAssertEqual(remaining.first?.status, completion == .retryableFailure ? .pending : .parked)
            if completion == .conflict { XCTAssertEqual(remaining.first?.lastError, ScreenplayDraftSaveOutbox.conflictReason) }
        }
        await queue.stopNetworkMonitoring()
    }

    private func project(_ id: String, draft: String, version: String) throws -> BackendScreenplayProjectSummary {
        try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
            from: JSONSerialization.data(withJSONObject: ["id": id, "title": id, "activeVersionId": version,
                "versions": [["id": version, "draft": draft, "updatedAt": 1]]]))
    }
}

private final class SaveCompletionResponseGate: @unchecked Sendable {
    private let lock = NSLock()
    private var response: (() -> Void)?
    func hold(_ send: @escaping () -> Void) { lock.lock(); response = send; lock.unlock() }
    func release() { lock.lock(); let send = response; response = nil; lock.unlock(); send?() }
}

private final class SaveCompletionProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) -> (Int, Data))?
    nonisolated(unsafe) static var scheduler: ((URLRequest, @escaping () -> Void) -> Void)?
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "save-completion.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let (status, data) = Self.handler!(request)
        let send = {
            self.client?.urlProtocol(self, didReceive: HTTPURLResponse(url: self.request.url!, statusCode: status,
                httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
            self.client?.urlProtocol(self, didLoad: data)
            self.client?.urlProtocolDidFinishLoading(self)
        }
        if let schedule = Self.scheduler { schedule(request, send) } else { send() }
    }
    override func stopLoading() {}
}
