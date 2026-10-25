import Foundation
import XCTest
@testable import them

final class OfflineTalkPageDeliveryTests: XCTestCase {
    func testOriginalRequestProjectSurvivesRelaunchAndCannotBeDeliveredToAnotherProject() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("TalkOrigin-\(UUID())")
        defer { try? FileManager.default.removeItem(at: directory) }
        let owner = BackendAuthRequestIdentity(sessionEpoch: 1, userID: "writer", clientToken: "fixture",
            accessToken: "fixture", sessionIntentGeneration: 1)
        let url = URL(string: "https://them.test")!
        func queue() -> OfflineTalkOutbox {
            .init(storageDirectory: directory, requestIdentityProvider: { _ in owner }, backendURLProvider: { url })
        }
        let boundary = "THEM-original-project"
        let body = Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"screenplay_project_id\"\r\n\r\nproject-a\r\n--\(boundary)--\r\n".utf8)
        var request = URLRequest(url: url.appendingPathComponent("talk")); request.httpMethod = "POST"
        request.setValue(owner.userID, forHTTPHeaderField: "X-User-Id")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        let original = queue()
        let entry = try await original.enqueue(request: request, body: body, reason: "offline").entry
        _ = await original.drainDue(now: .distantFuture, initiatingIdentity: owner, backendURL: url) { _ in
            .init(statusCode: 200, headers: ["x-reply": "A scene without a project trace"], body: Data("audio".utf8))
        }
        let relaunched = queue()
        let packet = try await relaunched.receivedReply(entry.id, initiatingIdentity: owner, backendURL: url)
        let destination = try await relaunched.receivedReplyProjectID(entry.id, receiptID: packet.response.id,
            initiatingIdentity: owner, backendURL: url)
        XCTAssertEqual(destination, "project-a", "Destination must come from the original request, even without a response trace.")
        do {
            _ = try await relaunched.receivedReplyProjectID(entry.id, receiptID: UUID().uuidString,
                initiatingIdentity: owner, backendURL: url)
            XCTFail("A stale reader resolved a different response's destination.")
        } catch {}
        let resolved = try await relaunched.receivedReply(entry.id, initiatingIdentity: owner, backendURL: url)
        XCTAssertEqual(resolved.response.id, packet.response.id)
        XCTAssertNil(resolved.pageDelivery, "Opening the original project must not acknowledge or plan a write.")
        do {
            _ = try await relaunched.preparePageDelivery(entry.id, receiptID: packet.response.id, projectID: "project-b",
                documentID: "document-b", beforeDraft: "B original", afterDraft: "B original\n\nA scene",
                initiatingIdentity: owner, backendURL: url)
            XCTFail("A missing response trace allowed an original-project scene into another screenplay.")
        } catch {}
        let kept = try await queue().receivedReply(entry.id, initiatingIdentity: owner, backendURL: url)
        XCTAssertNil(kept.pageDelivery, "A refused destination must not lock the reply to the wrong document.")
        XCTAssertEqual(kept.response.id, packet.response.id)
        _ = try await relaunched.preparePageDelivery(entry.id, receiptID: packet.response.id, projectID: "project-a",
            documentID: "document-a", beforeDraft: "A original", afterDraft: "A original\n\nA scene",
            initiatingIdentity: owner, backendURL: url)
    }

    func testEmptyOutputCannotHideTheSpokenReply() {
        XCTAssertEqual(offlineTalkReplyDisplayText(outputText: "", reply: "Your reply is kept."), "Your reply is kept.")
        XCTAssertEqual(offlineTalkReplyDisplayText(outputText: " \n", reply: "…"), "…")
        XCTAssertEqual(offlineTalkReplyDisplayText(outputText: "INT. ROOM - NIGHT\n", reply: "Preview"), "INT. ROOM - NIGHT\n")
        XCTAssertEqual(offlineTalkReplyDisplayText(outputText: nil, reply: nil), "No reply text was included.")
    }

    func testRenewedDocumentRequiresExactWordsAndUnchangedCanonicalBase() {
        let plan = OfflineTalkPageDeliveryPlan(id: UUID(), receiptID: "receipt", projectID: "project-a",
            documentID: "old-document", beforeDraft: "Original\r\nCafe\u{0301}. \t",
            afterDraft: "Original\r\nCafe\u{0301}. \t\n\nNew scene", baseVersionID: "base-a")
        func permits(project: String = "project-a", draft: String? = nil,
                     version: String = "base-a", server: String = "base-a") -> Bool {
            plan.permitsContinuation(project: project, document: "renewed-document",
                draft: draft ?? plan.beforeDraft, version: version, serverVersion: server, serverDraft: "Saved baseline")
        }
        XCTAssertTrue(permits(), "A renewed local UUID is not a new screenplay when version and bytes prove continuity.")
        XCTAssertTrue(permits(draft: plan.afterDraft), "An inserted but unsaved scene may finish the same plan.")
        XCTAssertFalse(permits(project: "project-b"))
        XCTAssertFalse(permits(draft: plan.beforeDraft + "Writer's newer words"))
        XCTAssertFalse(permits(draft: plan.afterDraft + "Writer's newer words"))
        XCTAssertFalse(permits(draft: "Original\r\nCafé. \t"), "Unicode equivalence is not exact writer bytes.")
        XCTAssertFalse(permits(version: "newer-a"))
        XCTAssertFalse(permits(server: "newer-a"))
        XCTAssertFalse(permits(version: "newer-a", server: "newer-a"), "Matching newer hints cannot rebase the immutable plan.")
    }

    func testLegacyDeliveryPlanKeepsDigestAndCannotFollowANewDocumentWithoutABase() throws {
        let legacy = #"{"afterDraft":"Before\n\nScene","beforeDraft":"Before","documentID":"document-a","id":"00000000-0000-0000-0000-000000000001","projectID":"project-a","receiptID":"receipt"}"#
        let plan = try JSONDecoder().decode(OfflineTalkPageDeliveryPlan.self, from: Data(legacy.utf8))
        XCTAssertNil(plan.baseVersionID)
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        XCTAssertEqual(try encoder.encode(plan), Data(legacy.utf8), "Missing optional anchors must not change old integrity bytes.")
        XCTAssertTrue(plan.permitsContinuation(project: "project-a", document: "document-a", draft: plan.afterDraft,
            version: "base", serverVersion: "base", serverDraft: plan.beforeDraft))
        XCTAssertFalse(plan.permitsContinuation(project: "project-a", document: "new-document", draft: plan.beforeDraft,
            version: "base", serverVersion: "base", serverDraft: plan.beforeDraft))
        XCTAssertFalse(plan.permitsContinuation(project: "project-a", document: "document-a", draft: plan.beforeDraft,
            version: "base", serverVersion: "base", serverDraft: "Changed server words"))
        let newProject = OfflineTalkPageDeliveryPlan(id: UUID(), receiptID: "receipt", projectID: "new-project",
            documentID: "old-document", beforeDraft: "", afterDraft: "Scene", baseVersionID: "")
        let restored = try JSONDecoder().decode(OfflineTalkPageDeliveryPlan.self, from: encoder.encode(newProject))
        XCTAssertEqual(restored.baseVersionID, "", "A known empty base must not become unknown legacy authority.")
        XCTAssertTrue(restored.permitsContinuation(project: "new-project", document: "renewed-document",
            draft: "", version: "", serverVersion: "", serverDraft: ""))
    }

    func testSavedResultRequiresThisPlansRequestIdentityNotHistoricalIdenticalWords() {
        let id = UUID()
        let plan = OfflineTalkPageDeliveryPlan(id: id, receiptID: "receipt", projectID: "project-a",
            documentID: "document", beforeDraft: "Before", afterDraft: "Before\n\nScene", baseVersionID: "base")
        XCTAssertFalse(plan.confirmsSavedResult(draft: plan.afterDraft, requestID: "unrelated-old-save", isCurrentVersion: false))
        XCTAssertFalse(plan.confirmsSavedResult(draft: plan.afterDraft, requestID: nil, isCurrentVersion: true))
        XCTAssertFalse(plan.confirmsSavedResult(draft: plan.afterDraft + "Newer words", requestID: id.uuidString.lowercased(), isCurrentVersion: true))
        XCTAssertTrue(plan.confirmsSavedResult(draft: plan.afterDraft, requestID: id.uuidString.lowercased(), isCurrentVersion: false),
            "A correlated durable save still proves delivery after the writer saves newer words.")
        let legacy = OfflineTalkPageDeliveryPlan(id: id, receiptID: plan.receiptID, projectID: plan.projectID,
            documentID: plan.documentID, beforeDraft: plan.beforeDraft, afterDraft: plan.afterDraft)
        XCTAssertFalse(legacy.confirmsSavedResult(draft: legacy.afterDraft, requestID: nil, isCurrentVersion: false))
        XCTAssertTrue(legacy.confirmsSavedResult(draft: legacy.afterDraft, requestID: nil, isCurrentVersion: true))
    }

    func testProjectExtractionUsesMultipartHeadersNotBinaryAudioOrResponseText() throws {
        let boundary = "THEM-original-project"
        let headers = ["content-type": "multipart/form-data; boundary=\"\(boundary)\""]
        let opening = "--\(boundary)\r\nContent-Disposition: form-data; name=\"screenplay_project_id\"\r\n\r\nproject-a\r\n"
        let audioHeader = "--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"recording.wav\"\r\nContent-Type: audio/wav\r\n\r\n"
        var body = Data((opening + audioHeader).utf8)
        body.append(Data([0, 255, 128]))
        body.append(Data("name=\"screenplay_project_id\"\r\n\r\nproject-b".utf8))
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        XCTAssertEqual(try offlineTalkRequestProjectID(body: body, headers: headers), "project-a")
        let duplicate = Data((opening + opening + "--\(boundary)--\r\n").utf8)
        XCTAssertThrowsError(try offlineTalkRequestProjectID(body: duplicate, headers: headers))
        XCTAssertThrowsError(try offlineTalkRequestProjectID(body: Data("malformed".utf8), headers: headers))
        XCTAssertNil(try offlineTalkRequestProjectID(body: body, headers: ["Content-Type": "application/octet-stream"]))
        XCTAssertThrowsError(try offlineTalkRequestProjectID(body: body,
            headers: ["Content-Type": "multipart/form-data; boundary=a; boundary=b"]))
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
        let before = "INT. ROOM - NIGHT\r\nWriter’s exact words. \t\n"
        let after = before + "\nINT. HALL - NIGHT\nA light flickers."
        let plan = try await outbox.preparePageDelivery(entry.id, receiptID: packet.response.id, projectID: "project-a",
            documentID: "document-a", beforeDraft: before, afterDraft: after, baseVersionID: "base-a",
            initiatingIdentity: owner, backendURL: url)
        let relaunched = queue()
        let restored = try await relaunched.receivedReply(entry.id, initiatingIdentity: owner, backendURL: url)
        XCTAssertEqual(restored.pageDelivery, plan)
        XCTAssertEqual(restored.pageDelivery?.baseVersionID, "base-a")
        let destination = try await relaunched.receivedReplyProjectID(entry.id, receiptID: restored.response.id,
            initiatingIdentity: owner, backendURL: url)
        XCTAssertEqual(destination, "project-a", "Legacy requests may resume only their existing durable plan's destination.")
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
