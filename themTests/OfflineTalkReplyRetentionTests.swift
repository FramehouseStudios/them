import Foundation
import XCTest
@testable import them

final class OfflineTalkReplyRetentionTests: XCTestCase {
    func testAcceptedTalkReplyIsKeptUntilWriterReceivesItAndIsNeverSentAgain() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("TalkReply-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let identity = BackendAuthRequestIdentity(sessionEpoch: 1, userID: "writer-a", clientToken: "fixture-client",
            accessToken: "fixture-access", sessionIntentGeneration: 1)
        let backend = URL(string: "https://them.test")!
        func queue() -> OfflineTalkOutbox {
            OfflineTalkOutbox(storageDirectory: directory, requestIdentityProvider: { _ in identity }, backendURLProvider: { backend })
        }
        let outbox = queue()
        var request = URLRequest(url: backend.appendingPathComponent("talk"))
        request.httpMethod = "POST"
        request.setValue(identity.userID, forHTTPHeaderField: "X-User-Id")
        request.setValue("original-request", forHTTPHeaderField: "X-Idempotency-Key")
        let entry = try await outbox.enqueue(request: request, body: Data("original audio".utf8), reason: "offline").entry
        let audio = Data("ID3response fixture".utf8)
        _ = await outbox.drainDue(now: .distantFuture, initiatingIdentity: identity, backendURL: backend) { _ in
            .init(statusCode: 200, headers: ["Content-Type": "audio/mpeg", "x-reply": "A recovered reply", "x-turn-id": "turn-a",
                "Authorization": "fixture-secret", "Set-Cookie": "fixture-cookie", "x-session-id": "fixture-session",
                "x-screenplay-api-key": "fixture-secret", "x-screenplay-target": "page"], body: audio)
        }
        let relaunched = queue()
        let recovery = try await relaunched.recoveryState(initiatingIdentity: identity, backendURL: backend)
        XCTAssertEqual(recovery.entries.map(\.id), [entry.id], "HTTP success discarded a reply the writer never received.")
        XCTAssertEqual(recovery.entries.first?.status, .parked)
        let reply = try await relaunched.receivedReply(entry.id, initiatingIdentity: identity, backendURL: backend)
        XCTAssertEqual(reply.response.body, audio)
        XCTAssertEqual(reply.response.headers, ["content-type": "audio/mpeg", "x-reply": "A recovered reply", "x-turn-id": "turn-a", "x-screenplay-target": "page"])
        try reply.response.validate()
        let duplicate = try await relaunched.enqueue(request: request, body: Data("original audio".utf8), reason: "retry")
        XCTAssertEqual(duplicate.entry, recovery.entries.first)
        let sameReply = try await relaunched.receivedReply(entry.id, initiatingIdentity: identity, backendURL: backend)
        XCTAssertEqual(sameReply.response.id, reply.response.id)
        let artifact = try await relaunched.exportRecoveryEntry(entry.id, initiatingIdentity: identity, backendURL: backend)
        let exported = try XCTUnwrap(JSONSerialization.jsonObject(with: artifact.data) as? [String: Any])
        let response = try XCTUnwrap(exported["response"] as? [String: Any])
        XCTAssertEqual(response["body_base64"] as? String, audio.base64EncodedString())
        do {
            try await relaunched.acknowledgeReceivedReply(entry.id, receiptID: UUID().uuidString, initiatingIdentity: identity, backendURL: backend)
            XCTFail("A stale delivery acknowledgement consumed the reply.")
        } catch {}
        var calls = 0
        _ = await relaunched.drainDue(now: .distantFuture, initiatingIdentity: identity, backendURL: backend) { _ in
            calls += 1; return .init(statusCode: 200)
        }
        XCTAssertEqual(calls, 0)
        try await relaunched.acknowledgeReceivedReply(entry.id, receiptID: reply.response.id, initiatingIdentity: identity, backendURL: backend)
        let delivered = try await queue().recoveryState(initiatingIdentity: identity, backendURL: backend)
        XCTAssertTrue(delivered.entries.isEmpty)
    }

    func testOversizedReplyRetainsMetadataWithoutClaimingAudioWasKept() throws {
        let response = try OfflineTalkStoredResponse(.init(statusCode: 200, headers: ["x-reply": "Kept words"],
            body: Data(repeating: 0, count: OfflineTalkStoredResponse.maxBodyBytes + 1)))
        try response.validate()
        XCTAssertTrue(response.bodyOmitted)
        XCTAssertTrue(response.body.isEmpty)
        XCTAssertEqual(response.originalBodyBytes, OfflineTalkStoredResponse.maxBodyBytes + 1)
        XCTAssertEqual(response.headers["x-reply"], "Kept words")
    }

    func testCorruptedReplyDoesNotValidate() throws {
        let response = try OfflineTalkStoredResponse(.init(statusCode: 200, headers: ["x-reply": "Kept words"], body: Data("audio".utf8)))
        var payload = try XCTUnwrap(PropertyListSerialization.propertyList(from: PropertyListEncoder().encode(response), format: nil) as? [String: Any])
        payload["body"] = Data("other".utf8)
        let tampered = try PropertyListDecoder().decode(OfflineTalkStoredResponse.self,
            from: PropertyListSerialization.data(fromPropertyList: payload, format: .binary, options: 0))
        XCTAssertThrowsError(try tampered.validate())
    }
}
