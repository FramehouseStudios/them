import Foundation
import XCTest
@testable import them

final class ScreenplayDraftSaveEvidenceTests: XCTestCase {
    private let owner = ScreenplayStudioAuthContext(userID: "writer-a", sessionIntentGeneration: 7)
    private let backend = URL(string: "https://save-evidence.test")!
    private let raw = "INT. CAFE - NIGHT\r\n\r\nA cafe\u{0301} stays open. \t \r\n"

    func testPostEvidenceUsesImmutableRequestAndExactEcho() throws {
        let entry = entry()
        let evidence = try XCTUnwrap(ordinary(entry, version: version(entry)))
        XCTAssertEqual(evidence.requestID, entry.id)
        XCTAssertEqual(evidence.owner, owner)
        XCTAssertEqual(evidence.projectID, "project-a")
        XCTAssertEqual(evidence.versionID, "version-a")
        XCTAssertEqual(evidence.documentID, "document-a")
        XCTAssertEqual(evidence.backendURL, backend)
        XCTAssertEqual(Data(evidence.draft.utf8), Data(raw.utf8))
        XCTAssertNil(evidence.promotedFromProjectID)
        XCTAssertNil(evidence.initialProjectReceiptID)
    }

    func testMissingOrContradictoryPostEchoCannotBecomeSaveEvidence() throws {
        let entry = entry()
        let patches: [[String: Any]] = [
            ["id": "other-version"], ["projectId": "project-b"],
            ["clientRequestId": "other-request"], ["clientRequestId": NSNull()],
            ["draft": NSNull()], ["draft": raw + " "], ["projectId": NSNull()]
        ]
        for patch in patches {
            XCTAssertNil(ordinary(entry, version: try version(entry, patch: patch)), "Accepted bad echo: \(patch.keys)")
        }
        XCTAssertNil(ScreenplayConfirmedDraftSave.ordinary(entry: entry, version: try version(entry),
            versionID: nil, projectID: entry.projectId, responseURL: backend,
            owner: owner, currentOwner: owner))
        XCTAssertNil(ScreenplayConfirmedDraftSave.ordinary(entry: entry, version: try version(entry),
            versionID: "version-a", projectID: nil, responseURL: backend,
            owner: owner, currentOwner: owner))
    }

    func testCanonicalUnicodeEqualityIsNotExactSavedWriterBytes() throws {
        let entry = entry()
        let composed = raw.precomposedStringWithCanonicalMapping
        XCTAssertEqual(raw, composed)
        XCTAssertNotEqual(Data(raw.utf8), Data(composed.utf8))
        XCTAssertNil(ordinary(entry, version: try version(entry, patch: ["draft": composed])))
    }

    func testMissingProvenanceWrongOriginAndChangedOwnerKeepReply() throws {
        var entry = entry()
        let echoed = try version(entry)
        entry.deliveryOrigin = nil
        XCTAssertNil(ordinary(entry, version: echoed))
        entry = self.entry()
        for url in [nil, URL(string: "https://other-backend.test/version"),
                    URL(string: "http://save-evidence.test/version"),
                    URL(string: "https://credential@save-evidence.test/version")] {
            XCTAssertNil(ScreenplayConfirmedDraftSave.ordinary(entry: entry, version: echoed,
                versionID: echoed.id, projectID: entry.projectId, responseURL: url,
                owner: owner, currentOwner: owner))
        }
        for changed in [ScreenplayStudioAuthContext(userID: "writer-b", sessionIntentGeneration: 7),
                        ScreenplayStudioAuthContext(userID: owner.userID, sessionIntentGeneration: 8)] {
            XCTAssertNil(ScreenplayConfirmedDraftSave.ordinary(entry: entry, version: echoed,
                versionID: echoed.id, projectID: entry.projectId, responseURL: backend,
                owner: owner, currentOwner: changed))
        }
    }

    func testReadbackMayProveExactVersionWithAnotherOriginalRequestID() throws {
        let entry = entry()
        let echoed = try version(entry, patch: ["clientRequestId": "earlier-device-request"])
        XCTAssertNil(ordinary(entry, version: echoed))
        let proof = try XCTUnwrap(ScreenplayConfirmedDraftSave.readback(entry: entry, version: echoed,
            projectID: entry.projectId, responseURL: backend.appendingPathComponent("screenplay/projects/project-a"),
            owner: owner, currentOwner: owner))
        XCTAssertEqual(proof.requestID, entry.id)
        XCTAssertEqual(proof.documentID, "document-a")
        XCTAssertEqual(proof.backendURL, backend)
        XCTAssertNil(ScreenplayConfirmedDraftSave.readback(entry: entry, version: echoed,
            projectID: "project-b", responseURL: backend, owner: owner, currentOwner: owner))
    }

    func testInitialEvidenceKeepsOriginalDocumentAndPromotionReceipt() throws {
        var entry = entry()
        entry.initialization = .init(documentID: "document-a", backendURL: backend, sourceProjectID: "")
        let proof = try XCTUnwrap(ScreenplayConfirmedDraftSave.initial(entry: entry, version: try version(entry),
            versionID: "version-a", projectID: entry.projectId, responseURL: backend,
            owner: owner, currentOwner: owner))
        XCTAssertEqual(proof.promotedFromProjectID, "")
        XCTAssertEqual(proof.initialProjectReceiptID, entry.id)
        XCTAssertEqual(proof.initialProjectVersionID, "version-a")
        XCTAssertEqual(proof.documentID, "document-a")
        entry.deliveryOrigin = .init(documentID: "document-b", backendURL: backend)
        XCTAssertNil(ScreenplayConfirmedDraftSave.initial(entry: entry, version: try version(entry),
            versionID: "version-a", projectID: entry.projectId, responseURL: backend,
            owner: owner, currentOwner: owner))
        entry.deliveryOrigin = nil
        XCTAssertNil(ScreenplayConfirmedDraftSave.initial(entry: entry, version: try version(entry),
            versionID: "version-a", projectID: entry.projectId, responseURL: backend,
            owner: owner, currentOwner: owner))
    }

    func testCaptureRejectsInactiveEditorAndOtherDocumentOwnerOrProject() {
        let document = ScreenplayLiveTalkDocument(owner: owner, projectID: "project-a", documentID: "document-a")
        let origin = ScreenplayDraftSaveOrigin.capture(document: document, projectID: "project-a",
            owner: owner, isActiveEditor: true, backendURL: backend.appendingPathComponent("a/path"))
        XCTAssertEqual(origin, .init(documentID: "document-a", backendURL: backend))
        XCTAssertNil(ScreenplayDraftSaveOrigin.capture(document: document, projectID: "project-a",
            owner: owner, isActiveEditor: false, backendURL: backend))
        XCTAssertNil(ScreenplayDraftSaveOrigin.capture(document: document, projectID: "project-b",
            owner: owner, isActiveEditor: true, backendURL: backend))
        XCTAssertNil(ScreenplayDraftSaveOrigin.capture(document: document, projectID: "project-a",
            owner: .init(userID: "writer-b", sessionIntentGeneration: 7), isActiveEditor: true, backendURL: backend))
        XCTAssertNil(ScreenplayDraftSaveOrigin.capture(document: nil, projectID: "project-a",
            owner: owner, isActiveEditor: true, backendURL: backend))
    }

    func testProvenanceRejectsAnotherBackendBeforeDispatch() {
        let origin = ScreenplayDraftSaveOrigin(documentID: "document-a", backendURL: backend)
        XCTAssertTrue(origin.permitsBackend(backend.appendingPathComponent("screenplay/projects/project-a/version")))
        XCTAssertFalse(origin.permitsBackend(URL(string: "https://save-evidence.test:444/version")!))
        XCTAssertFalse(origin.permitsBackend(URL(string: "http://save-evidence.test/version")!))
        XCTAssertFalse(origin.permitsBackend(URL(string: "https://writer@save-evidence.test/version")!))
        XCTAssertFalse(origin.permitsBackend(URL(string: "https://other-backend.test/version")!))
    }

    func testRetryAndRestartPreserveOriginalProvenance() async throws {
        let folder = temporaryFolder(); defer { try? FileManager.default.removeItem(at: folder) }
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: folder)
        let entry = entry()
        try await queue.enqueue(entry)
        try await queue.markInflight(id: entry.id)
        try await queue.markRetryable(id: entry.id, error: "Local acknowledgement storage interrupted")
        let restarted = ScreenplayDraftSaveOutbox(storageDirectory: folder)
        let rows = try await restarted.entriesForTesting()
        XCTAssertEqual(rows.first?.deliveryOrigin, entry.deliveryOrigin)
        XCTAssertEqual(rows.first?.ownerUserId, owner.userID)
        XCTAssertEqual(rows.first.map { Data($0.draft.utf8) }, Data(raw.utf8))
    }

    func testIdenticalWordsInDifferentDocumentsDoNotLoseTheirProvenance() async throws {
        let folder = temporaryFolder(); defer { try? FileManager.default.removeItem(at: folder) }
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: folder)
        let first = entry()
        var second = entry(id: "save-b")
        second.deliveryOrigin = .init(documentID: "document-b", backendURL: backend)
        try await queue.enqueue(first)
        try await queue.enqueue(second)
        let rows = try await queue.entriesForTesting()
        XCTAssertEqual(rows.count, 2)
        var relabeled = first
        relabeled.deliveryOrigin = second.deliveryOrigin
        do { try await queue.enqueue(relabeled); XCTFail("An existing request changed documents") }
        catch BackendMemoryAPIError.server(let status, _) { XCTAssertEqual(status, 409) }
        let kept = try await queue.entriesForTesting()
        XCTAssertEqual(kept.first?.deliveryOrigin, first.deliveryOrigin)
    }

    func testAcknowledgementDoesNotPurgeOrRebaseAnotherDocumentsQueue() async throws {
        let folder = temporaryFolder(); defer { try? FileManager.default.removeItem(at: folder) }
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: folder)
        let first = entry()
        var other = entry(id: "other-document")
        other.deliveryOrigin = .init(documentID: "document-b", backendURL: backend)
        try await queue.enqueue(other)
        try await queue.markParked(id: other.id, error: "Needs review in its original document")
        try await queue.enqueue(first)
        try await queue.markSucceeded(id: first.id, serverVersionId: "ack-a")
        let kept = try await queue.entriesForTesting()
        XCTAssertEqual(kept.map(\.id), [other.id])
        XCTAssertEqual(kept.first?.baseVersionId, "base-a")
        XCTAssertEqual(kept.first?.deliveryOrigin, other.deliveryOrigin)
    }

    func testLegacyEntriesDecodeWithoutInventedDeliveryOrigin() throws {
        var legacy = entry(); legacy.deliveryOrigin = nil
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(legacy)) as? [String: Any])
        object.removeValue(forKey: "deliveryOrigin")
        let decoded = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: object))
        XCTAssertNil(decoded.deliveryOrigin)
        XCTAssertEqual(Data(decoded.draft.utf8), Data(raw.utf8))
        XCTAssertNil(ordinary(decoded, version: try version(decoded)))
        let oldResult = BackendReadResult(payload: "legacy", sync: .empty, notModified: false)
        XCTAssertNil(oldResult.responseURL)
    }

    func testActualVersionHTTPResponseRetainsItsOwnURL() async throws {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [SaveEvidenceHTTPProtocol.self]
        let session = URLSession(configuration: config)
        defer { session.invalidateAndCancel() }
        let identity = BackendAuthRequestIdentity(sessionEpoch: 0, userID: owner.userID,
            clientToken: "local-fixture-client", accessToken: "", sessionIntentGeneration: 7)
        let api = BackendMemoryAPI(session: session, baseURL: backend, requestIdentityProvider: { _ in identity })
        let result = try await api.upsertScreenplayProjectVersion(projectId: "project-a", draft: raw,
            baseVersionId: "base-a", clientRequestId: "save-a", initiatingIdentity: identity)
        XCTAssertEqual(result.responseURL, backend.appendingPathComponent("screenplay/projects/project-a/version"))
        let proof = ScreenplayConfirmedDraftSave.ordinary(entry: entry(), version: result.payload.version,
            versionID: result.payload.versionId, projectID: result.payload.projectId,
            responseURL: result.responseURL, owner: owner, currentOwner: owner)
        XCTAssertNotNil(proof)
    }

    func testActualVersionClientRejectsMismatchedOriginBeforeVersionSend() async throws {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [SaveEvidenceHTTPProtocol.self]
        let session = URLSession(configuration: config)
        defer { session.invalidateAndCancel() }
        let identity = BackendAuthRequestIdentity(sessionEpoch: 0, userID: owner.userID,
            clientToken: "local-fixture-client", accessToken: "", sessionIntentGeneration: 7)
        let api = BackendMemoryAPI(session: session, baseURL: backend, requestIdentityProvider: { _ in identity })
        do {
            _ = try await api.upsertScreenplayProjectVersion(projectId: "project-a", draft: raw,
                baseVersionId: "base-a", clientRequestId: "save-a",
                expectedBackendURL: URL(string: "https://original-backend.test")!, initiatingIdentity: identity)
            XCTFail("A save escaped to the currently selected backend")
        } catch BackendMemoryAPIError.server(let status, let message) {
            XCTAssertEqual(status, 409)
            XCTAssertTrue(message.contains("another backend"))
        }
    }

    @MainActor
    func testCommittedAdoptionKeepsCompositionOnlyWriterBytes() async throws {
        let fixture = try CommittedSaveEvidenceFixture()
        defer { fixture.close() }
        let decomposed = raw
        let composed = decomposed.precomposedStringWithCanonicalMapping
        fixture.select(composed)
        XCTAssertTrue(fixture.model.adoptCommittedPageWriteIfNeeded(fixture.write(before: composed, after: decomposed)))
        XCTAssertEqual(Data(fixture.model.fountainDraft.utf8), Data(decomposed.utf8))
        // Revoke the queued autosave before yielding; it must not manufacture a
        // request with a later editor's identity. No global auth is seeded.
        let replacement = fixture.makeReplacement()
        await Task.yield()
        XCTAssertTrue(ScreenplayLiveDraftSyncService.shared.ownsEditor(replacement))
    }

    @MainActor
    func testCommittedAdoptionRejectsOldOwnerAndObsoleteEditor() throws {
        let fixture = try CommittedSaveEvidenceFixture()
        defer { fixture.close() }
        fixture.select(raw)
        let after = raw + "New scene."
        let wrongOwner = ScreenplayStudioAuthContext(userID: fixture.owner.userID + "-other",
            sessionIntentGeneration: fixture.owner.sessionIntentGeneration)
        XCTAssertFalse(fixture.model.adoptCommittedPageWriteIfNeeded(fixture.write(before: raw, after: after, owner: wrongOwner)))
        XCTAssertEqual(Data(fixture.model.fountainDraft.utf8), Data(raw.utf8))
        let replacement = fixture.makeReplacement()
        XCTAssertFalse(fixture.model.adoptCommittedPageWriteIfNeeded(fixture.write(before: raw, after: after)))
        XCTAssertEqual(Data(fixture.model.fountainDraft.utf8), Data(raw.utf8))
        XCTAssertTrue(ScreenplayLiveDraftSyncService.shared.ownsEditor(replacement))
    }

    func testPassiveReadbackRequiresCurrentExactTargetAndPreservesExplicitIntent() throws {
        let passive = entry(source: "studio_autosave")
        let response = try passiveResponse(passive)
        func proof(_ entry: ScreenplayDraftSaveOutboxEntry, _ response: BackendScreenplayVersionMutationResponse) -> ScreenplayConfirmedDraftSave? {
            ScreenplayConfirmedDraftSave.passiveAutosaveReadback(entry: entry, response: response,
                responseURL: backend, owner: owner, currentOwner: owner)
        }
        XCTAssertEqual(proof(passive, response)?.requestID, passive.id)
        for source in ["studio_manual", "studio_snapshot", "studio_conflict_resolve"] {
            XCTAssertNil(proof(entry(source: source), response), "Explicit intent was silently satisfied: \(source)")
        }
        XCTAssertNil(proof(entry(source: "studio_autosave", notes: "Writer requested a checkpoint"), response))
        for patch in [
            ["serverVersionId": "historical"],
            ["project": ["id": passive.projectId, "title": passive.title, "activeVersionId": "newer"]],
            ["project": ["id": passive.projectId, "title": "Different title", "activeVersionId": "version-a"]]
        ] as [[String: Any]] {
            XCTAssertNil(proof(passive, try passiveResponse(passive, patch: patch)))
        }
        for patch in [
            ["phase": "rewrite"], ["projectId": "other-project"],
            ["draft": raw.precomposedStringWithCanonicalMapping],
            ["studioWriteAnchors": [["writeId": "other-anchor"]]],
            ["screenplayBindings": [["draftSceneId": "other-binding"]]]
        ] as [[String: Any]] {
            XCTAssertNil(proof(passive, try passiveResponse(passive, versionPatch: patch)))
        }
    }

    private func passiveResponse(_ entry: ScreenplayDraftSaveOutboxEntry,
        patch: [String: Any] = [:], versionPatch: [String: Any] = [:]) throws -> BackendScreenplayVersionMutationResponse {
        var version: [String: Any] = ["id": "version-a", "projectId": entry.projectId,
            "draft": entry.draft, "phase": entry.phase, "clientRequestId": "earlier-manual-save"]
        version.merge(versionPatch) { _, new in new }
        var payload: [String: Any] = ["projectId": entry.projectId, "conflict": true,
            "serverVersionId": "version-a", "serverVersion": version,
            "project": ["id": entry.projectId, "title": entry.title, "activeVersionId": "version-a"]]
        payload.merge(patch) { _, new in new }
        return try JSONDecoder().decode(BackendScreenplayVersionMutationResponse.self,
            from: JSONSerialization.data(withJSONObject: payload))
    }

    private func ordinary(_ entry: ScreenplayDraftSaveOutboxEntry, version: BackendScreenplayVersion) -> ScreenplayConfirmedDraftSave? {
        ScreenplayConfirmedDraftSave.ordinary(entry: entry, version: version, versionID: "version-a",
            projectID: entry.projectId, responseURL: backend, owner: owner, currentOwner: owner)
    }

    private func entry(id: String = "save-a", source: String = "studio_manual", notes: String = "") -> ScreenplayDraftSaveOutboxEntry {
        .init(id: id, projectId: "project-a", ownerUserId: owner.userID, draft: raw, title: "A", phase: "scene_draft",
            notes: notes, source: source, studioWriteAnchors: [], screenplayBindings: [], baseVersionId: "base-a",
            createdAt: 1, updatedAt: 1, status: .pending, retries: 0, nextAttemptAt: 0, lastError: "",
            deliveryOrigin: .init(documentID: "document-a", backendURL: backend))
    }

    private func version(_ entry: ScreenplayDraftSaveOutboxEntry, patch: [String: Any] = [:]) throws -> BackendScreenplayVersion {
        var fields: [String: Any] = ["id": "version-a", "projectId": entry.projectId,
            "clientRequestId": entry.id, "draft": entry.draft]
        fields.merge(patch) { _, new in new }
        return try JSONDecoder().decode(BackendScreenplayVersion.self, from: JSONSerialization.data(withJSONObject: fields))
    }

    private func temporaryFolder() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("SaveEvidence-\(UUID())")
    }
}

@MainActor
private final class CommittedSaveEvidenceFixture {
    let model: ScreenplayStudioViewModel
    let owner = ScreenplayStudioAuthContext.current()
    private let suite = "them.committed-save-evidence.\(UUID())"
    private let defaults: UserDefaults
    private let queue: ScreenplayDraftSaveOutbox
    private let folder: URL
    private let priorDraft: String
    private let priorProject: String
    private let priorVersion: String
    private let priorBinding: ScreenplayProjectBindingSnapshot

    nonisolated deinit {}

    init() throws {
        let bridge = ScreenplayLiveDraftBridge.shared
        bridge.reconcileAccountStorage()
        priorDraft = bridge.draftText; priorProject = bridge.preferredProjectID
        priorVersion = bridge.preferredVersionID; priorBinding = bridge.projectBinding
        defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        folder = FileManager.default.temporaryDirectory.appendingPathComponent("CommittedSaveEvidence-\(UUID())")
        queue = ScreenplayDraftSaveOutbox(storageDirectory: folder)
        model = ScreenplayStudioViewModel(localDraftRecoveryStore: .init(defaults: defaults, key: "recovery"), draftSaveOutbox: queue)
        model.autosaveEnabled = false
    }

    func select(_ draft: String) {
        model.selectedProjectID = "project-a"
        model.applyStructuralUITestDraft(draft, versionID: "base-a")
        _ = ScreenplayLiveDraftBridge.shared.adoptLoadedProjectDraft(draft, projectID: "project-a", versionID: "base-a", owner: owner)
    }

    func write(before: String, after: String, owner: ScreenplayStudioAuthContext? = nil) -> ScreenplayCommittedWrite {
        .init(id: UUID(), writeID: UUID().uuidString.lowercased(), projectID: "project-a", versionID: "base-a",
            previousDraft: before, committedDraft: after, insertedText: after, replacementApplied: true,
            replacedWriteID: nil, startLine: 1, endLine: 4, committedAt: Date(), authContext: owner ?? self.owner)
    }

    func makeReplacement() -> ScreenplayStudioViewModel {
        let replacement = ScreenplayStudioViewModel(localDraftRecoveryStore: .init(defaults: defaults, key: "replacement"), draftSaveOutbox: queue)
        replacement.autosaveEnabled = false
        return replacement
    }

    func close() {
        let queue = queue
        Task { await queue.stopNetworkMonitoring() }
        defaults.removePersistentDomain(forName: suite)
        try? FileManager.default.removeItem(at: folder)
        let bridge = ScreenplayLiveDraftBridge.shared
        bridge.projectBinding = priorBinding
        _ = bridge.adoptLoadedProjectDraft(priorDraft, projectID: priorProject, versionID: priorVersion, owner: owner)
    }
}

private nonisolated final class SaveEvidenceHTTPProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "save-evidence.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            var body = request.httpBody ?? Data()
            if body.isEmpty, let stream = request.httpBodyStream {
                stream.open(); defer { stream.close() }
                var buffer = [UInt8](repeating: 0, count: 4096)
                while true {
                    let count = stream.read(&buffer, maxLength: buffer.count)
                    if count <= 0 { break }; body.append(contentsOf: buffer.prefix(count))
                }
            }
            let isVersion = request.url?.path == "/screenplay/projects/project-a/version"
            let payload: [String: Any]
            if isVersion {
                let sent = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                payload = ["project_id": "project-a", "version_id": "version-a",
                    "version": ["id": "version-a", "project_id": "project-a",
                        "client_request_id": sent["client_request_id"] ?? "", "draft": sent["draft"] ?? ""]]
            } else { payload = ["error": "fixture bootstrap unavailable"] }
            let response = HTTPURLResponse(url: request.url!, statusCode: isVersion ? 201 : 503,
                httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: try JSONSerialization.data(withJSONObject: payload))
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}
