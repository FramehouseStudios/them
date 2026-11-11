import Foundation
import XCTest
@testable import them

final class ScreenplayInitialProjectCreationTests: XCTestCase {
    private var directory: URL!
    private let backend = URL(string: "https://writer.example.test")!
    private let exact = "\r\nINT. ROOM - NIGHT\r\nCafe\u{0301}.\r\n \t "
    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("InitialProject-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }
    override func tearDownWithError() throws { try FileManager.default.removeItem(at: directory) }

    func testQueueOwnerExcludesSecondActorUntilInflightOwnerIsReleased() async throws {
        var first: ScreenplayDraftSaveOutbox? = ScreenplayDraftSaveOutbox(storageDirectory: directory)
        weak var firstWeak = first
        let entry = try await prepare(try XCTUnwrap(first))
        try await XCTUnwrap(first).beginInitialProject(id: entry.id, ownerUserID: "writer-a", backendURL: backend)
        let second = ScreenplayDraftSaveOutbox(storageDirectory: directory)
        do {
            _ = try await prepare(second)
            XCTFail("A second live actor must not load or replace an inflight request.")
        } catch {
            let failure = error as NSError
            XCTAssertEqual(failure.domain, "io.them.screenplay-outbox")
            XCTAssertEqual(failure.code, 1)
            XCTAssertTrue(failure.localizedDescription.contains("Keep the current page open"))
        }
        XCTAssertFalse(ScreenplayDraftSaveOutbox.resetStoredQueueForUITesting(at: directory),
            "A debug reset must not delete another live owner's queue or lock.")
        let third = ScreenplayDraftSaveOutbox(storageDirectory: directory)
        do {
            _ = try await prepare(third)
            XCTFail("A failed contender must not unlock the original owner.")
        } catch { }
        let firstRows = try await XCTUnwrap(first).entriesForTesting()
        XCTAssertEqual(firstRows.count, 1)
        XCTAssertEqual(firstRows[0].id, entry.id)
        XCTAssertEqual(firstRows[0].status, .inflight)
        first = nil
        XCTAssertNil(firstWeak, "The released owner must close its lifetime lease.")
        let reopened = try await prepare(second)
        XCTAssertEqual(reopened.id, entry.id)
        XCTAssertEqual(reopened.projectId, entry.projectId)
        XCTAssertEqual(reopened.status, .pending)
        XCTAssertEqual(Data(reopened.draft.utf8), Data(exact.utf8))
    }

    func testRecoveryForkIdentityIsStableAcrossRelaunchAndDoesNotChangeHeldRows() async throws {
        var queue: ScreenplayDraftSaveOutbox? = ScreenplayDraftSaveOutbox(storageDirectory: directory)
        let origin = ScreenplayDraftSaveOrigin(documentID: "document-a", backendURL: backend)
        var selected = ScreenplayDraftSaveOutboxEntry(id: "held-request-a", projectId: "project-a", ownerUserId: "writer-a",
            draft: exact, title: "Original", phase: "scene_draft", notes: "", source: "studio_autosave",
            studioWriteAnchors: [], screenplayBindings: [], baseVersionId: "base-a", createdAt: 1, updatedAt: 1,
            status: .parked, retries: 0, nextAttemptAt: 0, lastError: ScreenplayDraftSaveOutbox.conflictReason)
        selected.deliveryOrigin = origin
        _ = try await XCTUnwrap(queue).enqueue(selected)
        var second = ScreenplayDraftSaveOutboxEntry(id: "held-request-b", projectId: selected.projectId,
            ownerUserId: selected.ownerUserId, draft: exact, title: selected.title, phase: selected.phase,
            notes: selected.notes, source: selected.source, studioWriteAnchors: [], screenplayBindings: [],
            baseVersionId: selected.baseVersionId, createdAt: 2, updatedAt: 2, status: .parked,
            retries: 0, nextAttemptAt: 0, lastError: ScreenplayDraftSaveOutbox.conflictReason)
        second.deliveryOrigin = origin
        _ = try await XCTUnwrap(queue).enqueue(second)
        let first = try await XCTUnwrap(queue).recoveryForkIntent(selected: selected, origin: origin)
        let other = try await XCTUnwrap(queue).recoveryForkIntent(selected: second, origin: origin)
        XCTAssertNotEqual(first.id, other.id)
        XCTAssertNotEqual(first.projectId, other.projectId)
        queue = nil // A relaunch begins only after the old owner has exited.
        let restored = ScreenplayDraftSaveOutbox(storageDirectory: directory)
        let again = try await restored.recoveryForkIntent(selected: selected, origin: origin)
        XCTAssertEqual(first.id, again.id)
        XCTAssertEqual(first.projectId, again.projectId)
        XCTAssertNotEqual(first.projectId, selected.projectId)
        XCTAssertEqual(Data(first.draft.utf8), Data(exact.utf8))
        let rows = try await restored.entriesForTesting()
        XCTAssertEqual(rows, [selected, second])
        var changed = selected
        changed.baseVersionId = "another-base"
        do {
            _ = try await restored.recoveryForkIntent(selected: changed, origin: origin)
            XCTFail("A changed source must not authorize a recovery fork.")
        } catch { }
    }

    func testCreationIdentityAndOriginalBytesSurviveRelaunchAndChangedLocalText() async throws {
        var queue: ScreenplayDraftSaveOutbox? = ScreenplayDraftSaveOutbox(storageDirectory: directory)
        let first = try await prepare(try XCTUnwrap(queue))
        let rows = try await XCTUnwrap(queue).entriesForTesting()
        XCTAssertEqual(rows.count, 1)
        queue = nil // Release the live owner before modelling a relaunch.
        let replay = try await prepare(ScreenplayDraftSaveOutbox(storageDirectory: directory), draft: "New manual words. ")
        XCTAssertEqual(replay.id, first.id)
        XCTAssertEqual(replay.projectId, first.projectId)
        XCTAssertEqual(Data(replay.draft.utf8), Data(exact.utf8))
        XCTAssertEqual(replay.initialization?.documentID, "document-a")
    }

    func testDeliberateNewDocumentWithIdenticalTextGetsItsOwnCreationIdentity() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: directory)
        let a = try await prepare(queue)
        let b = try await prepare(queue, document: "document-b")
        XCTAssertNotEqual(a.id, b.id)
        XCTAssertNotEqual(a.projectId, b.projectId)
        XCTAssertEqual(Data(a.draft.utf8), Data(b.draft.utf8))
    }

    func testInitialSavesCannotEnterOrdinaryVersionDrainOrChangeOwnerAndOrigin() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: directory)
        let a = try await prepare(queue)
        let normal = try await queue.beginNext(projectId: a.projectId, ownerUserId: "writer-a", force: true)
        XCTAssertNil(normal)
        do {
            try await queue.beginInitialProject(id: a.id, ownerUserID: "writer-b", backendURL: backend)
            XCTFail("A different account claimed the initial save.")
        } catch {}
        do {
            try await queue.beginInitialProject(id: a.id, ownerUserID: "writer-a", backendURL: URL(string: "https://other.example.test")!)
            XCTFail("A different backend claimed the initial save.")
        } catch {}
        let retained = try await queue.entriesForTesting()
        XCTAssertEqual(retained, [a])
    }

    func testSavedReceiptStaysDurableUntilBindingAndInflightRestoresAfterInterruption() async throws {
        var firstQueue: ScreenplayDraftSaveOutbox? = ScreenplayDraftSaveOutbox(storageDirectory: directory)
        let entry = try await prepare(try XCTUnwrap(firstQueue))
        try await XCTUnwrap(firstQueue).beginInitialProject(id: entry.id, ownerUserID: "writer-a", backendURL: backend)
        firstQueue = nil
        var restored: ScreenplayDraftSaveOutbox? = ScreenplayDraftSaveOutbox(storageDirectory: directory)
        let resumed = try await prepare(try XCTUnwrap(restored))
        XCTAssertEqual(resumed.status, .pending)
        XCTAssertEqual(resumed.id, entry.id)
        try await XCTUnwrap(restored).beginInitialProject(id: entry.id, ownerUserID: "writer-a", backendURL: backend)
        try await XCTUnwrap(restored).recordInitialProjectReceipt(id: entry.id, versionID: "version-a")
        restored = nil
        let saved = try await prepare(ScreenplayDraftSaveOutbox(storageDirectory: directory))
        XCTAssertEqual(saved.initialization?.receiptVersionID, "version-a")
        XCTAssertEqual(saved.status, .parked)
        XCTAssertEqual(Data(saved.draft.utf8), Data(exact.utf8))
    }

    func testNewTitleCannotSilentlyReplaceAPendingCreationIntent() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: directory)
        let entry = try await prepare(queue)
        do {
            _ = try await queue.prepareInitialProject(ownerUserID: "writer-a", backendURL: backend, documentID: "document-a",
                sourceProjectID: "", draft: "Other words", title: "Different project", phase: "scene_draft",
                source: "studio_initial_seed", explicitTitle: true)
            XCTFail("A different title silently replaced pending work.")
        } catch {}
        let rows = try await queue.entriesForTesting()
        XCTAssertEqual(rows, [entry])
    }

    func testBlankCreationIdentitySurvivesRelaunchAndRejectsTitleChange() async throws {
        var queue: ScreenplayDraftSaveOutbox? = ScreenplayDraftSaveOutbox(storageDirectory: directory)
        let first = try await XCTUnwrap(queue).prepareInitialProject(ownerUserID: "writer-a", backendURL: backend,
            documentID: "blank-a", sourceProjectID: "", draft: "", title: "Untitled",
            phase: "scene_draft", source: "studio_blank_create", explicitTitle: true, blankProject: true)
        try await XCTUnwrap(queue).beginInitialProject(id: first.id, ownerUserID: "writer-a", backendURL: backend)
        queue = nil
        var restored: ScreenplayDraftSaveOutbox? = ScreenplayDraftSaveOutbox(storageDirectory: directory)
        let resumed = try await XCTUnwrap(restored).prepareInitialProject(ownerUserID: "writer-a", backendURL: backend,
            documentID: "blank-a", sourceProjectID: "", draft: "", title: "Untitled",
            phase: "scene_draft", source: "studio_blank_create", explicitTitle: true, blankProject: true)
        XCTAssertEqual(resumed.id, first.id)
        XCTAssertEqual(resumed.projectId, first.projectId)
        XCTAssertEqual(resumed.status, .pending)
        XCTAssertEqual(resumed.initialization?.blankProject, true)
        do {
            _ = try await XCTUnwrap(restored).prepareInitialProject(ownerUserID: "writer-a", backendURL: backend,
                documentID: "blank-a", sourceProjectID: "", draft: "", title: "Another title",
                phase: "scene_draft", source: "studio_blank_create", explicitTitle: true, blankProject: true)
            XCTFail("A different title must not replace the pending creation.")
        } catch {}
        try await XCTUnwrap(restored).beginInitialProject(id: first.id, ownerUserID: "writer-a", backendURL: backend)
        try await XCTUnwrap(restored).recordInitialProjectReceipt(id: first.id, versionID: "")
        restored = nil
        let after = ScreenplayDraftSaveOutbox(storageDirectory: directory)
        let acknowledged = try await after.pendingInitialProject(
            ownerUserID: "writer-a", backendURL: backend, documentID: "blank-a", sourceProjectID: "")
        XCTAssertEqual(acknowledged?.initialization?.blankReceipt, true)
        XCTAssertNil(acknowledged?.initialization?.receiptVersionID)
        let other = try await after.prepareInitialProject(ownerUserID: "writer-a", backendURL: backend,
            documentID: "blank-b", sourceProjectID: "", draft: "", title: "Untitled",
            phase: "scene_draft", source: "studio_blank_create", explicitTitle: true, blankProject: true)
        XCTAssertNotEqual(other.projectId, first.projectId)
    }

    func testWhitespaceOnlyFirstDraftRemainsAByteExactVersionedIntent() async throws {
        var queue: ScreenplayDraftSaveOutbox? = ScreenplayDraftSaveOutbox(storageDirectory: directory)
        let exactWhitespace = "\r\n \t"
        let entry = try await XCTUnwrap(queue).prepareInitialProject(ownerUserID: "writer-a", backendURL: backend,
            documentID: "whitespace-a", sourceProjectID: "", draft: exactWhitespace, title: "Untitled",
            phase: "scene_draft", source: "studio_initial_seed", explicitTitle: true)
        queue = nil
        let resumed = try await ScreenplayDraftSaveOutbox(storageDirectory: directory).pendingInitialProject(
            ownerUserID: "writer-a", backendURL: backend, documentID: "whitespace-a", sourceProjectID: "")
        XCTAssertEqual(Data(resumed?.draft.utf8 ?? "".utf8), Data(exactWhitespace.utf8))
        XCTAssertEqual(resumed?.id, entry.id)
        XCTAssertNotEqual(resumed?.initialization?.blankProject, true)
    }

    func testBlankReceiptRequiresMatchingRequestProjectAndZeroVersions() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: directory)
        let entry = try await queue.prepareInitialProject(ownerUserID: "writer-a", backendURL: backend,
            documentID: "blank-a", sourceProjectID: "", draft: "", title: "Untitled",
            phase: "scene_draft", source: "studio_blank_create", explicitTitle: true, blankProject: true)
        func response(requestID: String, projectID: String, hash: String, count: Int,
                      status: String = "created", created: Bool = true) throws -> BackendScreenplayProjectMutationResponse {
            let data = try JSONSerialization.data(withJSONObject: [
                "stage": "screenplay_project", "status": status, "created": created, "project_id": entry.projectId,
                "project": ["id": entry.projectId, "title": entry.title, "version_count": count],
                "blank_creation": ["client_request_id": requestID, "project_id": projectID, "creation_request_hash": hash]
            ])
            let decoder = JSONDecoder(); decoder.keyDecodingStrategy = .convertFromSnakeCase
            return try decoder.decode(BackendScreenplayProjectMutationResponse.self, from: data)
        }
        let hash = String(repeating: "a", count: 64)
        XCTAssertTrue(ScreenplayBlankProjectReceiptPolicy.accepts(try response(requestID: entry.id, projectID: entry.projectId, hash: hash, count: 0), entry: entry))
        XCTAssertFalse(ScreenplayBlankProjectReceiptPolicy.accepts(try response(requestID: "wrong", projectID: entry.projectId, hash: hash, count: 0), entry: entry))
        XCTAssertFalse(ScreenplayBlankProjectReceiptPolicy.accepts(try response(requestID: entry.id, projectID: "wrong", hash: hash, count: 0), entry: entry))
        XCTAssertFalse(ScreenplayBlankProjectReceiptPolicy.accepts(try response(requestID: entry.id, projectID: entry.projectId, hash: "bad", count: 0), entry: entry))
        XCTAssertFalse(ScreenplayBlankProjectReceiptPolicy.accepts(try response(requestID: entry.id, projectID: entry.projectId, hash: hash, count: 1), entry: entry))
        XCTAssertFalse(ScreenplayBlankProjectReceiptPolicy.accepts(try response(requestID: entry.id, projectID: entry.projectId, hash: hash, count: 0, status: "replayed", created: true), entry: entry))
    }

    private func prepare(_ queue: ScreenplayDraftSaveOutbox, draft: String? = nil, document: String = "document-a") async throws -> ScreenplayDraftSaveOutboxEntry {
        try await queue.prepareInitialProject(ownerUserID: "writer-a", backendURL: backend, documentID: document,
            sourceProjectID: "", draft: draft ?? exact, title: "The Reel", phase: "scene_draft", source: "studio_initial_seed")
    }
}
