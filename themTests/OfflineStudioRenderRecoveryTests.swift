import Foundation
import XCTest
@testable import them

final class OfflineStudioRenderRecoveryTests: XCTestCase {
    func testSupportsOnlyCanonicalRenderEndpoints() {
        XCTAssertTrue(OfflineStudioRenderRecovery.supports(endpoint: StudioRenderEndpoint.oneShotPath))
        XCTAssertTrue(OfflineStudioRenderRecovery.supports(endpoint: StudioRenderEndpoint.streamPath))
        for path in ["/talk", "/realtime/studio_render/other", "/realtime/studio_render?complete=1"] {
            XCTAssertFalse(OfflineStudioRenderRecovery.supports(endpoint: path))
        }
    }

    func testOneShotPreservesExactRequestAndReplyBytesAndOriginalProject() throws {
        let transcript = "\r\nRewrite cafe\u{0301}.  \t"
        let reply = "\r\nINT. CAFE - NIGHT\r\n\r\nMARA\r\nKeep the scar.  \t\r\n"
        let recovered = try OfflineStudioRenderRecovery(packet: packet(json: ["ok": true, "reply": reply,
            "screenplay_quality": ["ok": true]], transcript: transcript, project: "original-project"))
        XCTAssertEqual(Data(recovered.transcript.utf8), Data(transcript.utf8))
        XCTAssertEqual(Data(recovered.reply.utf8), Data(reply.utf8))
        XCTAssertEqual(recovered.projectID, "original-project")
        XCTAssertTrue(recovered.isComplete)
        XCTAssertTrue(recovered.qualityConfirmed)
    }

    func testCompleteHeaderMustBeExactlyCanonicalOne() throws {
        for marker: String? in [nil, "0", "true", " 1", "1 "] {
            let recovered = try OfflineStudioRenderRecovery(packet: packet(json: ["ok": true, "reply": "Kept text",
                "screenplay_quality": ["ok": true]], complete: marker))
            XCTAssertFalse(recovered.isComplete)
            XCTAssertFalse(recovered.qualityConfirmed)
        }
    }

    func testCompleteOneShotWithoutQualityOrWithRejectionRemainsUnconfirmed() throws {
        for quality: [String: Bool]? in [nil, ["ok": false]] {
            var json: [String: Any] = ["ok": true, "reply": "Keep for review"]
            if let quality { json["screenplay_quality"] = quality }
            let recovered = try OfflineStudioRenderRecovery(packet: packet(json: json))
            XCTAssertTrue(recovered.isComplete, "Transport completion does not assert page quality")
            XCTAssertFalse(recovered.qualityConfirmed)
        }
        for json: [String: Any] in [
            ["ok": false, "reply": "Keep rejected text", "screenplay_quality": ["ok": true]],
            ["ok": true, "reply": "Keep failed text", "error": "Rejected", "screenplay_quality": ["ok": true]]
        ] {
            let recovered = try OfflineStudioRenderRecovery(packet: packet(json: json))
            XCTAssertFalse(recovered.isComplete)
            XCTAssertFalse(recovered.qualityConfirmed)
        }
    }

    func testSSEMultipleEventsUseAuthoritativeDoneAndPreserveExactUnicodeAndWhitespace() throws {
        let final = "INT. CAFE\u{0301} - NIGHT\r\nFinal words.  \t\n"
        let stream = try event("meta", ["request_id": "render-a"])
            + event("delta", ["delta": "Old "]) + event("delta", ["delta": "partial"])
            + event("trace", ["screenplay_quality": ["ok": true]])
            + event("done", ["reply": final])
        let recovered = try OfflineStudioRenderRecovery(packet: packet(stream: stream))
        XCTAssertEqual(Data(recovered.reply.utf8), Data(final.utf8))
        XCTAssertTrue(recovered.isComplete)
        XCTAssertTrue(recovered.qualityConfirmed)
    }

    func testPartialStreamAccumulatesDeltasWithoutInventingDoneOrQuality() throws {
        let text = "cafe\u{0301}\r\nKeep this tail.  \t"
        let stream = try event("meta", ["screenplay_quality": ["ok": true]])
            + event("delta", ["delta": "cafe\u{0301}\r\n"])
            + event("delta", ["delta": "Keep this tail.  \t"])
        for marker: String? in [nil, "0", "1"] {
            let recovered = try OfflineStudioRenderRecovery(packet: packet(stream: stream, complete: marker))
            XCTAssertEqual(Data(recovered.reply.utf8), Data(text.utf8))
            XCTAssertFalse(recovered.isComplete)
            XCTAssertFalse(recovered.qualityConfirmed)
        }
    }

    func testDoneWithoutCompleteMarkerIsStillUnconfirmed() throws {
        let stream = try event("done", ["reply": "Unconfirmed final", "screenplay_quality": ["ok": true]])
        let recovered = try OfflineStudioRenderRecovery(packet: packet(stream: stream, complete: "0"))
        XCTAssertEqual(recovered.reply, "Unconfirmed final")
        XCTAssertFalse(recovered.isComplete)
        XCTAssertFalse(recovered.qualityConfirmed)
    }

    func testConfirmedDoneWithoutReplyUsesTheAccumulatedSnapshot() throws {
        let stream = try event("delta", ["delta": "Exact cumulative tail.  \t"])
            + event("done", ["screenplay_quality": ["ok": true]])
        let recovered = try OfflineStudioRenderRecovery(packet: packet(stream: stream))
        XCTAssertEqual(Data(recovered.reply.utf8), Data("Exact cumulative tail.  \t".utf8))
        XCTAssertTrue(recovered.isComplete)
        XCTAssertTrue(recovered.qualityConfirmed)
    }

    func testMalformedSSEAfterReadableDeltaRetainsTextButNeverApprovesPage() throws {
        let stream = try event("delta", ["delta": "Readable prefix.  "])
            + "event: delta\ndata: {broken\n\n"
            + event("done", ["reply": "Readable final.  ", "screenplay_quality": ["ok": true]])
        let recovered = try OfflineStudioRenderRecovery(packet: packet(stream: stream))
        XCTAssertEqual(Data(recovered.reply.utf8), Data("Readable final.  ".utf8))
        XCTAssertFalse(recovered.isComplete)
        XCTAssertFalse(recovered.qualityConfirmed)
    }

    func testErrorOrRejectedQualityNeverApprovesRetainedStream() throws {
        let prefix = try event("delta", ["delta": "Keep this scene"])
        let failed = try OfflineStudioRenderRecovery(packet: packet(stream: prefix + event("error", ["error": "Connection ended"])))
        XCTAssertEqual(failed.reply, "Keep this scene")
        XCTAssertFalse(failed.isComplete)
        XCTAssertFalse(failed.qualityConfirmed)
        let rejected = try OfflineStudioRenderRecovery(packet: packet(stream: prefix
            + event("done", ["reply": "Keep this scene", "screenplay_quality": ["ok": false]])))
        XCTAssertTrue(rejected.isComplete)
        XCTAssertFalse(rejected.qualityConfirmed)
    }

    func testConflictingDoneEventsRemainUnconfirmedInsteadOfReplacingFirstAuthority() throws {
        let stream = try event("done", ["reply": "First final", "screenplay_quality": ["ok": true]])
            + event("done", ["reply": "Conflicting final", "screenplay_quality": ["ok": true]])
        let recovered = try OfflineStudioRenderRecovery(packet: packet(stream: stream))
        XCTAssertEqual(recovered.reply, "First final")
        XCTAssertFalse(recovered.isComplete)
        XCTAssertFalse(recovered.qualityConfirmed)
    }

    func testMultiLineDataCommentsAndEOFFrameDoNotNormalizeReplyText() throws {
        let stream = ": keepalive\n\nevent: delta\ndata: {\ndata: \"delta\":\"First \\t\"}\n\n"
            + "event: delta\ndata: {\"delta\":\"last  \"}\n"
        let recovered = try OfflineStudioRenderRecovery(packet: packet(stream: stream, complete: "0"))
        XCTAssertEqual(Data(recovered.reply.utf8), Data("First \tlast  ".utf8))
        XCTAssertFalse(recovered.isComplete)
    }

    func testMissingMalformedOrForeignRequestCannotBecomeReviewedRender() throws {
        var received = try packet(json: ["ok": true, "reply": "Kept"])
        received.requestBody = nil
        XCTAssertThrowsError(try OfflineStudioRenderRecovery(packet: received))
        received.requestBody = Data("{broken".utf8)
        XCTAssertThrowsError(try OfflineStudioRenderRecovery(packet: received))
        received.requestBody = Data(#"{"transcript":42}"#.utf8)
        XCTAssertThrowsError(try OfflineStudioRenderRecovery(packet: received))
        received = try packet(json: ["ok": true, "reply": "Kept"], endpoint: "/talk")
        XCTAssertThrowsError(try OfflineStudioRenderRecovery(packet: received))
    }

    func testMalformedEmptyAndNonBooleanQualityCannotBecomeApprovedText() throws {
        for body in [Data(), Data("{broken".utf8), Data([0xFF]),
            Data(#"{"ok":true,"reply":"  \n\t"}"#.utf8),
            Data(#"{"ok":true,"reply":"Kept","screenplay_quality":{"ok":1}}"#.utf8)] {
            XCTAssertThrowsError(try OfflineStudioRenderRecovery(packet: packet(body: body)))
        }
        XCTAssertThrowsError(try OfflineStudioRenderRecovery(packet: packet(stream: "event: done\ndata: {broken\n\n")))
    }

    private func event(_ name: String, _ json: [String: Any]) throws -> String {
        "event: \(name)\ndata: " + String(decoding: try JSONSerialization.data(withJSONObject: json, options: [.sortedKeys]), as: UTF8.self) + "\n\n"
    }

    private func packet(json: [String: Any], transcript: String = "Write this scene", project: String = "original-project",
                        complete: String? = "1", endpoint: String = StudioRenderEndpoint.oneShotPath) throws -> OfflineTalkReceivedReply {
        try packet(body: JSONSerialization.data(withJSONObject: json), transcript: transcript,
            project: project, complete: complete, endpoint: endpoint)
    }

    private func packet(stream: String, complete: String? = "1") throws -> OfflineTalkReceivedReply {
        try packet(body: Data(stream.utf8), complete: complete, endpoint: StudioRenderEndpoint.streamPath)
    }

    private func packet(body: Data, transcript: String = "Write this scene", project: String = "original-project",
                        complete: String? = "1", endpoint: String = StudioRenderEndpoint.oneShotPath) throws -> OfflineTalkReceivedReply {
        let request = try JSONSerialization.data(withJSONObject: ["transcript": transcript, "screenplay_project_id": project])
        let entry = OfflineTalkOutboxEntry(id: UUID().uuidString.lowercased(), createdAt: 1, updatedAt: 1, endpoint: endpoint,
            method: "POST", urlString: "https://render.test" + endpoint, headers: [:], bodyRef: "fixture.turn",
            bodyByteCount: request.count, idempotencyKey: "render-test", timeoutInterval: 30,
            status: .parked, retries: 0, nextAttemptAt: 0, lastError: nil, receivedReply: true)
        var headers = ["content-type": endpoint == StudioRenderEndpoint.streamPath ? "text/event-stream" : "application/json"]
        if let complete { headers["x-them-render-complete"] = complete }
        let response = try OfflineTalkStoredResponse(.init(statusCode: 200, headers: headers, body: body))
        return .init(entry: entry, response: response, requestBody: request)
    }
}
