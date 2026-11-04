import Foundation
import XCTest
@testable import them

final class OfflineTalkAcceptedReplyBoundaryTests: XCTestCase {
    func testSuccessfulTransportRetainsUnseenReplyAcrossRelaunchWithoutResending() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("AcceptedReply-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let identity = BackendAuthRequestIdentity(sessionEpoch: 1, userID: "accepted-writer",
            clientToken: "fixture-client", accessToken: "fixture-access", sessionIntentGeneration: 1)
        let backend = URL(string: "https://accepted-reply.test")!
        func queue() -> OfflineTalkOutbox {
            .init(storageDirectory: directory, requestIdentityProvider: { _ in identity }, backendURLProvider: { backend })
        }
        var request = URLRequest(url: backend.appendingPathComponent("talk"))
        request.httpMethod = "POST"
        request.setValue(identity.userID, forHTTPHeaderField: "X-User-Id")
        request.setValue("accepted-request", forHTTPHeaderField: "X-Idempotency-Key")
        let outbox = queue()
        let original = Data("Original audio\r\n \t ".utf8)
        let audio = Data("ID3retained reply".utf8)
        let entry = try await outbox.enqueue(request: request, body: original, reason: "offline").entry
        _ = await outbox.drainDue(now: .distantFuture, initiatingIdentity: identity, backendURL: backend) { _ in
            .init(statusCode: 200, headers: ["content-type": "audio/mpeg", "x-reply": "The scene is ready.",
                "authorization": "fixture-private", "set-cookie": "fixture-cookie"], body: audio)
        }
        let relaunched = queue()
        let recovery = try await relaunched.recoveryState(initiatingIdentity: identity, backendURL: backend)
        XCTAssertEqual(recovery.entries.map(\.id), [entry.id], "A transport acknowledgement is not writer delivery.")
        guard recovery.entries.contains(where: { $0.id == entry.id }) else { return }
        let export = try await relaunched.exportRecoveryEntry(entry.id, initiatingIdentity: identity, backendURL: backend)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: export.data) as? [String: Any])
        XCTAssertEqual(object["body_base64"] as? String, original.base64EncodedString())
        let response = try XCTUnwrap(object["response"] as? [String: Any])
        XCTAssertEqual(response["body_base64"] as? String, audio.base64EncodedString())
        let headers = try XCTUnwrap(response["headers"] as? [String: String])
        XCTAssertEqual(headers["x-reply"], "The scene is ready.")
        XCTAssertNil(headers["authorization"])
        XCTAssertNil(headers["set-cookie"])
        var sends = 0
        _ = await relaunched.drainDue(now: .distantFuture, initiatingIdentity: identity, backendURL: backend) { _ in
            sends += 1
            return .init(statusCode: 200)
        }
        XCTAssertEqual(sends, 0)
    }
}
