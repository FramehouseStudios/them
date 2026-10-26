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

    func testCreationIdentityAndOriginalBytesSurviveRelaunchAndChangedLocalText() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: directory)
        let first = try await prepare(queue)
        let replay = try await prepare(ScreenplayDraftSaveOutbox(storageDirectory: directory), draft: "New manual words. ")
        XCTAssertEqual(replay.id, first.id)
        XCTAssertEqual(replay.projectId, first.projectId)
        XCTAssertEqual(Data(replay.draft.utf8), Data(exact.utf8))
        XCTAssertEqual(replay.initialization?.documentID, "document-a")
        let rows = try await queue.entriesForTesting()
        XCTAssertEqual(rows.count, 1)
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
        let firstQueue = ScreenplayDraftSaveOutbox(storageDirectory: directory)
        let entry = try await prepare(firstQueue)
        try await firstQueue.beginInitialProject(id: entry.id, ownerUserID: "writer-a", backendURL: backend)
        let restored = ScreenplayDraftSaveOutbox(storageDirectory: directory)
        let resumed = try await prepare(restored)
        XCTAssertEqual(resumed.status, .pending)
        XCTAssertEqual(resumed.id, entry.id)
        try await restored.beginInitialProject(id: entry.id, ownerUserID: "writer-a", backendURL: backend)
        try await restored.recordInitialProjectReceipt(id: entry.id, versionID: "version-a")
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

    private func prepare(_ queue: ScreenplayDraftSaveOutbox, draft: String? = nil, document: String = "document-a") async throws -> ScreenplayDraftSaveOutboxEntry {
        try await queue.prepareInitialProject(ownerUserID: "writer-a", backendURL: backend, documentID: document,
            sourceProjectID: "", draft: draft ?? exact, title: "The Reel", phase: "scene_draft", source: "studio_initial_seed")
    }
}
