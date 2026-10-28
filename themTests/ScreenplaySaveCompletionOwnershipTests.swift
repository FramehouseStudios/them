import Foundation
import XCTest
@testable import them

/// Real VM save -> BackendMemoryAPI -> URLSession -> durable draft outbox.
/// The version-write HTTP peer is deterministic; this is not provider proof.
@MainActor
final class ScreenplaySaveCompletionOwnershipTests: XCTestCase {
    func testAcknowledgedASaveCannotRebindBOrCopyItsWordsIntoARecovery() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let save = fixture.startSave()
        defer { save.cancel() }
        try await fixture.waitForFirstSave()
        fixture.select("b", draft: fixture.b, base: "b-base", dirty: true)
        let before = fixture.snapshot()
        fixture.peer.releaseFirst(.success)
        try await fixture.waitForSave(save)
        XCTAssertEqual(fixture.snapshot(), before, "A's acknowledgement changed B's UI or recovery")
        let rows = try await fixture.queue.entriesForTesting()
        XCTAssertTrue(rows.isEmpty, "A's real acknowledgement did not retire its own queue entry")
        let aRecovery = fixture.store.payloads(ownerUserId: fixture.owner)["a"]
        XCTAssertEqual((aRecovery?["draft"] as? String).map { Data($0.utf8) }, Data(fixture.a.utf8))
        XCTAssertEqual(aRecovery?["baseVersionId"] as? String, "a-ack-1")
        XCTAssertEqual(fixture.peer.writes.count, 1)
    }

    func testAConflictAfterSelectingBKeepsARequestAndLeavesBExactlyAlone() async throws {
        try await assertRejectedAStaysScoped(.conflict, expectedStatus: .parked)
    }

    func testAFailureAfterSelectingBKeepsARequestAndLeavesBExactlyAlone() async throws {
        try await assertRejectedAStaysScoped(.offline, expectedStatus: .pending)
    }

    func testSameDocumentNewerAEditsStayDirtyOnTheAcknowledgedBase() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let save = fixture.startSave()
        defer { save.cancel() }
        try await fixture.waitForFirstSave()
        let newer = fixture.a + "\r\nThe writer adds cafe\u{0301}. \t "
        fixture.model.fountainDraft = newer
        fixture.model.noteManualDraftEdit()
        _ = fixture.model.mirrorDraftIntoLiveBridgeIfOwned(newer)
        fixture.store.save(ownerUserId: fixture.owner, projectId: "a", draft: newer,
                           baseVersionId: "a-base", dirty: true)
        fixture.peer.releaseFirst(.success)
        try await fixture.waitForSave(save)
        XCTAssertEqual(fixture.model.selectedProjectID, "a")
        XCTAssertEqual(fixture.model.latestVersionID, "a-ack-1")
        XCTAssertTrue(fixture.model.fountainDraft.utf8.elementsEqual(newer.utf8))
        XCTAssertTrue(fixture.model.hasUnsavedDraftChanges)
        let kept = fixture.store.payloads(ownerUserId: fixture.owner)["a"]
        XCTAssertEqual((kept?["draft"] as? String).map { Data($0.utf8) }, Data(newer.utf8))
        XCTAssertEqual(kept?["baseVersionId"] as? String, "a-ack-1")
        XCTAssertEqual(kept?["dirty"] as? Bool, true)
        XCTAssertEqual(fixture.peer.writes.count, 1, "A's completion manufactured another save")
    }

    func testPendingAUsesAAcknowledgementEvenWhenBIsNowVisible() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let save = fixture.startSave()
        defer { save.cancel() }
        try await fixture.waitForFirstSave()
        let newer = fixture.a + "\r\nA second exact line.  "
        fixture.model.fountainDraft = newer
        fixture.model.hasUnsavedDraftChanges = true
        await fixture.model.manualSaveDraft() // Enters the real pending slot; HTTP A is still held.
        fixture.select("b", draft: fixture.b, base: "b-base", dirty: true)
        let before = fixture.snapshot()
        fixture.peer.releaseFirst(.success)
        try await fixture.waitForSave(save)
        let writes = fixture.peer.writes
        XCTAssertEqual(writes.map(\.project), ["a", "a"])
        XCTAssertEqual(writes.map(\.base), ["a-base", "a-ack-1"])
        XCTAssertEqual(writes.last.map { Data($0.draft.utf8) }, Data(newer.utf8))
        XCTAssertEqual(fixture.snapshot(), before)
        let kept = fixture.store.payloads(ownerUserId: fixture.owner)["a"]
        XCTAssertEqual((kept?["draft"] as? String).map { Data($0.utf8) }, Data(newer.utf8))
        XCTAssertEqual(kept?["baseVersionId"] as? String, "a-ack-2")
        XCTAssertEqual(kept?["dirty"] as? Bool, false)
    }

    func testPendingBKeepsItsOwnBaseRatherThanAAcknowledgement() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let save = fixture.startSave()
        defer { save.cancel() }
        try await fixture.waitForFirstSave()
        fixture.select("b", draft: fixture.b, base: "b-base", dirty: true)
        await fixture.model.manualSaveDraft()
        fixture.peer.releaseFirst(.success)
        try await fixture.waitForSave(save)
        let writes = fixture.peer.writes
        XCTAssertEqual(writes.map(\.project), ["a", "b"])
        XCTAssertEqual(writes.map(\.base), ["a-base", "b-base"])
        XCTAssertEqual(writes.last.map { Data($0.draft.utf8) }, Data(fixture.b.utf8))
        XCTAssertEqual(fixture.model.selectedProjectID, "b")
        XCTAssertEqual(fixture.model.latestVersionID, "b-ack-2")
        XCTAssertFalse(fixture.model.hasUnsavedDraftChanges)
        let rows = try await fixture.queue.entriesForTesting()
        XCTAssertTrue(rows.isEmpty)
    }

    private func assertRejectedAStaysScoped(_ outcome: SaveCompletionPeer.Outcome,
                                           expectedStatus: ScreenplayDraftSaveOutboxStatus) async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let save = fixture.startSave()
        defer { save.cancel() }
        try await fixture.waitForFirstSave()
        fixture.select("b", draft: fixture.b, base: "b-base", dirty: true)
        let before = fixture.snapshot()
        fixture.peer.releaseFirst(outcome)
        try await fixture.waitForSave(save)
        XCTAssertEqual(fixture.snapshot(), before)
        let rows = try await fixture.queue.entriesForTesting()
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows.first?.projectId, "a")
        XCTAssertEqual(rows.first?.status, expectedStatus)
        XCTAssertEqual(rows.first.map { Data($0.draft.utf8) }, Data(fixture.a.utf8))
        XCTAssertEqual(fixture.peer.writes.count, 1)
    }
}

@MainActor
private final class SaveCompletionFixture {
    let a = "INT. A - NIGHT\r\n\r\nA's cafe\u{0301} stays open. \t "
    let b = "INT. B - DAY\r\n\r\nB's exact words stay here.  \r\n"
    let model: ScreenplayStudioViewModel
    let queue: ScreenplayDraftSaveOutbox
    let store: ScreenplayLocalDraftRecoveryStore
    let owner: String
    let peer: SaveCompletionPeer
    private let directory: URL
    private let defaults: UserDefaults
    private let suite: String
    private let session: URLSession
    private let started: XCTestExpectation
    private let finished = XCTestExpectation(description: "Actual VM save completed")
    private let priorDraft: String
    private let priorProject: String
    private let priorVersion: String
    private let priorBinding: ScreenplayProjectBindingSnapshot

    init() throws {
        let bridge = ScreenplayLiveDraftBridge.shared
        bridge.reconcileAccountStorage()
        priorDraft = bridge.draftText; priorProject = bridge.preferredProjectID
        priorVersion = bridge.preferredVersionID; priorBinding = bridge.projectBinding
        owner = ScreenplayStudioAuthContext.current().userID
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("SaveCompletion-\(UUID())")
        suite = "them.save-completion.\(UUID())"
        defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        store = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        queue = ScreenplayDraftSaveOutbox(storageDirectory: directory)
        started = XCTestExpectation(description: "A's actual version request reached URLSession")
        peer = SaveCompletionPeer(started: started)
        SaveCompletionProtocol.install(peer)
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [SaveCompletionProtocol.self]
        session = URLSession(configuration: config)
        let api = BackendMemoryAPI(session: session, baseURL: URL(string: "https://save-completion.test")!)
        model = ScreenplayStudioViewModel(localDraftRecoveryStore: store, draftSaveOutbox: queue, draftSaveAPI: api)
        model.autosaveEnabled = false
    }

    func select(_ id: String, draft: String, base: String, dirty: Bool = false) {
        let data = try! JSONSerialization.data(withJSONObject: ["id": id, "title": id.uppercased()])
        let project = try! JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data)
        model.projects = [project]
        model.selectedProjectID = id
        model.selectedProject = project
        model.applyStructuralUITestDraft(dirty ? draft + "\nEarlier saved baseline." : draft, versionID: base)
        if dirty { model.fountainDraft = draft; model.noteManualDraftEdit() }
        _ = ScreenplayLiveDraftBridge.shared.adoptLoadedProjectDraft(draft, projectID: id,
            versionID: base, owner: .current())
        model.hasUnsavedDraftChanges = dirty
        model.autosaveStatusText = "Editing \(id)"
        model.infoText = "Current \(id) notice"
        model.errorText = "Current \(id) local status"
        store.save(ownerUserId: owner, projectId: id, draft: draft, baseVersionId: base, dirty: dirty)
    }

    func startSave() -> Task<Void, Never> {
        let model = model, finished = finished
        return Task { @MainActor in
            await model.manualSaveDraft()
            finished.fulfill()
        }
    }

    func waitForFirstSave() async throws {
        let result = await XCTWaiter.fulfillment(of: [started], timeout: 3)
        XCTAssertEqual(result, .completed)
        guard !peer.writes.isEmpty else { throw URLError(.timedOut) }
    }

    func waitForSave(_ task: Task<Void, Never>) async throws {
        let result = await XCTWaiter.fulfillment(of: [finished], timeout: 5)
        XCTAssertEqual(result, .completed)
        guard result == .completed else { task.cancel(); peer.close(); throw URLError(.timedOut) }
        await task.value
    }

    struct Snapshot: Equatable {
        let project: String
        let selectedProject: String?
        let version: String
        let draft: Data
        let dirty: Bool
        let loaded: String
        let info: String
        let error: String
        let recovery: Data
    }

    func snapshot() -> Snapshot {
        let payload = (store.payloads(ownerUserId: owner)["b"] ?? [:]).filter { $0.key != "savedAt" }
        let data = try! JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
        return .init(project: model.selectedProjectID, selectedProject: model.selectedProject?.id,
            version: model.latestVersionID, draft: Data(model.fountainDraft.utf8), dirty: model.hasUnsavedDraftChanges,
            loaded: model.debugLoadedDraftProjectID,
            info: model.infoText, error: model.errorText, recovery: data)
    }

    func close() {
        peer.close(); session.invalidateAndCancel()
        SaveCompletionProtocol.uninstall(peer)
        let queue = queue
        Task { await queue.stopNetworkMonitoring() }
        defaults.removePersistentDomain(forName: suite)
        try? FileManager.default.removeItem(at: directory)
        let bridge = ScreenplayLiveDraftBridge.shared
        bridge.projectBinding = priorBinding
        _ = bridge.adoptLoadedProjectDraft(priorDraft, projectID: priorProject, versionID: priorVersion, owner: .current())
    }
}

private nonisolated final class SaveCompletionPeer: @unchecked Sendable {
    enum Outcome { case success, conflict, offline }
    struct Write { let project: String; let base: String; let draft: String }
    private let lock = NSLock()
    private var recorded: [Write] = []
    private var held: (SaveCompletionProtocol, Write)?
    private let started: XCTestExpectation
    init(started: XCTestExpectation) { self.started = started }
    var writes: [Write] { lock.lock(); defer { lock.unlock() }; return recorded }

    func accept(_ transport: SaveCompletionProtocol, request: URLRequest) {
        do {
            let path = request.url!.path
            if path == "/screenplay/revision-colors" {
                transport.respond(status: 200, payload: ["ranges": []])
                return
            }
            guard path.hasSuffix("/version") else {
                transport.respond(status: 503, payload: ["error": "fixture endpoint unavailable"])
                return
            }
            var data = request.httpBody ?? Data()
            if data.isEmpty, let stream = request.httpBodyStream {
                stream.open(); defer { stream.close() }
                var buffer = [UInt8](repeating: 0, count: 4096)
                while true {
                    let count = stream.read(&buffer, maxLength: buffer.count)
                    if count <= 0 { break }; data.append(contentsOf: buffer.prefix(count))
                }
            }
            let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
            let write = Write(project: path.split(separator: "/").dropLast().last.map(String.init) ?? "",
                base: payload["base_version_id"] as? String ?? "", draft: try XCTUnwrap(payload["draft"] as? String))
            lock.lock(); recorded.append(write); let count = recorded.count
            if count == 1 { held = (transport, write) }; lock.unlock()
            if count == 1 { started.fulfill() }
            else { respond(transport, write: write, outcome: .success, number: count) }
        } catch { transport.fail(error) }
    }

    func releaseFirst(_ outcome: Outcome) {
        lock.lock(); let pending = held; held = nil; lock.unlock()
        if let (transport, write) = pending { respond(transport, write: write, outcome: outcome, number: 1) }
    }

    private func respond(_ transport: SaveCompletionProtocol, write: Write, outcome: Outcome, number: Int) {
        switch outcome {
        case .offline: transport.fail(URLError(.notConnectedToInternet))
        case .conflict:
            transport.respond(status: 409, payload: ["status": "conflict", "conflict": true,
                "project_id": write.project, "base_version_id": write.base, "server_version_id": "a-remote",
                "server_version": ["id": "a-remote", "draft": "Other A words"]])
        case .success:
            let version = "\(write.project)-ack-\(number)"
            transport.respond(status: 200, payload: ["status": "saved", "project_id": write.project,
                "version_id": version, "project": ["id": write.project, "title": write.project.uppercased()],
                "version": ["id": version, "draft": write.draft]])
        }
    }

    func close() {
        lock.lock(); let pending = held; held = nil; lock.unlock()
        pending?.0.fail(URLError(.cancelled))
    }
}

private nonisolated final class SaveCompletionProtocol: URLProtocol {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var installed: SaveCompletionPeer?
    private var peer: SaveCompletionPeer?
    private let callbackLock = NSRecursiveLock()
    private var closed = false
    static func install(_ peer: SaveCompletionPeer) { lock.lock(); installed = peer; lock.unlock() }
    static func uninstall(_ peer: SaveCompletionPeer) {
        lock.lock(); defer { lock.unlock() }
        if installed === peer { installed = nil }
    }
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "save-completion.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.lock.lock(); peer = Self.installed; Self.lock.unlock()
        peer?.accept(self, request: request)
    }
    override func stopLoading() { callbackLock.lock(); closed = true; callbackLock.unlock() }
    func fail(_ error: Error) {
        callbackLock.lock(); defer { callbackLock.unlock() }
        guard !closed else { return }; closed = true
        client?.urlProtocol(self, didFailWithError: error)
    }
    func respond(status: Int, payload: [String: Any]) {
        callbackLock.lock(); defer { callbackLock.unlock() }
        guard !closed else { return }
        do {
            let data = try JSONSerialization.data(withJSONObject: payload)
            closed = true
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1",
                                           headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { fail(error) }
    }
}
