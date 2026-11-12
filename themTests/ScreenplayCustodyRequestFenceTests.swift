import Foundation
import XCTest
@testable import them

final class ScreenplayCustodyRequestFenceTests: XCTestCase {
    private let backend = URL(string: "https://fence.example.test")!
    private let owner = ScreenplayStudioAuthContext(userID: "fence-writer", sessionIntentGeneration: 4)

    func testBlockedReceiptRetainsExactCopiesAndPermitsFreshExplicitChoiceAfterRelaunch() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("Fence-\(UUID())")
        defer { try? FileManager.default.removeItem(at: folder) }
        var queue: ScreenplayDraftSaveOutbox? = ScreenplayDraftSaveOutbox(storageDirectory: folder)
        let intent = try await prepare(try XCTUnwrap(queue))
        let evidence = try XCTUnwrap(verify(intent, result: response(intent)))
        try await XCTUnwrap(queue).recordConfirmedBlockedCustody(intent.entry, evidence: evidence)
        let before = try await XCTUnwrap(queue).persistedEntriesForTesting()
        XCTAssertEqual(before.filter { $0.source == "studio_custody_selected" }.count, 1)
        XCTAssertEqual(before.first { $0.id == "selected" }?.draft.utf8.map { $0 }, Array("\r\nCafe\u{0301}. \t".utf8))
        XCTAssertNotNil(before.first { $0.id == intent.entry.id }?.custodyBlockedReceipt)
        let manifest = try JSONSerialization.jsonObject(with: Data(contentsOf: folder.appendingPathComponent("queue.json"))) as? [String: Any]
        XCTAssertEqual(manifest?["schemaVersion"] as? Int, 8)
        for action in [0, 1, 2] {
            do {
                if action == 0 { try await XCTUnwrap(queue).remove(id: intent.entry.id) }
                else if action == 1 { try await XCTUnwrap(queue).removeAll(projectId: "project-a", ownerUserId: owner.userID) }
                else { try await XCTUnwrap(queue).markRetryable(id: intent.entry.id, error: "retry") }
                XCTFail("A generic mutation discarded or reopened a terminal request.")
            } catch { }
        }
        queue = nil
        let restored = ScreenplayDraftSaveOutbox(storageDirectory: folder)
        let rows = try await restored.entriesForTesting()
        XCTAssertEqual(rows.count, before.count)
        XCTAssertEqual(rows.first { $0.id == "other" }?.draft, "Other held words")
        XCTAssertEqual(rows.first { $0.id == "selected" }?.draft.utf8.map { $0 }, Array("\r\nCafe\u{0301}. \t".utf8))
        let origin = try XCTUnwrap(intent.entry.deliveryOrigin)
        let pending = try await restored.interruptedCustodySubmission(selectedID: "selected", projectID: "project-a",
            ownerUserID: owner.userID, deliveryOrigin: origin)
        XCTAssertNil(pending)
        let choice = try await restored.recordCustodyChoice(selectedID: "other", projectID: "project-a",
            ownerUserID: owner.userID, deliveryOrigin: origin)
        XCTAssertEqual(choice.selected.requestID, "other")
        let untouched = try await restored.persistedEntriesForTesting()
        XCTAssertNotNil(untouched.first { $0.id == intent.entry.id }?.custodyBlockedReceipt)
        XCTAssertEqual(untouched.filter { ["selected", "other"].contains($0.id) }.count, 2)
    }

    func testGenericConflictWrongOwnerOriginOrDigestCannotBecomeBlockedEvidence() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("Fence-\(UUID())")
        defer { try? FileManager.default.removeItem(at: folder) }
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: folder)
        let intent = try await prepare(queue)
        XCTAssertNotNil(verify(intent, result: try response(intent)))
        for patch: [String: Any] in [["status": "conflict"], ["proof": "full_request_hash_v1"],
            ["local_request_digest": String(repeating: "0", count: 64)], ["client_request_id": "another"],
            ["project_id": "another-project"], ["request_hash": "invalid"]] {
            XCTAssertNil(verify(intent, result: try response(intent, patch: patch)))
        }
        XCTAssertNil(verify(intent, result: try response(intent, code: 409)))
        XCTAssertNil(verify(intent, result: try response(intent, origin: URL(string: "https://wrong.example.test")!)))
        let result = try response(intent)
        XCTAssertNil(ScreenplayConfirmedBlockedCustodySave.verify(entry: intent.entry, localDigest: intent.digest,
            result: result, owner: owner, currentOwner: .init(userID: "different", sessionIntentGeneration: 4)))
        let rows = try await queue.persistedEntriesForTesting()
        XCTAssertNil(rows.first { $0.id == intent.entry.id }?.custodyBlockedReceipt)
    }

    func testFailedReceiptReadbackDoesNotReportSuccessAndReceiptRemainsRecoverable() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("Fence-\(UUID())")
        defer { try? FileManager.default.removeItem(at: folder) }
        var queue: ScreenplayDraftSaveOutbox? = ScreenplayDraftSaveOutbox(storageDirectory: folder,
            supersededReceiptReader: { _ in throw URLError(.cannotOpenFile) })
        let intent = try await prepare(try XCTUnwrap(queue))
        let evidence = try XCTUnwrap(verify(intent, result: response(intent)))
        do {
            try await XCTUnwrap(queue).recordConfirmedBlockedCustody(intent.entry, evidence: evidence)
            XCTFail("A failed readback reported a confirmed local receipt.")
        } catch { }
        queue = nil
        let restored = ScreenplayDraftSaveOutbox(storageDirectory: folder)
        let rows = try await restored.entriesForTesting()
        XCTAssertNotNil(rows.first { $0.id == intent.entry.id }?.custodyBlockedReceipt)
        XCTAssertEqual(rows.filter { ["selected", "other"].contains($0.id) }.count, 2)
    }

    private func verify(_ intent: (entry: ScreenplayDraftSaveOutboxEntry, digest: String),
                        result: BackendReadResult<BackendScreenplayFenceResponse>) -> ScreenplayConfirmedBlockedCustodySave? {
        ScreenplayConfirmedBlockedCustodySave.verify(entry: intent.entry, localDigest: intent.digest,
            result: result, owner: owner, currentOwner: owner)
    }

    private func response(_ intent: (entry: ScreenplayDraftSaveOutboxEntry, digest: String), patch: [String: Any] = [:],
                          code: Int = 200, origin: URL? = nil) throws -> BackendReadResult<BackendScreenplayFenceResponse> {
        var payload: [String: Any] = ["stage": "screenplay_version_fence", "status": "future_delivery_blocked",
            "proof": "pg_request_fence_v1", "project_id": intent.entry.projectId, "client_request_id": intent.entry.id,
            "local_request_digest": intent.digest, "request_hash": String(repeating: "a", count: 64),
            "head_version_id_at_fence": "historical-head"]
        payload.merge(patch) { _, value in value }
        let decoder = JSONDecoder(); decoder.keyDecodingStrategy = .convertFromSnakeCase
        return .init(payload: try decoder.decode(BackendScreenplayFenceResponse.self,
            from: JSONSerialization.data(withJSONObject: payload)), sync: .empty, notModified: false,
            responseURL: origin ?? backend, httpStatusCode: code)
    }

    private func prepare(_ queue: ScreenplayDraftSaveOutbox) async throws -> (entry: ScreenplayDraftSaveOutboxEntry, digest: String) {
        let origin = ScreenplayDraftSaveOrigin(documentID: "document-a", backendURL: backend)
        func row(_ id: String, _ draft: String, _ reason: String) -> ScreenplayDraftSaveOutboxEntry {
            var value = ScreenplayDraftSaveOutboxEntry(id: id, projectId: "project-a", ownerUserId: owner.userID,
                draft: draft, title: "A", phase: "scene_draft", notes: "", source: "studio_manual",
                studioWriteAnchors: [], screenplayBindings: [], baseVersionId: "old-base", createdAt: id == "selected" ? 1 : 2,
                updatedAt: 1, status: .parked, retries: 0, nextAttemptAt: 0, lastError: reason)
            value.deliveryOrigin = origin
            return value
        }
        let selected = row("selected", "\r\nCafe\u{0301}. \t", ScreenplayDraftSaveOutbox.conflictReason)
        try await queue.enqueue(selected)
        try await queue.enqueue(row("other", "Other held words", ScreenplayDraftSaveOutbox.divergentCustodyReason))
        let choice = try await queue.recordCustodyChoice(selectedID: selected.id, projectID: selected.projectId,
            ownerUserID: owner.userID, deliveryOrigin: origin)
        var submission = ScreenplayDraftSaveOutboxEntry(id: "submission", projectId: selected.projectId,
            ownerUserId: owner.userID, draft: selected.draft, title: selected.title, phase: selected.phase,
            notes: selected.notes, source: "studio_custody_selected", studioWriteAnchors: [], screenplayBindings: [],
            baseVersionId: "head-at-selection", createdAt: 3, updatedAt: 3, status: .pending,
            retries: 0, nextAttemptAt: 0, lastError: "")
        submission.deliveryOrigin = origin; submission.custodyChoice = choice
        submission.requestAuthority = .init(id: UUID(), generation: 0)
        submission.saveOrderingVersion = 1; submission.hasExplicitBaseSelection = true
        _ = try await queue.beginCustodyChoiceDelivery(submission)
        try await queue.markParked(id: submission.id, error: ScreenplayDraftSaveOutbox.custodySubmissionInterruptedReason)
        return try await queue.custodyFenceIntent(selectedID: selected.id, projectID: selected.projectId,
            ownerUserID: owner.userID, deliveryOrigin: origin)
    }
}
