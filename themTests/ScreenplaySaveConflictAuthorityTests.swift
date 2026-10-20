import XCTest
import ScreenplayStudio
@testable import them

final class ScreenplaySaveConflictAuthorityTests: XCTestCase {
    @MainActor
    func testRecoveredPageUsesDurableCanonicalSaveAndAcknowledgesExactTextOnce() async throws {
        let identity = try RecoveryApplicationTestOwner()
        defer { identity.restore() }
        let fixture = try Fixture()
        defer { fixture.cleanup() }
        let transport = SaveAuthorityTransport(delayed: false)
        let model = fixture.model(api: transport.api())
        let original = model.fountainDraft
        let reply = try RecoveredPageApplicationTests.reply(draft: original)
        let plan = try RecoveredPagePlan.make(reply: reply, draft: original, projectID: "project", versionID: "base")
        let version = try await model.enqueueRecoveredPage(plan, requestID: "recovered-once", expectedAuth: .current())
        XCTAssertEqual(version, "saved-v2")
        XCTAssertEqual(Array(model.fountainDraft.utf8), Array(plan.draft.utf8))
        XCTAssertFalse(model.hasUnsavedDraftChanges)
        XCTAssertEqual(transport.postCount, 1)
        XCTAssertEqual(transport.lastBaseVersion, "base")
        XCTAssertEqual(model.confirmedRecoveredPageVersion(plan.application), "saved-v2")
        let retained = try await fixture.queue.entriesForTesting()
        XCTAssertTrue(retained.isEmpty)
        do {
            _ = try await model.enqueueRecoveredPage(plan, requestID: "recovered-once", expectedAuth: .current())
            XCTFail("Old confirmation cannot apply the page twice.")
        } catch { }
        XCTAssertEqual(transport.postCount, 1)
        XCTAssertEqual(Array(model.fountainDraft.utf8), Array(plan.draft.utf8))
    }

    @MainActor
    func testRecoveredQueuedPageRefusesLateWriterEditAcrossRelaunch() async throws {
        let identity = try RecoveryApplicationTestOwner()
        defer { identity.restore() }
        let fixture = try Fixture()
        defer { fixture.cleanup() }
        let transport = SaveAuthorityTransport(delayed: false)
        let model = fixture.model(api: transport.api())
        let plan = try RecoveredPagePlan.make(reply: RecoveredPageApplicationTests.reply(draft: "Saved base"),
            draft: "Saved base", projectID: "project", versionID: "base")
        try await fixture.queue.enqueue(.init(id: "recovered-stale", projectId: "project", ownerUserId: identity.owner,
            draft: plan.draft, title: "Script", phase: "draft", notes: "", source: "studio_recovered_page",
            studioWriteAnchors: [], screenplayBindings: [], baseVersionId: "base", createdAt: 1, updatedAt: 1,
            status: .pending, retries: 0, nextAttemptAt: 0, lastError: "",
            recoveryOriginalDraftIdentity: plan.application.originalDraftIdentity))
        model.fountainDraft = "Newer writer words, cafe\u{0301}.\r\n"
        model.noteManualDraftEdit()
        let relaunched = ScreenplayStudioViewModel(localDraftRecoveryStore: fixture.recovery,
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: fixture.directory),
            draftSaveAPI: transport.api(), connectsToLiveWorkspace: false)
        let head = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
            from: Data(#"{"id":"project","title":"Script","activeVersionId":"base","versions":[{"id":"base","draft":"Saved base"}]}"#.utf8))
        relaunched.selectedProjectID = "project"
        relaunched.selectedProject = head
        relaunched.fountainDraft = ""
        _ = await relaunched.hydrateDraftRestoringQueuedSaves(from: head)
        await relaunched.resumeQueuedDraftSavesIfNeeded(force: true)
        XCTAssertEqual(Array(relaunched.fountainDraft.utf8), Array("Newer writer words, cafe\u{0301}.\r\n".utf8))
        XCTAssertEqual(transport.postCount, 0)
        let retained = try await ScreenplayDraftSaveOutbox(storageDirectory: fixture.directory).entriesForTesting()
        XCTAssertEqual(retained.first?.status, .parked)
        XCTAssertEqual(retained.first?.recoveryOriginalDraftIdentity, plan.application.originalDraftIdentity)
        XCTAssertEqual(retained.first?.draft, plan.draft)
        XCTAssertFalse(relaunched.errorText.isEmpty)
    }

    @MainActor
    func testParkedConflictRestoresChoiceWhenLocalTextOrNewerRecoveryAlreadyHasServerVersion() async throws {
        for textRestoredFirst in [false, true] {
            let fixture = try Fixture()
            defer { fixture.cleanup() }
            let transport = SaveAuthorityTransport(delayed: false)
            let raw = "  INT. ROOM - NIGHT\r\n\ncafe\u{0301} — keep these newer local words.\t "
            let entry = ScreenplayDraftSaveOutboxEntry(id: "retained-conflict", projectId: "project",
                ownerUserId: fixture.owner, draft: "Earlier retained local words", title: "Script", phase: "draft",
                notes: "", source: "studio_manual", studioWriteAnchors: [], screenplayBindings: [],
                baseVersionId: "writer-base-v1", createdAt: 1, updatedAt: 2, status: .parked,
                retries: 1, nextAttemptAt: 0, lastError: ScreenplayDraftSaveOutbox.conflictReason)
            try await fixture.queue.enqueue(entry)
            let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
                from: JSONSerialization.data(withJSONObject: ["id": "project", "title": "Script",
                    "activeVersionId": "server-v2", "versions": [["id": "server-v2",
                        "draft": "Collaborator text", "updatedAt": 200]]]))
            let restoredQueue = ScreenplayDraftSaveOutbox(storageDirectory: fixture.directory)
            let model = ScreenplayStudioViewModel(localDraftRecoveryStore: fixture.recovery,
                draftSaveOutbox: restoredQueue, draftSaveAPI: transport.api(), connectsToLiveWorkspace: false)
            model.autosaveEnabled = false
            model.selectedProjectID = "project"
            model.selectedProject = project
            model.applyStructuralUITestDraft("Collaborator text", versionID: "server-v2")
            if textRestoredFirst {
                model.fountainDraft = raw
                model.noteManualDraftEdit()
            }
            // The structural fixture clears ordinary recovery. Install the
            // persisted newer text after that setup, not before it.
            fixture.recovery.save(ownerUserId: fixture.owner, projectId: "project", draft: raw,
                baseVersionId: "server-v2", dirty: true, savedAt: 100)
            let hydrated = await model.hydrateDraftRestoringQueuedSaves(from: project)
            XCTAssertTrue(hydrated)
            XCTAssertEqual(Array(model.fountainDraft.utf8), Array(raw.utf8), "Never replace newer writer text with the queued draft or server text.")
            XCTAssertEqual(model.conflictState?.projectId, "project")
            XCTAssertEqual(model.conflictState?.baseVersionId, "writer-base-v1")
            XCTAssertEqual(model.conflictState?.serverVersionId, "server-v2")
            XCTAssertTrue(model.hasUnsavedDraftChanges)
            await model.resumeQueuedDraftSavesIfNeeded(force: true)
            XCTAssertEqual(transport.postCount, 0, "Relaunch is not the writer's Keep Mine choice.")
            let retained = try await ScreenplayDraftSaveOutbox(storageDirectory: fixture.directory).entriesForTesting()
            XCTAssertEqual(retained.count, 1)
            XCTAssertEqual(retained.first?.draft, entry.draft)
            XCTAssertEqual(retained.first?.baseVersionId, "writer-base-v1")
            XCTAssertEqual(retained.first?.status, .parked)
        }
    }

    @MainActor
    func testRecoveredManualSaveDoesNotCreateAnIdenticalAutosaveVersion() async throws {
        let fixture = try Fixture()
        defer { fixture.cleanup() }
        let transport = SaveAuthorityTransport(delayed: false)
        let model = fixture.model(api: transport.api())
        let raw = "  INT. CAPSULE - NIGHT\r\n\nMara waits at the cafe\u{0301}.\t \r\n"
        try await fixture.queue.enqueue(ScreenplayDraftSaveOutboxEntry(
            id: "recovery-manual", projectId: "project", ownerUserId: fixture.owner,
            draft: raw, title: "Script", phase: "draft", notes: "", source: "studio_manual",
            studioWriteAnchors: [], screenplayBindings: [], baseVersionId: "base",
            createdAt: 1, updatedAt: 1, status: .pending,
            retries: 0, nextAttemptAt: 0, lastError: ""))
        await model.resumeQueuedDraftSavesIfNeeded(force: true)
        XCTAssertEqual(transport.postCount, 1)
        // A relaunch/debounce can enqueue another request AFTER the manual
        // acknowledgement. Enqueue-time coalescing cannot see the removed save.
        try await fixture.queue.enqueue(ScreenplayDraftSaveOutboxEntry(
            id: "recovery-autosave", projectId: "project", ownerUserId: fixture.owner,
            draft: raw, title: "Script", phase: "draft", notes: "", source: "studio_autosave",
            studioWriteAnchors: [], screenplayBindings: [], baseVersionId: model.latestVersionID,
            createdAt: 2, updatedAt: 2, status: .pending,
            retries: 0, nextAttemptAt: 0, lastError: ""))
        await model.resumeQueuedDraftSavesIfNeeded(force: true)
        XCTAssertEqual(transport.postCount, 1, "A passive autosave of acknowledged exact bytes must not create another version.")
        XCTAssertEqual(Array(model.fountainDraft.utf8), Array(raw.utf8))
        XCTAssertFalse(model.hasUnsavedDraftChanges)
        let changed = raw + "\r\n"
        model.fountainDraft = changed
        model.noteManualDraftEdit()
        try await fixture.queue.enqueue(ScreenplayDraftSaveOutboxEntry(
            id: "different-autosave", projectId: "project", ownerUserId: fixture.owner,
            draft: changed, title: "Script", phase: "draft", notes: "", source: "studio_autosave",
            studioWriteAnchors: [], screenplayBindings: [], baseVersionId: model.latestVersionID,
            createdAt: 3, updatedAt: 3, status: .pending, retries: 0, nextAttemptAt: 0, lastError: ""))
        await model.resumeQueuedDraftSavesIfNeeded(force: true)
        XCTAssertEqual(transport.postCount, 2, "Even a byte-only whitespace change remains writer work.")
        XCTAssertEqual(Array(model.fountainDraft.utf8), Array(changed.utf8))
        let remaining = try await fixture.queue.entriesForTesting()
        XCTAssertTrue(remaining.isEmpty)
        model.snapshotLabel = "Explicit same-text checkpoint"
        await model.createRevisionSnapshot()
        XCTAssertEqual(transport.postCount, 3, "An explicit checkpoint must still be honored for identical text.")
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testSatisfiedAutosaveRequiresExactBaseAndPreservesOtherRetainedCopies() async throws {
        let fixture = try Fixture()
        defer { fixture.cleanup() }
        let raw = "cafe\u{0301}\r\n"
        for source in ["studio_manual", "studio_snapshot", "studio_conflict_resolve"] {
            XCTAssertFalse(ScreenplayDraftSaveCoalescingPolicy.isSatisfiedAutosave(draft: raw, source: source,
                notes: "", baseVersion: "v2", confirmedDraft: raw, confirmedVersion: "v2"))
        }
        for (draft, notes, base, confirmed) in [(raw + " ", "", "v2", "v2"), ("café\r\n", "", "v2", "v2"),
            (raw, "Keep this note", "v2", "v2"), (raw, "", "v1", "v2"), (raw, "", "", "")] {
            XCTAssertFalse(ScreenplayDraftSaveCoalescingPolicy.isSatisfiedAutosave(draft: draft, source: "studio_autosave",
                notes: notes, baseVersion: base, confirmedDraft: raw, confirmedVersion: confirmed))
        }
        let duplicate = ScreenplayDraftSaveOutboxEntry(id: "passive", projectId: "project", ownerUserId: fixture.owner,
            draft: raw, title: "Script", phase: "draft", notes: "", source: "studio_autosave", studioWriteAnchors: [],
            screenplayBindings: [], baseVersionId: "v2", createdAt: 2, updatedAt: 2, status: .pending,
            retries: 0, nextAttemptAt: 0, lastError: "")
        let retained = ScreenplayDraftSaveOutboxEntry(id: "retained-choice", projectId: "project", ownerUserId: fixture.owner,
            draft: raw, title: "Script", phase: "draft", notes: "", source: "studio_snapshot", studioWriteAnchors: [],
            screenplayBindings: [], baseVersionId: "v2", createdAt: 1, updatedAt: 1, status: .parked,
            retries: 0, nextAttemptAt: 0, lastError: "")
        try await fixture.queue.enqueue(retained)
        try await fixture.queue.enqueue(duplicate)
        let rejected = try await fixture.queue.markSatisfiedAutosave(id: duplicate.id, projectId: "project",
            ownerUserId: "wrong-owner", confirmedDraft: raw, confirmedVersion: "v2")
        XCTAssertFalse(rejected)
        let accepted = try await fixture.queue.markSatisfiedAutosave(id: duplicate.id, projectId: "project",
            ownerUserId: fixture.owner, confirmedDraft: raw, confirmedVersion: "v2")
        XCTAssertTrue(accepted)
        let remaining = try await fixture.queue.entriesForTesting()
        XCTAssertEqual(remaining, [retained], "A local duplicate acknowledgement cannot delete another retained draft.")
    }

    @MainActor
    func testBlankSnapshotDuringBackgroundDrainIsNotDropped() async throws {
        let fixture = try Fixture()
        defer { fixture.cleanup() }
        let transport = SaveAuthorityTransport(delayed: true)
        defer { transport.finish() }
        let model = fixture.model(api: transport.api())
        let queued = ScreenplayDraftSaveOutboxEntry(
            id: "earlier-save", projectId: "project", ownerUserId: fixture.owner,
            draft: "Earlier queued writer words", title: "Script", phase: "draft", notes: "",
            source: "studio_manual", studioWriteAnchors: [], screenplayBindings: [],
            baseVersionId: "base", createdAt: 1, updatedAt: 1, status: .pending,
            retries: 0, nextAttemptAt: 0, lastError: "")
        try await fixture.queue.enqueue(queued)
        let drain = Task { await model.resumeQueuedDraftSavesIfNeeded(force: true) }
        await fulfillment(of: [transport.started], timeout: 3)
        model.fountainDraft = ""
        model.noteManualDraftEdit()
        model.snapshotLabel = "Intentional blank snapshot"
        await model.createRevisionSnapshot()
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        transport.finish()
        await drain.value
        XCTAssertEqual(transport.postCount, 2, "A save submitted during background draining must not be left in an unconsumed pending slot.")
        XCTAssertEqual(transport.lastBaseVersion, "saved-v2", "The pending snapshot must follow the acknowledged earlier version.")
        XCTAssertEqual(model.fountainDraft, "")
        XCTAssertFalse(model.hasUnsavedDraftChanges)
        XCTAssertEqual(model.snapshotLabel, "")
        let entries = try await fixture.queue.entriesForTesting()
        XCTAssertTrue(entries.isEmpty)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

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
