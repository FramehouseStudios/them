import XCTest
@testable import them

final class RecoveredPageApplicationTests: XCTestCase {
    func testInsertUsesOriginalAnchorAndPreservesSurroundingBytes() throws {
        let original = "INT. ROOM - NIGHT\r\n\r\nJOHN\r\nWait.\r\n\r\nKeep this cafe\u{0301}.\t "
        let reply = try Self.reply(draft: original, line: 4)
        let plan = try RecoveredPagePlan.make(reply: reply, draft: original, projectID: "project", versionID: "base")
        XCTAssertEqual(Array(plan.draft.utf8), Array("INT. ROOM - NIGHT\r\n\r\nJOHN\r\nWait.\r\n\nMARA\nThe door is a set.\n\n\r\nKeep this cafe\u{0301}.\t ".utf8))
        XCTAssertTrue(plan.application.originalDraftIdentity.matches(original))
        XCTAssertTrue(plan.application.proposedDraftIdentity.matches(plan.draft))
    }

    func testStaleDraftWrongProjectRevisionLegacyAndUnsupportedPlacementRefuse() throws {
        let original = "Original words."
        let reply = try Self.reply(draft: original)
        for (draft, project, version) in [(original + " ", "project", "base"),
            (original, "other", "base"), (original, "project", "other")] {
            XCTAssertThrowsError(try RecoveredPagePlan.make(reply: reply, draft: draft, projectID: project, versionID: version))
        }
        for mode in ["", "replace_selection", "append_at_cursor"] {
            XCTAssertThrowsError(try RecoveredPagePlan.make(reply: Self.reply(draft: original, mode: mode),
                draft: original, projectID: "project", versionID: "base"))
        }
        var legacy = reply
        legacy.originalWriteContext?.draftIdentity = nil
        XCTAssertThrowsError(try RecoveredPagePlan.make(reply: legacy, draft: original, projectID: "project", versionID: "base"))
        let wrongReportedProject = RecoveredTalkReply(id: reply.id, ownerID: reply.ownerID, receivedAt: reply.receivedAt,
            requestKey: reply.requestKey, requestURL: reply.requestURL, requestBodyRef: reply.requestBodyRef,
            responseBodyRef: reply.responseBodyRef, headers: ["x-screenplay-project-id": "another-project"],
            originalWriteContext: reply.originalWriteContext, retrievedScreenplayOutput: reply.retrievedScreenplayOutput)
        XCTAssertThrowsError(try RecoveredPagePlan.make(reply: wrongReportedProject, draft: original, projectID: "project", versionID: "base"))
        XCTAssertThrowsError(try RecoveredPagePlan.make(reply: Self.reply(draft: original, line: 99),
            draft: original, projectID: "project", versionID: "base"))
    }

    func testExactPartialReplacementDoesNotTouchIdenticalDialogueElsewhere() throws {
        let original = "JOHN\nWait, stay here.\n\nSAM\nWait, stay here."
        let selected = (original as NSString).range(of: "stay here")
        var reply = try Self.reply(draft: original, mode: "replace_selection")
        reply.originalWriteContext?.replacementRange = .init(location: selected.location, length: selected.length,
            textIdentity: .init(draft: "stay here"))
        let plan = try RecoveredPagePlan.make(reply: reply, draft: original, projectID: "project", versionID: "base")
        XCTAssertEqual(plan.draft, "JOHN\nWait, MARA\nThe door is a set..\n\nSAM\nWait, stay here.")
        reply.originalWriteContext?.replacementRange = .init(location: 999, length: 4, textIdentity: .init(draft: "stay"))
        XCTAssertThrowsError(try RecoveredPagePlan.make(reply: reply, draft: original, projectID: "project", versionID: "base"))
    }

    @MainActor
    func testPreparedAndAcknowledgedDecisionSurvivesRelaunchAndCannotBeRelabeled() async throws {
        let identity = try RecoveryApplicationTestOwner()
        defer { identity.restore() }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let outbox = OfflineTalkOutbox(storageDirectory: directory)
        let fixture = try Self.reply(draft: "Original words.")
        var request = URLRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue(identity.owner, forHTTPHeaderField: "X-User-Id")
        request.setValue("one-original-page", forHTTPHeaderField: "X-Idempotency-Key")
        let entry = try await outbox.enqueue(request: request, body: Data("original utterance".utf8),
            reason: "offline", originalWriteContext: fixture.originalWriteContext)
        let output = try XCTUnwrap(fixture.screenplay)
        let encoded = try XCTUnwrap(String(data: JSONEncoder().encode(output), encoding: .utf8)?.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed))
        _ = await outbox.drainDue(now: Date().addingTimeInterval(10)) { _ in
            .init(statusCode: 200, headers: ["x-turn-status": "responded", "x-screenplay-output": encoded], body: Data([1]))
        }
        let reply = try await outbox.recoveredReply(id: entry.entry.id, expectedOwnerID: identity.owner)
        let plan = try RecoveredPagePlan.make(reply: reply, draft: "Original words.", projectID: "project", versionID: "base")
        _ = try await outbox.prepareRecoveredPage(id: reply.id, expectedOwnerID: identity.owner, application: plan.application)
        let relaunched = OfflineTalkOutbox(storageDirectory: directory)
        let saved = try await relaunched.recoveredReply(id: reply.id, expectedOwnerID: identity.owner)
        XCTAssertEqual(saved.pageApplication, plan.application)
        var changed = plan.application
        changed = .init(projectID: changed.projectID, baseVersionID: changed.baseVersionID,
            originalDraftIdentity: changed.originalDraftIdentity, proposedDraftIdentity: .init(draft: "A different proposal"))
        do {
            _ = try await relaunched.prepareRecoveredPage(id: reply.id, expectedOwnerID: identity.owner, application: changed)
            XCTFail("A second placement cannot reuse the retained decision.")
        } catch { }
        try await relaunched.acknowledgeRecoveredPage(id: reply.id, expectedOwnerID: identity.owner,
            application: plan.application, savedVersionID: "confirmed-v2")
        let confirmed = try await OfflineTalkOutbox(storageDirectory: directory).recoveredReply(id: reply.id, expectedOwnerID: identity.owner)
        XCTAssertEqual(confirmed.pageApplication?.savedVersionID, "confirmed-v2")
        XCTAssertEqual(confirmed.originalWriteContext, reply.originalWriteContext)
        XCTAssertEqual(confirmed.reply, output.text)
        do {
            _ = try await relaunched.recoveredReply(id: reply.id, expectedOwnerID: "another-writer")
            XCTFail("Wrong owner must not read the decision.")
        } catch { }
    }

    func testNewProjectRequiresExplicitValidTitleAndCompleteNewProjectContext() throws {
        let reply = try Self.reply(draft: "", projectID: "")
        for title in ["", "  ", "Injected\nAuthor: Other", String(repeating: "a", count: 201)] {
            XCTAssertThrowsError(try RecoveredPageCreation.make(reply: reply, title: title))
        }
        XCTAssertThrowsError(try RecoveredPageCreation.make(reply: Self.reply(draft: "Original"), title: "Separate script"))
        let creation = try RecoveredPageCreation.make(reply: reply, title: "  My screenplay  ")
        XCTAssertEqual(creation.title, "My screenplay")
        XCTAssertEqual(Array(creation.draft.utf8), Array("Title:\n    My screenplay\nCredit:\n    Written by\n\nMARA\nThe door is a set.".utf8))
        XCTAssertNotNil(UUID(uuidString: creation.projectID))
        XCTAssertTrue(creation.application.proposedDraftIdentity.matches(creation.draft))
    }

    static func reply(draft: String, mode: String = "insert_after_anchor", line: Int = 1, projectID: String = "project") throws -> RecoveredTalkReply {
        let digest = try JSONSerialization.jsonObject(with: JSONEncoder().encode(ScreenplayDraftContentIdentity(draft: draft)))
        let context = try JSONDecoder().decode(RecoveredTalkWriteContext.self, from: JSONSerialization.data(withJSONObject: [
            "projectID": projectID, "documentRevisionID": "base", "target": "page", "promptSource": "voice",
            "writeID": "original-write", "anchorLine": line, "anchorEndLine": line,
            "insertionMode": mode, "draftIdentity": digest]))
        return .init(id: UUID().uuidString, ownerID: "writer", receivedAt: 1, requestKey: "original",
            requestURL: "https://them.test/talk", requestBodyRef: "request", responseBodyRef: "response", headers: [:],
            originalWriteContext: context, retrievedScreenplayOutput: .init(target: "page", format: "fountain", source: "fixture",
                quality: nil, text: "MARA\nThe door is a set.", lines: []))
    }
}

/// Synthetic local credential-store identity; never a live sign-in or provider call.
@MainActor
final class RecoveryApplicationTestOwner {
    let owner = "recovered-apply-\(UUID().uuidString)"
    private let keys = ["auth_user_payload", "user_id", "auth_signed_in"]
    private let values: [Any?]
    private let previousSharedOwner: String?
    init() throws {
        let defaults = UserDefaults.standard
        values = keys.map { defaults.object(forKey: $0) }
        previousSharedOwner = BackendAuthClient.sharedUserID()
        let user = BackendAuthUser(userId: owner, email: "fixture@example.invalid", authProvider: "debug",
            emailVerified: true, emailVerifiedAt: nil, createdAt: nil, updatedAt: nil)
        defaults.set(try JSONEncoder().encode(user), forKey: "auth_user_payload")
        defaults.set(true, forKey: "auth_signed_in")
        XCTAssertTrue(BackendAuthClient.persistSharedUserID(owner))
        XCTAssertEqual(BackendAuthClient.currentAuthSessionState().user?.userId, owner)
    }
    func restore() {
        for (key, value) in zip(keys, values) {
            if let value { UserDefaults.standard.set(value, forKey: key) }
            else { UserDefaults.standard.removeObject(forKey: key) }
        }
        if let previousSharedOwner { _ = BackendAuthClient.persistSharedUserID(previousSharedOwner) }
        else { BackendAuthClient.clearSharedUserID() }
    }
}
