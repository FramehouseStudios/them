import Foundation
import XCTest
@testable import them

final class OfflineTalkPageDeliveryTests: XCTestCase {
    func testEmptyOutputCannotHideTheSpokenReply() {
        XCTAssertEqual(offlineTalkReplyDisplayText(outputText: "", reply: "Your reply is kept."), "Your reply is kept.")
        XCTAssertEqual(offlineTalkReplyDisplayText(outputText: " \n", reply: "…"), "…")
        XCTAssertEqual(offlineTalkReplyDisplayText(outputText: "INT. ROOM - NIGHT\n", reply: "Preview"), "INT. ROOM - NIGHT\n")
        XCTAssertEqual(offlineTalkReplyDisplayText(outputText: nil, reply: nil), "No reply text was included.")
    }

    func testDeliveryIntentSurvivesRelaunchAndNeverReplansAgainstNewerWords() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("TalkDelivery-\(UUID())")
        defer { try? FileManager.default.removeItem(at: directory) }
        let owner = BackendAuthRequestIdentity(sessionEpoch: 1, userID: "writer", clientToken: "fixture",
            accessToken: "fixture", sessionIntentGeneration: 1)
        let url = URL(string: "https://them.test")!
        func queue() -> OfflineTalkOutbox {
            .init(storageDirectory: directory, requestIdentityProvider: { _ in owner }, backendURLProvider: { url })
        }
        var request = URLRequest(url: url.appendingPathComponent("talk")); request.httpMethod = "POST"
        request.setValue(owner.userID, forHTTPHeaderField: "X-User-Id")
        let outbox = queue()
        let entry = try await outbox.enqueue(request: request, body: Data("spoken story".utf8), reason: "offline").entry
        _ = await outbox.drainDue(now: .distantFuture, initiatingIdentity: owner, backendURL: url) { _ in
            .init(statusCode: 200, headers: ["x-reply": "Kept scene"], body: Data("audio".utf8))
        }
        let packet = try await outbox.receivedReply(entry.id, initiatingIdentity: owner, backendURL: url)
        let before = "INT. ROOM - NIGHT\r\nWriter’s exact cafe\u{0301} words. \t\n"
        let after = before + "\nINT. HALL - NIGHT\nA light flickers."
        let plan = try await outbox.preparePageDelivery(entry.id, receiptID: packet.response.id, projectID: "project-a",
            documentID: "document-a", beforeDraft: before, afterDraft: after, initiatingIdentity: owner, backendURL: url)
        let relaunched = queue()
        let restored = try await relaunched.receivedReply(entry.id, initiatingIdentity: owner, backendURL: url)
        XCTAssertEqual(restored.pageDelivery, plan)
        XCTAssertTrue(plan.permitsInsertion(project: "project-a", document: "document-a", draft: before))
        XCTAssertFalse(plan.permitsInsertion(project: "project-b", document: "document-a", draft: before))
        XCTAssertFalse(plan.permitsInsertion(project: "project-a", document: "document-b", draft: before))
        XCTAssertFalse(plan.permitsInsertion(project: "project-a", document: "document-a", draft: after))
        let retry = try await relaunched.preparePageDelivery(entry.id, receiptID: packet.response.id, projectID: "project-a",
            documentID: "document-a", beforeDraft: after, afterDraft: after + "duplicate", initiatingIdentity: owner, backendURL: url)
        XCTAssertEqual(retry, plan, "An uncertain retry must finish the original delivery, never append again.")
        do {
            try await relaunched.acknowledgeReceivedReply(entry.id, receiptID: packet.response.id, initiatingIdentity: owner, backendURL: url)
            XCTFail("An unaware reader discarded an unfinished page delivery.")
        } catch {}
        let artifact = try await relaunched.exportRecoveryEntry(entry.id, initiatingIdentity: owner, backendURL: url)
        let exported = try XCTUnwrap(JSONSerialization.jsonObject(with: artifact.data) as? [String: Any])
        let exportedPlan = try XCTUnwrap(exported["page_delivery"] as? [String: Any])
        XCTAssertEqual(Data((exportedPlan["beforeDraft"] as? String ?? "").utf8), Data(before.utf8))
        try await relaunched.acknowledgeReceivedReply(entry.id, receiptID: packet.response.id,
            initiatingIdentity: owner, backendURL: url, deliveryPlanID: plan.id)
        let settled = try await queue().recoveryState(initiatingIdentity: owner, backendURL: url)
        XCTAssertTrue(settled.entries.isEmpty)
    }

    func testJournalRejectsTamperedOrMissingIntentDigest() throws {
        let body = Data("request".utf8)
        let entry = OfflineTalkOutboxEntry(id: "entry", createdAt: 1, updatedAt: 1, endpoint: "/talk", method: "POST",
            urlString: "https://them.test/talk", headers: [:], bodyRef: "fixture.turn", bodyByteCount: body.count,
            idempotencyKey: "entry", timeoutInterval: 30, status: .parked, retries: 0, nextAttemptAt: 0,
            lastError: nil, receivedReply: true)
        var record = OfflineTalkStoredBody(entry: entry, body: body)
        record.version = 3; record.state = .received
        record.response = try OfflineTalkStoredResponse(.init(statusCode: 200, headers: [:], body: Data()))
        let plan = OfflineTalkPageDeliveryPlan(id: UUID(), receiptID: record.response!.id, projectID: "project",
            documentID: "document", beforeDraft: "original", afterDraft: "original\n\nScene")
        record.pageDelivery = plan
        XCTAssertThrowsError(try record.validatedBody())
        record.pageDeliveryDigest = try plan.integrityDigest()
        XCTAssertEqual(try record.validatedBody(), body)
        record.pageDelivery = .init(id: plan.id, receiptID: plan.receiptID, projectID: "foreign-project",
            documentID: plan.documentID, beforeDraft: plan.beforeDraft, afterDraft: plan.afterDraft)
        XCTAssertThrowsError(try record.validatedBody())
        record.pageDelivery = nil
        XCTAssertThrowsError(try record.validatedBody())
    }

    func testSharedEditorSeparatorsPreserveExistingBytes() {
        for before in ["", "Original", "Original\n", "Original\n\n", "Original\r\n \t"] {
            let selection = NSRange(location: (before as NSString).length, length: 0)
            let insertion = screenplayEditorInsertionText(for: "  INT. ROOM - NIGHT\nA light flickers. \n", existing: before, selection: selection)
            let expectedPrefix = before.isEmpty ? "" : (before.hasSuffix("\n") ? "\n" : "\n\n")
            XCTAssertEqual(insertion, expectedPrefix + "INT. ROOM - NIGHT\nA light flickers.")
            XCTAssertEqual(Data((before + insertion).utf8.prefix(before.utf8.count)), Data(before.utf8))
        }
        XCTAssertEqual(screenplayEditorInsertionText(for: "Scene", existing: "ab", selection: .init(location: 1, length: 0)), "\n\nScene\n\n")
        XCTAssertEqual(screenplayEditorInsertionText(for: "Scene", existing: "ab", selection: .init(location: 3, length: 0)), "")
        XCTAssertEqual(screenplayEditorInsertionText(for: " \n", existing: "ab", selection: .init(location: 2, length: 0)), "")
    }
}
